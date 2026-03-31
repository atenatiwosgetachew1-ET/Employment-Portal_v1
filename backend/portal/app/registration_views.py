from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.middleware.csrf import get_token
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
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
from .auth_utils import feature_enabled
from .company_bootstrap import (
    consume_superadmin_reset_token_with_company,
    get_company_reset_consume_url,
    get_company_reset_validate_url,
    sync_superadmin_account_from_company_payload,
    validate_superadmin_reset_token_with_company,
)
from .email_service import send_password_reset_email, send_verification_email
from .licensing import create_organization_for_user, get_user_organization
from .models import Profile
from .serializers import (
    CompanySuperadminResetConfirmSerializer,
    CompanySuperadminResetTokenSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PublicRegisterSerializer,
    ResendVerificationSerializer,
    VerifyEmailCodeSerializer,
)
from .verification_code import (
    clear_code_on_profile,
    generate_code,
    store_code_on_profile,
    verify_code_for_profile,
)

User = get_user_model()


@api_view(["GET"])
@permission_classes([AllowAny])
def csrf_token_view(request):
    return Response({"csrfToken": get_token(request)})


@api_view(["GET"])
@permission_classes([AllowAny])
def public_auth_options_view(request):
    return Response(
        {
            "registration_enabled": feature_enabled("registration_enabled"),
            "email_password_login_enabled": feature_enabled("email_password_login_enabled"),
            "google_login_enabled": feature_enabled("google_login_enabled"),
            "google_configured": bool(getattr(settings, "GOOGLE_CLIENT_ID", "")),
        }
    )


