from .licensing import (
    get_access_state,
    get_user_organization,
    get_organization_subscription,
    sync_profile_membership,
)
from .models import PlatformSettings, Profile


def get_platform_settings():
    return PlatformSettings.get_solo()


def get_profile_role(user):
    profile, _ = Profile.objects.get_or_create(user=user, defaults={"role": Profile.ROLE_CUSTOMER})
    sync_profile_membership(user)
    return profile.role


def is_superadmin(user):
    return get_profile_role(user) == Profile.ROLE_SUPERADMIN


def is_admin(user):
    return get_profile_role(user) == Profile.ROLE_ADMIN


def get_role_permissions(role: str) -> set[str]:
    settings_obj = get_platform_settings()
    configured = settings_obj.role_permissions or {}
    if role in configured:
        return set(configured.get(role, []))
    return set(PlatformSettings.DEFAULT_ROLE_PERMISSIONS.get(role, []))


def has_permission(user, permission: str) -> bool:
    if not user or not user.is_authenticated:
        return False
    role = get_profile_role(user)
    return permission in get_role_permissions(role)


def can_manage_users(user):
    return has_permission(user, "users.manage_all") or has_permission(
        user, "users.manage_limited"
    )


def can_manage_all_users(user):
    return has_permission(user, "users.manage_all")


def can_view_audit_log(user):
    return has_permission(user, "audit.view")


def can_manage_platform(user):
    return has_permission(user, "platform.manage")


def feature_enabled(flag: str) -> bool:
    settings_obj = get_platform_settings()
    configured = settings_obj.feature_flags or {}
    if flag in configured:
        return bool(configured.get(flag))
    return bool(PlatformSettings.DEFAULT_FEATURE_FLAGS.get(flag, False))


def user_payload(user):
    profile, _ = Profile.objects.get_or_create(user=user, defaults={"role": Profile.ROLE_CUSTOMER})
    membership = sync_profile_membership(user)
    organization = get_user_organization(user)
    subscription = get_organization_subscription(organization)
    access = get_access_state(organization)
    settings_obj = get_platform_settings()
    feature_flags = dict(PlatformSettings.DEFAULT_FEATURE_FLAGS)
    feature_flags.update(settings_obj.feature_flags or {})
    if subscription:
        feature_flags.update(subscription.plan.feature_flags or {})
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email or "",
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "role": profile.role,
        "phone": profile.phone or "",
        "staff_side": profile.staff_side or "",
        "staff_level": profile.staff_level or 1,
        "staff_level_label": profile.staff_level_label or "",
        "email_verified": profile.email_verified,
        "google_linked": bool(profile.google_sub),
        "permissions": sorted(get_role_permissions(profile.role)),
        "feature_flags": feature_flags,
        "is_active": user.is_active,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "organization": access.get("organization"),
        "subscription": access.get("subscription"),
        "seat_limits": access.get("seat_limits"),
        "seat_usage": access.get("seat_usage"),
        "is_read_only": access.get("is_read_only", False),
        "is_suspended": access.get("is_suspended", False),
        "membership": {
            "role": membership.role if membership else profile.role,
            "is_owner": membership.is_owner if membership else profile.role == Profile.ROLE_SUPERADMIN,
        },
    }
