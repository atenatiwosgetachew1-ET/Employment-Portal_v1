from django.db.models import Q
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from .auth_utils import can_manage_platform, can_manage_users, can_view_audit_log
from .licensing import get_access_restriction, get_user_organization
from .models import AuditLog, Notification, PlatformSettings, UserPreferences
from .serializers import (
    AuditLogSerializer,
    NotificationSerializer,
    OrganizationSerializer,
    PlatformSettingsSerializer,
    UserPreferencesSerializer,
)


class IsManagerForAudit(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and can_view_audit_log(u))


class AuditLogPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class UserPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class NotificationListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        restriction = get_access_restriction(self.request.user, write=False)
        if restriction:
            return Notification.objects.none()
        return Notification.objects.filter(user=self.request.user)


class NotificationDetailView(generics.UpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer
    http_method_names = ["patch", "head", "options"]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    def update(self, request, *args, **kwargs):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)


class MarkAllNotificationsReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        updated = Notification.objects.filter(user=request.user, read=False).update(
            read=True
        )
        return Response({"marked_read": updated})


class UserPreferencesDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        restriction = get_access_restriction(request.user, write=False)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        prefs, _ = UserPreferences.objects.get_or_create(user=request.user)
        return Response(UserPreferencesSerializer(prefs).data)

    def patch(self, request):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        prefs, _ = UserPreferences.objects.get_or_create(user=request.user)
        ser = UserPreferencesSerializer(prefs, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class IsSuperadminOnly(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and can_manage_platform(u))


class PlatformSettingsDetailView(APIView):
    permission_classes = [IsAuthenticated, IsSuperadminOnly]

    def get(self, request):
        settings_obj = PlatformSettings.get_solo()
        return Response(PlatformSettingsSerializer(settings_obj).data)

    def patch(self, request):
        restriction = get_access_restriction(request.user, write=True)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        settings_obj = PlatformSettings.get_solo()
        serializer = PlatformSettingsSerializer(
            settings_obj,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class AuditLogListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsManagerForAudit]
    serializer_class = AuditLogSerializer
    pagination_class = AuditLogPagination
    queryset = AuditLog.objects.select_related("actor").all()

    def get_queryset(self):
        restriction = get_access_restriction(self.request.user, write=False)
        if restriction:
            return AuditLog.objects.none()
        queryset = super().get_queryset()
        organization = get_user_organization(self.request.user)
        if organization:
            queryset = queryset.filter(
                Q(actor__profile__organization=organization)
                | Q(metadata__organization_id=organization.id)
            ).distinct()
        q = (self.request.query_params.get("q") or "").strip()
        if q:
            queryset = queryset.filter(
                Q(action__icontains=q)
                | Q(resource_type__icontains=q)
                | Q(summary__icontains=q)
                | Q(actor__username__icontains=q)
            )
        return queryset


class CurrentOrganizationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        restriction = get_access_restriction(request.user, write=False)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        organization = get_user_organization(request.user)
        if not organization:
            return Response({"detail": "No organization found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(OrganizationSerializer(organization).data)
