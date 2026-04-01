from django.contrib.auth.models import User
from django.db.models import Q
import logging
from rest_framework import generics, status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit_log import log_audit
from .auth_utils import (
    can_manage_all_users,
    can_manage_users,
    feature_enabled,
    get_profile_role,
)
from .email_service import send_account_setup_email
from .licensing import get_access_restriction, get_user_organization
from .models import Notification, Profile
from .platform_views import UserPagination
from .serializers import (
    AdminPasswordResetSerializer,
    UserCreateSerializer,
    UserListSerializer,
    UserUpdateSerializer,
)

logger = logging.getLogger(__name__)


class IsSuperadminOrAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and can_manage_users(user))


class UserListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsSuperadminOrAdmin]
    pagination_class = UserPagination
    queryset = User.objects.all().select_related("profile").order_by("id")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UserCreateSerializer
        return UserListSerializer

    def create(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        self._finalize_created_user(user)

        warning = ""
        if user.email:
            try:
                send_account_setup_email(
                    user,
                    include_google_sign_in=feature_enabled("google_login_enabled"),
                )
            except Exception:
                logger.exception("Could not send setup email for created user %s", user.username)
                warning = (
                    "User was created, but the setup email could not be sent. "
                    "Check your email configuration and retry the invitation flow."
                )

        response_data = UserListSerializer(user, context=self.get_serializer_context()).data
        response_data.update(
            {
                "success": True,
                "message": "User created successfully.",
            }
        )
        if warning:
            response_data["warning"] = warning
        headers = self.get_success_headers(serializer.data)
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)

    def get_queryset(self):
        qs = super().get_queryset()
        organization = get_user_organization(self.request.user)
        if organization:
            qs = qs.filter(profile__organization=organization)
        if can_manage_all_users(self.request.user):
            queryset = qs
        elif can_manage_users(self.request.user):
            queryset = qs.filter(
                profile__role__in=[Profile.ROLE_STAFF, Profile.ROLE_CUSTOMER]
            )
        else:
            return qs.none()

        search = (self.request.query_params.get("q") or "").strip()
        role_filter = (self.request.query_params.get("role") or "").strip()
        is_active = (self.request.query_params.get("is_active") or "").strip().lower()

        if search:
            queryset = queryset.filter(
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(profile__phone__icontains=search)
                | Q(profile__agent_country__icontains=search)
                | Q(profile__staff_side__icontains=search)
                | Q(profile__staff_level_label__icontains=search)
            )

        if role_filter in {choice for choice, _ in Profile.ROLE_CHOICES}:
            queryset = queryset.filter(profile__role=role_filter)

        if is_active in {"true", "false"}:
            queryset = queryset.filter(is_active=(is_active == "true"))

        return queryset

    def _finalize_created_user(self, user):
        organization = get_user_organization(self.request.user)
        log_audit(
            self.request.user,
            "user.create",
            resource_type="user",
            resource_id=user.pk,
            summary=f"Created user {user.username}",
            metadata={"username": user.username, "organization_id": organization.id if organization else None},
        )
        Notification.objects.create(
            user=user,
            title="Welcome",
            body=(
                f'Your account "{user.username}" is ready. '
                "Use the setup link from your email to choose your password."
            ),
            kind=Notification.KIND_SUCCESS,
        )


class UserRetrieveUpdateDestroyView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, IsSuperadminOrAdmin]
    queryset = User.objects.all().select_related("profile")
    lookup_field = "pk"

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            return UserUpdateSerializer
        return UserListSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        organization = get_user_organization(self.request.user)
        if organization:
            qs = qs.filter(profile__organization=organization)
        if can_manage_all_users(self.request.user):
            return qs
        if can_manage_users(self.request.user):
            return qs.filter(profile__role__in=[Profile.ROLE_STAFF, Profile.ROLE_CUSTOMER])
        return qs.none()

    def perform_update(self, serializer):
        instance = serializer.save()
        organization = get_user_organization(self.request.user)
        log_audit(
            self.request.user,
            "user.update",
            resource_type="user",
            resource_id=instance.pk,
            summary=f"Updated user {instance.username}",
            metadata={"username": instance.username, "organization_id": organization.id if organization else None},
        )

    def destroy(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        instance = self.get_object()
        if instance.pk == request.user.pk:
            return Response(
                {"detail": "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not can_manage_all_users(request.user):
            target_role = get_profile_role(instance)
            if target_role not in (Profile.ROLE_STAFF, Profile.ROLE_CUSTOMER):
                return Response(
                    {"detail": "You do not have permission to delete this account."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        return super().destroy(request, *args, **kwargs)

    def perform_destroy(self, instance):
        organization = get_user_organization(self.request.user)
        log_audit(
            self.request.user,
            "user.delete",
            resource_type="user",
            resource_id=instance.pk,
            summary=f"Deleted user {instance.username}",
            metadata={"username": instance.username, "organization_id": organization.id if organization else None},
        )
        instance.delete()

    def update(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)


class UserPasswordResetView(APIView):
    permission_classes = [IsAuthenticated, IsSuperadminOrAdmin]

    def _target_user(self, request, pk):
        queryset = User.objects.all().select_related("profile")
        organization = get_user_organization(request.user)
        if organization:
            queryset = queryset.filter(profile__organization=organization)
        if can_manage_all_users(request.user):
            return queryset.filter(pk=pk).first()
        if can_manage_users(request.user):
            return queryset.filter(
                pk=pk,
                profile__role__in=[Profile.ROLE_STAFF, Profile.ROLE_CUSTOMER],
            ).first()
        return None

    def post(self, request, pk):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)

        target = self._target_user(request, pk)
        if not target:
            return Response(
                {"detail": "You do not have permission to reset this password."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if target.pk == request.user.pk:
            return Response(
                {"detail": "You cannot reset your own password from user management."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AdminPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target.set_password(serializer.validated_data["new_password"])
        target.save(update_fields=["password"])
        target.profile.failed_login_attempts = 0
        target.profile.login_locked_until = None
        target.profile.save(update_fields=["failed_login_attempts", "login_locked_until"])

        organization = get_user_organization(request.user)
        log_audit(
            request.user,
            "user.password_reset",
            resource_type="user",
            resource_id=target.pk,
            summary=f"Password reset for user {target.username}",
            metadata={
                "username": target.username,
                "organization_id": organization.id if organization else None,
            },
        )
        Notification.objects.create(
            user=target,
            title="Password reset",
            body="A manager reset your password. Use the new credentials you were given to sign in.",
            kind=Notification.KIND_WARNING,
        )
        return Response({"success": True, "message": "Password reset successful."})


class StaffSideOptionsView(APIView):
    permission_classes = [IsAuthenticated, IsSuperadminOrAdmin]

    def get(self, request):
        organization = get_user_organization(request.user)
        if not organization:
            return Response({"options": []})

        agent_names = list(
            User.objects.filter(
                profile__organization=organization,
                profile__role=Profile.ROLE_CUSTOMER,
            )
            .exclude(first_name="")
            .values_list("first_name", flat=True)
        )
        usernames = list(
            User.objects.filter(
                profile__organization=organization,
                profile__role=Profile.ROLE_CUSTOMER,
            )
            .exclude(username="")
            .values_list("username", flat=True)
        )
        seen = set()
        options = []
        for value in [organization.name, *agent_names, *usernames]:
            cleaned = (value or "").strip()
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                options.append(cleaned)
        return Response({"options": options})
