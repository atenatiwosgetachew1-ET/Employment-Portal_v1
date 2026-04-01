from datetime import date

from django.contrib.auth.models import User
from rest_framework import serializers

from .auth_utils import get_profile_role, is_admin, is_superadmin
from .licensing import (
    can_assign_role,
    get_access_state,
    get_user_organization,
    seat_limits_for_organization,
    seat_usage_for_organization,
)
from .models import (
    AuditLog,
    Employee,
    EmployeeDocument,
    LicenseEvent,
    Notification,
    Organization,
    OrganizationMembership,
    OrganizationSubscription,
    PlatformSettings,
    ProductPlan,
    Profile,
    UserPreferences,
)

STAFF_ROLE_LEVELS = {
    "Reception": 1,
    "Secretary": 2,
    "IT": 3,
    "Operations": 4,
    "Supervisor": 5,
}

PHONE_MIN_DIGITS = 7
PHONE_MAX_DIGITS = 15


def normalize_phone(value):
    raw = (value or "").strip()
    if not raw:
        return ""
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) < PHONE_MIN_DIGITS or len(digits) > PHONE_MAX_DIGITS:
        raise serializers.ValidationError("Enter a valid phone number.")
    return raw


def calculate_age(value):
    if not value:
        return None
    today = date.today()
    return today.year - value.year - (
        (today.month, today.day) < (value.month, value.day)
    )


EMPLOYEE_REQUIRED_DOCUMENT_TYPES = [
    "portrait_photo",
    "full_photo",
    "passport_photo",
    "passport_document",
    "employee_id",
    "contact_person_id",
    "medical_result",
    "certificate_of_competency",
    "contract",
    "visa",
    "insurance",
    "clearance",
    "departure_ticket",
    "return_ticket",
]


EMPLOYEE_URGENCY_DATE_FIELDS = [
    ("passport_expires_on", "Passport expiry"),
    ("medical_expires_on", "Medical result expiry"),
    ("departure_date", "Departure date"),
    ("return_ticket_date", "Return ticket date"),
    ("contract_expires_on", "Contract expiry"),
    ("visa_expires_on", "Visa expiry"),
    ("competency_certificate_expires_on", "Certificate of competency expiry"),
    ("clearance_expires_on", "Clearance expiry"),
    ("insurance_expires_on", "Insurance expiry"),
]


def build_employee_progress_status(employee):
    mandatory_fields = [
        employee.first_name,
        employee.middle_name,
        employee.last_name,
        employee.date_of_birth,
        employee.gender,
        employee.passport_number,
        employee.mobile_number,
        employee.application_countries,
        employee.profession,
        employee.employment_type,
        employee.languages,
        employee.residence_country,
        employee.nationality,
        employee.contact_person_name,
        employee.contact_person_mobile,
    ]
    completed_fields = sum(1 for value in mandatory_fields if value not in ("", None, [], {}))
    field_completion = round((completed_fields / len(mandatory_fields)) * 100)
    uploaded_types = set(employee.documents.values_list("document_type", flat=True))
    uploaded_required = sum(1 for item in EMPLOYEE_REQUIRED_DOCUMENT_TYPES if item in uploaded_types)
    document_completion = round(
        (uploaded_required / len(EMPLOYEE_REQUIRED_DOCUMENT_TYPES)) * 100
    )
    overall_completion = round((field_completion + document_completion) / 2)
    if overall_completion >= 90:
        label = "ready"
    elif overall_completion >= 60:
        label = "in_progress"
    else:
        label = "needs_attention"
    return {
        "field_completion": field_completion,
        "document_completion": document_completion,
        "overall_completion": overall_completion,
        "label": label,
    }


def build_employee_travel_status(employee):
    today = date.today()
    if employee.did_travel:
        return "travelled"
    if employee.departure_date and employee.departure_date < today:
        return "departure_missed"
    if employee.departure_date and employee.departure_date >= today:
        return "scheduled"
    return "pending"


def build_employee_return_status(employee):
    today = date.today()
    if not employee.did_travel:
        return "not_applicable"
    if not employee.return_ticket_date:
        return "missing_ticket"
    if employee.return_ticket_date < today:
        return "overdue"
    return "scheduled"


