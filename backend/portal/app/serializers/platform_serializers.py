from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from ..models import AuditLog, Notification, PlatformSettings, Profile, UserPreferences


class NotificationSerializer(serializers.ModelSerializer):
    remind_me = serializers.BooleanField(write_only=True, required=False)
    is_reminder_pending = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = (
            "id",
            "title",
            "body",
            "kind",
            "read",
            "created_at",
            "remind_at",
            "is_reminder_pending",
            "remind_me",
        )
        read_only_fields = (
            "id",
            "title",
            "body",
            "kind",
            "created_at",
            "is_reminder_pending",
        )

    def get_is_reminder_pending(self, obj):
        return bool(not obj.read and obj.remind_at and obj.remind_at > timezone.now())

    def validate_remind_at(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("Reminder time must be in the future.")
        return value

    def update(self, instance, validated_data):
        remind_me = validated_data.pop("remind_me", None)
        remind_at = validated_data.pop("remind_at", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if validated_data.get("read") is True or validated_data.get("read") is False:
            instance.remind_at = None

        if remind_at is not None:
            instance.read = False
            instance.remind_at = remind_at
        elif remind_me is True:
            instance.read = False
            instance.remind_at = timezone.now() + timedelta(days=1)
        elif remind_me is False:
            instance.remind_at = None

        instance.save()
        return instance


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
