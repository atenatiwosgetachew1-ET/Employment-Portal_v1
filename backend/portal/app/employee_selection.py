from django.contrib.auth.models import User
from django.db.models import Q

from .models import Profile


def agent_display_name(user: User | None) -> str:
    if not user:
        return ""
    full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return full_name or user.first_name or user.username


def get_selection_agent_for_user(user: User, organization=None) -> User | None:
    if not user or not user.is_authenticated:
        return None

    profile = getattr(user, "profile", None)
    if not profile or (organization and profile.organization_id != organization.id):
        return None

    if profile.role == Profile.ROLE_CUSTOMER:
        return user

    if profile.role != Profile.ROLE_STAFF or not organization:
        return None

    side = (profile.staff_side or "").strip()
    if not side or side == organization.name:
        return None

    return (
        User.objects.filter(
            profile__organization=organization,
            profile__role=Profile.ROLE_CUSTOMER,
            is_active=True,
        )
        .filter(Q(first_name__iexact=side) | Q(username__iexact=side))
        .order_by("id")
        .first()
    )


def build_agent_context(user: User, organization=None) -> dict:
    agent = get_selection_agent_for_user(user, organization=organization)
    return {
        "is_agent_side": bool(agent),
        "agent_id": agent.id if agent else None,
        "agent_name": agent_display_name(agent),
    }

