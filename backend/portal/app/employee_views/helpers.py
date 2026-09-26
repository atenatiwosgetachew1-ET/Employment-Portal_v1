from calendar import monthrange

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.permissions import BasePermission

from ..auth_utils import feature_enabled, is_admin, is_superadmin
from ..employee_selection import build_agent_context
from ..models import (
    EmployeeReturnRequest,
    EmployeeSelection,
    EmployeeSelectionInterest,
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


def is_employee_employed(employee):
    return bool(
        not getattr(employee, "returned_from_employment", False)
        and employee.did_travel
        and build_employee_progress_status(employee)["overall_completion"] == 100
    )


def add_one_calendar_month(value):
    if not value:
        return None
    year = value.year + (1 if value.month == 12 else 0)
    month = 1 if value.month == 12 else value.month + 1
    day = min(value.day, monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def auto_finalize_overdue_return(employee):
    if getattr(employee, "returned_from_employment", False):
        return employee
    if not is_employee_employed(employee):
        return employee
    return_window_end = add_one_calendar_month(employee.contract_expires_on)
    if not return_window_end or timezone.localdate() <= return_window_end:
        return employee

    return_request, _ = EmployeeReturnRequest.objects.get_or_create(
        employee=employee,
        defaults={"organization": employee.organization},
    )
    if return_request.organization_id != employee.organization_id:
        return_request.organization = employee.organization
    return_request.status = EmployeeReturnRequest.STATUS_APPROVED
    return_request.remark = "Expected to be returned"
    return_request.approved_by = None
    return_request.approved_at = timezone.now()
    if not return_request.requested_at:
        return_request.requested_at = timezone.now()
    return_request.save()

    employee.returned_from_employment = True
    employee.returned_recorded_by = None
    employee.save(update_fields=["returned_from_employment", "returned_recorded_by", "is_active", "updated_at"])
    return employee


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
