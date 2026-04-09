from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def migrate_selected_rows_to_interests(apps, schema_editor):
    EmployeeSelection = apps.get_model("app", "EmployeeSelection")
    EmployeeSelectionInterest = apps.get_model("app", "EmployeeSelectionInterest")

    selected_rows = EmployeeSelection.objects.filter(status="selected")
    for row in selected_rows.iterator():
      EmployeeSelectionInterest.objects.get_or_create(
          organization_id=row.organization_id,
          employee_id=row.employee_id,
          agent_id=row.agent_id,
          defaults={
              "selected_by_id": row.selected_by_id,
              "created_at": row.created_at,
              "updated_at": row.updated_at,
          },
      )
    selected_rows.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0021_employee_return_request_and_returned_state"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmployeeSelectionInterest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("agent", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="employee_selection_interests", to=settings.AUTH_USER_MODEL)),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="selection_interests", to="app.employee")),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="employee_selection_interests", to="app.organization")),
                ("selected_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="employee_selection_interests_made", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-updated_at"],
                "constraints": [
                    models.UniqueConstraint(fields=("organization", "employee", "agent"), name="unique_employee_selection_interest_per_agent"),
                ],
            },
        ),
        migrations.RunPython(migrate_selected_rows_to_interests, migrations.RunPython.noop),
    ]
