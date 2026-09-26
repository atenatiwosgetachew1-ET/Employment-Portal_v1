from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..audit_log import log_audit
from ..employee_selection import get_selection_agent_for_user
from ..licensing import get_access_restriction, get_user_organization
from ..models import Employee, EmployeeSelection, EmployeeSelectionInterest
from ..serializers import EmployeeSerializer
from .helpers import (
    EmployeesEnabled,
    can_initiate_employee_process,
    can_manage_process_for_organization,
    get_agent_by_id_for_organization,
)


class EmployeeSelectionView(APIView):
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
                "selection__selected_by",
            )
            .prefetch_related("selection_interests__agent", "selection_interests__selected_by")
            .filter(pk=employee_pk, organization=organization)
            .first()
        )
        if not employee:
            return Response({"detail": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

        agent = get_selection_agent_for_user(request.user, organization=organization)
        if not agent:
            return Response(
                {"detail": "Only agent-side users can select employees."},
                status=status.HTTP_403_FORBIDDEN,
            )

        selection = getattr(employee, "selection", None)
        if selection and selection.agent_id != agent.id:
            return Response(
                {"detail": "This employee is already selected or under process by another agent."},
                status=status.HTTP_409_CONFLICT,
            )

        interest, created = EmployeeSelectionInterest.objects.get_or_create(
            organization=organization,
            employee=employee,
            agent=agent,
            defaults={"selected_by": request.user},
        )
        if not created:
            interest.selected_by = request.user
            interest.save(update_fields=["selected_by", "updated_at"])

        if not selection:
            selection = EmployeeSelection.objects.create(
                organization=organization,
                employee=employee,
                agent=agent,
                selected_by=request.user,
                status=EmployeeSelection.STATUS_SELECTED,
            )
        elif selection.status != EmployeeSelection.STATUS_UNDER_PROCESS:
            selection.agent = agent
            selection.selected_by = request.user
            selection.status = EmployeeSelection.STATUS_SELECTED
            selection.save(update_fields=["agent", "selected_by", "status", "updated_at"])

        log_audit(
            request.user,
            "employee.select",
            resource_type="employee",
            resource_id=employee.pk,
            summary=f"Selected employee {employee.full_name}",
            metadata={
                "employee_name": employee.full_name,
                "organization_id": organization.id if organization else None,
                "agent_id": agent.id,
                "agent_username": agent.username,
            },
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
        organization = get_user_organization(request.user)
        employee = (
            Employee.objects.select_related(
                "organization",
                "selection__agent",
                "selection__selected_by",
            )
            .prefetch_related("selection_interests__agent", "selection_interests__selected_by")
            .filter(pk=employee_pk, organization=organization)
            .first()
        )
        if not employee:
            return Response({"detail": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

        agent = get_selection_agent_for_user(request.user, organization=organization)
        if not agent:
            return Response(
                {"detail": "Only agent-side users can remove employee selections."},
                status=status.HTTP_403_FORBIDDEN,
            )

        interest = (
            EmployeeSelectionInterest.objects.filter(
                organization=organization,
                employee=employee,
                agent=agent,
            )
            .select_related("agent")
            .first()
        )
        if not interest:
            return Response(status=status.HTTP_204_NO_CONTENT)
        if interest.selected_by_id != request.user.id and agent.id != request.user.id:
            return Response(
                {"detail": "Only the account that selected this employee or the agent owner can remove this selection."},
                status=status.HTTP_403_FORBIDDEN,
            )

        log_audit(
            request.user,
            "employee.unselect",
            resource_type="employee",
            resource_id=employee.pk,
            summary=f"Removed selection for employee {employee.full_name}",
            metadata={
                "employee_name": employee.full_name,
                "organization_id": organization.id if organization else None,
                "agent_id": interest.agent_id,
                "agent_username": interest.agent.username,
            },
        )
        interest.delete()
        selection = getattr(employee, "selection", None)
        if selection and selection.agent_id == agent.id and selection.status != EmployeeSelection.STATUS_UNDER_PROCESS:
            selection.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EmployeeProcessStartView(APIView):
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
                "selection__selected_by",
                "selection__process_initiated_by",
            )
            .prefetch_related("selection_interests__agent", "selection_interests__selected_by")
            .filter(pk=employee_pk, organization=organization)
            .first()
        )
        if not employee:
            return Response({"detail": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

        if employee.status != Employee.STATUS_APPROVED:
            return Response(
                {"detail": "Only approved employees can have a process initiated."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        selection = getattr(employee, "selection", None)
        acting_on_behalf = can_manage_process_for_organization(request.user, organization)
        if acting_on_behalf:
            target_agent = get_agent_by_id_for_organization(
                organization,
                request.data.get("agent_id"),
            )
            if not target_agent:
                return Response(
                    {"detail": "Choose an active agent account to start this process."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if selection and selection.status == EmployeeSelection.STATUS_UNDER_PROCESS:
                return Response(
                    {"detail": "This employee is already under process."},
                    status=status.HTTP_409_CONFLICT,
                )
            EmployeeSelectionInterest.objects.get_or_create(
                organization=organization,
                employee=employee,
                agent=target_agent,
                defaults={"selected_by": request.user},
            )
            if selection:
                selection.agent = target_agent
                selection.selected_by = request.user
                selection.status = EmployeeSelection.STATUS_UNDER_PROCESS
                selection.process_initiated_by = request.user
                selection.process_started_at = timezone.now()
                selection.save(
                    update_fields=[
                        "agent",
                        "selected_by",
                        "status",
                        "process_initiated_by",
                        "process_started_at",
                        "updated_at",
                    ]
                )
            else:
                selection = EmployeeSelection.objects.create(
                    organization=organization,
                    employee=employee,
                    agent=target_agent,
                    selected_by=request.user,
                    status=EmployeeSelection.STATUS_UNDER_PROCESS,
                    process_initiated_by=request.user,
                    process_started_at=timezone.now(),
                )
        else:
            agent_account = get_selection_agent_for_user(request.user, organization=organization)
            if not agent_account or not can_initiate_employee_process(request.user, employee):
                return Response(
                    {"detail": "Only the main agent account for this selected employee can initiate a process."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if selection and selection.status == EmployeeSelection.STATUS_UNDER_PROCESS:
                return Response(
                    {"detail": "This employee is already under process."},
                    status=status.HTTP_409_CONFLICT,
                )
            has_selection = bool(selection and selection.agent_id == agent_account.id)
            has_interest = EmployeeSelectionInterest.objects.filter(
                organization=organization,
                employee=employee,
                agent=agent_account,
            ).exists()
            if not has_selection and not has_interest:
                return Response(
                    {"detail": "Employee must be selected by your agent before starting a process."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if selection:
                selection.agent = agent_account
                selection.selected_by = request.user
                selection.status = EmployeeSelection.STATUS_UNDER_PROCESS
                selection.process_initiated_by = request.user
                selection.process_started_at = timezone.now()
                selection.save(
                    update_fields=[
                        "agent",
                        "selected_by",
                        "status",
                        "process_initiated_by",
                        "process_started_at",
                        "updated_at",
                    ]
                )
            else:
                selection = EmployeeSelection.objects.create(
                    organization=organization,
                    employee=employee,
                    agent=agent_account,
                    selected_by=request.user,
                    status=EmployeeSelection.STATUS_UNDER_PROCESS,
                    process_initiated_by=request.user,
                    process_started_at=timezone.now(),
                )

        log_audit(
            request.user,
            "employee.process_start",
            resource_type="employee",
            resource_id=employee.pk,
            summary=f"Started processing employee {employee.full_name}",
            metadata={
                "employee_name": employee.full_name,
                "organization_id": organization.id if organization else None,
                "agent_id": selection.agent_id,
                "agent_username": selection.agent.username,
            },
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

        organization = get_user_organization(request.user)
        employee = (
            Employee.objects.select_related(
                "organization",
                "selection__agent",
                "selection__selected_by",
                "selection__process_initiated_by",
            )
            .prefetch_related("selection_interests__agent", "selection_interests__selected_by")
            .filter(pk=employee_pk, organization=organization)
            .first()
        )
        if not employee:
            return Response({"detail": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

        if not (
            can_initiate_employee_process(request.user, employee)
            or can_manage_process_for_organization(request.user, organization)
        ):
            return Response(
                {"detail": "Only the main agent account or an admin/superadmin can decline a process."},
                status=status.HTTP_403_FORBIDDEN,
            )

        selection = getattr(employee, "selection", None)
        if not selection or selection.status != EmployeeSelection.STATUS_UNDER_PROCESS:
            return Response(
                {"detail": "This employee is not currently under process."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        EmployeeSelectionInterest.objects.get_or_create(
            organization=organization,
            employee=employee,
            agent=selection.agent,
            defaults={"selected_by": request.user},
        )
        selection.status = EmployeeSelection.STATUS_SELECTED
        selection.process_initiated_by = None
        selection.process_started_at = None
        selection.save(
            update_fields=[
                "status",
                "process_initiated_by",
                "process_started_at",
                "updated_at",
            ]
        )

        log_audit(
            request.user,
            "employee.process_decline",
            resource_type="employee",
            resource_id=employee.pk,
            summary=f"Declined processing for employee {employee.full_name}",
            metadata={
                "employee_name": employee.full_name,
                "organization_id": organization.id if organization else None,
                "agent_id": selection.agent_id,
                "agent_username": selection.agent.username,
            },
        )
        employee.refresh_from_db()
        return Response(
            EmployeeSerializer(employee, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class EmployeeProcessDeclineView(EmployeeProcessStartView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def post(self, request, employee_pk):
        return super().delete(request, employee_pk)
