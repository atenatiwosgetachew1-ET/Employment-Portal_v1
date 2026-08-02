from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def _agent_name(user):
    full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return full_name or user.first_name or user.username


def _unique_agent_name(AgentOffice, organization, base_name):
    base = (base_name or "Agent office").strip() or "Agent office"
    candidate = base
    counter = 1
    while AgentOffice.objects.filter(organization=organization, name=candidate).exists():
        counter += 1
        candidate = f"{base} {counter}"
    return candidate


def forwards(apps, schema_editor):
    User = apps.get_model("auth", "User")
    Profile = apps.get_model("app", "Profile")
    AgentOffice = apps.get_model("app", "AgentOffice")
    AgentMembership = apps.get_model("app", "AgentMembership")

    for profile in Profile.objects.filter(role="customer", organization__isnull=False).select_related("user", "organization"):
        user = profile.user
        name = _unique_agent_name(AgentOffice, profile.organization, _agent_name(user))
        agent_office, _ = AgentOffice.objects.get_or_create(
            owner=user,
            defaults={
                "organization": profile.organization,
                "name": name,
                "country": profile.agent_country or "",
                "commission": profile.agent_commission,
                "salary": profile.agent_salary,
                "is_active": user.is_active,
            },
        )
        profile.agent_office = agent_office
        profile.save(update_fields=["agent_office"])
        AgentMembership.objects.update_or_create(
            user=user,
            defaults={
                "agent_office": agent_office,
                "role": "owner",
                "is_active": user.is_active,
            },
        )

    for profile in Profile.objects.filter(role="staff", organization__isnull=False).select_related("user", "organization"):
        side = (profile.staff_side or "").strip()
        if not side or side == profile.organization.name:
            continue
        agent_office = (
            AgentOffice.objects.filter(organization=profile.organization, name__iexact=side).first()
            or AgentOffice.objects.filter(organization=profile.organization, owner__first_name__iexact=side).first()
            or AgentOffice.objects.filter(organization=profile.organization, owner__username__iexact=side).first()
        )
        if not agent_office:
            continue
        profile.agent_office = agent_office
        profile.staff_side = agent_office.name
        profile.save(update_fields=["agent_office", "staff_side"])
        AgentMembership.objects.update_or_create(
            user=profile.user,
            defaults={
                "agent_office": agent_office,
                "role": "staff",
                "is_active": profile.user.is_active,
            },
        )


def backwards(apps, schema_editor):
    AgentMembership = apps.get_model("app", "AgentMembership")
    AgentOffice = apps.get_model("app", "AgentOffice")
    AgentMembership.objects.all().delete()
    AgentOffice.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0025_employee_employment_discontinuation_requested"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AgentOffice",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=255)),
                ("country", models.CharField(blank=True, default="", max_length=120)),
                ("commission", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("salary", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="agent_offices", to="app.organization")),
                ("owner", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="owned_agent_office", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.AddField(
            model_name="profile",
            name="agent_office",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="profiles", to="app.agentoffice"),
        ),
        migrations.CreateModel(
            name="AgentMembership",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(choices=[("owner", "Owner"), ("staff", "Staff")], default="staff", max_length=20)),
                ("is_active", models.BooleanField(default=True)),
                ("joined_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("agent_office", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="memberships", to="app.agentoffice")),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="agent_membership", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["agent_office__name", "user__username"],
            },
        ),
        migrations.AddConstraint(
            model_name="agentoffice",
            constraint=models.UniqueConstraint(fields=("organization", "name"), name="unique_agent_office_name_per_organization"),
        ),
        migrations.RunPython(forwards, backwards),
    ]
