from decimal import Decimal

from django.contrib.auth.models import User
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver


class Organization(models.Model):
    STATUS_PENDING = "pending"
    STATUS_ACTIVE = "active"
    STATUS_GRACE = "grace"
    STATUS_SUSPENDED = "suspended"
    STATUS_CANCELLED = "cancelled"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_GRACE, "Grace"),
        (STATUS_SUSPENDED, "Suspended"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    REPUTATION_LOW = "low"
    REPUTATION_STANDARD = "standard"
    REPUTATION_TRUSTED = "trusted"

    REPUTATION_CHOICES = [
        (REPUTATION_LOW, "Low"),
        (REPUTATION_STANDARD, "Standard"),
        (REPUTATION_TRUSTED, "Trusted"),
    ]

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    company_reference = models.CharField(max_length=120, unique=True, null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    billing_contact_name = models.CharField(max_length=255, blank=True, default="")
    billing_contact_email = models.EmailField(blank=True, default="")
    reputation_tier = models.CharField(
        max_length=20,
        choices=REPUTATION_CHOICES,
        default=REPUTATION_STANDARD,
    )
    read_only_mode = models.BooleanField(default=False)
    created_by_company = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ProductPlan(models.Model):
    DEFAULT_FEATURE_FLAGS = {
        "registration_enabled": True,
        "email_password_login_enabled": True,
        "google_login_enabled": True,
        "employees_enabled": True,
        "users_management_enabled": True,
        "audit_log_enabled": True,
    }

    code = models.SlugField(max_length=50, unique=True)
    company_reference = models.CharField(max_length=120, unique=True, null=True, blank=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")
    monthly_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    currency = models.CharField(max_length=8, default="USD")
    max_superadmins = models.PositiveIntegerField(default=1)
    max_admins = models.PositiveIntegerField(default=1)
    max_staff = models.PositiveIntegerField(default=4)
    max_customers = models.PositiveIntegerField(default=5)
    feature_flags = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        merged_flags = dict(self.DEFAULT_FEATURE_FLAGS)
        merged_flags.update(self.feature_flags or {})
        self.feature_flags = merged_flags
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class OrganizationSubscription(models.Model):
    STATUS_TRIAL = "trial"
    STATUS_ACTIVE = "active"
    STATUS_GRACE = "grace"
    STATUS_SUSPENDED = "suspended"
    STATUS_CANCELLED = "cancelled"
    STATUS_EXPIRED = "expired"

    STATUS_CHOICES = [
        (STATUS_TRIAL, "Trial"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_GRACE, "Grace"),
        (STATUS_SUSPENDED, "Suspended"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_EXPIRED, "Expired"),
    ]

    PAYMENT_PENDING = "pending"
    PAYMENT_PAID = "paid"
    PAYMENT_FAILED = "failed"
    PAYMENT_CANCELLED = "cancelled"

    PAYMENT_STATUS_CHOICES = [
        (PAYMENT_PENDING, "Pending"),
        (PAYMENT_PAID, "Paid"),
        (PAYMENT_FAILED, "Failed"),
        (PAYMENT_CANCELLED, "Cancelled"),
    ]

    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="subscription",
    )
    company_reference = models.CharField(max_length=120, unique=True, null=True, blank=True)
    plan = models.ForeignKey(
        ProductPlan,
        on_delete=models.PROTECT,
        related_name="subscriptions",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_TRIAL,
    )
    starts_at = models.DateTimeField(null=True, blank=True)
    renews_at = models.DateTimeField(null=True, blank=True)
    grace_ends_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    last_payment_status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUS_CHOICES,
        default=PAYMENT_PENDING,
    )
    manual_notes = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["organization__name"]

    def __str__(self):
        return f"{self.organization} - {self.plan} ({self.status})"


class Profile(models.Model):
    ROLE_SUPERADMIN = "superadmin"
    ROLE_ADMIN = "admin"
    ROLE_STAFF = "staff"
    ROLE_CUSTOMER = "customer"

    ROLE_CHOICES = [
        (ROLE_SUPERADMIN, "Super admin"),
        (ROLE_ADMIN, "Admin"),
        (ROLE_STAFF, "Staff"),
        (ROLE_CUSTOMER, "Agent"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    organization = models.ForeignKey(
        Organization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="profiles",
    )
    role = models.CharField(max_length=50, choices=ROLE_CHOICES, default=ROLE_CUSTOMER)
    phone = models.CharField(max_length=30, blank=True, default="")
    agent_country = models.CharField(max_length=120, blank=True, default="")
    agent_commission = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )
    agent_salary = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    staff_side = models.CharField(max_length=255, blank=True, default="")
    staff_level = models.PositiveIntegerField(default=1)
    staff_level_label = models.CharField(max_length=120, blank=True, default="")
    email_verified = models.BooleanField(default=False)
    google_sub = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        unique=True,
        help_text="Google account subject (sub) when linked",
    )
    failed_login_attempts = models.PositiveIntegerField(default=0)
    login_locked_until = models.DateTimeField(null=True, blank=True)
    email_verification_code_hash = models.CharField(max_length=64, blank=True, default="")
    email_verification_code_expires = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.user.username


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.get_or_create(
            user=instance,
            defaults={"role": Profile.ROLE_CUSTOMER},
        )


class UserPreferences(models.Model):
    THEME_LIGHT = "light"
    THEME_DARK = "dark"
    THEME_SYSTEM = "system"
    THEME_CHOICES = [
        (THEME_LIGHT, "Light"),
        (THEME_DARK, "Dark"),
        (THEME_SYSTEM, "System"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="preferences")
    theme = models.CharField(max_length=20, choices=THEME_CHOICES, default=THEME_SYSTEM)
    timezone = models.CharField(max_length=64, default="UTC")
    language = models.CharField(max_length=16, default="en")
    email_notifications = models.BooleanField(default=True)

    def __str__(self):
        return f"Preferences({self.user.username})"


@receiver(post_save, sender=User)
def create_user_preferences(sender, instance, created, **kwargs):
    if created:
        UserPreferences.objects.get_or_create(user=instance)


class OrganizationMembership(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="organization_membership",
    )
    role = models.CharField(
        max_length=50,
        choices=Profile.ROLE_CHOICES,
        default=Profile.ROLE_CUSTOMER,
    )
    is_owner = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    joined_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["organization__name", "user__username"]

    def __str__(self):
        return f"{self.user.username} @ {self.organization.name}"


class PlatformSettings(models.Model):
    DEFAULT_FEATURE_FLAGS = {
        "registration_enabled": True,
        "email_password_login_enabled": True,
        "google_login_enabled": True,
        "employees_enabled": True,
        "users_management_enabled": True,
        "audit_log_enabled": True,
    }
    DEFAULT_ROLE_PERMISSIONS = {
        Profile.ROLE_SUPERADMIN: [
            "users.manage_all",
            "audit.view",
            "platform.manage",
        ],
        Profile.ROLE_ADMIN: [
            "users.manage_limited",
            "audit.view",
        ],
        Profile.ROLE_STAFF: [],
        Profile.ROLE_CUSTOMER: [],
    }

    login_max_failed_attempts = models.PositiveIntegerField(default=5)
    login_lockout_minutes = models.PositiveIntegerField(default=15)
    feature_flags = models.JSONField(default=dict, blank=True)
    role_permissions = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get_solo(cls):
        return cls.objects.get_or_create(pk=1)[0]

    def save(self, *args, **kwargs):
        self.pk = 1
        merged_flags = dict(self.DEFAULT_FEATURE_FLAGS)
        merged_flags.update(self.feature_flags or {})
        self.feature_flags = merged_flags

        merged_permissions = {
            role: list(perms)
            for role, perms in self.DEFAULT_ROLE_PERMISSIONS.items()
        }
        for role, perms in (self.role_permissions or {}).items():
            merged_permissions[role] = list(dict.fromkeys(perms or []))
        self.role_permissions = merged_permissions
        super().save(*args, **kwargs)

    def __str__(self):
        return "Platform settings"


class Notification(models.Model):
    KIND_INFO = "info"
    KIND_SUCCESS = "success"
    KIND_WARNING = "warning"
    KIND_CHOICES = [
        (KIND_INFO, "Info"),
        (KIND_SUCCESS, "Success"),
        (KIND_WARNING, "Warning"),
    ]

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="notifications"
    )
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default="")
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_INFO)
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.user.username})"


