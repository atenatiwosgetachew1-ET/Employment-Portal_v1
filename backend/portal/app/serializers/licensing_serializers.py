from rest_framework import serializers

from ..licensing import seat_limits_for_organization, seat_usage_for_organization
from ..models import LicenseEvent, Organization, OrganizationSubscription, ProductPlan


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
