from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.db.models import Count
from django.template.defaultfilters import slugify
from django.utils import timezone

from .models import (
    LicenseEvent,
    Organization,
    OrganizationMembership,
    OrganizationSubscription,
    ProductPlan,
    Profile,
)


DEFAULT_PLAN_CODE = "trial"


def get_or_create_default_plan():
    plan, _ = ProductPlan.objects.get_or_create(
        code=DEFAULT_PLAN_CODE,
        defaults={
            "name": "Trial",
            "description": "Starter trial for new Employment Portal organizations.",
            "monthly_price": Decimal("0.00"),
            "currency": "USD",
            "max_superadmins": 1,
            "max_admins": 1,
            "max_staff": 4,
            "max_customers": 5,
            "feature_flags": dict(ProductPlan.DEFAULT_FEATURE_FLAGS),
            "is_active": True,
        },
    )
    return plan


def grace_days_for_reputation(organization: Organization) -> int:
    tier = organization.reputation_tier or Organization.REPUTATION_STANDARD
    if tier == Organization.REPUTATION_LOW:
        return 3
    if tier == Organization.REPUTATION_TRUSTED:
        return 14
    return 7


def _unique_organization_slug(base: str) -> str:
    base_slug = slugify(base) or "employment-portal-org"
    slug = base_slug
    counter = 1
    while Organization.objects.filter(slug=slug).exists():
        counter += 1
        slug = f"{base_slug}-{counter}"
    return slug


def create_organization_for_user(
    user: User,
    *,
    organization_name: str | None = None,
    role: str = Profile.ROLE_SUPERADMIN,
    created_by_company: bool = False,
) -> Organization:
    profile, _ = Profile.objects.get_or_create(
        user=user,
        defaults={"role": role},
    )
    plan = get_or_create_default_plan()
    org_name = organization_name or f"{user.username}'s Employment Portal"
    organization = Organization.objects.create(
        name=org_name,
        slug=_unique_organization_slug(org_name),
        status=Organization.STATUS_ACTIVE if created_by_company else Organization.STATUS_PENDING,
        billing_contact_name=(f"{user.first_name} {user.last_name}".strip()),
        billing_contact_email=user.email or "",
        created_by_company=created_by_company,
    )
    OrganizationSubscription.objects.create(
        organization=organization,
        plan=plan,
        status=OrganizationSubscription.STATUS_TRIAL,
        starts_at=timezone.now(),
        renews_at=timezone.now() + timedelta(days=30),
        grace_ends_at=timezone.now() + timedelta(days=30 + grace_days_for_reputation(organization)),
        last_payment_status=OrganizationSubscription.PAYMENT_PENDING,
    )
    profile.organization = organization
    profile.role = role
    profile.save(update_fields=["organization", "role"])
    OrganizationMembership.objects.update_or_create(
        user=user,
        defaults={
            "organization": organization,
            "role": role,
            "is_owner": role == Profile.ROLE_SUPERADMIN,
            "is_active": user.is_active,
        },
    )
    LicenseEvent.objects.create(
        organization=organization,
        subscription=organization.subscription,
        actor=user,
        action="license.bootstrap",
        new_status=organization.subscription.status,
        notes="Organization and trial subscription bootstrapped automatically.",
    )
    return organization


def ensure_membership(user: User) -> OrganizationMembership | None:
    if not user or not user.pk:
        return None
    profile, _ = Profile.objects.get_or_create(
        user=user,
        defaults={"role": Profile.ROLE_CUSTOMER},
    )
    if not profile.organization:
        create_organization_for_user(
            user,
            role=profile.role or Profile.ROLE_SUPERADMIN,
        )
        profile.refresh_from_db()
    membership = (
        OrganizationMembership.objects.select_related("organization")
        .filter(user=user)
        .first()
    )
    expected_is_owner = profile.role == Profile.ROLE_SUPERADMIN
    if membership:
        update_fields = []
        if membership.organization_id != profile.organization_id:
            membership.organization = profile.organization
            update_fields.append("organization")
        if membership.role != profile.role:
            membership.role = profile.role
            update_fields.append("role")
        if membership.is_owner != expected_is_owner:
            membership.is_owner = expected_is_owner
            update_fields.append("is_owner")
        if membership.is_active != user.is_active:
            membership.is_active = user.is_active
            update_fields.append("is_active")
        if update_fields:
            membership.save(update_fields=update_fields)
        return membership

    membership = OrganizationMembership.objects.create(
        organization=profile.organization,
        user=user,
        role=profile.role,
        is_owner=expected_is_owner,
        is_active=user.is_active,
    )
    return membership


def get_user_organization(user: User) -> Organization | None:
    membership = ensure_membership(user)
    if membership:
        return membership.organization
    return None


