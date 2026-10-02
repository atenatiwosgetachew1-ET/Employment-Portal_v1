from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit_log import log_audit
from .employee_selection import get_selection_agent_for_user
from .employee_views.helpers import EmployeesEnabled, get_employee_user_scope
from .licensing import get_access_restriction, get_user_organization
from .models import (
    CommissionRequest,
    CommissionSettlement,
    Employee,
    PenaltyRecord,
    Profile,
    RefundRecord,
    RegulationSettlementRequest,
    User,
)
from .serializers import (
    CommissionRequestSerializer,
    CommissionSettlementSerializer,
    PenaltyRecordSerializer,
    RefundRecordSerializer,
    RegulationSettlementRequestSerializer,
)


def get_agent_commission_rate(agent_user):
    if not agent_user:
        return Decimal("0.00")
    profile = getattr(agent_user, "profile", None)
    if profile and profile.agent_commission is not None:
        return profile.agent_commission
    agent_office = getattr(profile, "agent_office", None)
    if agent_office and agent_office.commission is not None:
        return agent_office.commission
    return Decimal("0.00")


class CommissionRequestListView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def get(self, request):
        organization = get_user_organization(request.user)
        user_scope, agent_context = get_employee_user_scope(request.user, organization)

        queryset = CommissionRequest.objects.filter(
            organization=organization
        ).select_related("employee", "agent", "initiated_by")

        if user_scope == "agent" and agent_context.get("agent_id"):
            queryset = queryset.filter(agent_id=agent_context["agent_id"])

        agent_filter = request.query_params.get("agent_id")
        if agent_filter:
            queryset = queryset.filter(agent_id=agent_filter)

        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        employee_filter = request.query_params.get("employee_id")
        if employee_filter:
            queryset = queryset.filter(employee_id=employee_filter)

        serializer = CommissionRequestSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)

        organization = get_user_organization(request.user)
        user_scope, _ = get_employee_user_scope(request.user, organization)
        if user_scope != "organization":
            return Response(
                {"detail": "Only organization users can manually create commission requests."},
                status=status.HTTP_403_FORBIDDEN,
            )

        employee_id = request.data.get("employee_id") or request.data.get("candidate_id")
        if not employee_id:
            return Response({"detail": "Employee ID is mandatory."}, status=status.HTTP_400_BAD_REQUEST)

        employee = Employee.objects.filter(pk=employee_id, organization=organization).select_related("selection__agent").first()
        if not employee:
            return Response({"detail": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

        if not (employee.did_travel or employee.employment_activated_at):
            return Response(
                {"detail": "Only employed candidates are eligible for commission requests."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Agent determination
        agent_id = request.data.get("agent_id")
        target_agent = None
        if agent_id:
            target_agent = User.objects.filter(pk=agent_id, profile__organization=organization).first()
        elif getattr(employee, "selection", None) and employee.selection.agent:
            target_agent = employee.selection.agent

        if not target_agent:
            return Response({"detail": "An associated agent must be identified."}, status=status.HTTP_400_BAD_REQUEST)

        # Duplicate check
        existing = CommissionRequest.objects.filter(
            organization=organization,
            employee=employee,
            agent=target_agent,
            status__in=[CommissionRequest.STATUS_PENDING, CommissionRequest.STATUS_APPROVED, CommissionRequest.STATUS_SETTLED],
        ).first()
        if existing:
            return Response(
                {"detail": f"A commission request for this candidate and agent already exists (Status: {existing.status})."},
                status=status.HTTP_409_CONFLICT,
            )

        # Rate determination
        rate = get_agent_commission_rate(target_agent)
        custom_amount = request.data.get("amount")
        amount = Decimal(str(custom_amount)) if custom_amount is not None else rate
        notes = request.data.get("notes") or request.data.get("reason", "")

        comm_req = CommissionRequest.objects.create(
            organization=organization,
            employee=employee,
            agent=target_agent,
            commission_rate=rate,
            amount=amount,
            status=CommissionRequest.STATUS_PENDING,
            is_manual=True,
            initiated_by=request.user,
            notes=notes,
        )

        log_audit(
            request.user,
            "commission.request.create",
            resource_type="commission_request",
            resource_id=comm_req.pk,
            summary=f"Created manual commission request for {employee.full_name} (${amount})",
            metadata={
                "employee_id": employee.id,
                "agent_id": target_agent.id,
                "amount": str(amount),
            },
        )

        return Response(
            CommissionRequestSerializer(comm_req, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class CommissionSettlementListView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        organization = get_user_organization(request.user)
        user_scope, agent_context = get_employee_user_scope(request.user, organization)

        queryset = CommissionSettlement.objects.filter(
            organization=organization
        ).select_related("agent", "settled_by").prefetch_related("commission_requests__employee")

        if user_scope == "agent" and agent_context.get("agent_id"):
            queryset = queryset.filter(agent_id=agent_context["agent_id"])

        agent_filter = request.query_params.get("agent_id")
        if agent_filter:
            queryset = queryset.filter(agent_id=agent_filter)

        serializer = CommissionSettlementSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)

        organization = get_user_organization(request.user)
        user_scope, agent_context = get_employee_user_scope(request.user, organization)

        agent_id = request.data.get("agent_id")
        if user_scope == "agent":
            agent_id = agent_context.get("agent_id")
        if not agent_id:
            return Response({"detail": "Agent ID is required for settlement."}, status=status.HTTP_400_BAD_REQUEST)

        agent = User.objects.filter(pk=agent_id, profile__organization=organization).first()
        if not agent:
            return Response({"detail": "Agent not found."}, status=status.HTTP_404_NOT_FOUND)

        request_ids_raw = request.data.get("request_ids", [])
        if isinstance(request_ids_raw, str):
            import json
            try:
                request_ids = json.loads(request_ids_raw)
            except Exception:
                request_ids = [int(x.strip()) for x in request_ids_raw.split(",") if x.strip().isdigit()]
        else:
            request_ids = list(request_ids_raw)

        refund_ids_raw = request.data.get("refund_ids", [])
        if isinstance(refund_ids_raw, str):
            import json
            try:
                refund_ids = json.loads(refund_ids_raw)
            except Exception:
                refund_ids = [int(x.strip()) for x in refund_ids_raw.split(",") if x.strip().isdigit()]
        else:
            refund_ids = list(refund_ids_raw)

        notes = request.data.get("notes", "")

        with transaction.atomic():
            comm_requests = list(
                CommissionRequest.objects.select_for_update().filter(
                    id__in=request_ids,
                    organization=organization,
                    agent=agent,
                )
            )

            total_comm = sum(req.amount for req in comm_requests)
            if not comm_requests and not refund_ids:
                manual_amount = request.data.get("amount")
                if manual_amount:
                    total_comm = Decimal(str(manual_amount))
                else:
                    return Response({"detail": "Select at least one commission request or enter an amount."}, status=status.HTTP_400_BAD_REQUEST)

            # Process refund deductions
            total_refund_deduction = Decimal("0.00")
            if refund_ids:
                refunds = list(
                    RefundRecord.objects.select_for_update().filter(
                        id__in=refund_ids,
                        organization=organization,
                        agent=agent,
                        remaining_balance__gt=Decimal("0.00"),
                    )
                )
                available_to_deduct = total_comm
                for ref in refunds:
                    if available_to_deduct <= Decimal("0.00"):
                        break
                    deduct = min(ref.remaining_balance, available_to_deduct)
                    ref.deducted_amount += deduct
                    ref.remaining_balance -= deduct
                    available_to_deduct -= deduct
                    total_refund_deduction += deduct
                    if ref.remaining_balance <= Decimal("0.00"):
                        ref.status = RefundRecord.STATUS_FULLY_DEDUCTED
                    else:
                        ref.status = RefundRecord.STATUS_PARTIALLY_DEDUCTED
                    ref.save(update_fields=["deducted_amount", "remaining_balance", "status", "updated_at"])

            net_amount = max(Decimal("0.00"), total_comm - total_refund_deduction)

            settlement = CommissionSettlement.objects.create(
                organization=organization,
                agent=agent,
                settlement_type=CommissionSettlement.TYPE_COMMISSION,
                total_amount=total_comm,
                deducted_refund_amount=total_refund_deduction,
                net_amount=net_amount,
                settled_by=request.user,
                settled_at=timezone.now(),
                receipt_file_1=request.FILES.get("receipt_file_1"),
                receipt_file_2=request.FILES.get("receipt_file_2"),
                receipt_file_3=request.FILES.get("receipt_file_3"),
                notes=notes,
            )

            if comm_requests:
                settlement.commission_requests.set(comm_requests)
                for req in comm_requests:
                    req.status = CommissionRequest.STATUS_SETTLED
                    req.save(update_fields=["status", "updated_at"])

            log_audit(
                request.user,
                "commission.settle",
                resource_type="commission_settlement",
                resource_id=settlement.pk,
                summary=f"Settled ${net_amount} for agent {agent.username} (Gross: ${total_comm}, Deductions: ${total_refund_deduction})",
                metadata={
                    "agent_id": agent.id,
                    "net_amount": str(net_amount),
                    "total_amount": str(total_comm),
                    "refund_deductions": str(total_refund_deduction),
                    "settlement_id": settlement.id,
                },
            )

        return Response(
            CommissionSettlementSerializer(settlement, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class RegulationSettlementRequestListView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def get(self, request):
        organization = get_user_organization(request.user)
        user_scope, agent_context = get_employee_user_scope(request.user, organization)

        queryset = RegulationSettlementRequest.objects.filter(
            organization=organization
        ).select_related("agent", "initiated_by")

        if user_scope == "agent" and agent_context.get("agent_id"):
            queryset = queryset.filter(agent_id=agent_context["agent_id"])

        serializer = RegulationSettlementRequestSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)

        organization = get_user_organization(request.user)
        amount_raw = request.data.get("amount")
        if not amount_raw:
            return Response({"detail": "Amount is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(amount_raw))
        except Exception:
            return Response({"detail": "Enter a valid amount."}, status=status.HTTP_400_BAD_REQUEST)

        reason = request.data.get("reason", "")
        agent_id = request.data.get("agent_id")
        agent = None
        if agent_id:
            agent = User.objects.filter(pk=agent_id, profile__organization=organization).first()

        current_month = timezone.localdate().strftime("%Y-%m")

        with transaction.atomic():
            month_count = RegulationSettlementRequest.objects.filter(
                organization=organization,
                month_period=current_month,
            ).count()

            is_free = month_count < 2

            reg_req = RegulationSettlementRequest.objects.create(
                organization=organization,
                agent=agent,
                amount=amount,
                reason=reason,
                status=RegulationSettlementRequest.STATUS_PENDING,
                is_free_allowance=is_free,
                month_period=current_month,
                initiated_by=request.user,
            )

            log_audit(
                request.user,
                "regulation.request.create",
                resource_type="regulation_settlement",
                resource_id=reg_req.pk,
                summary=f"Created regulation settlement request (${amount}, Free: {is_free})",
                metadata={
                    "month": current_month,
                    "is_free": is_free,
                    "month_count": month_count + 1,
                },
            )

        return Response(
            RegulationSettlementRequestSerializer(reg_req, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class RefundRecordListView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def get(self, request):
        organization = get_user_organization(request.user)
        user_scope, agent_context = get_employee_user_scope(request.user, organization)

        queryset = RefundRecord.objects.filter(
            organization=organization
        ).select_related("employee", "agent", "return_request", "commission_request", "approved_by")

        if user_scope == "agent" and agent_context.get("agent_id"):
            queryset = queryset.filter(agent_id=agent_context["agent_id"])

        agent_filter = request.query_params.get("agent_id")
        if agent_filter:
            queryset = queryset.filter(agent_id=agent_filter)

        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        serializer = RefundRecordSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class PenaltyRecordListView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def get(self, request):
        organization = get_user_organization(request.user)
        user_scope, agent_context = get_employee_user_scope(request.user, organization)

        queryset = PenaltyRecord.objects.filter(
            organization=organization
        ).select_related("employee", "agent", "created_by")

        if user_scope == "agent" and agent_context.get("agent_id"):
            queryset = queryset.filter(agent_id=agent_context["agent_id"])

        serializer = PenaltyRecordSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)

        organization = get_user_organization(request.user)
        amount_raw = request.data.get("amount")
        if not amount_raw:
            return Response({"detail": "Amount is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(amount_raw))
        except Exception:
            return Response({"detail": "Enter a valid amount."}, status=status.HTTP_400_BAD_REQUEST)

        reason = request.data.get("reason", "")
        responsible_party = request.data.get("responsible_party", PenaltyRecord.PARTY_AGENT)
        employee_id = request.data.get("employee_id")
        employee = Employee.objects.filter(pk=employee_id, organization=organization).first() if employee_id else None

        agent_id = request.data.get("agent_id")
        agent = User.objects.filter(pk=agent_id, profile__organization=organization).first() if agent_id else None

        penalty = PenaltyRecord.objects.create(
            organization=organization,
            employee=employee,
            agent=agent,
            amount=amount,
            reason=reason,
            responsible_party=responsible_party,
            status=PenaltyRecord.STATUS_PENDING,
            created_by=request.user,
        )

        log_audit(
            request.user,
            "penalty.create",
            resource_type="penalty_record",
            resource_id=penalty.pk,
            summary=f"Created penalty of ${amount} ({reason})",
            metadata={"amount": str(amount), "responsible_party": responsible_party},
        )

        return Response(
            PenaltyRecordSerializer(penalty, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class CommissionRequestDetailView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def patch(self, request, pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        organization = get_user_organization(request.user)
        user_scope, _ = get_employee_user_scope(request.user, organization)
        if user_scope != "organization":
            return Response({"detail": "Only organization users can update commission requests."}, status=status.HTTP_403_FORBIDDEN)

        comm_req = CommissionRequest.objects.filter(pk=pk, organization=organization).first()
        if not comm_req:
            return Response({"detail": "Commission request not found."}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get("status")
        if new_status and new_status in dict(CommissionRequest.STATUS_CHOICES):
            comm_req.status = new_status
        new_amount = request.data.get("amount")
        if new_amount is not None:
            comm_req.amount = Decimal(str(new_amount))
        if "notes" in request.data:
            comm_req.notes = request.data.get("notes", "")

        comm_req.save()
        log_audit(
            request.user,
            "commission.request.update",
            resource_type="commission_request",
            resource_id=comm_req.pk,
            summary=f"Updated commission request {comm_req.pk} to {comm_req.status}",
        )
        return Response(CommissionRequestSerializer(comm_req, context={"request": request}).data)


class RegulationSettlementRequestDetailView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def patch(self, request, pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        organization = get_user_organization(request.user)
        user_scope, _ = get_employee_user_scope(request.user, organization)
        if user_scope != "organization":
            return Response({"detail": "Only organization users can update regulation requests."}, status=status.HTTP_403_FORBIDDEN)

        reg_req = RegulationSettlementRequest.objects.filter(pk=pk, organization=organization).first()
        if not reg_req:
            return Response({"detail": "Regulation request not found."}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get("status")
        if new_status and new_status in dict(RegulationSettlementRequest.STATUS_CHOICES):
            reg_req.status = new_status
            if new_status == RegulationSettlementRequest.STATUS_APPROVED:
                reg_req.approved_by = request.user
                reg_req.approved_at = timezone.now()

        reg_req.save()
        log_audit(
            request.user,
            "regulation.request.update",
            resource_type="regulation_settlement",
            resource_id=reg_req.pk,
            summary=f"Updated regulation request {reg_req.pk} to {reg_req.status}",
        )
        return Response(RegulationSettlementRequestSerializer(reg_req, context={"request": request}).data)


class PenaltyRecordDetailView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def patch(self, request, pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        organization = get_user_organization(request.user)
        user_scope, _ = get_employee_user_scope(request.user, organization)
        if user_scope != "organization":
            return Response({"detail": "Only organization users can update penalty records."}, status=status.HTTP_403_FORBIDDEN)

        penalty = PenaltyRecord.objects.filter(pk=pk, organization=organization).first()
        if not penalty:
            return Response({"detail": "Penalty record not found."}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get("status")
        if new_status and new_status in dict(PenaltyRecord.STATUS_CHOICES):
            penalty.status = new_status
            if new_status == PenaltyRecord.STATUS_SETTLED:
                penalty.settled_at = timezone.now()
                penalty.settled_by = request.user

        penalty.save()
        log_audit(
            request.user,
            "penalty.update",
            resource_type="penalty_record",
            resource_id=penalty.pk,
            summary=f"Updated penalty record {penalty.pk} to {penalty.status}",
        )
        return Response(PenaltyRecordSerializer(penalty, context={"request": request}).data)
