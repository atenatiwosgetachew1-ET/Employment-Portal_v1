from datetime import timedelta
import json
import os
import tempfile
import time
from unittest.mock import patch
from urllib import error

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core import mail
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .employee_ocr import build_field_candidates, extract_employee_document_fields
from .licensing import get_user_organization
from .models import (
    AuditLog,
    Employee,
    EmployeeSelection,
    Notification,
    OrganizationMembership,
    PlatformSettings,
    Profile,
)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AuthFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.csrf_client = Client(enforce_csrf_checks=True)

    def _csrf_token(self):
        response = self.csrf_client.get("/api/csrf/")
        self.assertEqual(response.status_code, 200)
        return response.cookies["csrftoken"].value

    def test_register_verify_login_and_bootstrap_me(self):
        csrf_token = self._csrf_token()

        with patch("app.registration_views.generate_code", return_value="123456"):
            response = self.csrf_client.post(
                "/api/register/",
                data=json.dumps(
                    {
                        "username": "newuser",
                        "email": "newuser@example.com",
                        "password": "strong-pass-123",
                        "password_confirm": "strong-pass-123",
                    }
                ),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=csrf_token,
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("123456", mail.outbox[0].body)

        user = User.objects.get(username="newuser")
        self.assertFalse(user.is_active)
        self.assertFalse(user.profile.email_verified)

        verify_response = self.csrf_client.post(
            "/api/verify-email/",
            data=json.dumps({"email": "newuser@example.com", "code": "123456"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(verify_response.status_code, 200)

        user.refresh_from_db()
        user.profile.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertTrue(user.profile.email_verified)

        login_response = self.csrf_client.post(
            "/api/login/",
            data=json.dumps({"username": "newuser", "password": "strong-pass-123"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.json()["user"]["username"], "newuser")

        me_response = self.csrf_client.get("/api/me/")
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.json()["email"], "newuser@example.com")

        actions = list(
            AuditLog.objects.order_by("created_at").values_list("action", flat=True)
        )
        self.assertIn("auth.register", actions)
        self.assertIn("auth.email_verified", actions)
        self.assertIn("auth.login", actions)

    def test_register_requires_csrf(self):
        response = self.csrf_client.post(
            "/api/register/",
            data=json.dumps(
                {
                    "username": "csrfuser",
                    "email": "csrfuser@example.com",
                    "password": "strong-pass-123",
                    "password_confirm": "strong-pass-123",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_registration_can_be_disabled_via_platform_settings(self):
        settings_obj = PlatformSettings.get_solo()
        settings_obj.feature_flags["registration_enabled"] = False
        settings_obj.save()

        csrf_token = self._csrf_token()
        response = self.csrf_client.post(
            "/api/register/",
            data=json.dumps(
                {
                    "username": "blocked-user",
                    "email": "blocked@example.com",
                    "password": "strong-pass-123",
                    "password_confirm": "strong-pass-123",
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )

        self.assertEqual(response.status_code, 503)
        self.assertIn("disabled", response.json()["message"].lower())

    @override_settings(LOGIN_MAX_FAILED_ATTEMPTS=3, LOGIN_LOCKOUT_MINUTES=15)
    def test_login_locks_after_repeated_failures_and_sends_reset_email(self):
        settings_obj = PlatformSettings.get_solo()
        settings_obj.login_max_failed_attempts = 3
        settings_obj.login_lockout_minutes = 15
        settings_obj.save()

        user = User.objects.create_user(
            username="locked-user",
            email="locked@example.com",
            password="strong-pass-123",
            is_active=True,
        )
        user.profile.email_verified = True
        user.profile.save(update_fields=["email_verified"])

        csrf_token = self._csrf_token()
        for _ in range(2):
            response = self.csrf_client.post(
                "/api/login/",
                data=json.dumps({"username": "locked-user", "password": "wrong-pass"}),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=csrf_token,
            )
            self.assertEqual(response.status_code, 401)

        locked = self.csrf_client.post(
            "/api/login/",
            data=json.dumps({"username": "locked-user", "password": "wrong-pass"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(locked.status_code, 429)
        self.assertIn("recovery instructions", locked.json()["message"])

        user.refresh_from_db()
        user.profile.refresh_from_db()
        self.assertEqual(user.profile.failed_login_attempts, 3)
        self.assertIsNotNone(user.profile.login_locked_until)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("reset your password", mail.outbox[0].body.lower())

        blocked = self.csrf_client.post(
            "/api/login/",
            data=json.dumps({"username": "locked-user", "password": "strong-pass-123"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(blocked.status_code, 429)

    @override_settings(LOGIN_MAX_FAILED_ATTEMPTS=2, LOGIN_LOCKOUT_MINUTES=15)
    def test_unverified_user_lockout_resends_verification_email(self):
        settings_obj = PlatformSettings.get_solo()
        settings_obj.login_max_failed_attempts = 2
        settings_obj.login_lockout_minutes = 15
        settings_obj.save()

        user = User.objects.create_user(
            username="pending-user",
            email="pending@example.com",
            password="strong-pass-123",
            is_active=False,
        )
        user.profile.email_verified = False
        user.profile.save(update_fields=["email_verified"])

        csrf_token = self._csrf_token()
        with patch("app.login_auth.generate_code", return_value="654321"):
            for _ in range(2):
                response = self.csrf_client.post(
                    "/api/login/",
                    data=json.dumps({"username": "pending-user", "password": "wrong-pass"}),
                    content_type="application/json",
                    HTTP_X_CSRFTOKEN=csrf_token,
                )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("654321", mail.outbox[0].body)

        user.refresh_from_db()
        user.profile.refresh_from_db()
        self.assertTrue(user.profile.email_verification_code_hash)
        self.assertIsNotNone(user.profile.login_locked_until)

    @override_settings(LOGIN_MAX_FAILED_ATTEMPTS=2, LOGIN_LOCKOUT_MINUTES=15)
    def test_lockout_expires_and_successful_login_clears_counter(self):
        settings_obj = PlatformSettings.get_solo()
        settings_obj.login_max_failed_attempts = 2
        settings_obj.login_lockout_minutes = 15
        settings_obj.save()

        user = User.objects.create_user(
            username="cooldown-user",
            email="cooldown@example.com",
            password="strong-pass-123",
            is_active=True,
        )
        user.profile.email_verified = True
        user.profile.failed_login_attempts = 2
        user.profile.login_locked_until = timezone.now() - timedelta(minutes=1)
        user.profile.save(
            update_fields=["email_verified", "failed_login_attempts", "login_locked_until"]
        )

        csrf_token = self._csrf_token()
        response = self.csrf_client.post(
            "/api/login/",
            data=json.dumps({"username": "cooldown-user", "password": "strong-pass-123"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )

        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        user.profile.refresh_from_db()
        self.assertEqual(user.profile.failed_login_attempts, 0)
        self.assertIsNone(user.profile.login_locked_until)

    @override_settings(FRONTEND_URL="http://localhost:5173")
    @patch("app.company_bootstrap.request.urlopen")
    def test_first_login_can_bootstrap_superadmin_from_company_portal(self, urlopen):
        class FakeResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return json.dumps(
                    {
                        "success": True,
                        "user": {
                            "username": "company-admin",
                            "email": "owner@acme.example",
                            "first_name": "Acme",
                            "last_name": "Owner",
                            "role": "superadmin",
                        },
                        "organization": {
                            "external_id": "company-org-1",
                            "name": "Acme Hiring",
                            "slug": "acme-hiring",
                            "billing_contact_email": "owner@acme.example",
                            "status": "active",
                            "reputation_tier": "trusted",
                        },
                    }
                ).encode("utf-8")

        urlopen.return_value = FakeResponse()

        csrf_token = self._csrf_token()
        with self.settings(
            COMPANY_CONTROL_CENTER_BASE_URL="http://localhost:8001"
        ):
            response = self.csrf_client.post(
                "/api/login/",
                data=json.dumps({"username": "company-admin", "password": "strong-pass-123"}),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=csrf_token,
            )

        self.assertEqual(response.status_code, 200)
        user = User.objects.get(username="company-admin")
        user.profile.refresh_from_db()
        self.assertEqual(user.email, "owner@acme.example")
        self.assertEqual(user.profile.role, Profile.ROLE_SUPERADMIN)
        self.assertTrue(user.profile.email_verified)
        self.assertEqual(user.profile.organization.name, "Acme Hiring")
        self.assertEqual(user.profile.organization.company_reference, "company-org-1")
        self.assertTrue(user.profile.organization.created_by_company)

    @patch("app.company_bootstrap.request.urlopen")
    def test_first_login_bootstrap_returns_invalid_credentials_when_company_rejects(self, urlopen):
        urlopen.side_effect = error.HTTPError(
            url="http://localhost:8001/api/customer-portals/bootstrap-login/",
            code=401,
            msg="Unauthorized",
            hdrs=None,
            fp=None,
        )

        csrf_token = self._csrf_token()
        with self.settings(
            COMPANY_CONTROL_CENTER_BASE_URL="http://localhost:8001"
        ):
            response = self.csrf_client.post(
                "/api/login/",
                data=json.dumps({"username": "unknown-admin", "password": "wrong-pass"}),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=csrf_token,
            )

        self.assertEqual(response.status_code, 401)
        self.assertFalse(User.objects.filter(username="unknown-admin").exists())

    @patch("app.company_bootstrap.request.urlopen")
    def test_existing_superadmin_login_is_verified_by_company_and_updates_local_password(self, urlopen):
        superadmin = User.objects.create_user(
            username="company-owner",
            email="owner@acme.example",
            password="old-local-pass",
            is_active=True,
        )
        superadmin.profile.role = Profile.ROLE_SUPERADMIN
        superadmin.profile.email_verified = True
        superadmin.profile.save(update_fields=["role", "email_verified"])
        organization = get_user_organization(superadmin)
        organization.created_by_company = True
        organization.company_reference = "company-org-1"
        organization.save(update_fields=["created_by_company", "company_reference"])

        class FakeResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return json.dumps(
                    {
                        "success": True,
                        "is_active": True,
                        "user": {
                            "username": "company-owner",
                            "email": "owner@acme.example",
                            "first_name": "Company",
                            "last_name": "Owner",
                            "role": "superadmin",
                        },
                    }
                ).encode("utf-8")

        urlopen.return_value = FakeResponse()
        csrf_token = self._csrf_token()
        with self.settings(COMPANY_CONTROL_CENTER_BASE_URL="http://localhost:8001"):
            response = self.csrf_client.post(
                "/api/login/",
                data=json.dumps({"username": "company-owner", "password": "new-company-pass"}),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=csrf_token,
            )

        self.assertEqual(response.status_code, 200)
        superadmin.refresh_from_db()
        self.assertTrue(superadmin.check_password("new-company-pass"))
        self.assertEqual(superadmin.first_name, "Company")
        self.assertEqual(superadmin.last_name, "Owner")

    @patch("app.company_bootstrap.request.urlopen")
    def test_existing_superadmin_login_fails_when_company_rejects_credentials(self, urlopen):
        superadmin = User.objects.create_user(
            username="company-owner",
            email="owner@acme.example",
            password="old-local-pass",
            is_active=True,
        )
        superadmin.profile.role = Profile.ROLE_SUPERADMIN
        superadmin.profile.email_verified = True
        superadmin.profile.save(update_fields=["role", "email_verified"])
        organization = get_user_organization(superadmin)
        organization.created_by_company = True
        organization.company_reference = "company-org-1"
        organization.save(update_fields=["created_by_company", "company_reference"])

        urlopen.side_effect = error.HTTPError(
            url="http://localhost:8001/api/customer-portals/bootstrap-login/",
            code=401,
            msg="Unauthorized",
            hdrs=None,
            fp=None,
        )

        csrf_token = self._csrf_token()
        with self.settings(COMPANY_CONTROL_CENTER_BASE_URL="http://localhost:8001"):
            response = self.csrf_client.post(
                "/api/login/",
                data=json.dumps({"username": "company-owner", "password": "wrong-pass"}),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=csrf_token,
            )

        self.assertEqual(response.status_code, 401)
        superadmin.refresh_from_db()
        self.assertTrue(superadmin.check_password("old-local-pass"))

    @patch("app.company_bootstrap.request.urlopen")
    def test_company_superadmin_reset_token_validate_proxies_company_result(self, urlopen):
        class FakeResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return json.dumps(
                    {
                        "success": True,
                        "organization": {
                            "external_reference": "company-org-1",
                            "name": "Acme Hiring",
                            "slug": "acme-hiring",
                            "superadmin_username": "company-owner",
                            "superadmin_email": "owner@acme.example",
                        },
                        "expires_at": "2026-03-31T12:00:00Z",
                    }
                ).encode("utf-8")

        urlopen.return_value = FakeResponse()
        csrf_token = self._csrf_token()
        with self.settings(COMPANY_CONTROL_CENTER_BASE_URL="http://localhost:8001"):
            response = self.csrf_client.post(
                "/api/password-reset/company-superadmin/validate/",
                data=json.dumps({"token": "reset-token-123"}),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=csrf_token,
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        self.assertEqual(response.json()["organization"]["name"], "Acme Hiring")

    @patch("app.company_bootstrap.request.urlopen")
    def test_company_superadmin_reset_token_consume_updates_local_account(self, urlopen):
        class FakeResponse:
            status = 200

            def __init__(self, payload):
                self.payload = payload

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return json.dumps(self.payload).encode("utf-8")

        urlopen.side_effect = [
            FakeResponse(
                {
                    "success": True,
                    "organization": {
                        "external_reference": "company-org-1",
                        "name": "Acme Hiring",
                        "slug": "acme-hiring",
                        "superadmin_username": "company-owner",
                        "superadmin_email": "owner@acme.example",
                        "status": "active",
                        "read_only_mode": False,
                    },
                }
            )
        ]

        csrf_token = self._csrf_token()
        with self.settings(COMPANY_CONTROL_CENTER_BASE_URL="http://localhost:8001"):
            response = self.csrf_client.post(
                "/api/password-reset/company-superadmin/consume/",
                data=json.dumps(
                    {
                        "token": "reset-token-123",
                        "new_password": "new-company-pass",
                        "new_password_confirm": "new-company-pass",
                    }
                ),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=csrf_token,
            )

        self.assertEqual(response.status_code, 200)
        user = User.objects.get(username="company-owner")
        self.assertTrue(user.check_password("new-company-pass"))
        self.assertEqual(user.email, "owner@acme.example")
        self.assertEqual(user.profile.role, Profile.ROLE_SUPERADMIN)
        self.assertEqual(user.profile.organization.company_reference, "company-org-1")

    def test_me_patch_updates_user_and_profile_fields(self):
        user = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="strong-pass-123",
            is_active=True,
        )
        user.profile.email_verified = True
        user.profile.save(update_fields=["email_verified"])

        self.client.force_authenticate(user=user)
        response = self.client.patch(
            "/api/me/",
            {
                "first_name": "Alice",
                "last_name": "Ngugi",
                "phone": "+254700000000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        user.profile.refresh_from_db()
        self.assertEqual(user.first_name, "Alice")
        self.assertEqual(user.last_name, "Ngugi")
        self.assertEqual(user.profile.phone, "+254700000000")
        self.assertTrue(
            AuditLog.objects.filter(
                actor=user,
                action="profile.update",
            ).exists()
        )


class NotificationReminderTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="notify-user",
            email="notify@example.com",
            password="strong-pass-123",
            is_active=True,
        )
        self.user.profile.email_verified = True
        self.user.profile.save(update_fields=["email_verified"])
        self.client.force_authenticate(user=self.user)

    def test_patch_notification_can_schedule_reminder(self):
        notification = Notification.objects.create(
            user=self.user,
            title="Missing document",
            body="Passport copy still missing.",
        )
        scheduled_at = timezone.now() + timedelta(hours=4)

        response = self.client.patch(
            f"/api/notifications/{notification.id}/",
            data={"remind_at": scheduled_at.isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        notification.refresh_from_db()
        self.assertTrue(notification.read)
        self.assertIsNotNone(notification.remind_at)
        self.assertEqual(notification.remind_at.isoformat(), scheduled_at.isoformat())
        self.assertTrue(response.json()["is_reminder_pending"])

    def test_listing_notifications_materializes_due_reminder(self):
        notification = Notification.objects.create(
            user=self.user,
            title="Subscription follow-up",
            body="Please confirm renewal status.",
            read=True,
            remind_at=timezone.now() - timedelta(minutes=5),
        )

        response = self.client.get("/api/notifications/")

        self.assertEqual(response.status_code, 200)
        notification.refresh_from_db()
        self.assertFalse(notification.read)
        self.assertIsNone(notification.remind_at)
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 1)
        payload = response.json()
        self.assertTrue(
            any(item["title"] == "Subscription follow-up" and item["read"] is False for item in payload)
        )


class UserManagementPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _create_user(self, username: str, role: str) -> User:
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="strong-pass-123",
            is_active=True,
        )
        profile = user.profile
        profile.role = role
        profile.email_verified = True
        profile.save(update_fields=["role", "email_verified"])
        return user

    def _assign_same_organization(self, owner: User, *members: User):
        organization = get_user_organization(owner)
        for user in members:
            user.profile.organization = organization
            user.profile.save(update_fields=["organization"])
            OrganizationMembership.objects.update_or_create(
                user=user,
                defaults={
                    "organization": organization,
                    "role": user.profile.role,
                    "is_owner": user.profile.role == Profile.ROLE_SUPERADMIN,
                    "is_active": user.is_active,
                },
            )

    def test_admin_cannot_create_admin_accounts(self):
        admin_user = self._create_user("manager", Profile.ROLE_ADMIN)
        self.client.force_authenticate(user=admin_user)

        response = self.client.post(
            "/api/users/",
            {
                "username": "bad-admin",
                "password": "strong-pass-123",
                "email": "bad-admin@example.com",
                "role": "admin",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("role", response.data)

    def test_admin_cannot_manage_other_admin_accounts(self):
        acting_admin = self._create_user("manager", Profile.ROLE_ADMIN)
        target_admin = self._create_user("second-admin", Profile.ROLE_ADMIN)
        self.client.force_authenticate(user=acting_admin)

        response = self.client.patch(
            f"/api/users/{target_admin.pk}/",
            {"first_name": "Blocked"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)

    def test_admin_can_create_customer_account(self):
        admin_user = self._create_user("manager", Profile.ROLE_ADMIN)
        self.client.force_authenticate(user=admin_user)

        response = self.client.post(
            "/api/users/",
            {
                "username": "customer1",
                "password": "strong-pass-123",
                "email": "customer1@example.com",
                "role": "customer",
                "agent_country": "Saudi Arabia",
                "agent_salary": "1800.00",
                "agent_commission": "120.00",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        created = User.objects.get(username="customer1")
        self.assertEqual(created.profile.role, Profile.ROLE_CUSTOMER)
        self.assertEqual(created.profile.agent_country, "Saudi Arabia")
        self.assertEqual(str(created.profile.agent_salary), "1800.00")
        self.assertTrue(created.profile.email_verified)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/reset-password?uid=", mail.outbox[0].body)

    def test_admin_can_create_staff_with_side_and_level_metadata(self):
        admin_user = self._create_user("manager", Profile.ROLE_ADMIN)
        self.client.force_authenticate(user=admin_user)

        response = self.client.post(
            "/api/users/",
            {
                "username": "staff1",
                "email": "staff1@example.com",
                "role": "staff",
                "staff_side": "North Branch",
                "staff_level_label": "Secretary",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        created = User.objects.get(username="staff1")
        self.assertEqual(created.profile.role, Profile.ROLE_STAFF)
        self.assertEqual(created.profile.staff_side, "North Branch")
        self.assertEqual(created.profile.staff_level, 2)
        self.assertEqual(created.profile.staff_level_label, "Secretary")

    def test_manual_user_creation_email_mentions_google_when_enabled(self):
        admin_user = self._create_user("manager", Profile.ROLE_ADMIN)
        settings_obj = PlatformSettings.get_solo()
        settings_obj.feature_flags["google_login_enabled"] = True
        settings_obj.save()
        self.client.force_authenticate(user=admin_user)

        response = self.client.post(
            "/api/users/",
            {
                "username": "customer2",
                "email": "customer2@example.com",
                "role": "customer",
                "agent_country": "Qatar",
                "agent_salary": "2200.00",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Sign in with Google", mail.outbox[0].body)

    @patch("app.user_views.send_account_setup_email", side_effect=Exception("smtp down"))
    def test_manual_user_creation_still_succeeds_when_setup_email_fails(self, _send_email):
        admin_user = self._create_user("manager", Profile.ROLE_ADMIN)
        self.client.force_authenticate(user=admin_user)

        response = self.client.post(
            "/api/users/",
            {
                "username": "email-fail-user",
                "email": "email-fail@example.com",
                "role": "customer",
                "agent_country": "United Arab Emirates",
                "agent_salary": "2500.00",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["username"], "email-fail-user")
        self.assertIn("warning", response.data)
        self.assertTrue(User.objects.filter(username="email-fail-user").exists())

    def test_only_superadmin_can_update_platform_lockout_settings(self):
        superadmin = self._create_user("root-admin", Profile.ROLE_SUPERADMIN)
        admin_user = self._create_user("manager", Profile.ROLE_ADMIN)

        self.client.force_authenticate(user=admin_user)
        forbidden = self.client.patch(
            "/api/platform-settings/",
            {"login_max_failed_attempts": 7},
            format="json",
        )
        self.assertEqual(forbidden.status_code, 403)

        self.client.force_authenticate(user=superadmin)
        allowed = self.client.patch(
            "/api/platform-settings/",
            {
                "login_max_failed_attempts": 7,
                "login_lockout_minutes": 20,
            },
            format="json",
        )
        self.assertEqual(allowed.status_code, 200)

        settings_obj = PlatformSettings.get_solo()
        self.assertEqual(settings_obj.login_max_failed_attempts, 7)
        self.assertEqual(settings_obj.login_lockout_minutes, 20)

    def test_dynamic_role_permissions_can_disable_admin_user_management(self):
        admin_user = self._create_user("manager", Profile.ROLE_ADMIN)
        settings_obj = PlatformSettings.get_solo()
        settings_obj.role_permissions[Profile.ROLE_ADMIN] = ["audit.view"]
        settings_obj.save()

        self.client.force_authenticate(user=admin_user)
        response = self.client.get("/api/users/")
        self.assertEqual(response.status_code, 403)

    def test_dynamic_role_permissions_can_enable_staff_audit_access(self):
        staff_user = self._create_user("auditor", Profile.ROLE_STAFF)
        settings_obj = PlatformSettings.get_solo()
        settings_obj.role_permissions[Profile.ROLE_STAFF] = ["audit.view"]
        settings_obj.save()

        self.client.force_authenticate(user=staff_user)
        response = self.client.get("/api/audit-logs/")
        self.assertEqual(response.status_code, 200)

    def test_me_payload_includes_default_feature_flags(self):
        staff_user = self._create_user("feature-user", Profile.ROLE_STAFF)
        settings_obj = PlatformSettings.get_solo()
        settings_obj.feature_flags = {}
        settings_obj.save()

        self.client.force_authenticate(user=staff_user)
        response = self.client.get("/api/me/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("feature_flags", response.data)
        self.assertTrue(response.data["feature_flags"]["employees_enabled"])

    def test_superadmin_can_reset_admin_password_but_not_own(self):
        superadmin = self._create_user("root-admin", Profile.ROLE_SUPERADMIN)
        admin_user = self._create_user("manager", Profile.ROLE_ADMIN)
        self._assign_same_organization(superadmin, admin_user)
        self.client.force_authenticate(user=superadmin)

        response = self.client.post(
            f"/api/users/{admin_user.pk}/reset-password/",
            {
                "new_password": "brand-new-pass-123",
                "new_password_confirm": "brand-new-pass-123",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        admin_user.refresh_from_db()
        self.assertTrue(admin_user.check_password("brand-new-pass-123"))
        self.assertTrue(
            AuditLog.objects.filter(
                actor=superadmin,
                action="user.password_reset",
                resource_id=admin_user.pk,
            ).exists()
        )

        own_response = self.client.post(
            f"/api/users/{superadmin.pk}/reset-password/",
            {
                "new_password": "another-pass-123",
                "new_password_confirm": "another-pass-123",
            },
            format="json",
        )
        self.assertEqual(own_response.status_code, 400)

    def test_admin_can_reset_staff_password_but_not_admin_or_superadmin(self):
        superadmin = self._create_user("root-admin", Profile.ROLE_SUPERADMIN)
        admin_user = self._create_user("manager", Profile.ROLE_ADMIN)
        second_admin = self._create_user("second-admin", Profile.ROLE_ADMIN)
        staff_user = self._create_user("helper", Profile.ROLE_STAFF)
        self._assign_same_organization(superadmin, admin_user, second_admin, staff_user)
        self.client.force_authenticate(user=admin_user)

        allowed = self.client.post(
            f"/api/users/{staff_user.pk}/reset-password/",
            {
                "new_password": "staff-pass-123",
                "new_password_confirm": "staff-pass-123",
            },
            format="json",
        )
        self.assertEqual(allowed.status_code, 200)
        staff_user.refresh_from_db()
        self.assertTrue(staff_user.check_password("staff-pass-123"))

        blocked_superadmin = self.client.post(
            f"/api/users/{superadmin.pk}/reset-password/",
            {
                "new_password": "blocked-pass-123",
                "new_password_confirm": "blocked-pass-123",
            },
            format="json",
        )
        self.assertEqual(blocked_superadmin.status_code, 404)

        blocked_admin = self.client.post(
            f"/api/users/{second_admin.pk}/reset-password/",
            {
                "new_password": "blocked-pass-123",
                "new_password_confirm": "blocked-pass-123",
            },
            format="json",
        )
        self.assertEqual(blocked_admin.status_code, 404)

        blocked_self = self.client.post(
            f"/api/users/{admin_user.pk}/reset-password/",
            {
                "new_password": "blocked-pass-123",
                "new_password_confirm": "blocked-pass-123",
            },
            format="json",
        )
        self.assertEqual(blocked_self.status_code, 404)

    def test_superadmin_can_update_staff_side_and_level(self):
        superadmin = self._create_user("root-admin", Profile.ROLE_SUPERADMIN)
        staff_user = self._create_user("helper", Profile.ROLE_STAFF)
        self._assign_same_organization(superadmin, staff_user)
        self.client.force_authenticate(user=superadmin)

        response = self.client.patch(
            f"/api/users/{staff_user.pk}/",
            {
                "staff_side": "Agent Atlas",
                "staff_level_label": "Supervisor",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        staff_user.refresh_from_db()
        self.assertEqual(staff_user.profile.staff_side, "Agent Atlas")
        self.assertEqual(staff_user.profile.staff_level, 5)
        self.assertEqual(staff_user.profile.staff_level_label, "Supervisor")

    def test_staff_side_options_include_organization_and_agents(self):
        superadmin = self._create_user("root-admin", Profile.ROLE_SUPERADMIN)
        agent_user = self._create_user("agent-atlas", Profile.ROLE_CUSTOMER)
        agent_user.first_name = "Agent Atlas"
        agent_user.save(update_fields=["first_name"])
        self._assign_same_organization(superadmin, agent_user)
        self.client.force_authenticate(user=superadmin)

        response = self.client.get("/api/users/staff-side-options/")

        self.assertEqual(response.status_code, 200)
        options = response.data["options"]
        self.assertIn(get_user_organization(superadmin).name, options)
        self.assertIn("Agent Atlas", options)


class EmployeeManagementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        os.makedirs(os.path.join(os.path.dirname(__file__), "test_media"), exist_ok=True)
        self.media_root = tempfile.mkdtemp(
            prefix="portal-test-media-",
            dir=os.path.join(os.path.dirname(__file__), "test_media"),
        )

    def tearDown(self):
        import shutil

        shutil.rmtree(self.media_root, ignore_errors=True)

    def _create_user(self, username: str, role: str) -> User:
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="strong-pass-123",
            is_active=True,
        )
        profile = user.profile
        profile.role = role
        profile.email_verified = True
        profile.save(update_fields=["role", "email_verified"])
        return user

    def _assign_same_organization(self, owner: User, *members: User):
        organization = get_user_organization(owner)
        for user in members:
            user.profile.organization = organization
            user.profile.save(update_fields=["organization"])
            OrganizationMembership.objects.update_or_create(
                user=user,
                defaults={
                    "organization": organization,
                    "role": user.profile.role,
                    "is_owner": user.profile.role == Profile.ROLE_SUPERADMIN,
                    "is_active": user.is_active,
                },
            )

    def test_staff_user_can_create_employee_record(self):
        staff_user = self._create_user("staff-maker", Profile.ROLE_STAFF)
        self.client.force_authenticate(user=staff_user)

        response = self.client.post(
            "/api/employees/",
            {
                "first_name": "Jane",
                "middle_name": "Ada",
                "last_name": "Doe",
                "date_of_birth": "1996-01-15",
                "gender": "Female",
                "passport_number": "P1234567",
                "mobile_number": "+251900000001",
                "application_countries": ["Saudi Arabia"],
                "profession": "Cashier",
                "employment_type": "Contract",
                "languages": ["Amharic", "English"],
                "email": "jane@example.com",
                "phone": "+251900000001",
                "summary": "Experienced finance professional.",
                "application_salary": "2200.00",
                "skills": ["Cash handling", "Customer service"],
                "experiences": [{"country": "Saudi Arabia", "years": 3}],
                "religion": "Christianity",
                "marital_status": "Single",
                "residence_country": "Ethiopia",
                "contact_person_name": "Anna Doe",
                "contact_person_mobile": "+251900000010",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        employee = Employee.objects.get(full_name="Jane Ada Doe")
        self.assertEqual(employee.registered_by, staff_user)
        self.assertEqual(employee.organization, get_user_organization(staff_user))
        self.assertEqual(employee.status, Employee.STATUS_PENDING)
        self.assertFalse(employee.is_active)
        self.assertTrue(
            AuditLog.objects.filter(
                actor=staff_user,
                action="employee.create",
                resource_id=employee.pk,
            ).exists()
        )

    def test_employee_registration_requires_minimum_age_of_18(self):
        staff_user = self._create_user("staff-young-check", Profile.ROLE_STAFF)
        self.client.force_authenticate(user=staff_user)

        response = self.client.post(
            "/api/employees/",
            {
                "first_name": "Young",
                "middle_name": "Applicant",
                "last_name": "Example",
                "date_of_birth": "2010-01-15",
                "gender": "Female",
                "passport_number": "P7654321",
                "mobile_number": "+251900000099",
                "application_countries": ["Saudi Arabia"],
                "profession": "Cashier",
                "employment_type": "Contract",
                "languages": ["Amharic"],
                "application_salary": "1800.00",
                "skills": ["Cash handling"],
                "experiences": [{"country": "Saudi Arabia", "years": 1}],
                "religion": "Christianity",
                "marital_status": "Single",
                "residence_country": "Ethiopia",
                "contact_person_name": "Guardian Example",
                "contact_person_mobile": "+251900000100",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("at least 18", response.data["date_of_birth"][0])

    def test_employee_status_patch_updates_availability_state(self):
        staff_user = self._create_user("staff-status", Profile.ROLE_STAFF)
        self.client.force_authenticate(user=staff_user)
        employee = Employee.objects.create(
            organization=get_user_organization(staff_user),
            registered_by=staff_user,
            updated_by=staff_user,
            full_name="Status Employee",
            status=Employee.STATUS_PENDING,
            is_active=False,
        )

        approve = self.client.patch(
            f"/api/employees/{employee.pk}/",
            {"status": "approved"},
            format="json",
        )
        self.assertEqual(approve.status_code, 200)
        employee.refresh_from_db()
        self.assertEqual(employee.status, Employee.STATUS_APPROVED)
        self.assertTrue(employee.is_active)

        suspend = self.client.patch(
            f"/api/employees/{employee.pk}/",
            {"status": "suspended"},
            format="json",
        )
        self.assertEqual(suspend.status_code, 200)
        employee.refresh_from_db()
        self.assertEqual(employee.status, Employee.STATUS_SUSPENDED)
        self.assertFalse(employee.is_active)

    def test_employee_list_is_scoped_to_same_organization(self):
        owner_a = self._create_user("owner-a", Profile.ROLE_SUPERADMIN)
        owner_b = self._create_user("owner-b", Profile.ROLE_SUPERADMIN)

        employee_a = Employee.objects.create(
            organization=get_user_organization(owner_a),
            registered_by=owner_a,
            updated_by=owner_a,
            full_name="Visible Employee",
        )
        Employee.objects.create(
            organization=get_user_organization(owner_b),
            registered_by=owner_b,
            updated_by=owner_b,
            full_name="Hidden Employee",
        )

        self.client.force_authenticate(user=owner_a)
        response = self.client.get("/api/employees/")

        self.assertEqual(response.status_code, 200)
        returned_ids = [item["id"] for item in response.data["results"]]
        self.assertIn(employee_a.id, returned_ids)
        self.assertEqual(len(returned_ids), 1)

    def test_employee_form_options_use_active_agent_countries_and_salaries(self):
        superadmin = self._create_user("owner-options", Profile.ROLE_SUPERADMIN)
        agent = self._create_user("agent-country", Profile.ROLE_CUSTOMER)
        agent.first_name = "Agent Country"
        agent.save(update_fields=["first_name"])
        self._assign_same_organization(superadmin, agent)
        agent.profile.agent_country = "Saudi Arabia"
        agent.profile.agent_salary = "2400.00"
        agent.profile.save(update_fields=["agent_country", "agent_salary"])

        self.client.force_authenticate(user=superadmin)
        response = self.client.get("/api/employees/form-options/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("Saudi Arabia", response.data["destination_countries"])
        self.assertIn("2400.00", response.data["salary_options_by_country"]["Saudi Arabia"])
        self.assertTrue(any(option["id"] == agent.id for option in response.data["agent_options"]))

    @patch("app.employee_views.extract_employee_document_fields")
    def test_employee_ocr_endpoint_returns_backend_updates(self, mocked_extract):
        superadmin = self._create_user("owner-ocr", Profile.ROLE_SUPERADMIN)
        self.client.force_authenticate(user=superadmin)
        mocked_extract.return_value = {
            "text": "Passport Number EQ2380846",
            "updates": {
                "passport_number": "EQ2380846",
                "first_name": "Temima",
                "last_name": "Hedeto",
            },
        }

        uploaded_file = SimpleUploadedFile("passport.jpg", b"fake-image-bytes", content_type="image/jpeg")
        response = self.client.post(
            "/api/employees/ocr/",
            {
                "file": uploaded_file,
                "step_index": "0",
                "form_options": json.dumps({"destination_countries": ["Saudi Arabia"]}),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["updates"]["passport_number"], "EQ2380846")
        self.assertEqual(response.data["updates"]["first_name"], "Temima")

    @patch("app.employee_views.get_ocr_status")
    def test_employee_ocr_status_endpoint_returns_setup_state(self, mocked_status):
        superadmin = self._create_user("owner-ocr-status", Profile.ROLE_SUPERADMIN)
        self.client.force_authenticate(user=superadmin)
        mocked_status.return_value = {
            "ready": False,
            "message": "Backend OCR is not configured yet.",
            "command": "",
        }

        response = self.client.get("/api/employees/ocr/status/")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["ready"])
        self.assertIn("not configured", response.data["message"].lower())

    def test_build_field_candidates_prefers_passport_specific_values(self):
        passport_text = """
        PASSPORT
        Surname
        HEDETO
        Given Name
        TEMIMA ALIYI
        Nationality
        ETHIOPIAN
        Sex
        F
        Date of Birth
        29 NOV O1
        Place of Birth
        HASASA
        Passport No
        EQ2380846

        PQETHHEDETO<<TEMIMA<ALIYI<<<<<<<<<<<<<<<<<<<<
        EQ23808467ETH0111296F30101160<<<<<<<<<<<<<<02
        """

        candidates = build_field_candidates(passport_text)

        self.assertEqual(candidates["first_name"], "Temima")
        self.assertEqual(candidates["middle_name"], "Aliyi")
        self.assertEqual(candidates["last_name"], "Hedeto")
        self.assertEqual(candidates["passport_number"], "EQ2380846")
        self.assertEqual(candidates["date_of_birth"], "2001-11-29")
        self.assertEqual(candidates["gender"], "Female")
        self.assertEqual(candidates["birth_place"], "HASASA")
        self.assertEqual(candidates["mobile_number"], "")

    @patch("app.employee_ocr.fetch_service_json")
    def test_extract_employee_document_fields_prefers_structured_passport_fields(self, mocked_fetch):
        mocked_fetch.return_value = {
            "ok": True,
            "status": 200,
            "message": "OCR completed.",
            "engine": "PaddleOCR",
            "document_type": "passport",
            "file_name": "passport.jpg",
            "content_type": "image/jpeg",
            "text": "messy fallback text",
            "raw_text": "raw fallback text",
            "fields": {
                "passport_number": "EP8221925",
                "surname": "ARARISSA",
                "given_names": "GETACHEW DADI",
                "nationality": "ETHIOPIAN",
                "sex": "M",
                "date_of_birth": "28MAR71",
                "place_of_birth": "SELALE",
            },
            "warnings": ["low confidence expiry"],
        }

        uploaded_file = SimpleUploadedFile("passport.jpg", b"fake-image-bytes", content_type="image/jpeg")

        step_zero_result = extract_employee_document_fields(uploaded_file, step_index=0, form_options={})
        step_one_result = extract_employee_document_fields(uploaded_file, step_index=1, form_options={})

        self.assertEqual(step_zero_result["document_type"], "passport")
        self.assertEqual(step_zero_result["fields"]["passport_number"], "EP8221925")
        self.assertEqual(step_zero_result["warnings"], ["low confidence expiry"])
        self.assertEqual(step_zero_result["updates"]["passport_number"], "EP8221925")
        self.assertEqual(step_zero_result["updates"]["date_of_birth"], "1971-03-28")
        self.assertEqual(step_zero_result["updates"]["gender"], "Male")
        self.assertEqual(step_one_result["updates"]["nationality"], "Ethiopian")
        self.assertEqual(step_one_result["updates"]["birth_place"], "Selale")

    @patch("app.employee_ocr.fetch_service_json")
    def test_extract_employee_document_fields_falls_back_to_text_when_fields_missing(self, mocked_fetch):
        mocked_fetch.return_value = {
            "ok": True,
            "status": 200,
            "message": "OCR completed.",
            "engine": "PaddleOCR",
            "document_type": "generic",
            "file_name": "scan.jpg",
            "content_type": "image/jpeg",
            "text": "Passport Number EQ2380846\nGiven Name Temima Aliyi\nSurname Hedeto",
            "raw_text": "",
            "fields": {},
            "warnings": [],
        }

        uploaded_file = SimpleUploadedFile("scan.jpg", b"fake-image-bytes", content_type="image/jpeg")

        result = extract_employee_document_fields(uploaded_file, step_index=0, form_options={})

        self.assertEqual(result["document_type"], "generic")
        self.assertEqual(result["updates"]["passport_number"], "EQ2380846")
        self.assertEqual(result["updates"]["first_name"], "Temima")
        self.assertEqual(result["updates"]["middle_name"], "Aliyi")
        self.assertEqual(result["updates"]["last_name"], "Hedeto")

    def test_agent_can_select_employee_and_org_can_filter_selected_employees(self):
        superadmin = self._create_user("owner-select", Profile.ROLE_SUPERADMIN)
        agent = self._create_user("agent-atlas", Profile.ROLE_CUSTOMER)
        agent.first_name = "Agent Atlas"
        agent.save(update_fields=["first_name"])
        self._assign_same_organization(superadmin, agent)
        employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            first_name="Selam",
            middle_name="K",
            last_name="Worker",
            full_name="Selam K Worker",
        )

        self.client.force_authenticate(user=agent)
        select_response = self.client.post(f"/api/employees/{employee.pk}/selection/")

        self.assertEqual(select_response.status_code, 200)
        employee.refresh_from_db()
        self.assertTrue(hasattr(employee, "selection"))
        self.assertEqual(employee.selection.agent_id, agent.id)
        self.assertEqual(
            select_response.data["selection_state"]["selection"]["agent_name"],
            "Agent Atlas",
        )

        self.client.force_authenticate(user=superadmin)
        org_selected = self.client.get("/api/employees/", {"selected_scope": "organization"})

        self.assertEqual(org_selected.status_code, 200)
        self.assertEqual(org_selected.data["count"], 1)
        self.assertEqual(
            org_selected.data["results"][0]["selection_state"]["selection"]["agent_name"],
            "Agent Atlas",
        )

    def test_agent_staff_selection_belongs_to_agent_owner_and_mine_scope_uses_agent(self):
        superadmin = self._create_user("owner-staff-select", Profile.ROLE_SUPERADMIN)
        agent = self._create_user("agent-owner", Profile.ROLE_CUSTOMER)
        agent.first_name = "Agent Atlas"
        agent.save(update_fields=["first_name"])
        agent_staff = self._create_user("agent-staff", Profile.ROLE_STAFF)
        self._assign_same_organization(superadmin, agent, agent_staff)
        agent_staff.profile.staff_side = "Agent Atlas"
        agent_staff.profile.save(update_fields=["staff_side"])
        employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            first_name="Marta",
            middle_name="N",
            last_name="Helper",
            full_name="Marta N Helper",
        )

        self.client.force_authenticate(user=agent_staff)
        select_response = self.client.post(f"/api/employees/{employee.pk}/selection/")

        self.assertEqual(select_response.status_code, 200)
        selection = EmployeeSelection.objects.get(employee=employee)
        self.assertEqual(selection.agent_id, agent.id)
        self.assertEqual(selection.selected_by_id, agent_staff.id)

        mine_response = self.client.get("/api/employees/", {"selected_scope": "mine"})

        self.assertEqual(mine_response.status_code, 200)
        self.assertEqual(mine_response.data["count"], 1)
        self.assertEqual(mine_response.data["results"][0]["id"], employee.id)
        self.assertTrue(mine_response.data["results"][0]["selection_state"]["selected_by_current_agent"])

    def test_agent_cannot_select_employee_already_selected_by_another_agent(self):
        superadmin = self._create_user("owner-conflict", Profile.ROLE_SUPERADMIN)
        first_agent = self._create_user("agent-first", Profile.ROLE_CUSTOMER)
        second_agent = self._create_user("agent-second", Profile.ROLE_CUSTOMER)
        self._assign_same_organization(superadmin, first_agent, second_agent)
        employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            full_name="Conflict Employee",
        )
        EmployeeSelection.objects.create(
            organization=get_user_organization(superadmin),
            employee=employee,
            agent=first_agent,
            selected_by=first_agent,
        )

        self.client.force_authenticate(user=second_agent)
        response = self.client.post(f"/api/employees/{employee.pk}/selection/")

        self.assertEqual(response.status_code, 409)

    def test_agent_can_only_update_selected_employee_and_cannot_create_employee(self):
        superadmin = self._create_user("owner-agent-rules", Profile.ROLE_SUPERADMIN)
        agent = self._create_user("agent-rules", Profile.ROLE_CUSTOMER)
        self._assign_same_organization(superadmin, agent)
        selected_employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            first_name="Chosen",
            middle_name="A",
            last_name="Worker",
            full_name="Chosen A Worker",
        )
        other_employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            first_name="Open",
            middle_name="B",
            last_name="Worker",
            full_name="Open B Worker",
        )
        EmployeeSelection.objects.create(
            organization=get_user_organization(superadmin),
            employee=selected_employee,
            agent=agent,
            selected_by=agent,
        )

        self.client.force_authenticate(user=agent)

        create_response = self.client.post(
            "/api/employees/",
            {
                "first_name": "Should",
                "middle_name": "Not",
                "last_name": "Create",
                "date_of_birth": "1996-01-15",
                "gender": "Female",
                "passport_number": "P1234567",
                "mobile_number": "+251900000001",
                "application_countries": ["Saudi Arabia"],
                "profession": "Cashier",
                "employment_type": "Contract",
                "languages": ["Amharic", "English"],
                "application_salary": "2200.00",
                "skills": ["Cash handling"],
                "experiences": [{"country": "Saudi Arabia", "years": 3}],
                "religion": "Christianity",
                "marital_status": "Single",
                "residence_country": "Ethiopia",
                "contact_person_name": "Anna Doe",
                "contact_person_mobile": "+251900000010",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 403)

        update_selected = self.client.patch(
            f"/api/employees/{selected_employee.pk}/",
            {"email": "chosen@example.com"},
            format="json",
        )
        self.assertEqual(update_selected.status_code, 200)

        update_other = self.client.patch(
            f"/api/employees/{other_employee.pk}/",
            {"email": "blocked@example.com"},
            format="json",
        )
        self.assertEqual(update_other.status_code, 403)

        update_status = self.client.patch(
            f"/api/employees/{selected_employee.pk}/",
            {"status": "approved"},
            format="json",
        )
        self.assertEqual(update_status.status_code, 403)

    def test_main_agent_can_start_process_and_under_process_employee_stays_visible_to_org_and_assigned_agent(self):
        superadmin = self._create_user("owner-process", Profile.ROLE_SUPERADMIN)
        agent = self._create_user("agent-process", Profile.ROLE_CUSTOMER)
        other_agent = self._create_user("agent-other-process", Profile.ROLE_CUSTOMER)
        self._assign_same_organization(superadmin, agent, other_agent)
        employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            full_name="Process Employee",
            status=Employee.STATUS_APPROVED,
            is_active=True,
        )
        EmployeeSelection.objects.create(
            organization=get_user_organization(superadmin),
            employee=employee,
            agent=agent,
            selected_by=agent,
        )

        self.client.force_authenticate(user=agent)
        start_response = self.client.post(f"/api/employees/{employee.pk}/process/")

        self.assertEqual(start_response.status_code, 200)
        employee.refresh_from_db()
        self.assertEqual(employee.selection.status, EmployeeSelection.STATUS_UNDER_PROCESS)
        self.assertEqual(employee.selection.process_initiated_by_id, agent.id)
        self.assertIsNotNone(employee.selection.process_started_at)

        default_list = self.client.get("/api/employees/")
        self.assertEqual(default_list.status_code, 200)
        self.assertEqual(default_list.data["count"], 1)

        under_process = self.client.get("/api/employees/", {"process_scope": "mine"})
        self.assertEqual(under_process.status_code, 200)
        self.assertEqual(under_process.data["count"], 1)
        self.assertEqual(
            under_process.data["results"][0]["selection_state"]["selection"]["status"],
            "under_process",
        )

        self.client.force_authenticate(user=superadmin)
        org_list = self.client.get("/api/employees/")
        self.assertEqual(org_list.status_code, 200)
        self.assertEqual(org_list.data["count"], 1)

        self.client.force_authenticate(user=other_agent)
        other_agent_list = self.client.get("/api/employees/")
        self.assertEqual(other_agent_list.status_code, 200)
        self.assertEqual(other_agent_list.data["count"], 0)

    def test_agent_staff_cannot_start_process_even_for_selected_employee(self):
        superadmin = self._create_user("owner-process-staff", Profile.ROLE_SUPERADMIN)
        agent = self._create_user("agent-process-owner", Profile.ROLE_CUSTOMER)
        agent.first_name = "Agent Prime"
        agent.save(update_fields=["first_name"])
        agent_staff = self._create_user("agent-process-staff", Profile.ROLE_STAFF)
        self._assign_same_organization(superadmin, agent, agent_staff)
        agent_staff.profile.staff_side = "Agent Prime"
        agent_staff.profile.save(update_fields=["staff_side"])
        employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            full_name="Staff Cannot Process",
            status=Employee.STATUS_APPROVED,
            is_active=True,
        )
        EmployeeSelection.objects.create(
            organization=get_user_organization(superadmin),
            employee=employee,
            agent=agent,
            selected_by=agent_staff,
        )

        self.client.force_authenticate(user=agent_staff)
        response = self.client.post(f"/api/employees/{employee.pk}/process/")

        self.assertEqual(response.status_code, 403)

    def test_main_agent_can_decline_process_and_employee_returns_to_selected_list(self):
        superadmin = self._create_user("owner-decline", Profile.ROLE_SUPERADMIN)
        agent = self._create_user("agent-decline", Profile.ROLE_CUSTOMER)
        self._assign_same_organization(superadmin, agent)
        employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            full_name="Decline Process Employee",
        )
        EmployeeSelection.objects.create(
            organization=get_user_organization(superadmin),
            employee=employee,
            agent=agent,
            selected_by=agent,
            status=EmployeeSelection.STATUS_UNDER_PROCESS,
            process_initiated_by=agent,
            process_started_at=timezone.now(),
        )

        self.client.force_authenticate(user=agent)
        response = self.client.delete(f"/api/employees/{employee.pk}/process/")

        self.assertEqual(response.status_code, 200)
        employee.refresh_from_db()
        self.assertEqual(employee.selection.status, EmployeeSelection.STATUS_SELECTED)
        self.assertIsNone(employee.selection.process_initiated_by)
        self.assertIsNone(employee.selection.process_started_at)

        default_list = self.client.get("/api/employees/")
        self.assertEqual(default_list.status_code, 200)
        returned_ids = [item["id"] for item in default_list.data["results"]]
        self.assertIn(employee.id, returned_ids)

        selected_list = self.client.get("/api/employees/", {"selected_scope": "mine"})
        self.assertEqual(selected_list.status_code, 200)
        self.assertEqual(selected_list.data["count"], 1)

        under_process = self.client.get("/api/employees/", {"process_scope": "mine"})
        self.assertEqual(under_process.status_code, 200)
        self.assertEqual(under_process.data["count"], 0)

    def test_admin_can_assign_agent_and_start_process_on_behalf(self):
        superadmin = self._create_user("owner-org-process", Profile.ROLE_SUPERADMIN)
        admin_user = self._create_user("org-admin-process", Profile.ROLE_ADMIN)
        agent = self._create_user("assigned-agent", Profile.ROLE_CUSTOMER)
        other_agent = self._create_user("other-assigned-agent", Profile.ROLE_CUSTOMER)
        self._assign_same_organization(superadmin, admin_user, agent, other_agent)
        employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            full_name="Admin Started Process",
            status=Employee.STATUS_APPROVED,
            is_active=True,
        )

        self.client.force_authenticate(user=admin_user)
        response = self.client.post(
            f"/api/employees/{employee.pk}/process/",
            {"agent_id": agent.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        employee.refresh_from_db()
        self.assertEqual(employee.selection.agent_id, agent.id)
        self.assertEqual(employee.selection.status, EmployeeSelection.STATUS_UNDER_PROCESS)
        self.assertEqual(employee.selection.selected_by_id, admin_user.id)
        self.assertEqual(employee.selection.process_initiated_by_id, admin_user.id)

        under_process = self.client.get("/api/employees/", {"process_scope": "mine"})
        self.assertEqual(under_process.status_code, 200)
        returned_ids = [item["id"] for item in under_process.data["results"]]
        self.assertIn(employee.id, returned_ids)

        default_list = self.client.get("/api/employees/")
        self.assertEqual(default_list.status_code, 200)
        returned_ids = [item["id"] for item in default_list.data["results"]]
        self.assertIn(employee.id, returned_ids)

        self.client.force_authenticate(user=agent)
        assigned_agent_list = self.client.get("/api/employees/")
        self.assertEqual(assigned_agent_list.status_code, 200)
        returned_ids = [item["id"] for item in assigned_agent_list.data["results"]]
        self.assertIn(employee.id, returned_ids)

        self.client.force_authenticate(user=other_agent)
        other_agent_list = self.client.get("/api/employees/")
        self.assertEqual(other_agent_list.status_code, 200)
        self.assertEqual(other_agent_list.data["count"], 0)

    def test_process_cannot_start_until_employee_is_approved(self):
        superadmin = self._create_user("owner-approval-gate", Profile.ROLE_SUPERADMIN)
        agent = self._create_user("agent-approval-gate", Profile.ROLE_CUSTOMER)
        self._assign_same_organization(superadmin, agent)
        employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            full_name="Approval Required Employee",
            status=Employee.STATUS_PENDING,
            is_active=False,
        )
        EmployeeSelection.objects.create(
            organization=get_user_organization(superadmin),
            employee=employee,
            agent=agent,
            selected_by=agent,
        )

        self.client.force_authenticate(user=agent)
        response = self.client.post(f"/api/employees/{employee.pk}/process/")

        self.assertEqual(response.status_code, 400)
        self.assertIn("Only approved employees can have a process initiated.", response.data["detail"])

    def test_admin_can_decline_under_process_employee(self):
        superadmin = self._create_user("owner-admin-decline", Profile.ROLE_SUPERADMIN)
        admin_user = self._create_user("decline-admin", Profile.ROLE_ADMIN)
        agent = self._create_user("agent-under-process", Profile.ROLE_CUSTOMER)
        self._assign_same_organization(superadmin, admin_user, agent)
        employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            full_name="Admin Decline Process",
        )
        EmployeeSelection.objects.create(
            organization=get_user_organization(superadmin),
            employee=employee,
            agent=agent,
            selected_by=admin_user,
            status=EmployeeSelection.STATUS_UNDER_PROCESS,
            process_initiated_by=admin_user,
            process_started_at=timezone.now(),
        )

        self.client.force_authenticate(user=admin_user)
        response = self.client.delete(f"/api/employees/{employee.pk}/process/")

        self.assertEqual(response.status_code, 200)
        employee.refresh_from_db()
        self.assertEqual(employee.selection.status, EmployeeSelection.STATUS_SELECTED)
        self.assertIsNone(employee.selection.process_initiated_by)

    def test_org_side_cannot_reject_or_suspend_employee_while_under_process(self):
        superadmin = self._create_user("owner-block-status", Profile.ROLE_SUPERADMIN)
        agent = self._create_user("agent-block-status", Profile.ROLE_CUSTOMER)
        self._assign_same_organization(superadmin, agent)
        employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            full_name="Blocked Status Employee",
            status=Employee.STATUS_APPROVED,
        )
        EmployeeSelection.objects.create(
            organization=get_user_organization(superadmin),
            employee=employee,
            agent=agent,
            selected_by=agent,
            status=EmployeeSelection.STATUS_UNDER_PROCESS,
            process_initiated_by=agent,
            process_started_at=timezone.now(),
        )

        self.client.force_authenticate(user=superadmin)
        reject_response = self.client.patch(
            f"/api/employees/{employee.pk}/",
            {"status": "rejected"},
            format="json",
        )
        suspend_response = self.client.patch(
            f"/api/employees/{employee.pk}/",
            {"status": "suspended"},
            format="json",
        )

        self.assertEqual(reject_response.status_code, 400)
        self.assertIn("Decline the process first", reject_response.data["detail"])
        self.assertEqual(suspend_response.status_code, 400)
        self.assertIn("Decline the process first", suspend_response.data["detail"])

    def test_admin_can_mark_progress_complete_with_override(self):
        superadmin = self._create_user("owner-progress-override", Profile.ROLE_SUPERADMIN)
        admin_user = self._create_user("admin-progress-override", Profile.ROLE_ADMIN)
        self._assign_same_organization(superadmin, admin_user)
        employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            full_name="Override Progress Employee",
            did_travel=True,
            status=Employee.STATUS_APPROVED,
            is_active=True,
        )

        self.client.force_authenticate(user=admin_user)
        response = self.client.patch(
            f"/api/employees/{employee.pk}/",
            {"progress_override_complete": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        employee.refresh_from_db()
        self.assertTrue(employee.progress_override_complete)
        self.assertEqual(response.data["progress_status"]["overall_completion"], 100)

    def test_employed_scope_returns_travelled_employees_with_full_progress(self):
        superadmin = self._create_user("owner-employed", Profile.ROLE_SUPERADMIN)
        agent = self._create_user("agent-employed", Profile.ROLE_CUSTOMER)
        other_agent = self._create_user("agent-employed-other", Profile.ROLE_CUSTOMER)
        self._assign_same_organization(superadmin, agent, other_agent)

        employed_employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            full_name="Employed Worker",
            did_travel=True,
            status=Employee.STATUS_APPROVED,
            is_active=True,
            progress_override_complete=True,
        )
        EmployeeSelection.objects.create(
            organization=get_user_organization(superadmin),
            employee=employed_employee,
            agent=agent,
            selected_by=agent,
            status=EmployeeSelection.STATUS_UNDER_PROCESS,
        )

        incomplete_employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            full_name="Incomplete Worker",
            did_travel=True,
            status=Employee.STATUS_APPROVED,
            is_active=True,
        )

        self.client.force_authenticate(user=superadmin)
        org_response = self.client.get("/api/employees/", {"employed_scope": "organization"})
        self.assertEqual(org_response.status_code, 200)
        returned_ids = [item["id"] for item in org_response.data["results"]]
        self.assertIn(employed_employee.id, returned_ids)
        self.assertNotIn(incomplete_employee.id, returned_ids)

        self.client.force_authenticate(user=agent)
        agent_response = self.client.get("/api/employees/", {"employed_scope": "mine"})
        self.assertEqual(agent_response.status_code, 200)
        returned_ids = [item["id"] for item in agent_response.data["results"]]
        self.assertIn(employed_employee.id, returned_ids)

        self.client.force_authenticate(user=other_agent)
        other_agent_response = self.client.get("/api/employees/", {"employed_scope": "mine"})
        self.assertEqual(other_agent_response.status_code, 200)
        self.assertEqual(other_agent_response.data["count"], 0)

    def test_completed_employee_is_hidden_from_other_agents_in_default_list(self):
        superadmin = self._create_user("owner-employed-default", Profile.ROLE_SUPERADMIN)
        agent = self._create_user("agent-employed-default", Profile.ROLE_CUSTOMER)
        other_agent = self._create_user("agent-employed-default-other", Profile.ROLE_CUSTOMER)
        self._assign_same_organization(superadmin, agent, other_agent)

        employed_employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=superadmin,
            updated_by=superadmin,
            full_name="Completed Worker",
            did_travel=True,
            status=Employee.STATUS_APPROVED,
            is_active=True,
            progress_override_complete=True,
        )
        EmployeeSelection.objects.create(
            organization=get_user_organization(superadmin),
            employee=employed_employee,
            agent=agent,
            selected_by=agent,
            status=EmployeeSelection.STATUS_UNDER_PROCESS,
        )

        self.client.force_authenticate(user=superadmin)
        org_response = self.client.get("/api/employees/")
        self.assertEqual(org_response.status_code, 200)
        self.assertIn(
            employed_employee.id,
            [item["id"] for item in org_response.data["results"]],
        )

        self.client.force_authenticate(user=agent)
        agent_response = self.client.get("/api/employees/")
        self.assertEqual(agent_response.status_code, 200)
        self.assertIn(
            employed_employee.id,
            [item["id"] for item in agent_response.data["results"]],
        )

        self.client.force_authenticate(user=other_agent)
        other_agent_response = self.client.get("/api/employees/")
        self.assertEqual(other_agent_response.status_code, 200)
        self.assertNotIn(
            employed_employee.id,
            [item["id"] for item in other_agent_response.data["results"]],
        )

    @patch(
        "django.core.files.storage.FileSystemStorage.save",
        return_value="employees/1/portrait.jpg",
    )
    def test_employee_document_upload_and_delete_work(self, _storage_save):
        superadmin = self._create_user("owner-a", Profile.ROLE_SUPERADMIN)
        staff_user = self._create_user("staff-a", Profile.ROLE_STAFF)
        self._assign_same_organization(superadmin, staff_user)
        employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=staff_user,
            updated_by=staff_user,
            full_name="Document Holder",
        )

        self.client.force_authenticate(user=staff_user)
        upload = SimpleUploadedFile(
            "portrait.jpg",
            b"employee-portrait",
            content_type="image/jpeg",
        )

        response = self.client.post(
            f"/api/employees/{employee.pk}/documents/",
            {
                "document_type": "portrait_photo",
                "label": "Portrait photo",
                "file": upload,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        document_id = response.data["id"]
        self.assertTrue(response.data["file_url"])

        delete_response = self.client.delete(f"/api/employee-documents/{document_id}/")

        self.assertEqual(delete_response.status_code, 204)

    def test_employee_document_upload_rejects_non_pdf_or_image_formats(self):
        superadmin = self._create_user("owner-invalid-doc", Profile.ROLE_SUPERADMIN)
        staff_user = self._create_user("staff-invalid-doc", Profile.ROLE_STAFF)
        self._assign_same_organization(superadmin, staff_user)
        employee = Employee.objects.create(
            organization=get_user_organization(superadmin),
            registered_by=staff_user,
            updated_by=staff_user,
            full_name="Invalid Document Holder",
        )

        self.client.force_authenticate(user=staff_user)
        upload = SimpleUploadedFile(
            "portrait.txt",
            b"invalid-document",
            content_type="text/plain",
        )

        response = self.client.post(
            f"/api/employees/{employee.pk}/documents/",
            {
                "document_type": "portrait_photo",
                "label": "Portrait photo",
                "file": upload,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Only PDF, JPG, JPEG, and PNG files are allowed.", response.data["file"][0])


class CompanySyncTests(TestCase):
    def setUp(self):
        self.private_key = Ed25519PrivateKey.generate()
        self.public_pem = self.private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode("utf-8")

    def _headers(self, payload: dict, *, key="company-sync-test"):
        timestamp = str(int(time.time()))
        body = json.dumps(payload).encode("utf-8")
        signature = self.private_key.sign(timestamp.encode("utf-8") + b"." + body)
        return {
            "content_type": "application/json",
            "HTTP_X_PORTAL_SYNC_KEY": key,
            "HTTP_X_PORTAL_SYNC_TIMESTAMP": timestamp,
            "HTTP_X_PORTAL_SYNC_ALGORITHM": "ed25519",
            "HTTP_X_PORTAL_SYNC_SIGNATURE": __import__("base64").b64encode(signature).decode("ascii"),
        }

    @patch("app.sync_security.get_public_key_record")
    def test_company_sync_requires_valid_signature(self, get_public_key_record):
        get_public_key_record.return_value = None
        payload = {
            "external_id": "company-plan-1",
            "code": "trial",
            "name": "Trial",
        }
        # No key lookup means the request is untrusted.
        response = self.client.post(
            "/api/company-sync/plans/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    @patch("app.sync_security.get_public_key_record")
    def test_company_sync_upserts_plan_organization_and_subscription(self, get_public_key_record):
        get_public_key_record.return_value = {
            "key_id": "company-sync-test",
            "algorithm": "ed25519",
            "public_key_pem": self.public_pem,
            "is_active": True,
        }
        plan_payload = {
            "external_id": "company-plan-1",
            "code": "starter",
            "name": "Starter",
            "max_superadmins": 1,
            "max_admins": 1,
            "max_staff": 8,
            "max_customers": 25,
            "feature_flags": {"audit_log_enabled": True},
        }
        response = self.client.post(
            "/api/company-sync/plans/",
            data=json.dumps(plan_payload),
            **self._headers(plan_payload),
        )
        self.assertEqual(response.status_code, 200)

        organization_payload = {
            "external_id": "company-organization-1",
            "name": "Acme Hiring",
            "slug": "acme-hiring",
            "status": "active",
            "billing_contact_email": "billing@acme.example",
            "reputation_tier": "trusted",
            "read_only_mode": False,
        }
        response = self.client.post(
            "/api/company-sync/organizations/",
            data=json.dumps(organization_payload),
            **self._headers(organization_payload),
        )
        self.assertEqual(response.status_code, 200)

        subscription_payload = {
            "external_id": "company-subscription-1",
            "organization_external_id": "company-organization-1",
            "plan_external_id": "company-plan-1",
            "status": "cancelled",
            "last_payment_status": "cancelled",
            "notes": "Billing closed by company operator.",
        }
        response = self.client.post(
            "/api/company-sync/subscriptions/",
            data=json.dumps(subscription_payload),
            **self._headers(subscription_payload),
        )
        self.assertEqual(response.status_code, 200)

        from .models import Organization, OrganizationSubscription, ProductPlan

        organization = Organization.objects.get(company_reference="company-organization-1")
        plan = ProductPlan.objects.get(company_reference="company-plan-1")
        subscription = OrganizationSubscription.objects.get(company_reference="company-subscription-1")

        self.assertEqual(plan.code, "starter")
        self.assertEqual(organization.slug, "acme-hiring")
        self.assertEqual(subscription.plan_id, plan.id)
        self.assertEqual(subscription.organization_id, organization.id)
        self.assertEqual(subscription.status, "cancelled")
        self.assertTrue(organization.read_only_mode)
