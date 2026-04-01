from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app", "0013_organization_company_reference_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="staff_level",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name="profile",
            name="staff_level_label",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="profile",
            name="staff_side",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
