import json

from django.db import transaction
from django.utils.text import slugify
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import LicenseEvent, Organization, OrganizationSubscription, ProductPlan
from .sync_security import verify_sync_request


def _normalized_slug(value: str, fallback: str) -> str:
    return slugify((value or "").strip()) or fallback


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def sync_plan_view(request):
    ok, message = verify_sync_request(request, request.body)
    if not ok:
        return Response({"detail": message}, status=status.HTTP_403_FORBIDDEN)

    payload = request.data
    external_id = (payload.get("external_id") or "").strip()
    code = (payload.get("code") or "").strip()
    if not external_id or not code:
        return Response(
            {"detail": "Both external_id and code are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        plan, _ = ProductPlan.objects.update_or_create(
            company_reference=external_id,
            defaults={
                "code": code,
                "name": (payload.get("name") or code).strip(),
                "description": payload.get("description") or "",
                "monthly_price": payload.get("monthly_price") or "0.00",
                "currency": payload.get("currency") or "USD",
                "max_superadmins": payload.get("max_superadmins") or 1,
                "max_admins": payload.get("max_admins") or 1,
                "max_staff": payload.get("max_staff") or 4,
                "max_customers": payload.get("max_customers") or 5,
                "feature_flags": payload.get("feature_flags") or {},
                "is_active": bool(payload.get("is_active", True)),
            },
        )
    return Response({"success": True, "plan_id": plan.id})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def sync_organization_view(request):
    ok, message = verify_sync_request(request, request.body)
    if not ok:
        return Response({"detail": message}, status=status.HTTP_403_FORBIDDEN)

    payload = request.data
    external_id = (payload.get("external_id") or "").strip()
    name = (payload.get("name") or "").strip()
    if not external_id or not name:
        return Response(
            {"detail": "Both external_id and name are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    desired_slug = _normalized_slug(payload.get("slug") or name, "employment-portal-org")
    with transaction.atomic():
        organization, created = Organization.objects.get_or_create(
            company_reference=external_id,
            defaults={
                "name": name,
                "slug": desired_slug,
            },
        )
        if created:
            slug_value = organization.slug
        elif organization.slug != desired_slug and not Organization.objects.filter(slug=desired_slug).exclude(pk=organization.pk).exists():
            slug_value = desired_slug
        else:
            slug_value = organization.slug

        organization.name = name
        organization.slug = slug_value
        organization.status = payload.get("status") or Organization.STATUS_PENDING
        organization.billing_contact_name = payload.get("billing_contact_name") or ""
        organization.billing_contact_email = payload.get("billing_contact_email") or ""
        organization.reputation_tier = payload.get("reputation_tier") or Organization.REPUTATION_STANDARD
        organization.read_only_mode = bool(payload.get("read_only_mode", False))
        organization.created_by_company = True
        organization.save()
    return Response({"success": True, "organization_id": organization.id})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def sync_subscription_view(request):
    ok, message = verify_sync_request(request, request.body)
    if not ok:
        return Response({"detail": message}, status=status.HTTP_403_FORBIDDEN)

    payload = request.data
    external_id = (payload.get("external_id") or "").strip()
    organization_external_id = (payload.get("organization_external_id") or "").strip()
    plan_external_id = (payload.get("plan_external_id") or "").strip()
    if not external_id or not organization_external_id or not plan_external_id:
        return Response(
            {"detail": "external_id, organization_external_id, and plan_external_id are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        organization = Organization.objects.get(company_reference=organization_external_id)
        plan = ProductPlan.objects.get(company_reference=plan_external_id)
    except Organization.DoesNotExist:
        return Response({"detail": "Organization must be synced first."}, status=status.HTTP_400_BAD_REQUEST)
    except ProductPlan.DoesNotExist:
        return Response({"detail": "Plan must be synced first."}, status=status.HTTP_400_BAD_REQUEST)

    old_status = ""
    with transaction.atomic():
        subscription, _ = OrganizationSubscription.objects.get_or_create(
            organization=organization,
            defaults={
                "company_reference": external_id,
                "plan": plan,
            },
        )
        old_status = subscription.status or ""
        subscription.company_reference = external_id
        subscription.plan = plan
        subscription.status = payload.get("status") or OrganizationSubscription.STATUS_TRIAL
        subscription.starts_at = payload.get("starts_at")
        subscription.renews_at = payload.get("renews_at")
        subscription.grace_ends_at = payload.get("grace_ends_at")
        subscription.cancelled_at = payload.get("cancelled_at")
        subscription.last_payment_status = payload.get("last_payment_status") or OrganizationSubscription.PAYMENT_PENDING
        subscription.manual_notes = payload.get("notes") or ""
        subscription.save()

        if subscription.status == OrganizationSubscription.STATUS_CANCELLED:
            organization.status = Organization.STATUS_CANCELLED
            organization.read_only_mode = True
        elif subscription.status == OrganizationSubscription.STATUS_SUSPENDED:
            organization.status = Organization.STATUS_SUSPENDED
        elif subscription.status == OrganizationSubscription.STATUS_GRACE:
            organization.status = Organization.STATUS_GRACE
        elif subscription.status in {
            OrganizationSubscription.STATUS_ACTIVE,
            OrganizationSubscription.STATUS_TRIAL,
        }:
            organization.status = Organization.STATUS_ACTIVE
            organization.read_only_mode = False
        elif subscription.status == OrganizationSubscription.STATUS_EXPIRED:
            organization.status = Organization.STATUS_SUSPENDED
        organization.created_by_company = True
        organization.save()

        LicenseEvent.objects.create(
            organization=organization,
            subscription=subscription,
            action="license.sync",
            old_status=old_status,
            new_status=subscription.status,
            notes="Subscription synchronized from company control center.",
        )
    return Response({"success": True, "subscription_id": subscription.id})