def build_employee_urgency_alerts(employee):
    today = date.today()
    alerts = []
    for field_name, label in EMPLOYEE_URGENCY_DATE_FIELDS:
        value = getattr(employee, field_name, None)
        if not value:
            continue
        days_remaining = (value - today).days
        if days_remaining < 0:
            alerts.append(
                {
                    "field": field_name,
                    "label": label,
                    "severity": "expired",
                    "days_remaining": days_remaining,
                }
            )
        elif days_remaining <= 30:
            alerts.append(
                {
                    "field": field_name,
                    "label": label,
                    "severity": "upcoming",
                    "days_remaining": days_remaining,
                }
            )
    return alerts


class UserListSerializer(serializers.ModelSerializer):
    """Read + list representation with profile fields."""

    role = serializers.CharField(source="profile.role", read_only=True)
    phone = serializers.CharField(source="profile.phone", read_only=True)
    agent_country = serializers.CharField(source="profile.agent_country", read_only=True)
    agent_commission = serializers.DecimalField(
        source="profile.agent_commission",
        max_digits=10,
        decimal_places=2,
        read_only=True,
        allow_null=True,
    )
    agent_salary = serializers.DecimalField(
        source="profile.agent_salary",
        max_digits=12,
        decimal_places=2,
        read_only=True,
        allow_null=True,
    )
    staff_side = serializers.CharField(source="profile.staff_side", read_only=True)
    staff_level = serializers.IntegerField(source="profile.staff_level", read_only=True)
    staff_level_label = serializers.CharField(source="profile.staff_level_label", read_only=True)
    email_verified = serializers.BooleanField(source="profile.email_verified", read_only=True)
    google_linked = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source="profile.organization.name", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "last_login",
            "role",
            "phone",
            "agent_country",
            "agent_commission",
            "agent_salary",
            "staff_side",
            "staff_level",
            "staff_level_label",
            "email_verified",
            "google_linked",
            "organization_name",
        )
        read_only_fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "last_login",
            "role",
            "phone",
            "agent_country",
            "agent_commission",
            "agent_salary",
            "staff_side",
            "staff_level",
            "staff_level_label",
            "email_verified",
            "google_linked",
            "organization_name",
        )

    def get_google_linked(self, obj):
        return bool(getattr(obj.profile, "google_sub", None))


