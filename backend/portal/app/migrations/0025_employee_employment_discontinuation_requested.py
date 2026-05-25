from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0024_employee_return_request_org_and_travel_booking"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    ALTER TABLE app_employee
                    ADD COLUMN IF NOT EXISTS employment_discontinuation_requested boolean NOT NULL DEFAULT FALSE;
                    """,
                    reverse_sql="""
                    ALTER TABLE app_employee
                    DROP COLUMN IF EXISTS employment_discontinuation_requested;
                    """,
                )
            ],
            state_operations=[
                migrations.AddField(
                    model_name="employee",
                    name="employment_discontinuation_requested",
                    field=models.BooleanField(default=False),
                )
            ],
        ),
    ]