@csrf_protect
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def register(request):
    if not feature_enabled("registration_enabled"):
        return Response(
            {
                "success": False,
                "message": "New registrations are currently disabled.",
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    serializer = PublicRegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    create_organization_for_user(user, role=Profile.ROLE_SUPERADMIN)
    plain = generate_code()
    try:
        store_code_on_profile(user.profile, plain)
        send_verification_email(user, plain)
    except Exception:
        user.delete()
        return Response(
            {"success": False, "message": "Could not send verification email. Try again later."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    log_audit(
        user,
        "auth.register",
        resource_type="user",
        resource_id=user.pk,
        summary=f"Registered {user.username} (pending email verification)",
        metadata={
            "username": user.username,
            "organization_id": user.profile.organization_id,
        },
    )
    return Response(
        {
            "success": True,
            "message": "We sent a 6-digit code to your email. Enter it to activate your account.",
        },
        status=status.HTTP_201_CREATED,
    )


@csrf_protect
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def verify_email(request):
    ser = VerifyEmailCodeSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    email = ser.validated_data["email"]
    code = ser.validated_data["code"]

    try:
        user = User.objects.select_related("profile").get(email__iexact=email)
    except User.DoesNotExist:
        return Response(
            {"success": False, "message": "Invalid email or verification code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    profile = user.profile
    if profile.email_verified and user.is_active:
        return Response(
            {"success": False, "message": "This account is already verified."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not profile.email_verification_code_hash:
        return Response(
            {"success": False, "message": "Invalid email or verification code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not verify_code_for_profile(profile, code):
        return Response(
            {"success": False, "message": "Invalid email or verification code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    clear_code_on_profile(profile)
    user.is_active = True
    user.save(update_fields=["is_active"])
    profile.email_verified = True
    profile.save(update_fields=["email_verified"])
    log_audit(
        user,
        "auth.email_verified",
        resource_type="user",
        resource_id=user.pk,
        summary=f"Email verified for {user.username}",
        metadata={"username": user.username, "organization_id": user.profile.organization_id},
    )
    return Response(
        {"success": True, "message": "Your account is verified. You can sign in now."}
    )


@csrf_protect
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def resend_verification(request):
    ser = ResendVerificationSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    email = ser.validated_data["email"]

    try:
        user = User.objects.select_related("profile").get(email__iexact=email)
    except User.DoesNotExist:
        return Response(
            {
                "success": True,
                "message": "If an account exists for that email and is pending verification, we sent a new code.",
            }
        )

    profile = user.profile
    if profile.email_verified and user.is_active:
        return Response(
            {
                "success": True,
                "message": "If an account exists for that email and is pending verification, we sent a new code.",
            }
        )

    if not user.has_usable_password():
        return Response(
            {
                "success": True,
                "message": "If an account exists for that email and is pending verification, we sent a new code.",
            }
        )

    plain = generate_code()
    try:
        store_code_on_profile(profile, plain)
        send_verification_email(user, plain)
    except Exception:
        return Response(
            {"success": False, "message": "Could not send email. Try again later."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    log_audit(
        user,
        "auth.verification_code_resent",
        resource_type="user",
        resource_id=user.pk,
        summary=f"Verification code resent for {user.username}",
        metadata={"username": user.username, "organization_id": user.profile.organization_id},
    )
    return Response(
        {
            "success": True,
            "message": "If an account exists for that email and is pending verification, we sent a new code.",
        }
    )


@csrf_protect
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def password_reset_request(request):
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"].strip().lower()
    try:
        user = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        return Response(
            {
                "success": True,
                "message": "If an account exists for that email, we sent reset instructions.",
            }
        )
    if not user.email:
        return Response(
            {
                "success": True,
                "message": "If an account exists for that email, we sent reset instructions.",
            }
        )
    try:
        send_password_reset_email(user)
    except Exception:
        return Response(
            {"success": False, "message": "Could not send email. Try again later."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    log_audit(
        user,
        "auth.password_reset_request",
        resource_type="user",
        resource_id=user.pk,
        summary=f"Password reset requested for {user.username}",
        metadata={"username": user.username, "organization_id": user.profile.organization_id},
    )
    return Response(
        {
            "success": True,
            "message": "If an account exists for that email, we sent reset instructions.",
        }
    )


@csrf_protect
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def password_reset_confirm(request):
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    uid = serializer.validated_data["uid"]
    token = serializer.validated_data["token"]
    password = serializer.validated_data["new_password"]
    try:
        pk = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=pk)
    except (User.DoesNotExist, TypeError, ValueError, OverflowError):
        return Response(
            {"success": False, "message": "Invalid reset link."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not default_token_generator.check_token(user, token):
        return Response(
            {"success": False, "message": "Invalid or expired reset link."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user.set_password(password)
    user.save(update_fields=["password"])
    profile, _ = Profile.objects.get_or_create(
        user=user,
        defaults={"role": Profile.ROLE_CUSTOMER},
    )
    profile.email_verified = True
    profile.save(update_fields=["email_verified"])
    log_audit(
        user,
        "auth.password_reset_complete",
        resource_type="user",
        resource_id=user.pk,
        summary=f"Password reset for {user.username}",
        metadata={"username": user.username, "organization_id": user.profile.organization_id},
    )
    return Response({"success": True, "message": "Your password has been updated. You can sign in now."})


@csrf_protect
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def company_superadmin_reset_token_validate(request):
    if not get_company_reset_validate_url():
        return Response(
            {"success": False, "message": "Company superadmin reset is not configured."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    serializer = CompanySuperadminResetTokenSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    token = serializer.validated_data["token"]
    status_code, data = validate_superadmin_reset_token_with_company(token)
    if status_code == 0:
        return Response(
            {"success": False, "message": "Company superadmin reset is not configured."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if status_code >= 400:
        return Response(
            {"success": False, "message": data.get("message") or "Reset token is invalid."},
            status=status_code,
        )
    return Response(
        {
            "success": True,
            "organization": data.get("organization"),
            "expires_at": data.get("expires_at"),
        }
    )


@csrf_protect
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def company_superadmin_reset_token_consume(request):
    if not get_company_reset_consume_url():
        return Response(
            {"success": False, "message": "Company superadmin reset is not configured."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    serializer = CompanySuperadminResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    token = serializer.validated_data["token"]
    new_password = serializer.validated_data["new_password"]
    status_code, data = consume_superadmin_reset_token_with_company(token, new_password)
    if status_code == 0:
        return Response(
            {"success": False, "message": "Company superadmin reset is not configured."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if status_code >= 400:
        return Response(
            {"success": False, "message": data.get("message") or "Reset failed."},
            status=status_code,
        )

    organization_payload = data.get("organization") or {}
    try:
        sync_superadmin_account_from_company_payload(
            {"organization": organization_payload},
            new_password,
        )
    except ValueError as exc:
        return Response(
            {"success": False, "message": str(exc)},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return Response(
        {
            "success": True,
            "message": "Your password has been updated. You can sign in now.",
            "organization": organization_payload,
        }
    )


register.csrf_exempt = False
verify_email.csrf_exempt = False
resend_verification.csrf_exempt = False
password_reset_request.csrf_exempt = False
password_reset_confirm.csrf_exempt = False
company_superadmin_reset_token_validate.csrf_exempt = False
company_superadmin_reset_token_consume.csrf_exempt = False
