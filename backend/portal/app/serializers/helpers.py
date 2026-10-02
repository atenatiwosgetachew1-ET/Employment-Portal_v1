from datetime import date
from rest_framework import serializers

STAFF_ROLE_LEVELS = {
    "Reception": 1,
    "Secretary": 2,
    "IT": 3,
    "Operations": 4,
    "Supervisor": 5,
}

PHONE_MIN_DIGITS = 7
PHONE_MAX_DIGITS = 15
EMPLOYEE_MINIMUM_AGE = 18

EMPLOYEE_REQUIRED_DOCUMENT_TYPES = [
    "portrait_photo",
    "full_photo",
    "passport_document",
]

ALLOWED_EMPLOYEE_DOCUMENT_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
}

ALLOWED_EMPLOYEE_DOCUMENT_EXTENSIONS = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
}

EMPLOYEE_URGENCY_DATE_FIELDS = [
    ("passport_expires_on", "Passport expiry"),
    ("medical_expires_on", "Medical result expiry"),
    ("departure_date", "Departure date"),
    ("return_ticket_date", "Return ticket date"),
    ("contract_expires_on", "Contract expiry"),
    ("visa_expires_on", "Visa expiry"),
    ("competency_certificate_expires_on", "Certificate of competency expiry"),
    ("clearance_expires_on", "Clearance expiry"),
    ("insurance_expires_on", "Insurance expiry"),
]


def normalize_phone(value):
    raw = (value or "").strip()
    if not raw:
        return ""
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) < PHONE_MIN_DIGITS or len(digits) > PHONE_MAX_DIGITS:
        raise serializers.ValidationError("Enter a valid phone number.")
    return raw


def calculate_age(value):
    if not value:
        return None
    today = date.today()
    return today.year - value.year - (
        (today.month, today.day) < (value.month, value.day)
    )


def build_employee_progress_status(employee):
    mandatory_fields = [
        employee.first_name,
        employee.middle_name,
        employee.last_name,
        employee.date_of_birth,
        employee.gender,
        employee.passport_number,
        employee.mobile_number,
        employee.application_countries,
        employee.profession,
        employee.employment_type,
        employee.languages,
        employee.residence_country,
        employee.nationality,
        employee.contact_person_name,
        employee.contact_person_mobile,
    ]
    completed_fields = sum(1 for value in mandatory_fields if value not in ("", None, [], {}))
    field_completion = round((completed_fields / len(mandatory_fields)) * 100)
    uploaded_types = set(employee.documents.values_list("document_type", flat=True)) if hasattr(employee, "documents") else set()
    uploaded_required = sum(1 for item in EMPLOYEE_REQUIRED_DOCUMENT_TYPES if item in uploaded_types)
    document_completion = round(
        (uploaded_required / len(EMPLOYEE_REQUIRED_DOCUMENT_TYPES)) * 100
    )
    overall_completion = round((field_completion + document_completion) / 2)

    is_admin_override = bool(
        getattr(employee, "is_administratively_completed", False)
        or getattr(employee, "progress_override_complete", False)
    )
    is_verified_complete = overall_completion == 100
    ready_for_travel = is_verified_complete or is_admin_override

    if overall_completion >= 90:
        label = "ready"
    elif overall_completion >= 60:
        label = "in_progress"
    else:
        label = "needs_attention"

    outstanding = []
    if field_completion < 100:
        outstanding.append(f"Incomplete personal fields ({100 - field_completion}% remaining)")
    missing_docs = [item for item in EMPLOYEE_REQUIRED_DOCUMENT_TYPES if item not in uploaded_types]
    if missing_docs:
        outstanding.append(f"Missing required documents: {', '.join(d.replace('_', ' ') for d in missing_docs)}")
    if not getattr(employee, "contract_expires_on", None):
        outstanding.append("Missing contract expiry date")

    return {
        "field_completion": field_completion,
        "document_completion": document_completion,
        "overall_completion": 100 if is_admin_override else overall_completion,
        "actual_overall_completion": overall_completion,
        "is_verified_complete": is_verified_complete,
        "is_administratively_completed": is_admin_override,
        "administrative_reason": getattr(employee, "administrative_completion_reason", "") or "",
        "outstanding_requirements": getattr(employee, "outstanding_requirements", []) or outstanding,
        "ready_for_travel": ready_for_travel,
        "label": "ready" if ready_for_travel else label,
    }


def build_employee_travel_status(employee):
    today = date.today()
    if getattr(employee, "returned_from_employment", False):
        return "travelled"
    if getattr(employee, "travel_status", "") == "confirmed" or employee.did_travel:
        return "travelled"
    if getattr(employee, "travel_status", "") == "disputed":
        return "disputed"
    if employee.departure_date and employee.departure_date < today:
        return "departure_missed"
    if employee.departure_date and employee.departure_date >= today:
        return "scheduled"
    return "pending"


def build_employee_return_status(employee):
    if getattr(employee, "returned_from_employment", False):
        return "returned"
    if getattr(employee, "is_overdue", False):
        return "overdue"
    today = date.today()
    if not employee.did_travel:
        return "--"
    if not employee.return_ticket_date:
        return "missing_ticket"
    if employee.return_ticket_date < today or (getattr(employee, "contract_expires_on", None) and employee.contract_expires_on < today):
        return "overdue"
    return "scheduled"


def build_employee_urgency_alerts(employee):
    if getattr(employee, "returned_from_employment", False) or getattr(getattr(employee, "return_request", None), "status", None) == "approved":
        return []
    today = date.today()
    alerts = []
    for field_name, label in EMPLOYEE_URGENCY_DATE_FIELDS:
        value = getattr(employee, field_name, None)
        if not value:
            continue
        days_remaining = (value - today).days
        if days_remaining < 0:
            alerts.append(
                {
                    "field": field_name,
                    "label": label,
                    "severity": "expired",
                    "days_remaining": days_remaining,
                }
            )
        elif days_remaining <= 30:
            alerts.append(
                {
                    "field": field_name,
                    "label": label,
                    "severity": "upcoming",
                    "days_remaining": days_remaining,
                }
            )
    return alerts
