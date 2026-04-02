from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit_log import log_audit
from .auth_utils import feature_enabled, is_admin, is_superadmin
from .employee_selection import build_agent_context, get_selection_agent_for_user
from .licensing import get_access_restriction, get_user_organization
from django.contrib.auth.models import User
from .models import Employee, EmployeeDocument, EmployeeSelection, Profile
from .platform_views import UserPagination
from .serializers import (
    build_employee_progress_status,
    EmployeeDocumentCreateSerializer,
    EmployeeDocumentSerializer,
    EmployeeListSerializer,
    EmployeeSerializer,
)


def get_employee_user_scope(user, organization):
    context = build_agent_context(user, organization=organization)
    if context["is_agent_side"]:
        return "agent", context
    return "organization", context


def can_manage_employee_registration(user, organization):
    scope, _ = get_employee_user_scope(user, organization)
    role = getattr(user.profile, "role", "")
    return scope == "organization" and role in {
        Profile.ROLE_SUPERADMIN,
        Profile.ROLE_ADMIN,
        Profile.ROLE_STAFF,
    }


def can_update_employee(user, employee):
    organization = employee.organization
    scope, context = get_employee_user_scope(user, organization)
    if scope == "organization":
        return True
    selection = getattr(employee, "selection", None)
    return bool(selection and context["agent_id"] and selection.agent_id == context["agent_id"])


def can_initiate_employee_process(user, employee):
    if getattr(user.profile, "role", "") != Profile.ROLE_CUSTOMER:
        return False
    selection = getattr(employee, "selection", None)
    return bool(selection and selection.agent_id == user.id)


def can_manage_process_for_organization(user, organization):
    scope, _ = get_employee_user_scope(user, organization)
    return scope == "organization" and (is_superadmin(user) or is_admin(user))


def can_override_employee_progress(user, organization):
    return can_manage_process_for_organization(user, organization)


def get_agent_by_id_for_organization(organization, agent_id):
    if not agent_id:
        return None
    return (
        User.objects.filter(
            pk=agent_id,
            profile__organization=organization,
            profile__role=Profile.ROLE_CUSTOMER,
            is_active=True,
        )
        .select_related("profile")
        .first()
    )


def is_employee_employed(employee):
    return bool(
        employee.did_travel
        and build_employee_progress_status(employee)["overall_completion"] == 100
    )


class EmployeesEnabled(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and feature_enabled("employees_enabled")
        )


class EmployeeListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]
    pagination_class = UserPagination

    def get_queryset(self):
        organization = get_user_organization(self.request.user)
        queryset = Employee.objects.select_related(
            "registered_by",
            "updated_by",
            "organization",
            "selection__agent",
            "selection__selected_by",
        ).prefetch_related("documents")
        if organization:
            queryset = queryset.filter(organization=organization)
        else:
            return Employee.objects.none()

        selected_scope = (self.request.query_params.get("selected_scope") or "").strip().lower()
        process_scope = (self.request.query_params.get("process_scope") or "").strip().lower()
        employed_scope = (self.request.query_params.get("employed_scope") or "").strip().lower()
        user_scope, agent_context = get_employee_user_scope(self.request.user, organization)
        q = (self.request.query_params.get("q") or "").strip()
        is_active = (self.request.query_params.get("is_active") or "").strip().lower()
        mine = (self.request.query_params.get("mine") or "").strip().lower()
        if q:
            queryset = queryset.filter(
                Q(full_name__icontains=q)
                | Q(professional_title__icontains=q)
                | Q(profession__icontains=q)
                | Q(email__icontains=q)
                | Q(phone__icontains=q)
                | Q(mobile_number__icontains=q)
            )
        if is_active in {"true", "false"}:
            queryset = queryset.filter(is_active=(is_active == "true"))
        if mine == "true":
            queryset = queryset.filter(registered_by=self.request.user)
        if employed_scope in {"mine", "organization"}:
            if user_scope == "organization":
                return queryset
            return queryset.filter(selection__agent_id=agent_context["agent_id"])
        if process_scope in {"mine", "organization"}:
            if user_scope == "organization":
                queryset = queryset.filter(
                    selection__status=EmployeeSelection.STATUS_UNDER_PROCESS,
                )
            else:
                queryset = queryset.filter(
                    selection__status=EmployeeSelection.STATUS_UNDER_PROCESS,
                    selection__agent_id=agent_context["agent_id"],
                )
        elif selected_scope == "organization":
            queryset = queryset.filter(
                selection__isnull=False,
                selection__status=EmployeeSelection.STATUS_SELECTED,
            )
        elif selected_scope == "mine":
            if user_scope != "agent" or not agent_context["agent_id"]:
                return queryset.none()
            queryset = queryset.filter(
                selection__agent_id=agent_context["agent_id"],
                selection__status=EmployeeSelection.STATUS_SELECTED,
            )
        else:
            if user_scope == "organization":
                return queryset
            queryset = queryset.filter(
                Q(selection__status=EmployeeSelection.STATUS_UNDER_PROCESS, selection__agent_id=agent_context["agent_id"])
                | ~Q(selection__status=EmployeeSelection.STATUS_UNDER_PROCESS)
            )
        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        organization = get_user_organization(request.user)
        user_scope, agent_context = get_employee_user_scope(request.user, organization)
        employed_scope = (request.query_params.get("employed_scope") or "").strip().lower()
        process_scope = (request.query_params.get("process_scope") or "").strip().lower()
        selected_scope = (request.query_params.get("selected_scope") or "").strip().lower()
        should_python_filter = employed_scope in {"mine", "organization"} or (
            user_scope == "agent"
            and employed_scope not in {"mine", "organization"}
            and process_scope not in {"mine", "organization"}
            and selected_scope != "mine"
        )

        if should_python_filter:
            queryset = [
                employee
                for employee in queryset
                if (
                    is_employee_employed(employee)
                    if employed_scope in {"mine", "organization"}
                    else not (
                        is_employee_employed(employee)
                        and getattr(employee, "selection", None)
                        and employee.selection.agent_id != agent_context["agent_id"]
                    )
                )
            ]
            page = self.paginate_queryset(queryset)
            if page is not None:
                serializer = self.get_serializer(page, many=True)
                return self.get_paginated_response(serializer.data)
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        return super().list(request, *args, **kwargs)

    def get_serializer_class(self):
        if self.request.method == "POST":
            return EmployeeSerializer
        return EmployeeListSerializer

    def create(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        organization = get_user_organization(request.user)
        if not can_manage_employee_registration(request.user, organization):
            return Response(
                {"detail": "Only organization-side privileged users can register employees."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = serializer.save(
            organization=organization,
            registered_by=request.user,
            updated_by=request.user,
        )
        log_audit(
            request.user,
            "employee.create",
            resource_type="employee",
            resource_id=employee.pk,
            summary=f"Created employee {employee.full_name}",
            metadata={
                "employee_name": employee.full_name,
                "organization_id": organization.id if organization else None,
            },
        )
        response_data = EmployeeSerializer(
            employee, context=self.get_serializer_context()
        ).data
        response_data.update({"success": True, "message": "Employee created successfully."})
        return Response(response_data, status=status.HTTP_201_CREATED)


class EmployeeRetrieveUpdateDestroyView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]
    serializer_class = EmployeeSerializer

    def get_queryset(self):
        organization = get_user_organization(self.request.user)
        queryset = Employee.objects.select_related(
            "registered_by",
            "updated_by",
            "organization",
            "selection__agent",
            "selection__selected_by",
        ).prefetch_related("documents")
        if organization:
            return queryset.filter(organization=organization)
        return Employee.objects.none()

    def update(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        employee = self.get_object()
        if not can_update_employee(request.user, employee):
            return Response(
                {"detail": "You can only update employees selected by your agent side."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        employee = self.get_object()
        if not can_update_employee(request.user, employee):
            return Response(
                {"detail": "You can only update employees selected by your agent side."},
                status=status.HTTP_403_FORBIDDEN,
            )
        scope, _ = get_employee_user_scope(request.user, employee.organization)
        if scope == "agent" and any(field in request.data for field in {"status", "is_active"}):
            return Response(
                {"detail": "Agent-side users cannot change employee approval status."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if "progress_override_complete" in request.data and not can_override_employee_progress(
            request.user,
            employee.organization,
        ):
            return Response(
                {"detail": "Only admins and superadmins can mark employee progress complete."},
                status=status.HTTP_403_FORBIDDEN,
            )
        requested_status = (request.data.get("status") or "").strip().lower()
        if (
            getattr(employee, "selection", None)
            and employee.selection.status == EmployeeSelection.STATUS_UNDER_PROCESS
            and requested_status in {Employee.STATUS_REJECTED, Employee.STATUS_SUSPENDED}
        ):
            return Response(
                {"detail": "Decline the process first before rejecting or suspending this employee."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().partial_update(request, *args, **kwargs)

    def perform_update(self, serializer):
        employee = serializer.save(updated_by=self.request.user)
        organization = get_user_organization(self.request.user)
        log_audit(
            self.request.user,
            "employee.update",
            resource_type="employee",
            resource_id=employee.pk,
            summary=f"Updated employee {employee.full_name}",
            metadata={
                "employee_name": employee.full_name,
                "organization_id": organization.id if organization else None,
            },
        )

    def destroy(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        employee = self.get_object()
        if not can_manage_employee_registration(request.user, employee.organization):
            return Response(
                {"detail": "Only organization-side privileged users can delete employees."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    def perform_destroy(self, instance):
        organization = get_user_organization(self.request.user)
        log_audit(
            self.request.user,
            "employee.delete",
            resource_type="employee",
            resource_id=instance.pk,
            summary=f"Deleted employee {instance.full_name}",
            metadata={
                "employee_name": instance.full_name,
                "organization_id": organization.id if organization else None,
            },
        )
        instance.delete()


class EmployeeDocumentUploadView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, employee_pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        organization = get_user_organization(request.user)
        employee = Employee.objects.filter(pk=employee_pk, organization=organization).first()
        if not employee:
            return Response({"detail": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_update_employee(request.user, employee):
            return Response(
                {"detail": "You can only upload documents for employees selected by your agent side."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = EmployeeDocumentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        existing = EmployeeDocument.objects.filter(
            employee=employee,
            document_type=serializer.validated_data["document_type"],
        ).first()
        if existing:
            for field, value in serializer.validated_data.items():
                setattr(existing, field, value)
            existing.uploaded_by = request.user
            existing.save()
            document = existing
        else:
            document = serializer.save(employee=employee, uploaded_by=request.user)
        log_audit(
            request.user,
            "employee.document_upload",
            resource_type="employee_document",
            resource_id=document.pk,
            summary=f"Uploaded document for {employee.full_name}",
            metadata={
                "employee_id": employee.pk,
                "employee_name": employee.full_name,
                "document_type": document.document_type,
                "organization_id": organization.id if organization else None,
            },
        )
        return Response(
            EmployeeDocumentSerializer(document, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class EmployeeFormOptionsView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def get(self, request):
        organization = get_user_organization(request.user)
        if not organization:
            return Response({"destination_countries": [], "salary_options_by_country": {}, "agent_options": []})

        agent_profiles = (
            request.user.__class__.objects.filter(
                profile__organization=organization,
                profile__role="customer",
                is_active=True,
            )
            .select_related("profile")
            .order_by("first_name", "username")
        )
        destination_countries = []
        salary_options_by_country = {}
        agent_options = []
        for agent in agent_profiles:
            country = (agent.profile.agent_country or "").strip()
            if not country:
                pass
            else:
                if country not in destination_countries:
                    destination_countries.append(country)
                salary_options_by_country.setdefault(country, [])
                salary_value = agent.profile.agent_salary
                if salary_value is not None:
                    salary_text = str(salary_value)
                    if salary_text not in salary_options_by_country[country]:
                        salary_options_by_country[country].append(salary_text)
            agent_options.append(
                {
                    "id": agent.id,
                    "name": agent.first_name or agent.username,
                    "username": agent.username,
                }
            )
        return Response(
            {
                "destination_countries": destination_countries,
                "salary_options_by_country": salary_options_by_country,
                "agent_options": agent_options,
            }
        )


class EmployeeDocumentDeleteView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]
    serializer_class = EmployeeDocumentSerializer

    def get_queryset(self):
        organization = get_user_organization(self.request.user)
        return EmployeeDocument.objects.select_related(
            "employee__organization",
            "employee__selection__agent",
        ).filter(employee__organization=organization)

    def destroy(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        document = self.get_object()
        if not can_update_employee(request.user, document.employee):
            return Response(
                {"detail": "You can only remove documents for employees selected by your agent side."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


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
                {"detail": "This employee has already been selected by another agent."},
                status=status.HTTP_409_CONFLICT,
            )

        if selection and selection.agent_id == agent.id:
            selection.selected_by = request.user
            selection.save(update_fields=["selected_by", "updated_at"])
        else:
            selection = EmployeeSelection.objects.create(
                organization=organization,
                employee=employee,
                agent=agent,
                selected_by=request.user,
            )

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
            .filter(pk=employee_pk, organization=organization)
            .first()
        )
        if not employee:
            return Response({"detail": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

        selection = getattr(employee, "selection", None)
        if not selection:
            return Response(status=status.HTTP_204_NO_CONTENT)

        agent = get_selection_agent_for_user(request.user, organization=organization)
        can_clear = can_manage_employee_registration(request.user, organization) or (
            agent and selection.agent_id == agent.id
        )
        if not can_clear:
            return Response(
                {"detail": "You can only remove selections for your own agent side."},
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
                "agent_id": selection.agent_id,
                "agent_username": selection.agent.username,
            },
        )
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
            if not can_initiate_employee_process(request.user, employee):
                return Response(
                    {"detail": "Only the main agent account for this selected employee can initiate a process."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if not selection:
                return Response(
                    {"detail": "Employee must be selected before starting a process."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if selection.status == EmployeeSelection.STATUS_UNDER_PROCESS:
                return Response(
                    {"detail": "This employee is already under process."},
                    status=status.HTTP_409_CONFLICT,
                )

            selection.status = EmployeeSelection.STATUS_UNDER_PROCESS
            selection.process_initiated_by = request.user
            selection.process_started_at = timezone.now()
            selection.save(update_fields=["status", "process_initiated_by", "process_started_at", "updated_at"])

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

        selection.status = EmployeeSelection.STATUS_SELECTED
        selection.process_initiated_by = None
        selection.process_started_at = None
        selection.save(update_fields=["status", "process_initiated_by", "process_started_at", "updated_at"])

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
