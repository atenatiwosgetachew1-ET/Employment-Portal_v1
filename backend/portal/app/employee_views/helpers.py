from calendar import monthrange

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.permissions import BasePermission

from ..auth_utils import feature_enabled, is_admin, is_superadmin
from ..employee_selection import build_agent_context
from ..models import (
    Employee,
    EmployeeReturnRequest,
    EmployeeSelection,
    EmployeeSelectionInterest,
    Notification,
    Profile,
)
from ..serializers import build_employee_progress_status


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
    if scope == "agent" and context["agent_id"]:
        selection = getattr(employee, "selection", None)
        return bool(selection and selection.agent_id == context["agent_id"])
    return False


def can_manage_employee_travel(user, employee):
    organization = employee.organization
    if can_manage_process_for_organization(user, organization):
        return True
    scope, context = get_employee_user_scope(user, organization)
    if scope != "agent" or not context["agent_id"]:
        return False
    selection = getattr(employee, "selection", None)
    return bool(selection and selection.agent_id == context["agent_id"])


def can_initiate_employee_process(user, employee):
    if getattr(user.profile, "role", "") != Profile.ROLE_CUSTOMER:
        return False
    scope, context = get_employee_user_scope(user, employee.organization)
    if scope != "agent" or not context["agent_id"]:
        return False
    selection = getattr(employee, "selection", None)
    if selection and selection.status == EmployeeSelection.STATUS_UNDER_PROCESS:
        return bool(selection.agent_id == context["agent_id"])
    return bool(
        selection and selection.agent_id == context["agent_id"]
    ) or EmployeeSelectionInterest.objects.filter(
        organization=employee.organization,
        employee=employee,
        agent_id=context["agent_id"],
    ).exists()


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


def is_employee_returned(employee):
    return bool(
        getattr(employee, "returned_from_employment", False)
        or getattr(getattr(employee, "return_request", None), "status", None) == "approved"
    )


def is_employee_employed(employee):
    return bool(
        not is_employee_returned(employee)
        and (
            employee.did_travel
            or getattr(employee, "arrival_status", "") in {"confirmed", "system_acknowledged"}
            or getattr(employee, "employment_activated_at", None) is not None
        )
        and (
            build_employee_progress_status(employee)["overall_completion"] == 100
            or getattr(employee, "is_administratively_completed", False)
        )
    )


def add_one_calendar_month(value):
    if not value:
        return None
    year = value.year + (1 if value.month == 12 else 0)
    month = 1 if value.month == 12 else value.month + 1
    day = min(value.day, monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def check_and_update_overdue_status(employee):
    if getattr(employee, "returned_from_employment", False):
        return employee
    if not is_employee_employed(employee):
        return employee
    today = timezone.localdate()
    is_overdue = False
    if employee.return_ticket_date and employee.return_ticket_date < today:
        is_overdue = True
    elif employee.contract_expires_on and employee.contract_expires_on < today:
        is_overdue = True

    if is_overdue and not getattr(employee, "is_overdue", False):
        employee.is_overdue = True
        update_fields = ["is_overdue", "updated_at"]
        if not employee.overdue_notified_at:
            employee.overdue_notified_at = timezone.now()
            update_fields.append("overdue_notified_at")
            try:
                from ..models import Notification
                org_profiles = Profile.objects.filter(
                    organization_id=employee.organization_id,
                    role__in=[Profile.ROLE_SUPERADMIN, Profile.ROLE_ADMIN],
                )
                for p in org_profiles:
                    Notification.objects.create(
                        user_id=p.user_id,
                        title=f"Overdue return: {employee.full_name}",
                        body=f"Candidate {employee.full_name} is overdue for return. Contract/ticket date has passed.",
                        kind=Notification.KIND_WARNING,
                    )
                selection = getattr(employee, "selection", None)
                if selection and selection.agent_id:
                    Notification.objects.create(
                        user_id=selection.agent_id,
                        title=f"Overdue return: {employee.full_name}",
                        body=f"Candidate {employee.full_name} is overdue for return. Please review return travel details.",
                        kind=Notification.KIND_WARNING,
                    )
            except Exception:
                pass
        employee.save(update_fields=update_fields)
    return employee


def auto_acknowledge_pending_arrivals(employee):
    if not (employee.did_travel or employee.travel_status == Employee.TRAVEL_STATUS_CONFIRMED):
        return employee
    if employee.arrival_status != Employee.ARRIVAL_STATUS_PENDING:
        return employee
    from datetime import timedelta
    cutoff = timezone.now() - timedelta(days=3)
    if employee.travel_confirmed_at and employee.travel_confirmed_at <= cutoff:
        employee.arrival_status = Employee.ARRIVAL_STATUS_SYSTEM_ACKNOWLEDGED
        employee.actual_arrival_date = employee.actual_travel_date or timezone.localdate()
        employee.employment_activated_at = timezone.now()
        if not employee.contract_start_date:
            employee.contract_start_date = employee.actual_arrival_date
        employee.save(
            update_fields=[
                "arrival_status",
                "actual_arrival_date",
                "employment_activated_at",
                "contract_start_date",
                "updated_at",
            ]
        )
        try:
            from decimal import Decimal
            from ..models import CommissionRequest
            selection = getattr(employee, "selection", None)
            agent_user = selection.agent if selection else None
            if agent_user:
                rate = Decimal("0.00")
                if hasattr(agent_user, "profile") and agent_user.profile.agent_commission:
                    rate = agent_user.profile.agent_commission
                CommissionRequest.objects.get_or_create(
                    organization=employee.organization,
                    employee=employee,
                    defaults={
                        "agent": agent_user,
                        "commission_rate": rate,
                        "amount": rate,
                        "status": CommissionRequest.STATUS_PENDING,
                        "is_manual": False,
                        "notes": "System-acknowledged arrival after 3 days without agent response.",
                    },
                )
        except Exception:
            pass
    return employee


def auto_finalize_overdue_return(employee):
    # Preserves record open and visible as Overdue without auto-returning
    employee = auto_acknowledge_pending_arrivals(employee)
    return check_and_update_overdue_status(employee)


def can_initiate_return_request(user, employee):
    organization = employee.organization
    if can_manage_process_for_organization(user, organization):
        return True
    scope, context = get_employee_user_scope(user, organization)
    profile = getattr(user, "profile", None)
    if scope == "organization":
        return bool(
            getattr(profile, "role", "") == Profile.ROLE_STAFF
            and getattr(profile, "staff_level", 1) > 4
        )
    if scope != "agent":
        return False
    if not (
        getattr(profile, "role", "") == Profile.ROLE_CUSTOMER
        or getattr(profile, "staff_level", 1) > 4
    ):
        return False
    selection = getattr(employee, "selection", None)
    return bool(selection and context["agent_id"] and selection.agent_id == context["agent_id"])


class EmployeesEnabled(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and feature_enabled("employees_enabled")
        )
