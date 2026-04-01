# portal/app/urls.py
from django.urls import path

from .google_auth import login_with_google
from .login_auth import login, logout
from .me_view import me_view
from .employee_views import (
    EmployeeDocumentDeleteView,
    EmployeeDocumentUploadView,
    EmployeeFormOptionsView,
    EmployeeListCreateView,
    EmployeeRetrieveUpdateDestroyView,
)
from .registration_views import (
    company_superadmin_reset_token_consume,
    company_superadmin_reset_token_validate,
    csrf_token_view,
    password_reset_confirm,
    password_reset_request,
    public_auth_options_view,
    register,
    resend_verification,
    verify_email,
)
from .sync_views import (
    sync_organization_view,
    sync_plan_view,
    sync_subscription_view,
)
from .platform_views import (
    AuditLogListView,
    CurrentOrganizationView,
    MarkAllNotificationsReadView,
    NotificationDetailView,
    NotificationListView,
    PlatformSettingsDetailView,
    UserPreferencesDetailView,
)
from .user_views import (
    StaffSideOptionsView,
    UserListCreateView,
    UserPasswordResetView,
    UserRetrieveUpdateDestroyView,
)

urlpatterns = [
    path("csrf/", csrf_token_view, name="csrf"),
    path("auth/options/", public_auth_options_view, name="auth-options"),
    path("login/", login, name="login"),
    path("auth/google/", login_with_google, name="auth-google"),
    path("logout/", logout, name="logout"),
    path("register/", register, name="register"),
    path("verify-email/", verify_email, name="verify-email"),
    path(
        "resend-verification/",
        resend_verification,
        name="resend-verification",
    ),
    path("password-reset/", password_reset_request, name="password-reset"),
    path(
        "password-reset/company-superadmin/validate/",
        company_superadmin_reset_token_validate,
        name="password-reset-company-superadmin-validate",
    ),
    path(
        "password-reset/company-superadmin/consume/",
        company_superadmin_reset_token_consume,
        name="password-reset-company-superadmin-consume",
    ),
    path(
        "password-reset/confirm/",
        password_reset_confirm,
        name="password-reset-confirm",
    ),
    path("me/", me_view, name="me"),
    path("employees/form-options/", EmployeeFormOptionsView.as_view(), name="employees-form-options"),
    path("employees/", EmployeeListCreateView.as_view(), name="employees-list"),
    path("employees/<int:pk>/", EmployeeRetrieveUpdateDestroyView.as_view(), name="employees-detail"),
    path("employees/<int:employee_pk>/documents/", EmployeeDocumentUploadView.as_view(), name="employees-document-upload"),
    path("employee-documents/<int:pk>/", EmployeeDocumentDeleteView.as_view(), name="employees-document-delete"),
    path("users/", UserListCreateView.as_view(), name="users-list"),
    path("users/staff-side-options/", StaffSideOptionsView.as_view(), name="users-staff-side-options"),
    path("users/<int:pk>/reset-password/", UserPasswordResetView.as_view(), name="users-reset-password"),
    path("users/<int:pk>/", UserRetrieveUpdateDestroyView.as_view(), name="users-detail"),
    path(
        "notifications/mark-all-read/",
        MarkAllNotificationsReadView.as_view(),
        name="notifications-mark-all-read",
    ),
    path(
        "notifications/<int:pk>/",
        NotificationDetailView.as_view(),
        name="notifications-detail",
    ),
    path("notifications/", NotificationListView.as_view(), name="notifications-list"),
    path(
        "preferences/me/",
        UserPreferencesDetailView.as_view(),
        name="preferences-me",
    ),
    path("organization/me/", CurrentOrganizationView.as_view(), name="organization-me"),
    path("company-sync/plans/", sync_plan_view, name="company-sync-plans"),
    path("company-sync/organizations/", sync_organization_view, name="company-sync-organizations"),
    path("company-sync/subscriptions/", sync_subscription_view, name="company-sync-subscriptions"),
    path(
        "platform-settings/",
        PlatformSettingsDetailView.as_view(),
        name="platform-settings",
    ),
    path("audit-logs/", AuditLogListView.as_view(), name="audit-logs-list"),
]
