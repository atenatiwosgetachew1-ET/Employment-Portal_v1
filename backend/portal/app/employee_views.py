from django.db.models import Q
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit_log import log_audit
from .auth_utils import feature_enabled
from .licensing import get_access_restriction, get_user_organization
from .models import Employee, EmployeeDocument
from .platform_views import UserPagination
from .serializers import (
    EmployeeDocumentCreateSerializer,
    EmployeeDocumentSerializer,
    EmployeeListSerializer,
    EmployeeSerializer,
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
        queryset = Employee.objects.select_related("registered_by", "updated_by").prefetch_related(
            "documents"
        )
        if organization:
            queryset = queryset.filter(organization=organization)
        else:
            return Employee.objects.none()

        q = (self.request.query_params.get("q") or "").strip()
        is_active = (self.request.query_params.get("is_active") or "").strip().lower()
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
        return queryset

    def get_serializer_class(self):
        if self.request.method == "POST":
            return EmployeeSerializer
        return EmployeeListSerializer

    def create(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organization = get_user_organization(request.user)
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
        queryset = Employee.objects.select_related("registered_by", "updated_by").prefetch_related(
            "documents"
        )
        if organization:
            return queryset.filter(organization=organization)
        return Employee.objects.none()

    def update(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
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
            return Response({"destination_countries": [], "salary_options_by_country": {}})

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
        for agent in agent_profiles:
            country = (agent.profile.agent_country or "").strip()
            if not country:
                continue
            if country not in destination_countries:
                destination_countries.append(country)
            salary_options_by_country.setdefault(country, [])
            salary_value = agent.profile.agent_salary
            if salary_value is not None:
                salary_text = str(salary_value)
                if salary_text not in salary_options_by_country[country]:
                    salary_options_by_country[country].append(salary_text)
        return Response(
            {
                "destination_countries": destination_countries,
                "salary_options_by_country": salary_options_by_country,
            }
        )


class EmployeeDocumentDeleteView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]
    serializer_class = EmployeeDocumentSerializer

    def get_queryset(self):
        organization = get_user_organization(self.request.user)
        return EmployeeDocument.objects.filter(employee__organization=organization)

    def destroy(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)
