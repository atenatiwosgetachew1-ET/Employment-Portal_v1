from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0023_notification_remind_at"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    ALTER TABLE app_employeereturnrequest
                    ADD COLUMN IF NOT EXISTS organization_id bigint NULL;
                    UPDATE app_employeereturnrequest AS req
                    SET organization_id = emp.organization_id
                    FROM app_employee AS emp
                    WHERE req.employee_id = emp.id
                      AND req.organization_id IS NULL;
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'app_employeereturnrequest_organization_id_fk'
                        ) THEN
                            ALTER TABLE app_employeereturnrequest
                            ADD CONSTRAINT app_employeereturnrequest_organization_id_fk
                            FOREIGN KEY (organization_id)
                            REFERENCES app_organization (id)
                            DEFERRABLE INITIALLY DEFERRED;
                        END IF;
                    END $$;
                    CREATE INDEX IF NOT EXISTS app_employeereturnrequest_organization_id_idx
                    ON app_employeereturnrequest (organization_id);
                    ALTER TABLE app_employeereturnrequest
                    ALTER COLUMN organization_id SET NOT NULL;
                    """,
                    reverse_sql="""
                    ALTER TABLE app_employeereturnrequest
                    ALTER COLUMN organization_id DROP NOT NULL;
                    """,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="employeereturnrequest",
                    name="organization",
                    field=models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="employee_return_requests",
                        to="app.organization",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="EmployeeTravelBooking",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ticket_number", models.CharField(blank=True, default="", max_length=120)),
                ("pnr", models.CharField(blank=True, default="", max_length=32)),
                ("airline", models.CharField(blank=True, default="", max_length=120)),
                ("origin", models.CharField(blank=True, default="", max_length=16)),
                ("destination", models.CharField(blank=True, default="", max_length=16)),
                ("departure_date", models.DateField(blank=True, null=True)),
                ("departure_time", models.TimeField(blank=True, null=True)),
                ("arrival_date", models.DateField(blank=True, null=True)),
                ("arrival_time", models.TimeField(blank=True, null=True)),
                ("route_summary", models.CharField(blank=True, default="", max_length=255)),
                ("notes", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="employee_travel_bookings_created", to=settings.AUTH_USER_MODEL)),
                ("employee", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="travel_booking", to="app.employee")),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="employee_travel_bookings", to="app.organization")),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="employee_travel_bookings_updated", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-updated_at"],
            },
        ),
    ]
