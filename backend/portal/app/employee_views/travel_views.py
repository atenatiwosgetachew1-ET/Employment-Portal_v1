from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..audit_log import log_audit
from ..licensing import get_access_restriction, get_user_organization
from ..models import CommissionRequest, Employee, Notification, Profile, RefundRecord
from ..serializers import EmployeeSerializer, EmployeeTravelBookingSerializer, build_employee_progress_status
from .helpers import (
    EmployeesEnabled,
    can_initiate_employee_process,
    can_manage_employee_travel,
    can_manage_process_for_organization,
    get_employee_user_scope,
)


class EmployeeTravelBookingView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def _get_employee(self, request, employee_pk):
        organization = get_user_organization(request.user)
        return (
            Employee.objects.select_related(
                "organization",
                "selection__agent",
                "travel_booking",
            )
            .filter(pk=employee_pk, organization=organization)
            .first()
        )

    def post(self, request, employee_pk):
        return self._save(request, employee_pk, partial=False)

    def patch(self, request, employee_pk):
        return self._save(request, employee_pk, partial=True)

    def delete(self, request, employee_pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)

        employee = self._get_employee(request, employee_pk)
        if not employee:
            return Response({"detail": "Candidate not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_employee_travel(request.user, employee):
            return Response(
                {"detail": "You do not have permission to manage this employee's travel booking."},
                status=status.HTTP_403_FORBIDDEN,
            )

        booking = getattr(employee, "travel_booking", None)
        if booking:
            booking.delete()
        employee.departure_date = None
        employee.save(update_fields=["departure_date", "updated_at"])
        employee.refresh_from_db()
        return Response(
            EmployeeSerializer(employee, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    def _save(self, request, employee_pk, *, partial):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)

        employee = self._get_employee(request, employee_pk)
        if not employee:
            return Response({"detail": "Candidate not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_employee_travel(request.user, employee):
            return Response(
                {"detail": "You do not have permission to manage this employee's travel booking."},
                status=status.HTTP_403_FORBIDDEN,
            )

        booking = getattr(employee, "travel_booking", None)
        serializer = EmployeeTravelBookingSerializer(
            booking,
            data=request.data,
            partial=partial,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        saved_booking = serializer.save(
            organization=employee.organization,
            employee=employee,
            created_by=booking.created_by if booking and booking.created_by_id else request.user,
            updated_by=request.user,
        )
        if saved_booking.departure_date != employee.departure_date:
            employee.departure_date = saved_booking.departure_date
            employee.save(update_fields=["departure_date", "updated_at"])
        employee.refresh_from_db()

        log_audit(
            request.user,
            "employee.travel_booking.save",
            resource_type="employee",
            resource_id=employee.pk,
            summary=f"Saved travel booking for employee {employee.full_name}",
            metadata={
                "employee_name": employee.full_name,
                "organization_id": employee.organization_id,
                "pnr": saved_booking.pnr,
                "ticket_number": saved_booking.ticket_number,
            },
        )
        return Response(
            EmployeeSerializer(employee, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class EmployeeTravelConfirmView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def post(self, request, employee_pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        organization = get_user_organization(request.user)
        employee = (
            Employee.objects.select_related(
                "organization",
                "selection__agent",
                "travel_booking",
            )
            .filter(pk=employee_pk, organization=organization)
            .first()
        )
        if not employee:
            return Response({"detail": "Candidate not found."}, status=status.HTTP_404_NOT_FOUND)

        if not can_manage_process_for_organization(request.user, organization):
            return Response(
                {"detail": "Only organization-side administrators can confirm travel."},
                status=status.HTTP_403_FORBIDDEN,
            )

        progress = build_employee_progress_status(employee)
        if progress["overall_completion"] < 100 and not employee.is_administratively_completed:
            return Response(
                {
                    "detail": "Candidate requirements must be 100% complete or administratively completed before confirming travel.",
                    "progress": progress,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not employee.departure_date and not getattr(employee, "travel_booking", None):
            return Response(
                {"detail": "Departure date or travel booking is required before confirming travel."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        actual_travel_date = request.data.get("actual_travel_date") or employee.departure_date or timezone.localdate()
        employee.did_travel = True
        employee.travel_status = Employee.TRAVEL_STATUS_CONFIRMED
        employee.actual_travel_date = actual_travel_date
        employee.travel_confirmed_by = request.user
        employee.travel_confirmed_at = timezone.now()
        employee.arrival_status = Employee.ARRIVAL_STATUS_PENDING
        employee.save(
            update_fields=[
                "did_travel",
                "travel_status",
                "actual_travel_date",
                "travel_confirmed_by",
                "travel_confirmed_at",
                "arrival_status",
                "updated_at",
            ]
        )

        selection = getattr(employee, "selection", None)
        if selection and selection.agent:
            try:
                Notification.objects.create(
                    user=selection.agent,
                    title=f"Travel Confirmed: {employee.full_name}",
                    body=f"Travel has been confirmed for candidate {employee.full_name}. Please confirm candidate arrival within 3 business days of scheduled arrival.",
                    kind=Notification.KIND_INFO,
                )
            except Exception:
                pass

        log_audit(
            request.user,
            "employee.travel_confirm",
            resource_type="employee",
            resource_id=employee.pk,
            summary=f"Confirmed travel for employee {employee.full_name}",
            metadata={
                "employee_name": employee.full_name,
                "organization_id": organization.id if organization else None,
                "actual_travel_date": str(actual_travel_date),
            },
        )
        employee.refresh_from_db()
        return Response(
            EmployeeSerializer(employee, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class EmployeeArrivalConfirmView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def post(self, request, employee_pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        organization = get_user_organization(request.user)
        employee = (
            Employee.objects.select_related(
                "organization",
                "selection__agent",
                "travel_booking",
            )
            .filter(pk=employee_pk, organization=organization)
            .first()
        )
        if not employee:
            return Response({"detail": "Candidate not found."}, status=status.HTTP_404_NOT_FOUND)

        if not (employee.did_travel or employee.travel_status == Employee.TRAVEL_STATUS_CONFIRMED):
            return Response(
                {"detail": "Travel has not been confirmed for this candidate yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        scope, context = get_employee_user_scope(request.user, organization)
        selection = getattr(employee, "selection", None)
        is_org_admin = can_manage_process_for_organization(request.user, organization)
        is_assigned_agent = bool(
            scope == "agent" and context.get("agent_id") and selection and selection.agent_id == context["agent_id"]
        )

        if not (is_org_admin or is_assigned_agent):
            return Response(
                {"detail": "Only the assigned agent or organization administrator can confirm arrival."},
                status=status.HTTP_403_FORBIDDEN,
            )

        action = (request.data.get("action") or "confirm").strip().lower()
        if action == "confirm":
            actual_arrival_date = request.data.get("actual_arrival_date") or timezone.localdate()
            employee.arrival_status = Employee.ARRIVAL_STATUS_CONFIRMED
            employee.arrival_confirmed_by = request.user
            employee.arrival_confirmed_at = timezone.now()
            employee.actual_arrival_date = actual_arrival_date
            employee.employment_activated_at = timezone.now()
            if not employee.contract_start_date:
                employee.contract_start_date = actual_arrival_date
            employee.save(
                update_fields=[
                    "arrival_status",
                    "arrival_confirmed_by",
                    "arrival_confirmed_at",
                    "actual_arrival_date",
                    "employment_activated_at",
                    "contract_start_date",
                    "updated_at",
                ]
            )

            agent_user = selection.agent if selection else request.user
            existing_commission = CommissionRequest.objects.filter(
                organization=organization,
                employee=employee,
            ).first()
            if not existing_commission and agent_user:
                rate = Decimal("0.00")
                if hasattr(agent_user, "profile") and agent_user.profile.agent_commission:
                    rate = agent_user.profile.agent_commission
                CommissionRequest.objects.create(
                    organization=organization,
                    employee=employee,
                    agent=agent_user,
                    commission_rate=rate,
                    amount=rate,
                    status=CommissionRequest.STATUS_PENDING,
                    is_manual=False,
                    initiated_by=request.user,
                    notes="Auto-generated upon arrival confirmation and employment activation.",
                )

            try:
                Notification.objects.create(
                    user=request.user,
                    title=f"Employment Activated: {employee.full_name}",
                    body=f"Arrival confirmed. Candidate {employee.full_name} is now actively employed.",
                    kind=Notification.KIND_SUCCESS,
                )
                if selection and selection.agent_id != request.user.id:
                    Notification.objects.create(
                        user=selection.agent,
                        title=f"Employment Activated: {employee.full_name}",
                        body=f"Arrival confirmed. Candidate {employee.full_name} is now actively employed.",
                        kind=Notification.KIND_SUCCESS,
                    )
            except Exception:
                pass

            log_audit(
                request.user,
                "employee.arrival_confirm",
                resource_type="employee",
                resource_id=employee.pk,
                summary=f"Confirmed arrival for employee {employee.full_name}",
                metadata={
                    "employee_name": employee.full_name,
                    "organization_id": organization.id if organization else None,
                    "actual_arrival_date": str(actual_arrival_date),
                },
            )
        elif action in {"decline", "dispute"}:
            reason = (request.data.get("reason") or request.data.get("arrival_decline_reason") or "").strip()
            if not reason:
                return Response(
                    {"detail": "A reason is required when declining or disputing arrival."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            employee.arrival_status = Employee.ARRIVAL_STATUS_DECLINED
            employee.arrival_decline_reason = reason
            employee.save(update_fields=["arrival_status", "arrival_decline_reason", "updated_at"])

            try:
                for p in Profile.objects.filter(
                    organization=organization,
                    role__in=[Profile.ROLE_SUPERADMIN, Profile.ROLE_ADMIN],
                ):
                    Notification.objects.create(
                        user_id=p.user_id,
                        title=f"Arrival Disputed: {employee.full_name}",
                        body=f"Arrival was disputed for {employee.full_name}. Reason: {reason}",
                        kind=Notification.KIND_WARNING,
                    )
            except Exception:
                pass

            log_audit(
                request.user,
                "employee.arrival_dispute",
                resource_type="employee",
                resource_id=employee.pk,
                summary=f"Disputed arrival for employee {employee.full_name}: {reason}",
                metadata={
                    "employee_name": employee.full_name,
                    "organization_id": organization.id if organization else None,
                    "reason": reason,
                },
            )
        else:
            return Response(
                {"detail": f"Unsupported arrival action '{action}'. Use 'confirm' or 'decline'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        employee.refresh_from_db()
        return Response(
            EmployeeSerializer(employee, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class EmployeeReturnConfirmView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def post(self, request, employee_pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        organization = get_user_organization(request.user)
        employee = (
            Employee.objects.select_related(
                "organization",
                "selection__agent",
            )
            .filter(pk=employee_pk, organization=organization)
            .first()
        )
        if not employee:
            return Response({"detail": "Candidate not found."}, status=status.HTTP_404_NOT_FOUND)

        if not can_manage_process_for_organization(request.user, organization):
            return Response(
                {"detail": "Only organization administrators can confirm employee return."},
                status=status.HTTP_403_FORBIDDEN,
            )

        actual_return_date = request.data.get("actual_return_date") or timezone.localdate()
        employee.returned_from_employment = True
        employee.actual_return_date = actual_return_date
        employee.return_confirmed_by = request.user
        employee.return_confirmed_at = timezone.now()
        employee.is_overdue = False
        employee.is_active = False
        employee.save(
            update_fields=[
                "returned_from_employment",
                "actual_return_date",
                "return_confirmed_by",
                "return_confirmed_at",
                "is_overdue",
                "is_active",
                "updated_at",
            ]
        )

        employment_start = employee.contract_start_date or employee.actual_arrival_date or employee.actual_travel_date
        if employment_start:
            if hasattr(actual_return_date, "strftime"):
                ret_date = actual_return_date
            else:
                try:
                    from datetime import date
                    ret_date = date.fromisoformat(str(actual_return_date))
                except Exception:
                    ret_date = timezone.localdate()

            days_employed = (ret_date - employment_start).days
            if days_employed <= 90:
                selection = getattr(employee, "selection", None)
                agent = selection.agent if selection else None
                commission_req = CommissionRequest.objects.filter(
                    organization=organization,
                    employee=employee,
                ).first()
                if agent:
                    refund_amount = commission_req.amount if commission_req else Decimal("0.00")
                    RefundRecord.objects.get_or_create(
                        organization=organization,
                        employee=employee,
                        agent=agent,
                        defaults={
                            "commission_request": commission_req,
                            "refund_amount": refund_amount,
                            "remaining_balance": refund_amount,
                            "is_eligible_early_return": True,
                            "status": RefundRecord.STATUS_PENDING,
                        },
                    )

        log_audit(
            request.user,
            "employee.return_confirm",
            resource_type="employee",
            resource_id=employee.pk,
            summary=f"Confirmed return for employee {employee.full_name}",
            metadata={
                "employee_name": employee.full_name,
                "organization_id": organization.id if organization else None,
                "actual_return_date": str(actual_return_date),
            },
        )
        employee.refresh_from_db()
        return Response(
            EmployeeSerializer(employee, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )
