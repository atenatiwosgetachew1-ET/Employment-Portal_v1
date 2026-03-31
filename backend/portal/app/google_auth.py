import re

from django.conf import settings
from django.contrib.auth import login as django_login
from django.contrib.auth.models import User
from django.views.decorators.csrf import csrf_protect
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit_log import log_audit
from .auth_utils import feature_enabled, user_payload
from .licensing import create_organization_for_user, get_user_organization, sync_profile_membership
from .models import Profile


def _names_from_google(idinfo):
    first = (idinfo.get("given_name") or "").strip()[:150]
    last = (idinfo.get("family_name") or "").strip()[:150]
    if not first and not last:
        name = (idinfo.get("name") or "").strip()
        if name:
            parts = name.split(None, 1)
            first = parts[0][:150]
            last = (parts[1] if len(parts) > 1 else "")[:150]
    return first, last


def _username_from_email(email: str) -> str:
    local = email.split("@")[0].lower()
    s = re.sub(r"[^a-z0-9._-]", "_", local)
    s = re.sub(r"_+", "_", s).strip("._-")
    if not s:
        s = "user"
    max_len = User._meta.get_field("username").max_length
    return s[:max_len]


def _unique_username(base: str) -> str:
    max_len = User._meta.get_field("username").max_length
    base = (base or "user")[:max_len]
    username = base
    n = 0
    while User.objects.filter(username=username).exists():
        n += 1
        suffix = f"_{n}"
        username = (base[: max_len - len(suffix)] + suffix)
    return username


@csrf_protect
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def login_with_google(request):
    if not feature_enabled("google_login_enabled"):
        return Response(
            {
                "success": False,
                "message": "Google sign-in is currently disabled.",
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    client_id = getattr(settings, "GOOGLE_CLIENT_ID", "") or ""
    if not client_id:
        return Response(
            {
                "success": False,
                "message": "Google sign-in is not configured on the server.",
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    token = request.data.get("id_token")
    if not token:
        return Response(
            {"success": False, "message": "Missing id_token."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        idinfo = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            client_id,
        )
    except ValueError:
        return Response(
            {"success": False, "message": "Invalid or expired Google sign-in."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    sub = idinfo.get("sub")
    email = (idinfo.get("email") or "").strip().lower()
    if not sub or not email:
        return Response(
            {"success": False, "message": "Google did not return a complete profile."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not idinfo.get("email_verified", False):
        return Response(
            {
                "success": False,
                "message": "Your Google account email is not verified.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        profile = Profile.objects.select_related("user").get(google_sub=sub)
        user = profile.user
    except Profile.DoesNotExist:
        existing = User.objects.filter(email__iexact=email).select_related("profile").first()
        if existing:
            profile = existing.profile
            if profile.google_sub and profile.google_sub != sub:
                return Response(
                    {
                        "success": False,
                        "message": "This email is linked to a different Google account.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            profile.google_sub = sub
            profile.email_verified = True
            profile.save(update_fields=["google_sub", "email_verified"])
            user = existing
            first, last = _names_from_google(idinfo)
            updated = []
            if first and not user.first_name:
                user.first_name = first
                updated.append("first_name")
            if last and not user.last_name:
                user.last_name = last
                updated.append("last_name")
            if updated:
                user.save(update_fields=updated)
            sync_profile_membership(existing)
        else:
            first, last = _names_from_google(idinfo)
            base_username = _username_from_email(email)
            username = _unique_username(base_username)
            user = User(
                username=username,
                email=email,
                first_name=first,
                last_name=last,
                is_active=True,
            )
            user.set_unusable_password()
            user.save()
            create_organization_for_user(user, role=Profile.ROLE_SUPERADMIN)
            profile = user.profile
            profile.google_sub = sub
            profile.email_verified = True
            profile.save(update_fields=["google_sub", "email_verified"])

    if not user.is_active:
        return Response(
            {"success": False, "message": "This account is inactive."},
            status=status.HTTP_403_FORBIDDEN,
        )

    django_login(request, user)
    organization = get_user_organization(user)
    log_audit(
        user,
        "auth.login_google",
        resource_type="session",
        summary=f"User {user.username} signed in with Google",
        metadata={"username": user.username, "organization_id": organization.id if organization else None},
    )
    return Response(
        {
            "success": True,
            "message": "Login successful",
            "user": user_payload(user),
        }
    )


login_with_google.csrf_exempt = False
