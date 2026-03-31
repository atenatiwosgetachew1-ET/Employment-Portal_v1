import os
import time
from base64 import b64decode
from urllib import error, request

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization


SYNC_KEY_HEADER = "HTTP_X_PORTAL_SYNC_KEY"
SYNC_TIMESTAMP_HEADER = "HTTP_X_PORTAL_SYNC_TIMESTAMP"
SYNC_SIGNATURE_HEADER = "HTTP_X_PORTAL_SYNC_SIGNATURE"
SYNC_ALGORITHM_HEADER = "HTTP_X_PORTAL_SYNC_ALGORITHM"
DEFAULT_MAX_SKEW_SECONDS = 300
DEFAULT_PUBLIC_KEY_CACHE_SECONDS = 300
_PUBLIC_KEY_CACHE: dict[str, tuple[float, dict | None]] = {}


def get_company_keys_base_url() -> str:
    return (os.getenv("COMPANY_CONTROL_CENTER_BASE_URL") or "").rstrip("/")


def get_public_key_record(key_id: str) -> dict | None:
    cached = _PUBLIC_KEY_CACHE.get(key_id)
    now = time.time()
    if cached and cached[0] > now:
        return cached[1]

    base_url = get_company_keys_base_url()
    if not base_url:
        return None
    target = f"{base_url}/api/sync-keys/{key_id}/public/"
    try:
        with request.urlopen(target, timeout=10) as response:
            body = response.read().decode("utf-8")
    except error.HTTPError:
        return None
    except Exception:
        return None
    import json

    record = json.loads(body)
    _PUBLIC_KEY_CACHE[key_id] = (now + DEFAULT_PUBLIC_KEY_CACHE_SECONDS, record)
    return record


def clear_public_key_cache(key_id: str | None = None):
    if key_id is None:
        _PUBLIC_KEY_CACHE.clear()
        return
    _PUBLIC_KEY_CACHE.pop(key_id, None)


def verify_sync_request(request, raw_body: bytes) -> tuple[bool, str]:
    provided_key = (request.META.get(SYNC_KEY_HEADER) or "").strip()
    provided_timestamp = (request.META.get(SYNC_TIMESTAMP_HEADER) or "").strip()
    provided_signature = (request.META.get(SYNC_SIGNATURE_HEADER) or "").strip()
    provided_algorithm = (request.META.get(SYNC_ALGORITHM_HEADER) or "").strip().lower()

    if not provided_timestamp or not provided_signature:
        return False, "Missing sync authentication headers."
    if provided_algorithm != "ed25519":
        return False, "Unsupported sync algorithm."

    try:
        timestamp_int = int(provided_timestamp)
    except ValueError:
        return False, "Invalid sync timestamp."

    now = int(time.time())
    if abs(now - timestamp_int) > DEFAULT_MAX_SKEW_SECONDS:
        return False, "Sync request timestamp is too old or too far in the future."

    key_record = get_public_key_record(provided_key)
    if not key_record or not key_record.get("is_active"):
        return False, "Sync key is not recognized."

    try:
        public_key = serialization.load_pem_public_key(
            key_record["public_key_pem"].encode("utf-8")
        )
        public_key.verify(
            b64decode(provided_signature.encode("ascii")),
            provided_timestamp.encode("utf-8") + b"." + (raw_body or b""),
        )
    except (ValueError, TypeError, InvalidSignature):
        clear_public_key_cache(provided_key)
        return False, "Invalid sync signature."
    return True, ""