class AuditLog(models.Model):
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_actions",
    )
    action = models.CharField(max_length=64)
    resource_type = models.CharField(max_length=64, blank=True, default="")
    resource_id = models.IntegerField(null=True, blank=True)
    summary = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} @ {self.created_at}"


class LicenseEvent(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="license_events",
    )
    subscription = models.ForeignKey(
        OrganizationSubscription,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
    )
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="license_actions",
    )
    action = models.CharField(max_length=64)
    old_status = models.CharField(max_length=20, blank=True, default="")
    new_status = models.CharField(max_length=20, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.organization} - {self.action}"


class Employee(models.Model):
    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_SUSPENDED = "suspended"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending approval"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_SUSPENDED, "Suspended"),
    ]

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="employees",
    )
    registered_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="registered_employees",
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_employees",
    )
    first_name = models.CharField(max_length=120, blank=True, default="")
    middle_name = models.CharField(max_length=120, blank=True, default="")
    last_name = models.CharField(max_length=120, blank=True, default="")
    full_name = models.CharField(max_length=255)
    professional_title = models.CharField(max_length=255, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=40, blank=True, default="")
    address = models.CharField(max_length=255, blank=True, default="")
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=30, blank=True, default="")
    id_number = models.CharField(max_length=120, blank=True, default="")
    passport_number = models.CharField(max_length=120, blank=True, default="")
    labour_id = models.CharField(max_length=120, blank=True, default="")
    mobile_number = models.CharField(max_length=40, blank=True, default="")
    application_countries = models.JSONField(default=list, blank=True)
    profession = models.CharField(max_length=120, blank=True, default="")
    employment_type = models.CharField(max_length=30, blank=True, default="")
    experiences = models.JSONField(default=list, blank=True)
    application_salary = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    summary = models.TextField(blank=True, default="")
    education = models.TextField(blank=True, default="")
    experience = models.TextField(blank=True, default="")
    skills = models.JSONField(default=list, blank=True)
    certifications = models.TextField(blank=True, default="")
    languages = models.JSONField(default=list, blank=True)
    references = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    religion = models.CharField(max_length=80, blank=True, default="")
    marital_status = models.CharField(max_length=80, blank=True, default="")
    children_count = models.PositiveIntegerField(default=0)
    residence_country = models.CharField(max_length=120, blank=True, default="")
    nationality = models.CharField(max_length=120, blank=True, default="")
    birth_place = models.CharField(max_length=120, blank=True, default="")
    weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    height_cm = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    contact_person_name = models.CharField(max_length=255, blank=True, default="")
    contact_person_id_number = models.CharField(max_length=120, blank=True, default="")
    contact_person_mobile = models.CharField(max_length=40, blank=True, default="")
    did_travel = models.BooleanField(default=False)
    departure_date = models.DateField(null=True, blank=True)
    return_ticket_date = models.DateField(null=True, blank=True)
    passport_expires_on = models.DateField(null=True, blank=True)
    medical_expires_on = models.DateField(null=True, blank=True)
    contract_expires_on = models.DateField(null=True, blank=True)
    visa_expires_on = models.DateField(null=True, blank=True)
    competency_certificate_expires_on = models.DateField(null=True, blank=True)
    clearance_expires_on = models.DateField(null=True, blank=True)
    insurance_expires_on = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    progress_override_complete = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["full_name", "-created_at"]

    def save(self, *args, **kwargs):
        parts = [self.first_name, self.middle_name, self.last_name]
        computed_full_name = " ".join(part.strip() for part in parts if (part or "").strip())
        if computed_full_name:
            self.full_name = computed_full_name
        if self.profession and not self.professional_title:
            self.professional_title = self.profession
        if self.status == self.STATUS_APPROVED and not self.did_travel:
            self.is_active = True
        else:
            self.is_active = False
        super().save(*args, **kwargs)

    def __str__(self):
        return self.full_name


