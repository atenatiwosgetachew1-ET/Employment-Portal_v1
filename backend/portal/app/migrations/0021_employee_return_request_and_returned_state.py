from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

import app.models


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0020_employee_progress_override_complete"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="returned_from_employment",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="employee",
            name="returned_recorded_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="employees_returned_recorded",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.CreateModel(
            name="EmployeeReturnRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("pending", "Pending"), ("approved", "Approved"), ("refused", "Refused"), ("cancelled", "Cancelled")], default="pending", max_length=20)),
                ("remark", models.TextField(blank=True, default="")),
                ("evidence_file_1", models.FileField(blank=True, null=True, upload_to=app.models.employee_return_request_upload_to)),
                ("evidence_file_2", models.FileField(blank=True, null=True, upload_to=app.models.employee_return_request_upload_to)),
                ("evidence_file_3", models.FileField(blank=True, null=True, upload_to=app.models.employee_return_request_upload_to)),
                ("requested_at", models.DateTimeField(auto_now_add=True)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("approved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="employee_return_requests_approved", to=settings.AUTH_USER_MODEL)),
                ("employee", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="return_request", to="app.employee")),
                ("requested_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="employee_return_requests_requested", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-requested_at"]},
        ),
    ]
