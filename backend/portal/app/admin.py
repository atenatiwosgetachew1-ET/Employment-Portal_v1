from django.contrib import admin

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

admin.site.site_header = "Employment Portal Admin"
admin.site.site_title = "Employment Portal Admin"
admin.site.index_title = "Employment Portal Administration"


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "status",
        "billing_contact_email",
        "reputation_tier",
        "read_only_mode",
        "created_by_company",
    )
    search_fields = ("name", "slug", "billing_contact_email")
    list_filter = ("status", "reputation_tier", "read_only_mode", "created_by_company")


@admin.register(ProductPlan)
class ProductPlanAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "code",
        "monthly_price",
        "currency",
        "max_superadmins",
        "max_admins",
        "max_staff",
        "max_customers",
        "is_active",
    )
    search_fields = ("name", "code")
    list_filter = ("is_active", "currency")


@admin.register(OrganizationSubscription)
class OrganizationSubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "organization",
        "plan",
        "status",
        "last_payment_status",
        "renews_at",
        "grace_ends_at",
    )
    search_fields = ("organization__name", "plan__name")
    list_filter = ("status", "last_payment_status", "plan")


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ("organization", "user", "role", "is_owner", "is_active", "joined_at")
    search_fields = ("organization__name", "user__username", "user__email")
    list_filter = ("role", "is_owner", "is_active")


@admin.register(LicenseEvent)
class LicenseEventAdmin(admin.ModelAdmin):
    list_display = ("organization", "action", "old_status", "new_status", "actor", "created_at")
    search_fields = ("organization__name", "action", "actor__username")
    list_filter = ("action", "old_status", "new_status")


admin.site.register(Profile)
admin.site.register(UserPreferences)
admin.site.register(Notification)
admin.site.register(AuditLog)
admin.site.register(PlatformSettings)