def employee_document_upload_to(instance, filename):
    employee_id = instance.employee_id or "unassigned"
    return f"employees/{employee_id}/{filename}"


class EmployeeDocument(models.Model):
    TYPE_PORTRAIT = "portrait_photo"
    TYPE_FULL = "full_photo"
    TYPE_PASSPORT = "passport_photo"
    TYPE_PASSPORT_SCAN = "passport_document"
    TYPE_EMPLOYEE_ID = "employee_id"
    TYPE_CONTACT_PERSON_ID = "contact_person_id"
    TYPE_MEDICAL = "medical_result"
    TYPE_COMPETENCY = "certificate_of_competency"
    TYPE_CONTRACT = "contract"
    TYPE_VISA = "visa"
    TYPE_INSURANCE = "insurance"
    TYPE_CLEARANCE = "clearance"
    TYPE_DEPARTURE_TICKET = "departure_ticket"
    TYPE_RETURN_TICKET = "return_ticket"
    TYPE_CV = "cv_document"
    TYPE_CERTIFICATE = "certificate"
    TYPE_OPTION_1 = "att_option_1"
    TYPE_OPTION_2 = "att_option_2"
    TYPE_OPTION_3 = "att_option_3"
    TYPE_OTHER = "other"

    TYPE_CHOICES = [
        (TYPE_PORTRAIT, "Portrait photo 3x4"),
        (TYPE_FULL, "Full photo"),
        (TYPE_PASSPORT, "Passport photo"),
        (TYPE_PASSPORT_SCAN, "Passport"),
        (TYPE_EMPLOYEE_ID, "Employee ID"),
        (TYPE_CONTACT_PERSON_ID, "Contact person ID"),
        (TYPE_MEDICAL, "Medical result"),
        (TYPE_COMPETENCY, "Certificate of competency"),
        (TYPE_CONTRACT, "Contract"),
        (TYPE_VISA, "Visa"),
        (TYPE_INSURANCE, "Insurance"),
        (TYPE_CLEARANCE, "Clearance"),
        (TYPE_DEPARTURE_TICKET, "Departure ticket"),
        (TYPE_RETURN_TICKET, "Return ticket"),
        (TYPE_CV, "CV document"),
        (TYPE_CERTIFICATE, "Certificate"),
        (TYPE_OPTION_1, "Attachment option 1"),
        (TYPE_OPTION_2, "Attachment option 2"),
        (TYPE_OPTION_3, "Attachment option 3"),
        (TYPE_OTHER, "Other"),
    ]

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="documents",
    )
    document_type = models.CharField(max_length=50, choices=TYPE_CHOICES, default=TYPE_OTHER)
    label = models.CharField(max_length=120, blank=True, default="")
    file = models.FileField(upload_to=employee_document_upload_to)
    expires_on = models.DateField(null=True, blank=True)
    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee_documents_uploaded",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["document_type", "-created_at"]

    def __str__(self):
        return self.label or self.file.name.rsplit("/", 1)[-1]


class EmployeeSelection(models.Model):
    STATUS_SELECTED = "selected"
    STATUS_UNDER_PROCESS = "under_process"
    STATUS_CHOICES = [
        (STATUS_SELECTED, "Selected"),
        (STATUS_UNDER_PROCESS, "Under process"),
    ]

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="employee_selections",
    )
    employee = models.OneToOneField(
        Employee,
        on_delete=models.CASCADE,
        related_name="selection",
    )
    agent = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="selected_employees",
    )
    selected_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee_selections_made",
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default=STATUS_SELECTED,
    )
    process_initiated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee_processes_initiated",
    )
    process_started_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "employee"],
                name="unique_employee_selection_per_organization",
            )
        ]

    def __str__(self):
        return f"{self.employee.full_name} -> {self.agent.username}"