def get_organization_subscription(organization: Organization | None) -> OrganizationSubscription | None:
    if not organization:
        return None
    subscription = getattr(organization, "subscription", None)
    if subscription:
        return subscription
    plan = get_or_create_default_plan()
    subscription = OrganizationSubscription.objects.create(
        organization=organization,
        plan=plan,
        status=OrganizationSubscription.STATUS_TRIAL,
        starts_at=timezone.now(),
        renews_at=timezone.now() + timedelta(days=30),
        grace_ends_at=timezone.now() + timedelta(days=30 + grace_days_for_reputation(organization)),
        last_payment_status=OrganizationSubscription.PAYMENT_PENDING,
    )
    return subscription


def get_plan_feature_flags(organization: Organization | None) -> dict:
    subscription = get_organization_subscription(organization)
    if not subscription:
        return {}
    return dict(subscription.plan.feature_flags or {})


def seat_limits_for_organization(organization: Organization | None) -> dict[str, int]:
    subscription = get_organization_subscription(organization)
    if not subscription:
        return {}
    plan = subscription.plan
    return {
        Profile.ROLE_SUPERADMIN: plan.max_superadmins,
        Profile.ROLE_ADMIN: plan.max_admins,
        Profile.ROLE_STAFF: plan.max_staff,
        Profile.ROLE_CUSTOMER: plan.max_customers,
    }


def seat_usage_for_organization(organization: Organization | None) -> dict[str, int]:
    if not organization:
        return {}
    counts = (
        OrganizationMembership.objects.filter(organization=organization, is_active=True, user__is_active=True)
        .values("role")
        .annotate(total=Count("id"))
    )
    usage = {
        Profile.ROLE_SUPERADMIN: 0,
        Profile.ROLE_ADMIN: 0,
        Profile.ROLE_STAFF: 0,
        Profile.ROLE_CUSTOMER: 0,
    }
    for row in counts:
        usage[row["role"]] = row["total"]
    return usage


def can_assign_role(organization: Organization | None, role: str, *, exclude_user: User | None = None) -> tuple[bool, str]:
    if not organization:
        return False, "No organization is assigned to this account."
    limits = seat_limits_for_organization(organization)
    usage = seat_usage_for_organization(organization)
    limit = limits.get(role)
    if limit is None:
        return False, "This plan does not support that role."
    current = usage.get(role, 0)
    if exclude_user:
        membership = OrganizationMembership.objects.filter(
            organization=organization,
            user=exclude_user,
            role=role,
            is_active=True,
            user__is_active=True,
        ).first()
        if membership:
            current = max(0, current - 1)
    if current >= limit:
        return False, f"Seat limit reached for {role}. Plan allows {limit}."
    return True, ""


def get_access_state(organization: Organization | None) -> dict:
    subscription = get_organization_subscription(organization)
    limits = seat_limits_for_organization(organization)
    usage = seat_usage_for_organization(organization)
    if not organization or not subscription:
        return {
            "organization": None,
            "subscription": None,
            "seat_limits": limits,
            "seat_usage": usage,
            "is_suspended": False,
            "is_read_only": False,
        }
    status = subscription.status
    is_suspended = status in {
        OrganizationSubscription.STATUS_SUSPENDED,
        OrganizationSubscription.STATUS_EXPIRED,
    }
    is_read_only = organization.read_only_mode or status == OrganizationSubscription.STATUS_CANCELLED
    return {
        "organization": {
            "id": organization.id,
            "name": organization.name,
            "slug": organization.slug,
            "status": organization.status,
            "billing_contact_email": organization.billing_contact_email,
            "reputation_tier": organization.reputation_tier,
            "read_only_mode": organization.read_only_mode,
        },
        "subscription": {
            "id": subscription.id,
            "status": subscription.status,
            "plan_code": subscription.plan.code,
            "plan_name": subscription.plan.name,
            "renews_at": subscription.renews_at,
            "grace_ends_at": subscription.grace_ends_at,
            "cancelled_at": subscription.cancelled_at,
            "last_payment_status": subscription.last_payment_status,
        },
        "seat_limits": limits,
        "seat_usage": usage,
        "is_suspended": is_suspended,
        "is_read_only": is_read_only,
    }


def get_access_restriction(user: User, *, write: bool = False) -> str | None:
    organization = get_user_organization(user)
    access = get_access_state(organization)
    subscription = access.get("subscription") or {}
    if access["is_suspended"]:
        return "Your organization's Employment Portal access is suspended."
    if write and access["is_read_only"]:
        return "Your organization is in read-only mode."
    if subscription.get("status") == OrganizationSubscription.STATUS_GRACE:
        return None
    return None


def sync_profile_membership(user: User) -> OrganizationMembership | None:
    membership = ensure_membership(user)
    if not membership:
        return None
    profile = user.profile
    if profile.organization_id != membership.organization_id or profile.role != membership.role:
        profile.organization = membership.organization
        profile.role = membership.role
        profile.save(update_fields=["organization", "role"])
    return membership