class SelfProfileSerializer(serializers.Serializer):
    """PATCH /api/me/ — edit own username, name, phone."""

    username = serializers.CharField(max_length=150, required=False)
    first_name = serializers.CharField(max_length=150, allow_blank=True, required=False)
    last_name = serializers.CharField(max_length=150, allow_blank=True, required=False)
    phone = serializers.CharField(max_length=30, allow_blank=True, required=False)

    def validate_username(self, value):
        v = (value or "").strip()
        if not v:
            raise serializers.ValidationError("Username is required.")
        max_len = User._meta.get_field("username").max_length
        if len(v) > max_len:
            raise serializers.ValidationError(f"At most {max_len} characters.")
        user = self.context["request"].user
        if User.objects.filter(username__iexact=v).exclude(pk=user.pk).exists():
            raise serializers.ValidationError("This username is already taken.")
        return v

    def update(self, user, validated_data):
        if "username" in validated_data:
            user.username = validated_data["username"]
        if "first_name" in validated_data:
            user.first_name = validated_data["first_name"] or ""
        if "last_name" in validated_data:
            user.last_name = validated_data["last_name"] or ""
        user.save()
        if "phone" in validated_data:
            p = user.profile
            p.phone = validated_data.get("phone", "") or ""
            p.save(update_fields=["phone"])
        return user


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=Profile.ROLE_CHOICES, default=Profile.ROLE_CUSTOMER)
    phone = serializers.CharField(required=False, allow_blank=True, default="")
    agent_country = serializers.CharField(required=False, allow_blank=True, default="")
    agent_commission = serializers.DecimalField(
        required=False,
        allow_null=True,
        max_digits=10,
        decimal_places=2,
    )
    agent_salary = serializers.DecimalField(
        required=False,
        allow_null=True,
        max_digits=12,
        decimal_places=2,
    )
    staff_side = serializers.CharField(required=False, allow_blank=True, default="")
    staff_level = serializers.IntegerField(required=False, min_value=1, max_value=5, default=1)
    staff_level_label = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = User
        fields = (
            "username",
            "password",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "role",
            "phone",
            "agent_country",
            "agent_commission",
            "agent_salary",
            "staff_side",
            "staff_level",
            "staff_level_label",
        )

    def validate_phone(self, value):
        return normalize_phone(value)

    def validate(self, attrs):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        actor = request.user
        role = attrs.get("role", Profile.ROLE_CUSTOMER)
        actor_org = get_user_organization(actor)
        if role == Profile.ROLE_STAFF:
            attrs["staff_side"] = (attrs.get("staff_side") or "").strip() or (
                actor_org.name if actor_org else ""
            )
            attrs["agent_country"] = ""
            attrs["agent_commission"] = None
            attrs["agent_salary"] = None
            attrs["staff_level_label"] = (attrs.get("staff_level_label") or "").strip()
            if not attrs["staff_side"]:
                raise serializers.ValidationError({"staff_side": "Staff side is required."})
            if attrs["staff_level_label"] not in STAFF_ROLE_LEVELS:
                raise serializers.ValidationError(
                    {"staff_level_label": f"Choose one of: {', '.join(STAFF_ROLE_LEVELS)}."}
                )
            attrs["staff_level"] = STAFF_ROLE_LEVELS[attrs["staff_level_label"]]
        else:
            attrs["staff_side"] = ""
            attrs["staff_level"] = 1
            attrs["staff_level_label"] = ""
            if role == Profile.ROLE_CUSTOMER:
                attrs["agent_country"] = (attrs.get("agent_country") or "").strip()
                if not attrs["agent_country"]:
                    raise serializers.ValidationError(
                        {"agent_country": "Country is required for agent accounts."}
                    )
                if attrs.get("agent_salary") in (None, ""):
                    raise serializers.ValidationError(
                        {"agent_salary": "Salary is required for agent accounts."}
                    )
            else:
                attrs["agent_country"] = ""
                attrs["agent_commission"] = None
                attrs["agent_salary"] = None
        if is_superadmin(actor):
            allowed, message = can_assign_role(actor_org, role)
            if not allowed:
                raise serializers.ValidationError({"role": message})
            return attrs
        if is_admin(actor):
            if role not in (Profile.ROLE_STAFF, Profile.ROLE_CUSTOMER):
                raise serializers.ValidationError(
                    {"role": "Admins may only create staff or agent accounts."}
                )
            allowed, message = can_assign_role(actor_org, role)
            if not allowed:
                raise serializers.ValidationError({"role": message})
            return attrs
        raise serializers.ValidationError("You cannot create users.")

    def create(self, validated_data):
        role = validated_data.pop("role")
        phone = validated_data.pop("phone", "")
        agent_country = validated_data.pop("agent_country", "")
        agent_commission = validated_data.pop("agent_commission", None)
        agent_salary = validated_data.pop("agent_salary", None)
        staff_side = validated_data.pop("staff_side", "")
        staff_level = validated_data.pop("staff_level", 1)
        staff_level_label = validated_data.pop("staff_level_label", "")
        password = (validated_data.pop("password", "") or "").strip()
        user = User.objects.create_user(password=password or None, **validated_data)
        if not password:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        actor_org = get_user_organization(self.context["request"].user)
        user.profile.role = role
        user.profile.organization = actor_org
        user.profile.phone = phone
        user.profile.agent_country = agent_country if role == Profile.ROLE_CUSTOMER else ""
        user.profile.agent_commission = (
            agent_commission if role == Profile.ROLE_CUSTOMER else None
        )
        user.profile.agent_salary = agent_salary if role == Profile.ROLE_CUSTOMER else None
        user.profile.staff_side = staff_side if role == Profile.ROLE_STAFF else ""
        user.profile.staff_level = staff_level if role == Profile.ROLE_STAFF else 1
        user.profile.staff_level_label = (
            staff_level_label if role == Profile.ROLE_STAFF else ""
        )
        user.profile.email_verified = True
        user.profile.save()
        OrganizationMembership.objects.update_or_create(
            user=user,
            defaults={
                "organization": actor_org,
                "role": role,
                "is_owner": role == Profile.ROLE_SUPERADMIN,
                "is_active": user.is_active,
            },
        )
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(choices=Profile.ROLE_CHOICES, required=False)
    phone = serializers.CharField(required=False, allow_blank=True)
    agent_country = serializers.CharField(required=False, allow_blank=True)
    agent_commission = serializers.DecimalField(
        required=False,
        allow_null=True,
        max_digits=10,
        decimal_places=2,
    )
    agent_salary = serializers.DecimalField(
        required=False,
        allow_null=True,
        max_digits=12,
        decimal_places=2,
    )
    staff_side = serializers.CharField(required=False, allow_blank=True)
    staff_level = serializers.IntegerField(required=False, min_value=1, max_value=5)
    staff_level_label = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = (
            "email",
            "first_name",
            "last_name",
            "is_active",
            "role",
            "phone",
            "agent_country",
            "agent_commission",
            "agent_salary",
            "staff_side",
            "staff_level",
            "staff_level_label",
        )

    def validate_phone(self, value):
        return normalize_phone(value)

    def validate(self, attrs):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        actor = request.user
        instance = self.instance
        new_role = attrs.get("role")
        target_role = new_role or get_profile_role(instance)
        actor_org = get_user_organization(actor)
        target_org = getattr(instance.profile, "organization", None)
        if actor_org and target_org and actor_org.pk != target_org.pk:
            raise serializers.ValidationError("You do not have permission to modify this account.")
        if new_role is not None:
            if is_superadmin(actor):
                allowed, message = can_assign_role(actor_org, new_role, exclude_user=instance)
                if not allowed:
                    raise serializers.ValidationError({"role": message})
            elif is_admin(actor):
                if new_role not in (Profile.ROLE_STAFF, Profile.ROLE_CUSTOMER):
                    raise serializers.ValidationError(
                        {"role": "Admins may only assign staff or agent roles."}
                    )
                allowed, message = can_assign_role(actor_org, new_role, exclude_user=instance)
                if not allowed:
                    raise serializers.ValidationError({"role": message})
            else:
                raise serializers.ValidationError({"role": "You cannot change roles."})
        if target_role == Profile.ROLE_STAFF:
            attrs["agent_country"] = ""
            attrs["agent_commission"] = None
            attrs["agent_salary"] = None
            next_side = (attrs.get("staff_side", instance.profile.staff_side) or "").strip()
            next_label = (
                attrs.get("staff_level_label", instance.profile.staff_level_label) or ""
            ).strip()
            if not next_side:
                next_side = actor_org.name if actor_org else ""
            if not next_side:
                raise serializers.ValidationError({"staff_side": "Staff side is required."})
            if next_label not in STAFF_ROLE_LEVELS:
                raise serializers.ValidationError(
                    {"staff_level_label": f"Choose one of: {', '.join(STAFF_ROLE_LEVELS)}."}
                )
            attrs["staff_side"] = next_side
            attrs["staff_level_label"] = next_label
            attrs["staff_level"] = STAFF_ROLE_LEVELS[next_label]
        elif target_role == Profile.ROLE_CUSTOMER:
            attrs["staff_side"] = ""
            attrs["staff_level"] = 1
            attrs["staff_level_label"] = ""
            next_country = (
                attrs.get("agent_country", instance.profile.agent_country) or ""
            ).strip()
            next_salary = attrs.get("agent_salary", instance.profile.agent_salary)
            if not next_country:
                raise serializers.ValidationError(
                    {"agent_country": "Country is required for agent accounts."}
                )
            if next_salary in (None, ""):
                raise serializers.ValidationError(
                    {"agent_salary": "Salary is required for agent accounts."}
                )
            attrs["agent_country"] = next_country
        else:
            attrs["staff_side"] = ""
            attrs["staff_level"] = 1
            attrs["staff_level_label"] = ""
            attrs["agent_country"] = ""
            attrs["agent_commission"] = None
            attrs["agent_salary"] = None
        if instance and is_admin(actor) and not is_superadmin(actor):
            if target_role not in (Profile.ROLE_STAFF, Profile.ROLE_CUSTOMER):
                raise serializers.ValidationError(
                    "You do not have permission to modify this account."
                )
        return attrs

    def update(self, instance, validated_data):
        has_agent_country = "agent_country" in validated_data
        has_agent_commission = "agent_commission" in validated_data
        has_agent_salary = "agent_salary" in validated_data
        role = validated_data.pop("role", None)
        phone = validated_data.pop("phone", None)
        agent_country = validated_data.pop("agent_country", None)
        agent_commission = validated_data.pop("agent_commission", None)
        agent_salary = validated_data.pop("agent_salary", None)
        staff_side = validated_data.pop("staff_side", None)
        staff_level = validated_data.pop("staff_level", None)
        staff_level_label = validated_data.pop("staff_level_label", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        profile, _ = Profile.objects.get_or_create(
            user=instance,
            defaults={"role": Profile.ROLE_CUSTOMER},
        )
        if role is not None:
            profile.role = role
        if phone is not None:
            profile.phone = phone
        if has_agent_country:
            profile.agent_country = agent_country
        if has_agent_commission:
            profile.agent_commission = agent_commission
        if has_agent_salary:
            profile.agent_salary = agent_salary
        if staff_side is not None:
            profile.staff_side = staff_side
        if staff_level is not None:
            profile.staff_level = staff_level
        if staff_level_label is not None:
            profile.staff_level_label = staff_level_label
        profile.save()
        OrganizationMembership.objects.update_or_create(
            user=instance,
            defaults={
                "organization": profile.organization,
                "role": profile.role,
                "is_owner": profile.role == Profile.ROLE_SUPERADMIN,
                "is_active": instance.is_active,
            },
        )
        return instance


class AdminPasswordResetSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )
        return attrs


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "title", "body", "kind", "read", "created_at")
        read_only_fields = ("id", "title", "body", "kind", "created_at")


class UserPreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreferences
        fields = ("id", "theme", "timezone", "language", "email_notifications")
        read_only_fields = ("id",)


class PlatformSettingsSerializer(serializers.ModelSerializer):
    feature_flags = serializers.JSONField()
    role_permissions = serializers.JSONField()

    class Meta:
        model = PlatformSettings
        fields = (
            "login_max_failed_attempts",
            "login_lockout_minutes",
            "feature_flags",
            "role_permissions",
            "updated_at",
        )
        read_only_fields = ("updated_at",)

    def validate_feature_flags(self, value):
        allowed = set(PlatformSettings.DEFAULT_FEATURE_FLAGS.keys())
        if not isinstance(value, dict):
            raise serializers.ValidationError("Feature flags must be an object.")
        cleaned = {}
        for key, flag_value in value.items():
            if key not in allowed:
                raise serializers.ValidationError(f"Unknown feature flag: {key}")
            cleaned[key] = bool(flag_value)
        merged = dict(PlatformSettings.DEFAULT_FEATURE_FLAGS)
        merged.update(cleaned)
        return merged

    def validate_role_permissions(self, value):
        allowed_roles = {choice for choice, _ in Profile.ROLE_CHOICES}
        allowed_permissions = {
            "users.manage_all",
            "users.manage_limited",
            "audit.view",
            "platform.manage",
        }
        if not isinstance(value, dict):
            raise serializers.ValidationError("Role permissions must be an object.")
        merged = {
            role: list(perms)
            for role, perms in PlatformSettings.DEFAULT_ROLE_PERMISSIONS.items()
        }
        for role, permissions in value.items():
            if role not in allowed_roles:
                raise serializers.ValidationError(f"Unknown role: {role}")
            if not isinstance(permissions, list):
                raise serializers.ValidationError(f"Permissions for {role} must be a list.")
            invalid = [perm for perm in permissions if perm not in allowed_permissions]
            if invalid:
                raise serializers.ValidationError(
                    f"Unknown permissions for {role}: {', '.join(invalid)}"
                )
            merged[role] = list(dict.fromkeys(permissions))
        return merged


class PublicRegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )
        if User.objects.filter(username__iexact=attrs["username"].strip()).exists():
            raise serializers.ValidationError({"username": "Username already taken."})
        if User.objects.filter(email__iexact=attrs["email"].strip().lower()).exists():
            raise serializers.ValidationError({"email": "Email already registered."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        username = validated_data["username"].strip()
        email = validated_data["email"].strip().lower()
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            is_active=False,
        )
        profile = user.profile
        profile.email_verified = False
        profile.role = Profile.ROLE_CUSTOMER
        profile.save(update_fields=["email_verified", "role"])
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )
        return attrs


class CompanySuperadminResetTokenSerializer(serializers.Serializer):
    token = serializers.CharField()

    def validate_token(self, value):
        token = (value or "").strip()
        if not token:
            raise serializers.ValidationError("Reset token is required.")
        return token


class CompanySuperadminResetConfirmSerializer(CompanySuperadminResetTokenSerializer):
    new_password = serializers.CharField(write_only=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )
        return attrs


class VerifyEmailCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=32)

    def validate_email(self, value):
        return value.strip().lower()

    def validate_code(self, value):
        digits = "".join(c for c in value if c.isdigit())
        if len(digits) != 6:
            raise serializers.ValidationError("Enter the 6-digit code from your email.")
        return digits


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(
        source="actor.username", read_only=True, allow_null=True
    )

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "actor_username",
            "action",
            "resource_type",
            "resource_id",
            "summary",
            "metadata",
            "created_at",
        )
        read_only_fields = (
            "id",
            "actor_username",
            "action",
            "resource_type",
            "resource_id",
            "summary",
            "metadata",
            "created_at",
        )


class ProductPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductPlan
        fields = (
            "id",
            "code",
            "name",
            "description",
            "monthly_price",
            "currency",
            "max_superadmins",
            "max_admins",
            "max_staff",
            "max_customers",
            "feature_flags",
            "is_active",
        )
        read_only_fields = ("id",)


class OrganizationSubscriptionSerializer(serializers.ModelSerializer):
    plan = ProductPlanSerializer(read_only=True)

    class Meta:
        model = OrganizationSubscription
        fields = (
            "id",
            "status",
            "starts_at",
            "renews_at",
            "grace_ends_at",
            "cancelled_at",
            "last_payment_status",
            "manual_notes",
            "plan",
            "updated_at",
        )
        read_only_fields = ("id", "updated_at")


class OrganizationSerializer(serializers.ModelSerializer):
    subscription = serializers.SerializerMethodField()
    seat_limits = serializers.SerializerMethodField()
    seat_usage = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "slug",
            "status",
            "billing_contact_name",
            "billing_contact_email",
            "reputation_tier",
            "read_only_mode",
            "created_by_company",
            "subscription",
            "seat_limits",
            "seat_usage",
        )
        read_only_fields = ("id", "subscription", "seat_limits", "seat_usage")

    def get_subscription(self, obj):
        subscription = getattr(obj, "subscription", None)
        if not subscription:
            return None
        return OrganizationSubscriptionSerializer(subscription).data

    def get_seat_limits(self, obj):
        return seat_limits_for_organization(obj)

    def get_seat_usage(self, obj):
        return seat_usage_for_organization(obj)


class LicenseEventSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True, allow_null=True)

    class Meta:
        model = LicenseEvent
        fields = (
            "id",
            "organization",
            "actor_username",
            "action",
            "old_status",
            "new_status",
            "notes",
            "created_at",
        )
        read_only_fields = fields


class EmployeeDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeDocument
        fields = (
            "id",
            "document_type",
            "label",
            "file",
            "file_url",
            "expires_on",
            "uploaded_by_username",
            "created_at",
        )
        read_only_fields = ("id", "file_url", "uploaded_by_username", "created_at")

    def get_file_url(self, obj):
        request = self.context.get("request")
        if not obj.file:
            return ""
        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url


