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


class UserListSerializer(serializers.ModelSerializer):
    """Read + list representation with profile fields."""

    role = serializers.CharField(source="profile.role", read_only=True)
    phone = serializers.CharField(source="profile.phone", read_only=True)
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
        )

    def validate(self, attrs):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        actor = request.user
        role = attrs.get("role", Profile.ROLE_CUSTOMER)
        actor_org = get_user_organization(actor)
        if is_superadmin(actor):
            allowed, message = can_assign_role(actor_org, role)
            if not allowed:
                raise serializers.ValidationError({"role": message})
            return attrs
        if is_admin(actor):
            if role not in (Profile.ROLE_STAFF, Profile.ROLE_CUSTOMER):
                raise serializers.ValidationError(
                    {"role": "Admins may only create staff or customer accounts."}
                )
            allowed, message = can_assign_role(actor_org, role)
            if not allowed:
                raise serializers.ValidationError({"role": message})
            return attrs
        raise serializers.ValidationError("You cannot create users.")

    def create(self, validated_data):
        role = validated_data.pop("role")
        phone = validated_data.pop("phone", "")
        password = (validated_data.pop("password", "") or "").strip()
        user = User.objects.create_user(password=password or None, **validated_data)
        if not password:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        actor_org = get_user_organization(self.context["request"].user)
        user.profile.role = role
        user.profile.organization = actor_org
        user.profile.phone = phone
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

    class Meta:
        model = User
        fields = (
            "email",
            "first_name",
            "last_name",
            "is_active",
            "role",
            "phone",
        )

    def validate(self, attrs):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        actor = request.user
        instance = self.instance
        new_role = attrs.get("role")
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
                        {"role": "Admins may only assign staff or customer roles."}
                    )
                allowed, message = can_assign_role(actor_org, new_role, exclude_user=instance)
                if not allowed:
                    raise serializers.ValidationError({"role": message})
            else:
                raise serializers.ValidationError({"role": "You cannot change roles."})
        if instance and is_admin(actor) and not is_superadmin(actor):
            target_role = get_profile_role(instance)
            if target_role not in (Profile.ROLE_STAFF, Profile.ROLE_CUSTOMER):
                raise serializers.ValidationError(
                    "You do not have permission to modify this account."
                )
        return attrs

    def update(self, instance, validated_data):
        role = validated_data.pop("role", None)
        phone = validated_data.pop("phone", None)

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
