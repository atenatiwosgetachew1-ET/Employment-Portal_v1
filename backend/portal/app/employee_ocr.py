import base64
import json
import os
import re
from datetime import date
from urllib import error, request

from django.conf import settings


MONTH_NAME_MAP = {
    "jan": "01",
    "feb": "02",
    "mar": "03",
    "apr": "04",
    "may": "05",
    "jun": "06",
    "jul": "07",
    "aug": "08",
    "sep": "09",
    "sept": "09",
    "oct": "10",
    "nov": "11",
    "dec": "12",
}

GENDER_OPTIONS = ["Male", "Female"]
EMPLOYMENT_TYPE_OPTIONS = ["Housemaid", "Cleaner", "Caregiver", "Cook", "Driver", "Laborer"]
LANGUAGE_OPTIONS = ["English", "Arabic", "Amharic", "Afan Oromo", "Tigrinya", "Hindi"]
MARITAL_STATUS_OPTIONS = ["Single", "Married", "Divorced", "Widowed"]
PROFESSION_OPTIONS = ["Housemaid", "Cleaner", "Caregiver", "Cook", "Driver", "Laborer"]
RELIGION_OPTIONS = ["Muslim", "Christian", "Orthodox", "Protestant", "Catholic", "Other"]
RESIDENCE_COUNTRY_OPTIONS = ["Ethiopia", "Kenya", "Saudi Arabia", "United Arab Emirates", "Qatar", "Oman"]

DEFAULT_OCR_SERVICE_URL = "http://127.0.0.1:8766"
OCR_SERVICE_STATUS_PATH = "/health"
OCR_SERVICE_EXTRACT_PATH = "/ocr"


class EmployeeOcrError(Exception):
    pass


def resolve_ocr_service_url():
    configured = getattr(settings, "EMPLOYEE_OCR_SERVICE_URL", "") or os.environ.get("EMPLOYEE_OCR_SERVICE_URL")
    return (configured or DEFAULT_OCR_SERVICE_URL).strip().rstrip("/")


def resolve_ocr_service_timeout():
    raw_value = str(
        getattr(settings, "EMPLOYEE_OCR_SERVICE_TIMEOUT_SECONDS", "")
        or os.environ.get("EMPLOYEE_OCR_SERVICE_TIMEOUT_SECONDS")
        or "60"
    ).strip()
    try:
        return max(5, int(raw_value))
    except ValueError:
        return 60


def fetch_service_json(path, payload=None):
    service_url = resolve_ocr_service_url()
    url = f"{service_url}{path}"
    timeout = resolve_ocr_service_timeout()
    request_body = None
    headers = {}
    if payload is not None:
        request_body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(url, data=request_body, headers=headers, method="POST" if payload is not None else "GET")
    try:
        with request.urlopen(req, timeout=timeout) as response:
            raw_body = response.read().decode("utf-8", errors="ignore")
    except error.HTTPError as exc:
        raw_body = exc.read().decode("utf-8", errors="ignore")
        try:
            data = json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError:
            data = {}
        message = data.get("message") or data.get("detail") or f"OCR service responded with HTTP {exc.code}."
        raise EmployeeOcrError(message) from exc
    except error.URLError as exc:
        raise EmployeeOcrError(
            "OCR service is not reachable. Start the configured PaddleOCR OCR service, then check again."
        ) from exc
    except TimeoutError as exc:
        raise EmployeeOcrError("OCR service timed out while processing this document.") from exc

    try:
        return json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError as exc:
        raise EmployeeOcrError("OCR service returned an invalid response.") from exc


def get_ocr_status():
    service_url = resolve_ocr_service_url()
    try:
        data = fetch_service_json(OCR_SERVICE_STATUS_PATH)
    except EmployeeOcrError as exc:
        return {
            "ready": False,
            "message": str(exc),
            "command": service_url,
            "source": "ocr-service",
        }

    return {
        "ready": bool(data.get("ready")),
        "message": str(data.get("message") or ("OCR service is ready." if data.get("ready") else "OCR service is not ready.")),
        "command": service_url,
        "source": "ocr-service",
        "engine": str(data.get("engine") or "PaddleOCR"),
    }


def normalize_text(value):
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", str(value or "").replace("\r", "\n"))).strip()


def normalize_comparable(value):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", str(value or "").lower())).strip()


