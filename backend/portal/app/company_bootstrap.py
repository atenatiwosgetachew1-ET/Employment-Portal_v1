import json
import os
from dataclasses import dataclass
from urllib import error, request

from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from django.template.defaultfilters import slugify

from .audit_log import log_audit
from .models import Organization, OrganizationMembership, Profile


DEFAULT_BOOTSTRAP_PATH = "/api/customer-portals/bootstrap-login/"
DEFAULT_RESET_VALIDATE_PATH = "/api/customer-portals/password-reset-tokens/validate/"
DEFAULT_RESET_CONSUME_PATH = "/api/customer-portals/password-reset-tokens/consume/"


@dataclass
class BootstrapResult:
    user: User | None = None
    error_message: str | None = None
    error_status: int | None = None
    payload: dict | None = None


def _unique_organization_slug(base: str) -> str:
    base_slug = slugify(base) or "employment-portal-org"
    slug = base_slug
    counter = 1
    while Organization.objects.filter(slug=slug).exists():
        counter += 1
        slug = f"{base_slug}-{counter}"
    return slug


def get_company_bootstrap_url() -> str:
    return _company_url(
        env_key="COMPANY_CONTROL_CENTER_BOOTSTRAP_LOGIN_URL",
        default_path=DEFAULT_BOOTSTRAP_PATH,
    )


def get_company_reset_validate_url() -> str:
    return _company_url(
        env_key="COMPANY_CONTROL_CENTER_RESET_VALIDATE_URL",
        default_path=DEFAULT_RESET_VALIDATE_PATH,
    )


def get_company_reset_consume_url() -> str:
    return _company_url(
        env_key="COMPANY_CONTROL_CENTER_RESET_CONSUME_URL",
        default_path=DEFAULT_RESET_CONSUME_PATH,
    )


def _company_url(*, env_key: str, default_path: str) -> str:
    explicit = (
        getattr(settings, env_key, "")
        or os.getenv(env_key)
        or ""
    ).strip()
    if explicit:
        return explicit.rstrip("/")
    base_url = (
        getattr(settings, "COMPANY_CONTROL_CENTER_BASE_URL", "")
        or os.getenv("COMPANY_CONTROL_CENTER_BASE_URL")
        or ""
    ).strip().rstrip("/")
    if not base_url:
        return ""
    return f"{base_url}{default_path}"


def _bootstrap_secret() -> str:
    return (
        getattr(settings, "COMPANY_CONTROL_CENTER_BOOTSTRAP_SHARED_SECRET", "")
        or os.getenv("COMPANY_CONTROL_CENTER_BOOTSTRAP_SHARED_SECRET")
        or ""
    ).strip()


def _bootstrap_timeout() -> int:
    raw = (
        str(
            getattr(settings, "COMPANY_CONTROL_CENTER_BOOTSTRAP_TIMEOUT_SECONDS", "")
            or os.getenv("COMPANY_CONTROL_CENTER_BOOTSTRAP_TIMEOUT_SECONDS")
            or "10"
        )
    ).strip()
    try:
        return max(1, int(raw))
    except ValueError:
        return 10


def _post_bootstrap_login(username: str, password: str) -> tuple[int, dict]:
    target = get_company_bootstrap_url()
    if not target:
        return 0, {}

    return _post_company_json(
        target,
        {
            "username": username,
            "password": password,
            "portal_frontend_url": getattr(settings, "FRONTEND_URL", ""),
            "portal_api_base_url": "",
        },
    )


def _post_company_json(target: str, payload: dict) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json"}
    if secret := _bootstrap_secret():
        headers["X-Portal-Bootstrap-Secret"] = secret

    req = request.Request(
        target,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=_bootstrap_timeout()) as response:
            body = response.read().decode("utf-8")
            return getattr(response, "status", 200), json.loads(body or "{}")
    except error.HTTPError as exc:
        try:
            body = exc.read().decode("utf-8")
            data = json.loads(body or "{}")
        except Exception:
            data = {}
        return exc.code, data
    except Exception:
        return 503, {"message": "Company control center is unavailable."}


def validate_superadmin_reset_token_with_company(token: str) -> tuple[int, dict]:
    target = get_company_reset_validate_url()
    if not target:
        return 0, {}
    return _post_company_json(target, {"token": token})


def consume_superadmin_reset_token_with_company(token: str, new_password: str) -> tuple[int, dict]:
    target = get_company_reset_consume_url()
    if not target:
        return 0, {}
    return _post_company_json(
        target,
        {"token": token, "new_password": new_password},
    )


def _get_or_create_company_organization(payload: dict) -> Organization:
    organization_data = payload.get("organization") or {}
    external_id = (
        organization_data.get("external_id")
        or organization_data.get("external_reference")
        or organization_data.get("company_reference")
        or payload.get("organization_external_id")
        or payload.get("organization_company_reference")
        or ""
    ).strip()
    name = (organization_data.get("name") or payload.get("organization_name") or "").strip()

    if external_id:
        organization = Organization.objects.filter(company_reference=external_id).first()
        if organization:
            return organization

    if not name:
        name = "Employment Portal Organization"

    desired_slug = (
        organization_data.get("slug")
        or payload.get("organization_slug")
        or _unique_organization_slug(name)
    )
    slug = slugify((desired_slug or "").strip()) or _unique_organization_slug(name)
    if Organization.objects.filter(slug=slug).exists():
        slug = _unique_organization_slug(name)

    return Organization.objects.create(
        name=name,
        slug=slug,
        company_reference=external_id or None,
        status=(organization_data.get("status") or Organization.STATUS_ACTIVE).strip(),
        billing_contact_name=(organization_data.get("billing_contact_name") or "").strip(),
        billing_contact_email=(
            organization_data.get("billing_contact_email")
            or payload.get("email")
            or ""
        ).strip().lower(),
        reputation_tier=(
            organization_data.get("reputation_tier") or Organization.REPUTATION_STANDARD
        ).strip(),
        read_only_mode=bool(organization_data.get("read_only_mode", False)),
        created_by_company=True,
    )