class EmployeeListSerializer(serializers.ModelSerializer):
    registered_by_username = serializers.CharField(source="registered_by.username", read_only=True)
    documents = EmployeeDocumentSerializer(many=True, read_only=True)
    age = serializers.SerializerMethodField()
    progress_status = serializers.SerializerMethodField()
    travel_status = serializers.SerializerMethodField()
    return_status = serializers.SerializerMethodField()
    urgency_alerts = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = (
            "id",
            "full_name",
            "first_name",
            "middle_name",
            "last_name",
            "professional_title",
            "profession",
            "email",
            "phone",
            "application_countries",
            "is_active",
            "age",
            "progress_status",
            "travel_status",
            "return_status",
            "urgency_alerts",
            "registered_by_username",
            "documents",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_age(self, obj):
        return calculate_age(obj.date_of_birth)

    def get_progress_status(self, obj):
        return build_employee_progress_status(obj)

    def get_travel_status(self, obj):
        return build_employee_travel_status(obj)

    def get_return_status(self, obj):
        return build_employee_return_status(obj)

    def get_urgency_alerts(self, obj):
        return build_employee_urgency_alerts(obj)


class EmployeeSerializer(serializers.ModelSerializer):
    application_countries = serializers.ListField(
        child=serializers.CharField(max_length=120),
        required=False,
    )
    skills = serializers.ListField(
        child=serializers.CharField(max_length=120),
        required=False,
    )
    languages = serializers.ListField(
        child=serializers.CharField(max_length=120),
        required=False,
    )
    experiences = serializers.ListField(
        child=serializers.DictField(),
        required=False,
    )
    documents = EmployeeDocumentSerializer(many=True, read_only=True)
    registered_by_username = serializers.CharField(source="registered_by.username", read_only=True)
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True)
    age = serializers.SerializerMethodField()
    progress_status = serializers.SerializerMethodField()
    travel_status = serializers.SerializerMethodField()
    return_status = serializers.SerializerMethodField()
    urgency_alerts = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = (
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "full_name",
            "professional_title",
            "email",
            "phone",
            "address",
            "date_of_birth",
            "age",
            "gender",
            "id_number",
            "passport_number",
            "labour_id",
            "mobile_number",
            "application_countries",
            "profession",
            "employment_type",
            "experiences",
            "application_salary",
            "summary",
            "education",
            "experience",
            "skills",
            "certifications",
            "languages",
            "references",
            "notes",
            "religion",
            "marital_status",
            "children_count",
            "residence_country",
            "nationality",
            "birth_place",
            "weight_kg",
            "height_cm",
            "contact_person_name",
            "contact_person_id_number",
            "contact_person_mobile",
            "did_travel",
            "departure_date",
            "return_ticket_date",
            "passport_expires_on",
            "medical_expires_on",
            "contract_expires_on",
            "visa_expires_on",
            "competency_certificate_expires_on",
            "clearance_expires_on",
            "insurance_expires_on",
            "is_active",
            "progress_status",
            "travel_status",
            "return_status",
            "urgency_alerts",
            "registered_by_username",
            "updated_by_username",
            "documents",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "full_name",
            "registered_by_username",
            "updated_by_username",
            "documents",
            "created_at",
            "updated_at",
        )

    def validate_mobile_number(self, value):
        return normalize_phone(value)

    def validate_contact_person_mobile(self, value):
        return normalize_phone(value)

    def validate_phone(self, value):
        return normalize_phone(value)

    def validate_experiences(self, value):
        cleaned = []
        for item in value or []:
            country = (item.get("country") or "").strip()
            years = item.get("years")
            if not country:
                raise serializers.ValidationError("Each experience entry needs a country.")
            try:
                years_value = int(years)
            except (TypeError, ValueError):
                raise serializers.ValidationError("Experience years must be numeric.")
            if years_value < 0:
                raise serializers.ValidationError("Experience years cannot be negative.")
            cleaned.append({"country": country, "years": years_value})
        return cleaned

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not (attrs.get("first_name") or getattr(self.instance, "first_name", "")):
            raise serializers.ValidationError({"first_name": "First name is required."})
        if not (attrs.get("middle_name") or getattr(self.instance, "middle_name", "")):
            raise serializers.ValidationError({"middle_name": "Middle name is required."})
        if not (attrs.get("last_name") or getattr(self.instance, "last_name", "")):
            raise serializers.ValidationError({"last_name": "Last name is required."})
        if not (attrs.get("date_of_birth") or getattr(self.instance, "date_of_birth", None)):
            raise serializers.ValidationError({"date_of_birth": "Date of birth is required."})
        if not (attrs.get("passport_number") or getattr(self.instance, "passport_number", "")):
            raise serializers.ValidationError(
                {"passport_number": "Passport number is required."}
            )
        application_countries = attrs.get(
            "application_countries",
            getattr(self.instance, "application_countries", []),
        )
        if not application_countries:
            raise serializers.ValidationError(
                {"application_countries": "Select at least one destination country."}
            )
        profession = attrs.get("profession", getattr(self.instance, "profession", ""))
        if not profession:
            raise serializers.ValidationError({"profession": "Profession is required."})
        employment_type = attrs.get(
            "employment_type",
            getattr(self.instance, "employment_type", ""),
        )
        if not employment_type:
            raise serializers.ValidationError({"employment_type": "Type is required."})
        return attrs

    def get_age(self, obj):
        return calculate_age(obj.date_of_birth)

    def get_progress_status(self, obj):
        return build_employee_progress_status(obj)

    def get_travel_status(self, obj):
        return build_employee_travel_status(obj)

    def get_return_status(self, obj):
        return build_employee_return_status(obj)

    def get_urgency_alerts(self, obj):
        return build_employee_urgency_alerts(obj)


class EmployeeDocumentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeDocument
        fields = ("document_type", "label", "file", "expires_on")
