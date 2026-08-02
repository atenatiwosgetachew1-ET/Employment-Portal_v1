from django.contrib.auth.models import User
from django.db.models import Q

from .models import AgentMembership, AgentOffice, Profile


def agent_display_name(user: User | None) -> str:
    if not user:
        return ""
    full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return full_name or user.first_name or user.username


def agent_office_display_name(agent_office: AgentOffice | None) -> str:
    if not agent_office:
        return ""
    return agent_office.name or agent_display_name(agent_office.owner)


def agent_office_country(agent_office: AgentOffice | None, agent: User | None = None) -> str:
    if agent_office and agent_office.country:
        return agent_office.country.strip()
    profile = getattr(agent, "profile", None)
    if profile and profile.agent_country:
        return profile.agent_country.strip()
    return ""


def ensure_agent_office_for_owner(user: User, organization=None) -> AgentOffice | None:
    if not user or not user.is_authenticated:
        return None
    profile = getattr(user, "profile", None)
    if not profile or profile.role != Profile.ROLE_CUSTOMER:
        return None
    organization = organization or profile.organization
    if not organization:
        return None

    name = agent_display_name(user)
    agent_office, _ = AgentOffice.objects.update_or_create(
        owner=user,
        defaults={
            "organization": organization,
            "name": name,
            "country": profile.agent_country or "",
            "commission": profile.agent_commission,
            "salary": profile.agent_salary,
            "is_active": user.is_active,
        },
    )
    AgentMembership.objects.update_or_create(
        user=user,
        defaults={
            "agent_office": agent_office,
            "role": AgentMembership.ROLE_OWNER,
            "is_active": user.is_active,
        },
    )
    if profile.agent_office_id != agent_office.id:
        profile.agent_office = agent_office
        profile.save(update_fields=["agent_office"])
    return agent_office


def agent_office_for_staff(user: User, organization=None) -> AgentOffice | None:
    profile = getattr(user, "profile", None)
    if not profile or profile.role != Profile.ROLE_STAFF:
        return None
    organization = organization or profile.organization
    if not organization:
        return None
    if profile.agent_office_id:
        return profile.agent_office

    side = (profile.staff_side or "").strip()
    if not side or side == organization.name:
        return None

    agent_office = (
        AgentOffice.objects.filter(
            organization=organization,
            is_active=True,
        )
        .filter(
            Q(name__iexact=side)
            | Q(owner__first_name__iexact=side)
            | Q(owner__username__iexact=side)
        )
        .select_related("owner")
        .order_by("id")
        .first()
    )
    if agent_office:
        profile.agent_office = agent_office
        profile.staff_side = agent_office_display_name(agent_office)
        profile.save(update_fields=["agent_office", "staff_side"])
        AgentMembership.objects.update_or_create(
            user=user,
            defaults={
                "agent_office": agent_office,
                "role": AgentMembership.ROLE_STAFF,
                "is_active": user.is_active,
            },
        )
    return agent_office


def get_selection_agent_for_user(user: User, organization=None) -> User | None:
    if not user or not user.is_authenticated:
        return None

    profile = getattr(user, "profile", None)
    if not profile or (organization and profile.organization_id != organization.id):
        return None

    if profile.role == Profile.ROLE_CUSTOMER:
        ensure_agent_office_for_owner(user, organization=organization)
        return user

    if profile.role != Profile.ROLE_STAFF or not organization:
        return None

    agent_office = agent_office_for_staff(user, organization=organization)
    if agent_office:
        return agent_office.owner

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
    profile = getattr(user, "profile", None)
    agent_office = None
    if profile and profile.role == Profile.ROLE_CUSTOMER:
        agent_office = ensure_agent_office_for_owner(user, organization=organization)
    elif profile and profile.role == Profile.ROLE_STAFF:
        agent_office = agent_office_for_staff(user, organization=organization)
    return {
        "is_agent_side": bool(agent),
        "agent_id": agent.id if agent else None,
        "agent_name": agent_display_name(agent),
        "agent_office_id": agent_office.id if agent_office else None,
        "agent_office_name": agent_office_display_name(agent_office),
        "agent_country": agent_office_country(agent_office, agent),
    }
