from django.db.models import Q
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..audit_log import log_audit
from ..licensing import get_access_restriction, get_user_organization
from ..models import Employee, EmployeeSelection
from ..platform_views import UserPagination
from ..serializers import EmployeeListSerializer, EmployeeSerializer
from .helpers import (
    EmployeesEnabled,
    auto_finalize_overdue_return,
    can_manage_employee_registration,
    can_override_employee_progress,
    can_update_employee,
    get_employee_user_scope,
    is_employee_employed,
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
            "returned_recorded_by",
            "selection__agent",
            "selection__selected_by",
            "travel_booking",
            "return_request",
            "return_request__requested_by",
            "return_request__approved_by",
        ).prefetch_related("documents", "selection_interests__agent", "selection_interests__selected_by")
        if organization:
            queryset = queryset.filter(organization=organization)
        else:
            return Employee.objects.none()

        selected_scope = (self.request.query_params.get("selected_scope") or "").strip().lower()
        process_scope = (self.request.query_params.get("process_scope") or "").strip().lower()
        employed_scope = (self.request.query_params.get("employed_scope") or "").strip().lower()
        returned_scope = (self.request.query_params.get("returned_scope") or "").strip().lower()
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
                | Q(passport_number__icontains=q)
            )
        if is_active in {"true", "false"}:
            queryset = queryset.filter(is_active=(is_active == "true"))
        if mine == "true":
            queryset = queryset.filter(registered_by=self.request.user)
        if returned_scope in {"mine", "organization"}:
            queryset = queryset.filter(returned_from_employment=True)
            if user_scope == "agent":
                return queryset.filter(selection__agent_id=agent_context["agent_id"])
            return queryset
        if employed_scope in {"mine", "organization"}:
            if user_scope == "organization":
                return queryset
            return queryset.filter(selection__agent_id=agent_context["agent_id"])
        if process_scope in {"mine", "organization"}:
            if user_scope == "organization":
                queryset = queryset.filter(
                    selection__status=EmployeeSelection.STATUS_UNDER_PROCESS,
                    returned_from_employment=False,
                )
            else:
                queryset = queryset.filter(
                    selection__status=EmployeeSelection.STATUS_UNDER_PROCESS,
                    selection__agent_id=agent_context["agent_id"],
                    returned_from_employment=False,
                )
        elif selected_scope == "organization":
            queryset = queryset.filter(
                selection_interests__isnull=False,
                returned_from_employment=False,
            ).exclude(selection__status=EmployeeSelection.STATUS_UNDER_PROCESS)
        elif selected_scope == "mine":
            if user_scope != "agent" or not agent_context["agent_id"]:
                return queryset.none()
            queryset = queryset.filter(
                selection_interests__agent_id=agent_context["agent_id"],
                returned_from_employment=False,
            ).exclude(selection__status=EmployeeSelection.STATUS_UNDER_PROCESS)
        else:
            if user_scope == "organization":
                return queryset
            agent_country = (agent_context.get("agent_country") or "").strip()
            if not agent_country:
                return queryset.filter(selection__agent_id=agent_context["agent_id"])
            queryset = queryset.filter(
                Q(
                    status=Employee.STATUS_APPROVED,
                    returned_from_employment=False,
                    selection__isnull=True,
                    selection_interests__isnull=True,
                    application_countries__contains=[agent_country],
                )
                | Q(selection__agent_id=agent_context["agent_id"])
            )
        return queryset.distinct()

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        organization = get_user_organization(request.user)
        user_scope, agent_context = get_employee_user_scope(request.user, organization)
        employed_scope = (request.query_params.get("employed_scope") or "").strip().lower()
        returned_scope = (request.query_params.get("returned_scope") or "").strip().lower()
        process_scope = (request.query_params.get("process_scope") or "").strip().lower()
        selected_scope = (request.query_params.get("selected_scope") or "").strip().lower()
        should_python_filter = employed_scope in {"mine", "organization"} or (
            user_scope == "agent"
            and employed_scope not in {"mine", "organization"}
            and returned_scope not in {"mine", "organization"}
            and process_scope not in {"mine", "organization"}
            and selected_scope != "mine"
        )

        if should_python_filter or employed_scope in {"mine", "organization"} or returned_scope in {"mine", "organization"}:
            queryset = [auto_finalize_overdue_return(employee) for employee in queryset]

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
        response_data.update({"success": True, "message": "Candidate created successfully."})
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
            "returned_recorded_by",
            "selection__agent",
            "selection__selected_by",
            "travel_booking",
            "return_request",
            "return_request__requested_by",
            "return_request__approved_by",
        ).prefetch_related("documents")
        if organization:
            return queryset.filter(organization=organization)
        return Employee.objects.none()

    def get_object(self):
        employee = super().get_object()
        return auto_finalize_overdue_return(employee)

    def update(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        employee = self.get_object()
        if not can_update_employee(request.user, employee):
            return Response(
                {"detail": "Only organization-side users can update employee records."},
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
                {"detail": "Only organization-side users can update employee records."},
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
        scope, _ = get_employee_user_scope(request.user, employee.organization)
        if "status" in request.data and scope == "agent":
            return Response(
                {"detail": "Agents cannot update candidate status."},
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
