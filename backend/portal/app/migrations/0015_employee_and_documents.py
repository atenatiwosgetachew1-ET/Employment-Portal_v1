from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import app.models


class Migration(migrations.Migration):
    dependencies = [
        ("app", "0014_profile_staff_side_level_fields"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Employee",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("full_name", models.CharField(max_length=255)),
                ("professional_title", models.CharField(blank=True, default="", max_length=255)),
                ("email", models.EmailField(blank=True, default="", max_length=254)),
                ("phone", models.CharField(blank=True, default="", max_length=40)),
                ("address", models.CharField(blank=True, default="", max_length=255)),
                ("summary", models.TextField(blank=True, default="")),
                ("education", models.TextField(blank=True, default="")),
                ("experience", models.TextField(blank=True, default="")),
                ("skills", models.TextField(blank=True, default="")),
                ("certifications", models.TextField(blank=True, default="")),
                ("languages", models.TextField(blank=True, default="")),
                ("references", models.TextField(blank=True, default="")),
                ("notes", models.TextField(blank=True, default="")),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="employees", to="app.organization")),
                ("registered_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="registered_employees", to=settings.AUTH_USER_MODEL)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="updated_employees", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["full_name", "-created_at"]},
        ),
        migrations.CreateModel(
            name="EmployeeDocument",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("document_type", models.CharField(choices=[("portrait_photo", "Portrait photo"), ("full_photo", "Full photo"), ("passport_photo", "Passport photo"), ("cv_document", "CV document"), ("certificate", "Certificate"), ("other", "Other")], default="other", max_length=50)),
                ("label", models.CharField(blank=True, default="", max_length=120)),
                ("file", models.FileField(upload_to=app.models.employee_document_upload_to)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="documents", to="app.employee")),
                ("uploaded_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="employee_documents_uploaded", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["document_type", "-created_at"]},
        ),
    ]
