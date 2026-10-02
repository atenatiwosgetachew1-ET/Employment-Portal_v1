from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..licensing import get_access_restriction, get_user_organization
from ..models import Employee, EmployeeReturnRequest, EmployeeReversalRequest, Notification, Profile
from ..serializers import EmployeeSerializer
from .helpers import (
    EmployeesEnabled,
    auto_finalize_overdue_return,
    can_initiate_return_request,
    can_manage_process_for_organization,
    get_employee_user_scope,
    is_employee_employed,
    is_employee_returned,
)


class EmployeeReturnRequestView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]
    parser_classes = [MultiPartParser, FormParser]

    def _get_employee(self, request, employee_pk):
        organization = get_user_organization(request.user)
        return (
            Employee.objects.select_related(
                "organization",
                "selection__agent",
                "selection__selected_by",
                "return_request",
                "return_request__requested_by",
                "return_request__approved_by",
            )
            .filter(pk=employee_pk, organization=organization)
            .first()
        )

    def post(self, request, employee_pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)

        employee = self._get_employee(request, employee_pk)
        if not employee:
            return Response({"detail": "Candidate not found."}, status=status.HTTP_404_NOT_FOUND)

        employee = auto_finalize_overdue_return(employee)
        if not can_initiate_return_request(request.user, employee):
            return Response(
                {"detail": "Only the assigned agent side or organization-side admins can initiate a return."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not is_employee_employed(employee):
            return Response(
                {"detail": "Only currently employed employees can receive a return request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        remark = (request.data.get("remark") or "").strip()
        if not remark:
            return Response(
                {"detail": "Add a remark explaining the reason for initiating the return."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        evidence_files = [
            request.FILES.get("evidence_file_1"),
            request.FILES.get("evidence_file_2"),
            request.FILES.get("evidence_file_3"),
        ]
        if not any(evidence_files):
            return Response(
                {"detail": "Attach at least one evidence document."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return_request = getattr(employee, "return_request", None)
        if return_request and return_request.status == EmployeeReturnRequest.STATUS_PENDING:
            return Response(
                {"detail": "This employee already has a pending return request."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not return_request:
            return_request = EmployeeReturnRequest(
                employee=employee,
                organization=employee.organization,
            )

        return_request.status = EmployeeReturnRequest.STATUS_PENDING
        return_request.remark = remark
        return_request.requested_by = request.user
        return_request.requested_at = timezone.now()
        return_request.approved_by = None
        return_request.approved_at = None
        for index, file_obj in enumerate(evidence_files, start=1):
            if file_obj is not None:
                setattr(return_request, f"evidence_file_{index}", file_obj)
        return_request.save()

        requester = request.user
        requester_profile = getattr(requester, "profile", None)
        requester_is_agent = False
        if requester_profile:
            if requester_profile.role == Profile.ROLE_CUSTOMER:
                requester_is_agent = True
            elif requester_profile.role == Profile.ROLE_STAFF:
                staff_side = (requester_profile.staff_side or "").strip()
                org_name = (employee.organization.name or "").strip() if employee.organization else ""
                if staff_side and staff_side != org_name:
                    requester_is_agent = True

        recipient_user_ids = []
        org_name_lower = (employee.organization.name or "").strip().lower() if employee.organization else ""
        if requester_is_agent:
            if employee.organization_id:
                org_profiles = Profile.objects.filter(
                    organization_id=employee.organization_id,
                    role__in=[Profile.ROLE_SUPERADMIN, Profile.ROLE_ADMIN, Profile.ROLE_STAFF],
                ).exclude(user_id=requester.id)
                for p in org_profiles:
                    s_side = (p.staff_side or "").strip().lower()
                    if not s_side or s_side == org_name_lower:
                        recipient_user_ids.append(p.user_id)
        else:
            selection = getattr(employee, "selection", None)
            if selection and selection.agent_id:
                recipient_user_ids.append(selection.agent_id)
                agent_user = selection.agent
                agent_names = {agent_user.username.lower(), (agent_user.get_full_name() or "").lower()} if agent_user else set()
                agent_profiles = Profile.objects.filter(
                    organization_id=employee.organization_id,
                    role=Profile.ROLE_STAFF,
                ).exclude(user_id=requester.id)
                for p in agent_profiles:
                    s_side = (p.staff_side or "").strip().lower()
                    if s_side and (s_side in agent_names or s_side.replace(" ", "_") in agent_names):
                        recipient_user_ids.append(p.user_id)

        for uid in set(recipient_user_ids):
            Notification.objects.create(
                user_id=uid,
                title=f"Return request: {employee.full_name}",
                body=f"Return requested by {request.user.username}: \"{remark}\"",
                kind=Notification.KIND_WARNING,
            )

        employee.refresh_from_db()
        return Response(
            EmployeeSerializer(employee, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request, employee_pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)

        employee = self._get_employee(request, employee_pk)
        if not employee:
            return Response({"detail": "Candidate not found."}, status=status.HTTP_404_NOT_FOUND)

        return_request = getattr(employee, "return_request", None)
        if not return_request:
            return Response({"detail": "No return request found for this employee."}, status=status.HTTP_404_NOT_FOUND)
        if return_request.status != EmployeeReturnRequest.STATUS_PENDING:
            return Response(
                {"detail": f"This return request is already {return_request.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not can_initiate_return_request(request.user, employee):
            return Response(
                {"detail": "Only the assigned agent side can cancel a pending return request."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return_request.status = EmployeeReturnRequest.STATUS_CANCELLED
        return_request.approved_by = request.user
        return_request.approved_at = timezone.now()
        return_request.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
        full_name_clean = (employee.full_name or "").strip()
        Notification.objects.filter(
            Q(title__icontains=full_name_clean) | Q(body__icontains=full_name_clean),
            title__istartswith="Return request:"
        ).delete()
        employee.refresh_from_db()
        return Response(
            EmployeeSerializer(employee, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class EmployeeReturnRequestDecisionView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    decision_status = None

    def post(self, request, employee_pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)

        organization = get_user_organization(request.user)
        employee = (
            Employee.objects.select_related(
                "organization",
                "return_request",
                "return_request__requested_by",
                "return_request__approved_by",
            )
            .filter(pk=employee_pk, organization=organization)
            .first()
        )
        if not employee:
            return Response({"detail": "Candidate not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_process_for_organization(request.user, organization):
            return Response(
                {"detail": "Only organization-side admins can review a pending return request."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return_request = getattr(employee, "return_request", None)
        if not return_request:
            return Response({"detail": "No return request found for this employee."}, status=status.HTTP_404_NOT_FOUND)
        if return_request.status != EmployeeReturnRequest.STATUS_PENDING:
            return Response(
                {"detail": f"This return request is already {return_request.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return_request.status = self.decision_status
        return_request.approved_by = request.user
        return_request.approved_at = timezone.now()
        return_request.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

        if self.decision_status == EmployeeReturnRequest.STATUS_APPROVED:
            employee.returned_from_employment = True
            employee.returned_recorded_by = request.user
            employee.save(update_fields=["returned_from_employment", "returned_recorded_by", "is_active", "updated_at"])

        full_name_clean = (employee.full_name or "").strip()
        Notification.objects.filter(
            Q(title__icontains=full_name_clean) | Q(body__icontains=full_name_clean),
            title__istartswith="Return request:"
        ).delete()

        employee.refresh_from_db()
        return Response(
            EmployeeSerializer(employee, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class EmployeeReturnRequestApproveView(EmployeeReturnRequestDecisionView):
    decision_status = EmployeeReturnRequest.STATUS_APPROVED


class EmployeeReturnRequestRefuseView(EmployeeReturnRequestDecisionView):
    decision_status = EmployeeReturnRequest.STATUS_REFUSED


def get_user_side(user, organization):
    if not user:
        return "organization"
    profile = getattr(user, "profile", None)
    if not profile:
        return "organization"
    if profile.role == Profile.ROLE_CUSTOMER:
        return "agent"
    if profile.role == Profile.ROLE_STAFF:
        staff_side = (profile.staff_side or "").strip()
        org_name = (organization.name or "").strip() if organization else ""
        if staff_side and staff_side != org_name:
            return "agent"
    return "organization"


def can_initiate_reversal_request(user, employee):
    if not is_employee_returned(employee):
        return False
    organization = employee.organization
    if can_manage_process_for_organization(user, organization):
        return True
    scope, context = get_employee_user_scope(user, organization)
    if scope == "agent":
        selection = getattr(employee, "selection", None)
        return bool(selection and context.get("agent_id") and selection.agent_id == context["agent_id"])
    return False


def can_decide_reversal_request(user, employee, reversal_request):
    organization = employee.organization
    requester_side = get_user_side(reversal_request.requested_by, organization) if reversal_request.requested_by else "organization"
    if requester_side == "agent":
        return can_manage_process_for_organization(user, organization)
    else:
        selection = getattr(employee, "selection", None)
        if not selection or not selection.agent_id:
            return can_manage_process_for_organization(user, organization)
        scope, context = get_employee_user_scope(user, organization)
        return bool(scope == "agent" and context.get("agent_id") and selection.agent_id == context["agent_id"])


def can_cancel_reversal_request(user, employee, reversal_request):
    organization = employee.organization
    requester_side = get_user_side(reversal_request.requested_by, organization) if reversal_request.requested_by else "organization"
    user_side = get_user_side(user, organization)
    return user.id == reversal_request.requested_by_id or user_side == requester_side


class EmployeeReversalRequestView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def _get_employee(self, request, employee_pk):
        organization = get_user_organization(request.user)
        return (
            Employee.objects.select_related(
                "organization",
                "selection__agent",
                "selection__selected_by",
                "return_request",
                "reversal_request",
                "reversal_request__requested_by",
                "reversal_request__approved_by",
            )
            .filter(pk=employee_pk, organization=organization)
            .first()
        )

    def post(self, request, employee_pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)

        employee = self._get_employee(request, employee_pk)
        if not employee:
            return Response({"detail": "Candidate not found."}, status=status.HTTP_404_NOT_FOUND)

        if not can_initiate_reversal_request(request.user, employee):
            return Response(
                {"detail": "Only the assigned agent side or organization-side admins can initiate a reverse to employed request."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not is_employee_returned(employee):
            return Response(
                {"detail": "Only currently returned candidates can receive a reversal request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        remark = (request.data.get("remark") or "").strip()

        reversal_request = getattr(employee, "reversal_request", None)
        if reversal_request and reversal_request.status == EmployeeReversalRequest.STATUS_PENDING:
            return Response(
                {"detail": "This candidate already has a pending reversal request."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not reversal_request:
            reversal_request = EmployeeReversalRequest(
                employee=employee,
                organization=employee.organization,
            )

        reversal_request.status = EmployeeReversalRequest.STATUS_PENDING
        reversal_request.remark = remark
        reversal_request.requested_by = request.user
        reversal_request.requested_at = timezone.now()
        reversal_request.approved_by = None
        reversal_request.approved_at = None
        reversal_request.save()

        requester = request.user
        requester_side = get_user_side(requester, employee.organization)
        recipient_user_ids = []
        org_name_lower = (employee.organization.name or "").strip().lower() if employee.organization else ""

        if requester_side == "agent":
            if employee.organization_id:
                org_profiles = Profile.objects.filter(
                    organization_id=employee.organization_id,
                    role__in=[Profile.ROLE_SUPERADMIN, Profile.ROLE_ADMIN, Profile.ROLE_STAFF],
                ).exclude(user_id=requester.id)
                for p in org_profiles:
                    s_side = (p.staff_side or "").strip().lower()
                    if not s_side or s_side == org_name_lower:
                        recipient_user_ids.append(p.user_id)
        else:
            selection = getattr(employee, "selection", None)
            if selection and selection.agent_id:
                recipient_user_ids.append(selection.agent_id)
                agent_user = selection.agent
                agent_names = {agent_user.username.lower(), (agent_user.get_full_name() or "").lower()} if agent_user else set()
                agent_profiles = Profile.objects.filter(
                    organization_id=employee.organization_id,
                    role=Profile.ROLE_STAFF,
                ).exclude(user_id=requester.id)
                for p in agent_profiles:
                    s_side = (p.staff_side or "").strip().lower()
                    if s_side and (s_side in agent_names or s_side.replace(" ", "_") in agent_names):
                        recipient_user_ids.append(p.user_id)

        remark_text = f': "{remark}"' if remark else ""
        for uid in set(recipient_user_ids):
            Notification.objects.create(
                user_id=uid,
                title=f"Reversal request: {employee.full_name}",
                body=f"Reversal to employed requested by {request.user.username}{remark_text}",
                kind=Notification.KIND_WARNING,
            )

        employee.refresh_from_db()
        return Response(
            EmployeeSerializer(employee, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request, employee_pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)

        employee = self._get_employee(request, employee_pk)
        if not employee:
            return Response({"detail": "Candidate not found."}, status=status.HTTP_404_NOT_FOUND)

        reversal_request = getattr(employee, "reversal_request", None)
        if not reversal_request:
            return Response({"detail": "No reversal request found for this candidate."}, status=status.HTTP_404_NOT_FOUND)
        if reversal_request.status != EmployeeReversalRequest.STATUS_PENDING:
            return Response(
                {"detail": f"This reversal request is already {reversal_request.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not can_cancel_reversal_request(request.user, employee, reversal_request):
            return Response(
                {"detail": "Only the requesting party can cancel this pending reversal request."},
                status=status.HTTP_403_FORBIDDEN,
            )

        reversal_request.status = EmployeeReversalRequest.STATUS_CANCELLED
        reversal_request.approved_by = request.user
        reversal_request.approved_at = timezone.now()
        reversal_request.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

        full_name_clean = (employee.full_name or "").strip()
        Notification.objects.filter(
            Q(title__icontains=full_name_clean) | Q(body__icontains=full_name_clean),
            title__istartswith="Reversal request:"
        ).delete()

        employee.refresh_from_db()
        return Response(
            EmployeeSerializer(employee, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class EmployeeReversalRequestDecisionView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]
    decision_status = None

    def post(self, request, employee_pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)

        organization = get_user_organization(request.user)
        employee = (
            Employee.objects.select_related(
                "organization",
                "selection__agent",
                "return_request",
                "reversal_request",
                "reversal_request__requested_by",
                "reversal_request__approved_by",
            )
            .filter(pk=employee_pk, organization=organization)
            .first()
        )
        if not employee:
            return Response({"detail": "Candidate not found."}, status=status.HTTP_404_NOT_FOUND)

        reversal_request = getattr(employee, "reversal_request", None)
        if not reversal_request:
            return Response({"detail": "No reversal request found for this candidate."}, status=status.HTTP_404_NOT_FOUND)
        if reversal_request.status != EmployeeReversalRequest.STATUS_PENDING:
            return Response(
                {"detail": f"This reversal request is already {reversal_request.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not can_decide_reversal_request(request.user, employee, reversal_request):
            return Response(
                {"detail": "Only the acknowledging party can review this pending reversal request."},
                status=status.HTTP_403_FORBIDDEN,
            )

        reversal_request.status = self.decision_status
        reversal_request.approved_by = request.user
        reversal_request.approved_at = timezone.now()
        reversal_request.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

        if self.decision_status == EmployeeReversalRequest.STATUS_APPROVED:
            employee.returned_from_employment = False
            employee.returned_recorded_by = None
            return_req = getattr(employee, "return_request", None)
            if return_req:
                return_req.status = EmployeeReturnRequest.STATUS_REINSTATED
                return_req.save(update_fields=["status", "updated_at"])
            employee.save(update_fields=["returned_from_employment", "returned_recorded_by", "updated_at"])

        full_name_clean = (employee.full_name or "").strip()
        Notification.objects.filter(
            Q(title__icontains=full_name_clean) | Q(body__icontains=full_name_clean),
            title__istartswith="Reversal request:"
        ).delete()

        employee.refresh_from_db()
        return Response(
            EmployeeSerializer(employee, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class EmployeeReversalRequestApproveView(EmployeeReversalRequestDecisionView):
    decision_status = EmployeeReversalRequest.STATUS_APPROVED


class EmployeeReversalRequestRefuseView(EmployeeReversalRequestDecisionView):
    decision_status = EmployeeReversalRequest.STATUS_REFUSED