def clean_value(value):
    return re.sub(r"\s{2,}", " ", re.sub(r"^[#:\-\s]+", "", str(value or ""))).strip()


def escape_regexp(value):
    return re.escape(str(value))


def normalize_document_number(value):
    return re.sub(r"[^A-Z0-9/-]", "", re.sub(r"\s+", "", str(value or "")).upper())


def normalize_title_text(value):
    cleaned = re.sub(r"\s+", " ", str(value or "").strip())
    if not cleaned:
        return ""
    if cleaned.isupper():
        return cleaned.title()
    return cleaned


def find_first_match(text, pattern):
    match = re.search(pattern, text, flags=re.IGNORECASE)
    return clean_value(match.group(1)) if match and match.group(1) else ""


def is_label_line(line, label):
    comparable_line = normalize_comparable(line)
    comparable_label = normalize_comparable(label)
    if not comparable_line or not comparable_label:
        return False
    return (
        comparable_line == comparable_label
        or comparable_line == f"{comparable_label} number"
        or comparable_line == f"{comparable_label} no"
        or comparable_line.startswith(f"{comparable_label} ")
    )


def find_next_value_line(lines, start_index, current_labels):
    all_known_labels = list(current_labels) + [
        "full name",
        "name",
        "passport number",
        "passport no",
        "date of birth",
        "mobile number",
        "phone number",
        "email",
        "nationality",
        "address",
        "gender",
        "surname",
        "given name",
        "sex",
        "place of birth",
    ]
    end_index = min(len(lines), start_index + 3)
    for index in range(start_index, end_index):
        value = clean_value(lines[index])
        if not value:
            continue
        comparable = normalize_comparable(value)
        looks_like_label = any(
            comparable == normalize_comparable(label) or comparable.startswith(f"{normalize_comparable(label)} ")
            for label in all_known_labels
        )
        if not looks_like_label:
            return value
    return ""


def line_value(text, labels):
    lines = [line.strip() for line in normalize_text(text).split("\n") if line.strip()]
    for index, line in enumerate(lines):
        for label in labels:
            pattern = rf"^\s*{escape_regexp(label)}\s*(?:[:#\-]|no\.?|number)?\s*(.+)$"
            match = re.match(pattern, line, flags=re.IGNORECASE)
            if match and match.group(1):
                value = clean_value(match.group(1))
                if value and normalize_comparable(value) not in {"no", "number"}:
                    return value
            if is_label_line(line, label):
                next_value = find_next_value_line(lines, index + 1, labels)
                if next_value:
                    return next_value
    for label in labels:
        pattern = rf"{escape_regexp(label)}\s*(?:[:#\-]|no\.?|number)?\s*([^\n]{{2,80}})"
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match and match.group(1):
            return clean_value(match.group(1))
    return ""


def parse_date(value):
    raw = str(value or "").strip().upper()
    if not raw:
        return ""
    raw = raw.replace("O", "0")
    iso = re.search(r"\b(19|20)\d{2}[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b", raw)
    if iso:
        year, month, day = re.split(r"[-/.]", iso.group(0))
        return f"{year.zfill(4)}-{month.zfill(2)}-{day.zfill(2)}"
    dmy = re.search(r"\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.]((?:19|20)?\d{2})\b", raw)
    if dmy:
        day, month, year = dmy.group(1), dmy.group(2), dmy.group(3)
        year = f"20{year}" if len(year) == 2 else year
        return f"{year.zfill(4)}-{month.zfill(2)}-{day.zfill(2)}"
    text_month = re.search(r"\b(0?[1-9]|[12]\d|3[01])\s*([A-Z]{3,9})\s*((?:19|20)?\d{2})\b", raw)
    if text_month:
        day = text_month.group(1)
        month_key = text_month.group(2).lower()
        month = MONTH_NAME_MAP.get(month_key[:4]) or MONTH_NAME_MAP.get(month_key[:3])
        if not month:
            return ""
        year = text_month.group(3)
        if len(year) == 2:
            year_number = int(year)
            year = str(1900 + year_number if year_number > 30 else 2000 + year_number)
        return f"{year.zfill(4)}-{month}-{day.zfill(2)}"
    return ""


