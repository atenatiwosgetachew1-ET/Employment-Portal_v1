from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..audit_log import log_audit
from ..employee_ocr import EmployeeOcrError, extract_employee_document_fields, get_ocr_status, parse_form_options
from ..licensing import get_access_restriction, get_user_organization
from ..models import Employee, EmployeeDocument
from ..serializers import EmployeeDocumentCreateSerializer, EmployeeDocumentSerializer
from .helpers import EmployeesEnabled, can_manage_employee_registration, can_update_employee


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
                {"detail": "Only organization-side users can upload employee documents."},
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


class EmployeeOcrExtractView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        organization = get_user_organization(request.user)
        if not organization or not can_manage_employee_registration(request.user, organization):
            return Response(
                {"detail": "Only organization-side privileged users can extract employee document fields."},
                status=status.HTTP_403_FORBIDDEN,
            )

        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "No document was uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            step_index = int(request.data.get("step_index", 0))
        except (TypeError, ValueError):
            return Response({"detail": "Invalid registration step."}, status=status.HTTP_400_BAD_REQUEST)

        form_options = parse_form_options(request.data.get("form_options"))
        try:
            import sys
            mod = sys.modules.get("app.employee_views")
            extractor = getattr(mod, "extract_employee_document_fields", extract_employee_document_fields)
            result = extractor(uploaded_file, step_index=step_index, form_options=form_options)
        except EmployeeOcrError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)


class EmployeeOcrStatusView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def get(self, request):
        organization = get_user_organization(request.user)
        if not organization or not can_manage_employee_registration(request.user, organization):
            return Response(
                {"detail": "Only organization-side privileged users can check OCR setup."},
                status=status.HTTP_403_FORBIDDEN,
            )
        import sys
        mod = sys.modules.get("app.employee_views")
        status_fn = getattr(mod, "get_ocr_status", get_ocr_status)
        return Response(status_fn(), status=status.HTTP_200_OK)


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
                {"detail": "Only organization-side users can remove employee documents."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)
