from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0022_employeeselectioninterest"),
    ]

    operations = [
        migrations.AddField(
            model_name="notification",
            name="remind_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
