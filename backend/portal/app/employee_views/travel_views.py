from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..audit_log import log_audit
from ..licensing import get_access_restriction, get_user_organization
from ..models import Employee
from ..serializers import EmployeeSerializer, EmployeeTravelBookingSerializer
from .helpers import EmployeesEnabled, can_manage_employee_travel


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