def bootstrap_superadmin_from_company(username: str, password: str) -> BootstrapResult:
    if not username or password is None:
        return BootstrapResult()

    status_code, data = _post_bootstrap_login(username, password)
    if status_code == 0:
        return BootstrapResult()
    if status_code in {401, 404}:
        return BootstrapResult(payload=data)
    if status_code == 403:
        return BootstrapResult(
            error_message=data.get("message") or "This company-managed account cannot access the portal yet.",
            error_status=403,
            payload=data,
        )
    if status_code >= 500:
        return BootstrapResult(
            error_message=data.get("message") or "Company control center is unavailable.",
            error_status=503,
            payload=data,
        )
    if not data.get("success"):
        return BootstrapResult(payload=data)

    user_data = data.get("user") or {}
    organization_data = data.get("organization") or {}
    email = (
        user_data.get("email")
        or organization_data.get("superadmin_email")
        or data.get("email")
        or ""
    ).strip().lower()
    resolved_username = (
        user_data.get("username")
        or organization_data.get("superadmin_username")
        or username
        or ""
    ).strip()
    if not resolved_username:
        return BootstrapResult(
            error_message="Company control center did not return a username.",
            error_status=502,
            payload=data,
        )

    existing_by_username = User.objects.filter(username__iexact=resolved_username).first()
    if existing_by_username:
        return BootstrapResult(user=existing_by_username, payload=data)

    if email and User.objects.filter(email__iexact=email).exists():
        return BootstrapResult(
            error_message="A local account already exists for this email. Please contact support to link it.",
            error_status=409,
            payload=data,
        )

    first_name = (user_data.get("first_name") or data.get("first_name") or "").strip()
    last_name = (user_data.get("last_name") or data.get("last_name") or "").strip()
    role = (user_data.get("role") or data.get("role") or Profile.ROLE_SUPERADMIN).strip()
    if role not in {choice for choice, _ in Profile.ROLE_CHOICES}:
        role = Profile.ROLE_SUPERADMIN

    with transaction.atomic():
        organization = _get_or_create_company_organization(data)
        user = User.objects.create_user(
            username=resolved_username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            is_active=bool(data.get("is_active", True)),
        )
        profile = user.profile
        profile.organization = organization
        profile.role = role
        profile.email_verified = True
        profile.save(update_fields=["organization", "role", "email_verified"])
        OrganizationMembership.objects.update_or_create(
            user=user,
            defaults={
                "organization": organization,
                "role": role,
                "is_owner": role == Profile.ROLE_SUPERADMIN,
                "is_active": user.is_active,
            },
        )
        log_audit(
            user,
            "auth.bootstrap_company_superadmin",
            resource_type="user",
            resource_id=user.pk,
            summary=f"Bootstrapped local account for {user.username} from company control center",
            metadata={
                "username": user.username,
                "organization_id": organization.id,
                "organization_company_reference": organization.company_reference,
            },
        )
    return BootstrapResult(user=user, payload=data)


def sync_superadmin_account_from_company_payload(payload: dict, password: str) -> User:
    organization_data = payload.get("organization") or {}
    username = (
        (payload.get("user") or {}).get("username")
        or organization_data.get("superadmin_username")
        or ""
    ).strip()
    if not username:
        raise ValueError("Company control center did not return a superadmin username.")

    email = (
        (payload.get("user") or {}).get("email")
        or organization_data.get("superadmin_email")
        or ""
    ).strip().lower()
    first_name = ((payload.get("user") or {}).get("first_name") or "").strip()
    last_name = ((payload.get("user") or {}).get("last_name") or "").strip()
    organization = _get_or_create_company_organization(payload)

    user = User.objects.filter(username__iexact=username).first()
    if not user:
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            is_active=True,
        )
    else:
        updated_fields = []
        if email and user.email != email:
            user.email = email
            updated_fields.append("email")
        if first_name and user.first_name != first_name:
            user.first_name = first_name
            updated_fields.append("first_name")
        if last_name and user.last_name != last_name:
            user.last_name = last_name
            updated_fields.append("last_name")
        user.set_password(password)
        updated_fields.append("password")
        if not user.is_active:
            user.is_active = True
            updated_fields.append("is_active")
        user.save(update_fields=updated_fields)

    profile = user.profile
    profile.organization = organization
    profile.role = Profile.ROLE_SUPERADMIN
    profile.email_verified = True
    profile.save(update_fields=["organization", "role", "email_verified"])
    OrganizationMembership.objects.update_or_create(
        user=user,
        defaults={
            "organization": organization,
            "role": Profile.ROLE_SUPERADMIN,
            "is_owner": True,
            "is_active": user.is_active,
        },
    )
    return user
