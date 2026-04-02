from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0019_employeeselection_process_state"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="progress_override_complete",
            field=models.BooleanField(default=False),
        ),
    ]