def parse_mrz_date(value, kind="birth"):
    raw = re.sub(r"\D", "", str(value or ""))
    if len(raw) != 6:
        return ""
    year, month, day = int(raw[:2]), raw[2:4], raw[4:6]
    current_year = date.today().year
    current_century = (current_year // 100) * 100
    full_year = current_century + year
    if kind == "birth" and full_year > current_year:
        full_year -= 100
    if kind != "birth" and full_year < current_year - 20:
        full_year += 100
    return f"{full_year}-{month}-{day}"


def find_date(text, labels):
    value = line_value(text, labels)
    parsed = parse_date(value)
    if parsed:
        return parsed
    return parse_date(find_first_match(text, r"\b((?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)?\d{2})\b"))


def find_option(text, options):
    comparable_text = f" {normalize_comparable(text)} "
    for option in options:
        if f" {normalize_comparable(option)} " in comparable_text:
            return option
    return ""


def find_options(text, options):
    comparable_text = f" {normalize_comparable(text)} "
    return [option for option in options if f" {normalize_comparable(option)} " in comparable_text]


def find_phone(value):
    match = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", str(value or ""))
    if not match:
        return ""
    raw = match.group(0).strip()
    compact = re.sub(r"[^\d+]", "", raw)
    return compact if len(compact) >= 8 else re.sub(r"\s{2,}", " ", raw).strip()


def find_email(value):
    match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", str(value or ""), flags=re.IGNORECASE)
    return match.group(0) if match else ""


def clean_mrz_name(value):
    cleaned = re.sub(r"\s+", " ", re.sub(r"[^A-Z\s'-]", " ", str(value or "").replace("<", " "), flags=re.IGNORECASE)).strip().lower()
    cleaned = re.sub(r"\b[a-z]{1,2}\b(?=\s+[a-z]{4,})", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -")
    return re.sub(r"\b[a-z]", lambda match: match.group(0).upper(), cleaned)


def split_name(full_name):
    parts = re.sub(r"\s+", " ", re.sub(r"[^A-Za-z\s'-]", " ", clean_value(full_name))).strip().split()
    if len(parts) < 2:
        return {}
    return {
        "first_name": parts[0] if len(parts) > 0 else "",
        "middle_name": " ".join(parts[1:-1]) if len(parts) > 2 else "",
        "last_name": parts[-1] if len(parts) > 0 else "",
    }


def split_given_names(value):
    parts = clean_mrz_name(value).split()
    if len(parts) >= 2 and len(parts[0]) <= 2 and len(parts[1]) >= 4:
        parts = parts[1:]
    return {
        "first_name": parts[0] if len(parts) > 0 else "",
        "middle_name": " ".join(parts[1:]) if len(parts) > 1 else "",
    }


def pick_first_value(*values):
    for value in values:
        cleaned = str(value or "").strip()
        if cleaned:
            return cleaned
    return ""


def normalize_gender(value):
    comparable = normalize_comparable(value)
    if comparable in {"m", "male"}:
        return "Male"
    if comparable in {"f", "female"}:
        return "Female"
    return ""


def value_near(text, label, pattern):
    value = line_value(text, [label])
    if value:
        match = re.search(pattern, value)
        if match:
            return clean_value(match.group(1) if match.groups() else match.group(0))
    return ""


def normalize_mrz_line(value):
    return re.sub(r"[^A-Z0-9<]", "", re.sub(r"\s+", "", str(value or "").upper().replace("Â«", "<").replace("â€¹", "<")))


def parse_mrz_text(text):
    lines = [
        normalize_mrz_line(line)
        for line in normalize_text(text).split("\n")
        if "<" in line and len(normalize_mrz_line(line)) >= 20
    ]
    line1 = next((line for line in lines if re.match(r"^P[A-Z0-9<]", line)), "")
    if not line1:
        line1 = next((line for line in lines if "<<" in line), "")
    line2 = next((line for line in lines if re.search(r"\d{6}[0-9<][MF<]", line)), "")
    result = {}
    if line1:
        name_section = re.sub(r"^P[A-Z0-9<]{1,3}", "", line1)
        surname, _, given_names = name_section.partition("<<")
        given_parts = clean_mrz_name(given_names).split()
        surname_value = clean_mrz_name(surname)
        if given_parts or surname_value:
            result["first_name"] = given_parts[0] if len(given_parts) > 0 else ""
            result["middle_name"] = " ".join(given_parts[1:]) if len(given_parts) > 1 else ""
            result["last_name"] = surname_value
    if line2:
        passport_number = normalize_document_number(line2[:9].replace("<", ""))
        nationality = line2[10:13].replace("<", "")
        date_of_birth = parse_mrz_date(line2[13:19], "birth")
        gender = "Male" if line2[20:21] == "M" else "Female" if line2[20:21] == "F" else ""
        if passport_number:
            result["passport_number"] = passport_number
        if nationality == "ETH":
            result["nationality"] = "Ethiopian"
        if date_of_birth:
            result["date_of_birth"] = date_of_birth
        if gender:
            result["gender"] = gender
    return result


def looks_like_passport_number(value):
    normalized = normalize_document_number(value)
    return bool(re.fullmatch(r"[A-Z]{1,2}\d{6,9}", normalized))


def score_passport_number(value, mrz_value=""):
    normalized = normalize_document_number(value)
    if not looks_like_passport_number(normalized):
        return -1
    score = 0
    prefix = re.match(r"[A-Z]{1,2}", normalized)
    if prefix and len(prefix.group(0)) == 2:
        score += 3
    if 7 <= len(re.sub(r"^[A-Z]{1,2}", "", normalized)) <= 8:
        score += 2
    if mrz_value and normalized == normalize_document_number(mrz_value):
        score += 4
    if normalized.startswith("E"):
        score += 1
    return score


def find_passport_number(text, mrz=None):
    mrz = mrz or {}
    mrz_value = mrz.get("passport_number", "")
    candidates = [
        mrz_value,
        line_value(text, ["passport no", "passport number", "passport no."]),
        find_first_match(text, r"\b([A-Z]{1,2}\d{6,9})\b"),
    ]
    candidates.extend(re.findall(r"\b[A-Z]{1,2}\d{6,9}\b", normalize_text(text).upper()))
    ranked = []
    for candidate in candidates:
        normalized = normalize_document_number(candidate)
        score = score_passport_number(normalized, mrz_value=mrz_value)
        if score >= 0:
            ranked.append((score, normalized))
    if ranked:
        ranked.sort(key=lambda item: (-item[0], -len(item[1]), item[1]))
        return ranked[0][1]
    return ""


def detect_document_profile(text):
    comparable = normalize_comparable(text)
    if any(token in comparable for token in ["passport", "passport no", "country code", "issuing authority", "date of expiry"]):
        return "passport"
    return "generic"


def parse_passport_fields(text, mrz=None):
    mrz = mrz or {}
    surname = pick_first_value(line_value(text, ["surname", "family name"]), mrz.get("last_name", ""))
    given_name = pick_first_value(
        line_value(text, ["given name", "given names", "forename", "forenames"]),
        " ".join([part for part in [mrz.get("first_name", ""), mrz.get("middle_name", "")] if part]),
    )
    split_given = split_given_names(given_name)
    return {
        "first_name": split_given.get("first_name", ""),
        "middle_name": split_given.get("middle_name", ""),
        "last_name": clean_mrz_name(surname),
        "passport_number": find_passport_number(text, mrz),
        "date_of_birth": pick_first_value(find_date(text, ["date of birth", "birth date", "dob"]), mrz.get("date_of_birth", "")),
        "gender": normalize_gender(pick_first_value(line_value(text, ["sex", "gender"]), mrz.get("gender", ""))),
        "nationality": pick_first_value(line_value(text, ["nationality"]), mrz.get("nationality", "")),
        "birth_place": line_value(text, ["place of birth", "birth place"]) or "",
    }


def build_structured_passport_candidates(fields):
    fields = fields or {}
    surname = normalize_title_text(fields.get("surname"))
    given_names = normalize_title_text(fields.get("given_names"))
    split_given = split_given_names(given_names)
    nationality = normalize_title_text(fields.get("nationality"))
    if nationality.lower() == "ethiopian":
        nationality = "Ethiopian"
    return {
        "first_name": split_given.get("first_name", ""),
        "middle_name": split_given.get("middle_name", ""),
        "last_name": surname,
        "passport_number": normalize_document_number(fields.get("passport_number")),
        "date_of_birth": parse_date(fields.get("date_of_birth")),
        "gender": normalize_gender(fields.get("sex")),
        "nationality": nationality,
        "birth_place": normalize_title_text(fields.get("place_of_birth")),
    }


def build_field_candidates(text, form_options=None):
    form_options = form_options or {}
    normalized = normalize_text(text)
    mrz = parse_mrz_text(normalized)
    document_profile = detect_document_profile(normalized)
    passport_fields = parse_passport_fields(normalized, mrz) if document_profile == "passport" else {}
    destination_options = form_options.get("destination_countries") or []
    salary_options = []
    for values in (form_options.get("salary_options_by_country") or {}).values():
        if isinstance(values, list):
            salary_options.extend(values)
    full_name = line_value(normalized, ["full name", "name", "employee name", "applicant name"])
    name_parts = {} if document_profile == "passport" else split_name(full_name)
    mobile = "" if document_profile == "passport" else find_phone(line_value(normalized, ["mobile", "mobile number", "phone", "phone number", "telephone"]) or normalized)
    contact_mobile = find_phone(line_value(normalized, ["contact person mobile", "emergency mobile", "contact mobile", "guardian mobile"]))
    salary = line_value(normalized, ["salary", "application salary", "expected salary"]) or find_option(normalized, salary_options)
    return {
        **name_parts,
        **mrz,
        **passport_fields,
        "date_of_birth": passport_fields.get("date_of_birth") or find_date(normalized, ["date of birth", "birth date", "dob"]) or mrz.get("date_of_birth", ""),
        "gender": passport_fields.get("gender") or normalize_gender(line_value(normalized, ["gender", "sex"])) or find_option(normalized, GENDER_OPTIONS) or mrz.get("gender", ""),
        "id_number": normalize_document_number(line_value(normalized, ["id number", "id no", "national id", "identity number"])),
        "passport_number": passport_fields.get("passport_number") or normalize_document_number(line_value(normalized, ["passport number", "passport no", "passport"])) or mrz.get("passport_number", ""),
        "labour_id": normalize_document_number(line_value(normalized, ["labour id", "labor id", "labour number"])),
        "mobile_number": mobile,
        "email": find_email(line_value(normalized, ["email", "email address"]) or normalized),
        "phone": find_phone(line_value(normalized, ["secondary phone", "alternate phone", "other phone"])),
        "application_countries": find_options(normalized, destination_options),
        "profession": find_option(normalized, PROFESSION_OPTIONS),
        "employment_type": find_option(normalized, EMPLOYMENT_TYPE_OPTIONS),
        "application_salary": re.sub(r"[^\d.]", "", str(salary)) or salary,
        "professional_title": line_value(normalized, ["professional title", "job title", "title"]),
        "languages": find_options(normalized, LANGUAGE_OPTIONS),
        "religion": find_option(normalized, RELIGION_OPTIONS),
        "marital_status": find_option(normalized, MARITAL_STATUS_OPTIONS),
        "children_count": value_near(normalized, "children", r"(\d+)"),
        "address": line_value(normalized, ["address", "current address", "residential address"]),
        "residence_country": find_option(normalized, RESIDENCE_COUNTRY_OPTIONS),
        "nationality": passport_fields.get("nationality") or line_value(normalized, ["nationality", "citizenship"]) or mrz.get("nationality", ""),
        "birth_place": passport_fields.get("birth_place") or line_value(normalized, ["birth place", "place of birth"]),
        "weight_kg": value_near(normalized, "weight", r"(\d+(?:\.\d+)?)"),
        "height_cm": value_near(normalized, "height", r"(\d+(?:\.\d+)?)"),
        "summary": line_value(normalized, ["summary", "profile summary"]),
        "education": line_value(normalized, ["education", "educational background"]),
        "experience": line_value(normalized, ["experience notes", "experience", "work experience"]),
        "contact_person_name": line_value(normalized, ["contact person name", "emergency contact name", "guardian name"]),
        "contact_person_id_number": line_value(normalized, ["contact person id", "emergency contact id", "guardian id"]),
        "contact_person_mobile": contact_mobile,
        "references": line_value(normalized, ["references", "reference"]),
        "notes": line_value(normalized, ["notes", "remarks"]),
        "certifications": line_value(normalized, ["certifications", "certificates", "certificate notes"]),
    }


def normalize_ocr_response(response_data):
    response_data = response_data or {}
    return {
        "ok": bool(response_data.get("ok", True)),
        "status": int(response_data.get("status") or 200),
        "message": str(response_data.get("message") or "").strip(),
        "engine": str(response_data.get("engine") or "PaddleOCR").strip(),
        "document_type": str(response_data.get("document_type") or "unknown").strip().lower(),
        "file_name": str(response_data.get("file_name") or "").strip(),
        "content_type": str(response_data.get("content_type") or "").strip(),
        "text": normalize_text(response_data.get("text")),
        "raw_text": normalize_text(response_data.get("raw_text")),
        "fields": response_data.get("fields") if isinstance(response_data.get("fields"), dict) else {},
        "warnings": [str(item).strip() for item in (response_data.get("warnings") or []) if str(item).strip()],
    }


def build_candidates_from_ocr_result(ocr_result, form_options=None):
    ocr_result = ocr_result or {}
    text = ocr_result.get("text") or ocr_result.get("raw_text") or ""
    candidates = build_field_candidates(text, form_options=form_options)
    if ocr_result.get("document_type") == "passport":
        structured_candidates = build_structured_passport_candidates(ocr_result.get("fields"))
        for key, value in structured_candidates.items():
            if value:
                candidates[key] = value
    return candidates


def step_fields(step_index):
    if step_index == 0:
        return ["first_name", "middle_name", "last_name", "date_of_birth", "gender", "id_number", "passport_number", "labour_id", "mobile_number"]
    if step_index == 1:
        return ["religion", "marital_status", "children_count", "residence_country", "nationality", "birth_place", "address", "weight_kg", "height_cm", "summary", "education", "experience"]
    if step_index == 2:
        return ["contact_person_name", "contact_person_id_number", "contact_person_mobile", "email", "phone", "references", "notes"]
    if step_index == 3:
        return ["application_countries", "profession", "employment_type", "application_salary", "professional_title", "languages"]
    return []


def map_employee_ocr_fields(ocr_result, step_index, form_options=None):
    candidates = build_candidates_from_ocr_result(ocr_result, form_options=form_options)
    fields = step_fields(step_index)
    updates = {}
    for field in fields:
        value = candidates.get(field)
        if isinstance(value, list):
            if value:
                updates[field] = list(dict.fromkeys(value))
            continue
        if value is None:
            continue
        cleaned = str(value).strip()
        if cleaned:
            updates[field] = cleaned
    return updates


def build_updates_by_step(ocr_result, form_options=None, total_steps=6):
    updates_by_step = {}
    for step_index in range(total_steps):
        updates_by_step[str(step_index)] = map_employee_ocr_fields(
            ocr_result,
            step_index=step_index,
            form_options=form_options,
        )
    return updates_by_step


def extract_text_from_upload(file_obj):
    content_type = getattr(file_obj, "content_type", "") or ""
    if not content_type.startswith("image/"):
        raise EmployeeOcrError("OCR service currently supports image scans only.")

    image_bytes = file_obj.read()
    if hasattr(file_obj, "seek"):
        file_obj.seek(0)
    if not image_bytes:
        raise EmployeeOcrError("The uploaded scan was empty.")

    payload = {
        "filename": getattr(file_obj, "name", "scan-image"),
        "content_type": content_type,
        "image_base64": base64.b64encode(image_bytes).decode("ascii"),
    }
    response_data = fetch_service_json(OCR_SERVICE_EXTRACT_PATH, payload=payload)
    ocr_result = normalize_ocr_response(response_data)
    if ocr_result["ok"] and (ocr_result["text"] or ocr_result["raw_text"] or ocr_result["fields"]):
        return ocr_result
    raise EmployeeOcrError(ocr_result["message"] or "OCR service could not read this scanned document.")


def extract_employee_document_fields(file_obj, step_index, form_options=None):
    ocr_result = extract_text_from_upload(file_obj)
    text = ocr_result.get("text") or ocr_result.get("raw_text") or ""
    updates_by_step = build_updates_by_step(ocr_result, form_options=form_options)
    updates = updates_by_step.get(str(step_index), {})
    return {
        "text": text,
        "raw_text": ocr_result.get("raw_text", ""),
        "document_type": ocr_result.get("document_type", "unknown"),
        "fields": ocr_result.get("fields", {}),
        "warnings": ocr_result.get("warnings", []),
        "updates_by_step": updates_by_step,
        "updates": updates,
    }


def parse_form_options(raw_value):
    if not raw_value:
        return {}
    if isinstance(raw_value, dict):
        return raw_value
    try:
        return json.loads(raw_value)
    except Exception:
        return {}
