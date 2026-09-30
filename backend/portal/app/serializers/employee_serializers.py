import os

from rest_framework import serializers

from ..employee_selection import agent_display_name, get_selection_agent_for_user
from ..licensing import get_user_organization
from ..models import (
    Employee,
    EmployeeDocument,
    EmployeeReturnRequest,
    EmployeeSelection,
    EmployeeSelectionInterest,
    EmployeeTravelBooking,
    Profile,
)
from .helpers import (
    ALLOWED_EMPLOYEE_DOCUMENT_EXTENSIONS,
    ALLOWED_EMPLOYEE_DOCUMENT_MIME_TYPES,
    EMPLOYEE_MINIMUM_AGE,
    build_employee_progress_status,
    build_employee_return_status,
    build_employee_travel_status,
    build_employee_urgency_alerts,
    calculate_age,
    normalize_phone,
)


class EmployeeDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeDocument
        fields = (
            "id",
            "document_type",
            "label",
            "file",
            "file_url",
            "expires_on",
            "uploaded_by_username",
            "created_at",
        )
        read_only_fields = ("id", "file_url", "uploaded_by_username", "created_at")

    def get_file_url(self, obj):
        request = self.context.get("request")
        if not obj.file:
            return ""
        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url


class EmployeeSelectionSerializer(serializers.ModelSerializer):
    agent_name = serializers.SerializerMethodField()
    selected_by_username = serializers.CharField(source="selected_by.username", read_only=True)
    process_initiated_by_username = serializers.CharField(
        source="process_initiated_by.username",
        read_only=True,
    )

    class Meta:
        model = EmployeeSelection
        fields = (
            "agent",
            "agent_name",
            "selected_by",
            "selected_by_username",
            "status",
            "process_initiated_by",
            "process_initiated_by_username",
            "process_started_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_agent_name(self, obj):
        return agent_display_name(obj.agent)


class EmployeeSelectionInterestSerializer(serializers.ModelSerializer):
    agent_name = serializers.SerializerMethodField()
    selected_by_username = serializers.CharField(source="selected_by.username", read_only=True)
    status = serializers.SerializerMethodField()
    process_initiated_by = serializers.SerializerMethodField()
    process_initiated_by_username = serializers.SerializerMethodField()
    process_started_at = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeSelectionInterest
        fields = (
            "agent",
            "agent_name",
            "selected_by",
            "selected_by_username",
            "status",
            "process_initiated_by",
            "process_initiated_by_username",
            "process_started_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_agent_name(self, obj):
        return agent_display_name(obj.agent)

    def get_status(self, obj):
        return EmployeeSelection.STATUS_SELECTED

    def get_process_initiated_by(self, obj):
        return None

    def get_process_initiated_by_username(self, obj):
        return None

    def get_process_started_at(self, obj):
        return None


class EmployeeReturnRequestSerializer(serializers.ModelSerializer):
    requested_by_username = serializers.CharField(
        source="requested_by.username",
        read_only=True,
        allow_null=True,
    )
    requested_by_id = serializers.IntegerField(
        source="requested_by.id",
        read_only=True,
        allow_null=True,
    )
    approved_by_username = serializers.CharField(
        source="approved_by.username",
        read_only=True,
        allow_null=True,
    )
    evidence_file_1_url = serializers.SerializerMethodField()
    evidence_file_2_url = serializers.SerializerMethodField()
    evidence_file_3_url = serializers.SerializerMethodField()
    requested_by_side = serializers.SerializerMethodField()
    is_requester = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeReturnRequest
        fields = (
            "status",
            "remark",
            "requested_by_id",
            "requested_by_username",
            "requested_by_side",
            "is_requester",
            "requested_at",
            "approved_by_username",
            "approved_at",
            "evidence_file_1_url",
            "evidence_file_2_url",
            "evidence_file_3_url",
            "updated_at",
        )
        read_only_fields = fields

    def _build_file_url(self, obj, field_name):
        request = self.context.get("request")
        file_obj = getattr(obj, field_name, None)
        if not file_obj:
            return ""
        if request:
            return request.build_absolute_uri(file_obj.url)
        return file_obj.url

    def get_evidence_file_1_url(self, obj):
        return self._build_file_url(obj, "evidence_file_1")

    def get_evidence_file_2_url(self, obj):
        return self._build_file_url(obj, "evidence_file_2")

    def get_evidence_file_3_url(self, obj):
        return self._build_file_url(obj, "evidence_file_3")

    def get_requested_by_side(self, obj):
        if not obj.requested_by:
            return "organization"
        profile = getattr(obj.requested_by, "profile", None)
        if not profile:
            return "organization"
        if profile.role == Profile.ROLE_CUSTOMER:
            return "agent"
        staff_side = (profile.staff_side or "").strip()
        org_name = (obj.organization.name or "").strip() if obj.organization else ""
        if staff_side and staff_side != org_name:
            return "agent"
        return "organization"

    def get_is_requester(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        if obj.requested_by_id == request.user.id:
            return True
        user_profile = getattr(request.user, "profile", None)
        user_is_agent = False
        if user_profile:
            if user_profile.role == Profile.ROLE_CUSTOMER:
                user_is_agent = True
            elif user_profile.role == Profile.ROLE_STAFF:
                staff_side = (user_profile.staff_side or "").strip()
                org_name = (obj.organization.name or "").strip() if obj.organization else ""
                if staff_side and staff_side != org_name:
                    user_is_agent = True
        req_side = self.get_requested_by_side(obj)
        return (user_is_agent and req_side == "agent") or (not user_is_agent and req_side == "organization")


class EmployeeTravelBookingSerializer(serializers.ModelSerializer):
    employeeId = serializers.IntegerField(source="employee_id", read_only=True)
    ticketNumber = serializers.CharField(source="ticket_number")
    departureDate = serializers.DateField(source="departure_date", allow_null=True, required=False)
    departureTime = serializers.TimeField(
        source="departure_time",
        allow_null=True,
        required=False,
        format="%H:%M",
        input_formats=["%H:%M", "%H:%M:%S"],
    )
    arrivalDate = serializers.DateField(source="arrival_date", allow_null=True, required=False)
    arrivalTime = serializers.TimeField(
        source="arrival_time",
        allow_null=True,
        required=False,
        format="%H:%M",
        input_formats=["%H:%M", "%H:%M:%S"],
    )
    routeSummary = serializers.CharField(source="route_summary", allow_blank=True, required=False)
    savedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = EmployeeTravelBooking
        fields = (
            "employeeId",
            "ticketNumber",
            "pnr",
            "airline",
            "origin",
            "destination",
            "departureDate",
            "departureTime",
            "arrivalDate",
            "arrivalTime",
            "routeSummary",
            "notes",
            "savedAt",
        )
        read_only_fields = ("employeeId", "savedAt")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        next_ticket_number = attrs.get("ticket_number", getattr(instance, "ticket_number", ""))
        next_pnr = attrs.get("pnr", getattr(instance, "pnr", ""))
        next_origin = attrs.get("origin", getattr(instance, "origin", ""))
        next_destination = attrs.get("destination", getattr(instance, "destination", ""))
        next_departure_date = attrs.get("departure_date", getattr(instance, "departure_date", None))

        if not str(next_ticket_number or "").strip():
            raise serializers.ValidationError({"ticketNumber": "Ticket number is required."})
        if not str(next_pnr or "").strip():
            raise serializers.ValidationError({"pnr": "PNR is required."})
        if not str(next_origin or "").strip():
            raise serializers.ValidationError({"origin": "Origin airport is required."})
        if not str(next_destination or "").strip():
            raise serializers.ValidationError({"destination": "Destination airport is required."})
        if not next_departure_date:
            raise serializers.ValidationError({"departureDate": "Departure date is required."})

        if "pnr" in attrs:
            attrs["pnr"] = str(attrs["pnr"] or "").strip().upper()
        if "ticket_number" in attrs:
            attrs["ticket_number"] = str(attrs["ticket_number"] or "").strip()
        for field_name in ("airline", "origin", "destination", "route_summary", "notes"):
            if field_name in attrs:
                attrs[field_name] = str(attrs[field_name] or "").strip()
        return attrs


def build_employee_selection_payload(employee, request):
    process_selection = getattr(employee, "selection", None)
    interests = list(getattr(employee, "selection_interests", []).all()) if hasattr(getattr(employee, "selection_interests", None), "all") else []
    current_agent = None
    current_user = getattr(request, "user", None) if request else None
    if request and request.user.is_authenticated:
        current_agent = get_selection_agent_for_user(
            request.user,
            organization=employee.organization,
        )
    current_interest = None
    if current_agent:
        current_interest = next(
            (item for item in interests if item.agent_id == current_agent.id),
            None,
        )
    primary_interest = current_interest or (interests[0] if interests else None)
    current_user_id = getattr(current_user, "id", None)
    can_unselect = bool(
        current_interest
        and current_user_id
        and (
            current_interest.selected_by_id == current_user_id
            or (current_agent and current_agent.id == current_user_id)
        )
    )
    selection_payload = None
    if process_selection:
        selection_payload = EmployeeSelectionSerializer(process_selection).data
    elif primary_interest:
        selection_payload = EmployeeSelectionInterestSerializer(primary_interest).data
    return {
        "is_selected": bool(process_selection or interests),
        "selected_by_current_agent": bool(
            (process_selection and current_agent and process_selection.agent_id == current_agent.id)
            or current_interest
        ),
        "selected_by_current_account": bool(current_interest and current_interest.selected_by_id == current_user_id),
        "can_unselect": can_unselect,
        "selection": selection_payload,
        "selection_count": len(interests),
    }


class EmployeeListSerializer(serializers.ModelSerializer):
    registered_by_username = serializers.CharField(source="registered_by.username", read_only=True)
    documents = EmployeeDocumentSerializer(many=True, read_only=True)
    age = serializers.SerializerMethodField()
    progress_status = serializers.SerializerMethodField()
    travel_status = serializers.SerializerMethodField()
    return_status = serializers.SerializerMethodField()
    urgency_alerts = serializers.SerializerMethodField()
    selection_state = serializers.SerializerMethodField()
    return_request = serializers.SerializerMethodField()
    travel_booking = serializers.SerializerMethodField()
    returned_recorded_by_username = serializers.CharField(
        source="returned_recorded_by.username",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = Employee
        fields = (
            "id",
            "full_name",
            "first_name",
            "middle_name",
            "last_name",
            "professional_title",
            "profession",
            "email",
            "phone",
            "mobile_number",
            "passport_number",
            "gender",
            "date_of_birth",
            "marital_status",
            "residence_country",
            "nationality",
            "skills",
            "languages",
            "experience",
            "experiences",
            "application_countries",
            "religion",
            "status",
            "is_active",
            "age",
            "progress_status",
            "travel_status",
            "return_status",
            "urgency_alerts",
            "selection_state",
            "travel_booking",
            "return_request",
            "did_travel",
            "progress_override_complete",
            "returned_from_employment",
            "returned_recorded_by_username",
            "registered_by_username",
            "documents",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_age(self, obj):
        return calculate_age(obj.date_of_birth)

    def get_progress_status(self, obj):
        return build_employee_progress_status(obj)

    def get_travel_status(self, obj):
        return build_employee_travel_status(obj)

    def get_return_status(self, obj):
        return build_employee_return_status(obj)

    def get_urgency_alerts(self, obj):
        return build_employee_urgency_alerts(obj)

    def get_selection_state(self, obj):
        request = self.context.get("request")
        return build_employee_selection_payload(obj, request)

    def get_return_request(self, obj):
        request_obj = getattr(obj, "return_request", None)
        if not request_obj:
            return None
        return EmployeeReturnRequestSerializer(
            request_obj,
            context=self.context,
        ).data

    def get_travel_booking(self, obj):
        booking = getattr(obj, "travel_booking", None)
        if not booking:
            return None
        return EmployeeTravelBookingSerializer(booking, context=self.context).data


class EmployeeSerializer(serializers.ModelSerializer):
    status = serializers.ChoiceField(choices=Employee.STATUS_CHOICES, required=False)
    progress_override_complete = serializers.BooleanField(required=False)
    application_countries = serializers.ListField(
        child=serializers.CharField(max_length=120),
        required=False,
    )
    skills = serializers.ListField(
        child=serializers.CharField(max_length=120),
        required=False,
    )
    languages = serializers.ListField(
        child=serializers.CharField(max_length=120),
        required=False,
    )
    experiences = serializers.ListField(
        child=serializers.DictField(),
        required=False,
    )
    documents = EmployeeDocumentSerializer(many=True, read_only=True)
    registered_by_username = serializers.CharField(source="registered_by.username", read_only=True)
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True)
    age = serializers.SerializerMethodField()
    progress_status = serializers.SerializerMethodField()
    travel_status = serializers.SerializerMethodField()
    return_status = serializers.SerializerMethodField()
    urgency_alerts = serializers.SerializerMethodField()
    selection_state = serializers.SerializerMethodField()
    return_request = serializers.SerializerMethodField()
    travel_booking = serializers.SerializerMethodField()
    returned_recorded_by_username = serializers.CharField(
        source="returned_recorded_by.username",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = Employee
        fields = (
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "full_name",
            "professional_title",
            "email",
            "phone",
            "address",
            "date_of_birth",
            "age",
            "gender",
            "id_number",
            "passport_number",
            "labour_id",
            "mobile_number",
            "application_countries",
            "profession",
            "employment_type",
            "experiences",
            "application_salary",
            "summary",
            "education",
            "experience",
            "skills",
            "certifications",
            "languages",
            "references",
            "notes",
            "religion",
            "marital_status",
            "children_count",
            "residence_country",
            "nationality",
            "birth_place",
            "weight_kg",
            "height_cm",
            "contact_person_name",
            "contact_person_id_number",
            "contact_person_mobile",
            "did_travel",
            "departure_date",
            "return_ticket_date",
            "passport_expires_on",
            "medical_expires_on",
            "contract_expires_on",
            "visa_expires_on",
            "competency_certificate_expires_on",
            "clearance_expires_on",
            "insurance_expires_on",
            "returned_from_employment",
            "employment_discontinuation_requested",
            "status",
            "progress_override_complete",
            "is_active",
            "progress_status",
            "travel_status",
            "return_status",
            "urgency_alerts",
            "selection_state",
            "travel_booking",
            "return_request",
            "returned_recorded_by_username",
            "registered_by_username",
            "updated_by_username",
            "documents",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "full_name",
            "registered_by_username",
            "updated_by_username",
            "documents",
            "created_at",
            "updated_at",
        )

    def validate_mobile_number(self, value):
        return normalize_phone(value)

    def validate_contact_person_mobile(self, value):
        return normalize_phone(value)

    def validate_phone(self, value):
        return normalize_phone(value)

    def validate_experiences(self, value):
        cleaned = []
        for item in value or []:
            country = (item.get("country") or "").strip()
            years = item.get("years")
            if not country:
                continue
            try:
                years_value = int(years)
            except (TypeError, ValueError):
                raise serializers.ValidationError("Experience years must be numeric.")
            if years_value < 0:
                raise serializers.ValidationError("Experience years cannot be negative.")
            cleaned.append({"country": country, "years": years_value})
        return cleaned

    def validate_status(self, value):
        return (value or Employee.STATUS_PENDING).strip()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get("request")
        organization = (
            get_user_organization(getattr(request, "user", None)) if request else None
        )
        if self.instance and getattr(self, "partial", False):
            status_only_fields = {"status", "is_active"}
            if attrs and set(attrs.keys()).issubset(status_only_fields):
                attrs["status"] = attrs.get(
                    "status",
                    getattr(self.instance, "status", Employee.STATUS_PENDING),
                )
                return attrs
            required_partial_fields = {
                "first_name": "First name is required.",
                "middle_name": "Middle name is required.",
                "last_name": "Last name is required.",
                "passport_number": "Passport number is required.",
                "profession": "Profession is required.",
                "employment_type": "Type is required.",
                "religion": "Religion is required.",
                "marital_status": "Marital status is required.",
                "residence_country": "Residence country is required.",
                "contact_person_name": "Contact person name is required.",
                "contact_person_mobile": "Contact person mobile is required.",
            }
            for field_name, message in required_partial_fields.items():
                if field_name in attrs and not (attrs.get(field_name) or "").strip():
                    raise serializers.ValidationError({field_name: message})
            if "date_of_birth" in attrs:
                if not attrs.get("date_of_birth"):
                    raise serializers.ValidationError(
                        {"date_of_birth": "Date of birth is required."}
                    )
                age = calculate_age(attrs["date_of_birth"])
                if age is not None and age < EMPLOYEE_MINIMUM_AGE:
                    raise serializers.ValidationError(
                        {
                            "date_of_birth": f"Employee must be at least {EMPLOYEE_MINIMUM_AGE} years old."
                        }
                    )
            if "application_countries" in attrs and not attrs.get("application_countries"):
                raise serializers.ValidationError(
                    {"application_countries": "Select at least one destination country."}
                )
            if "skills" in attrs and not attrs.get("skills"):
                raise serializers.ValidationError({"skills": "Select at least one skill."})
            if "application_salary" in attrs and attrs.get("application_salary") in (None, ""):
                raise serializers.ValidationError(
                    {"application_salary": "Salary is required."}
                )
            attrs["status"] = attrs.get(
                "status",
                getattr(self.instance, "status", Employee.STATUS_PENDING),
            )
            passport_number = (
                (attrs.get("passport_number") or getattr(self.instance, "passport_number", "") or "")
                .strip()
            )
            if organization and passport_number:
                existing = (
                    Employee.objects.filter(
                        organization=organization,
                        passport_number=passport_number,
                    )
                    .exclude(pk=getattr(self.instance, "pk", None))
                    .exists()
                )
                if existing:
                    raise serializers.ValidationError(
                        {"passport_number": "Employee with this passport number already exists."}
                    )
            return attrs
        if not (attrs.get("first_name") or getattr(self.instance, "first_name", "")):
            raise serializers.ValidationError({"first_name": "First name is required."})
        if not (attrs.get("middle_name") or getattr(self.instance, "middle_name", "")):
            raise serializers.ValidationError({"middle_name": "Middle name is required."})
        if not (attrs.get("last_name") or getattr(self.instance, "last_name", "")):
            raise serializers.ValidationError({"last_name": "Last name is required."})
        if not (attrs.get("date_of_birth") or getattr(self.instance, "date_of_birth", None)):
            raise serializers.ValidationError({"date_of_birth": "Date of birth is required."})
        date_of_birth = attrs.get(
            "date_of_birth",
            getattr(self.instance, "date_of_birth", None),
        )
        age = calculate_age(date_of_birth)
        if age is not None and age < EMPLOYEE_MINIMUM_AGE:
            raise serializers.ValidationError(
                {
                    "date_of_birth": f"Employee must be at least {EMPLOYEE_MINIMUM_AGE} years old."
                }
            )
        if not (attrs.get("passport_number") or getattr(self.instance, "passport_number", "")):
            raise serializers.ValidationError(
                {"passport_number": "Passport number is required."}
            )
        passport_number = (
            (attrs.get("passport_number") or getattr(self.instance, "passport_number", "") or "")
            .strip()
        )
        if organization and passport_number:
            existing = (
                Employee.objects.filter(
                    organization=organization,
                    passport_number=passport_number,
                )
                .exclude(pk=getattr(self.instance, "pk", None))
                .exists()
            )
            if existing:
                raise serializers.ValidationError(
                    {"passport_number": "Employee with this passport number already exists."}
                )
        application_countries = attrs.get(
            "application_countries",
            getattr(self.instance, "application_countries", []),
        )
        if not application_countries:
            raise serializers.ValidationError(
                {"application_countries": "Select at least one destination country."}
            )
        skills = attrs.get("skills", getattr(self.instance, "skills", []))
        if not skills:
            raise serializers.ValidationError({"skills": "Select at least one skill."})
        profession = attrs.get("profession", getattr(self.instance, "profession", ""))
        if not profession:
            raise serializers.ValidationError({"profession": "Profession is required."})
        employment_type = attrs.get(
            "employment_type",
            getattr(self.instance, "employment_type", ""),
        )
        if not employment_type:
            raise serializers.ValidationError({"employment_type": "Type is required."})
        application_salary = attrs.get(
            "application_salary",
            getattr(self.instance, "application_salary", None),
        )
        if application_salary in (None, ""):
            raise serializers.ValidationError(
                {"application_salary": "Salary is required."}
            )
        religion = (attrs.get("religion", getattr(self.instance, "religion", "")) or "").strip()
        if not religion:
            raise serializers.ValidationError({"religion": "Religion is required."})
        marital_status = (
            attrs.get("marital_status", getattr(self.instance, "marital_status", "")) or ""
        ).strip()
        if not marital_status:
            raise serializers.ValidationError(
                {"marital_status": "Marital status is required."}
            )
        residence_country = (
            attrs.get(
                "residence_country",
                getattr(self.instance, "residence_country", ""),
            )
            or ""
        ).strip()
        if not residence_country:
            raise serializers.ValidationError(
                {"residence_country": "Residence country is required."}
            )
        contact_person_name = (
            attrs.get(
                "contact_person_name",
                getattr(self.instance, "contact_person_name", ""),
            )
            or ""
        ).strip()
        if not contact_person_name:
            raise serializers.ValidationError(
                {"contact_person_name": "Contact person name is required."}
            )
        contact_person_mobile = attrs.get(
            "contact_person_mobile",
            getattr(self.instance, "contact_person_mobile", ""),
        )
        if not contact_person_mobile:
            raise serializers.ValidationError(
                {"contact_person_mobile": "Contact person mobile is required."}
            )
        attrs["status"] = attrs.get(
            "status",
            getattr(self.instance, "status", Employee.STATUS_PENDING),
        )
        return attrs

    def get_age(self, obj):
        return calculate_age(obj.date_of_birth)

    def get_progress_status(self, obj):
        return build_employee_progress_status(obj)

    def get_travel_status(self, obj):
        return build_employee_travel_status(obj)

    def get_return_status(self, obj):
        return build_employee_return_status(obj)

    def get_urgency_alerts(self, obj):
        return build_employee_urgency_alerts(obj)

    def get_selection_state(self, obj):
        request = self.context.get("request")
        return build_employee_selection_payload(obj, request)

    def get_return_request(self, obj):
        request_obj = getattr(obj, "return_request", None)
        if not request_obj:
            return None
        return EmployeeReturnRequestSerializer(
            request_obj,
            context=self.context,
        ).data

    def get_travel_booking(self, obj):
        booking = getattr(obj, "travel_booking", None)
        if not booking:
            return None
        return EmployeeTravelBookingSerializer(booking, context=self.context).data


class EmployeeDocumentCreateSerializer(serializers.ModelSerializer):
    def validate_file(self, value):
        content_type = (getattr(value, "content_type", "") or "").lower()
        extension = os.path.splitext(getattr(value, "name", "") or "")[1].lower()
        if extension not in ALLOWED_EMPLOYEE_DOCUMENT_EXTENSIONS:
            raise serializers.ValidationError(
                "Only PDF, JPG, JPEG, and PNG files are allowed."
            )
        if content_type and content_type not in ALLOWED_EMPLOYEE_DOCUMENT_MIME_TYPES:
            raise serializers.ValidationError(
                "Only PDF, JPG, JPEG, and PNG files are allowed."
            )
        return value

    class Meta:
        model = EmployeeDocument
        fields = ("document_type", "label", "file", "expires_on")
