from django.db import migrations, models


def set_existing_employee_statuses(apps, schema_editor):
    Employee = apps.get_model("app", "Employee")
    for employee in Employee.objects.all():
        if employee.is_active and not employee.did_travel:
            employee.status = "approved"
        elif employee.did_travel:
            employee.status = "approved"
        else:
            employee.status = "pending"
        employee.save(update_fields=["status", "is_active"])


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0016_employee_application_countries_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending approval"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                    ("suspended", "Suspended"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.RunPython(set_existing_employee_statuses, migrations.RunPython.noop),
    ]
