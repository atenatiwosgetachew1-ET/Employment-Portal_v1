import json
import os
import time
from urllib import error, parse, request

from django.conf import settings

from .travel_providers import (
    TravelProviderError,
    search_flight_availabilities as search_internal_flight_availabilities,
    search_travel_locations as search_internal_travel_locations,
)


DEFAULT_TRAVEL_SERVICE_STATUS_PATH = "/health"
DEFAULT_TRAVEL_SERVICE_AUTH_PATH = "/api/auth/service-token"
DEFAULT_TRAVEL_SERVICE_FLIGHT_SEARCH_PATH = "/api/flights/search"
DEFAULT_TRAVEL_SERVICE_LOCATION_SEARCH_PATH = "/api/locations/search"

_TRAVEL_SERVICE_TOKEN_CACHE = {
    "access_token": "",
    "expires_at": 0,
}


def resolve_travel_service_url():
    configured = getattr(settings, "TRAVEL_SERVICE_URL", "") or os.environ.get("TRAVEL_SERVICE_URL")
    return (configured or "").strip().rstrip("/")


def resolve_travel_service_timeout():
    raw_value = str(
        getattr(settings, "TRAVEL_SERVICE_TIMEOUT_SECONDS", "")
        or os.environ.get("TRAVEL_SERVICE_TIMEOUT_SECONDS")
        or "30"
    ).strip()
    try:
        return max(5, int(raw_value))
    except ValueError:
        return 30


def resolve_travel_service_status_path():
    configured = (
        getattr(settings, "TRAVEL_SERVICE_STATUS_PATH", "")
        or os.environ.get("TRAVEL_SERVICE_STATUS_PATH")
    )
    return (configured or DEFAULT_TRAVEL_SERVICE_STATUS_PATH).strip()


def resolve_travel_service_auth_path():
    configured = (
        getattr(settings, "TRAVEL_SERVICE_AUTH_PATH", "")
        or os.environ.get("TRAVEL_SERVICE_AUTH_PATH")
    )
    return (configured or DEFAULT_TRAVEL_SERVICE_AUTH_PATH).strip()


def resolve_travel_service_flight_search_path():
    configured = (
        getattr(settings, "TRAVEL_SERVICE_FLIGHT_SEARCH_PATH", "")
        or os.environ.get("TRAVEL_SERVICE_FLIGHT_SEARCH_PATH")
    )
    return (configured or DEFAULT_TRAVEL_SERVICE_FLIGHT_SEARCH_PATH).strip()


def resolve_travel_service_location_search_path():
    configured = (
        getattr(settings, "TRAVEL_SERVICE_LOCATION_SEARCH_PATH", "")
        or os.environ.get("TRAVEL_SERVICE_LOCATION_SEARCH_PATH")
    )
    return (configured or DEFAULT_TRAVEL_SERVICE_LOCATION_SEARCH_PATH).strip()


def resolve_travel_service_client_id():
    return str(
        getattr(settings, "TRAVEL_SERVICE_CLIENT_ID", "")
        or os.environ.get("TRAVEL_SERVICE_CLIENT_ID")
        or ""
    ).strip()


def resolve_travel_service_client_secret():
    return str(
        getattr(settings, "TRAVEL_SERVICE_CLIENT_SECRET", "")
        or os.environ.get("TRAVEL_SERVICE_CLIENT_SECRET")
        or ""
    ).strip()


def resolve_travel_service_source_system():
    return str(
        getattr(settings, "TRAVEL_SERVICE_SOURCE_SYSTEM", "")
        or os.environ.get("TRAVEL_SERVICE_SOURCE_SYSTEM")
        or "employment_portal"
    ).strip() or "employment_portal"


def travel_service_enabled():
    return bool(resolve_travel_service_url())


def fetch_travel_service_json(path, *, payload=None, query_params=None, headers=None):
    service_url = resolve_travel_service_url()
    if not service_url:
        raise TravelProviderError("Travel service URL is not configured.")

    query_string = parse.urlencode(query_params or {})
    url = f"{service_url}{path}"
    if query_string:
        url = f"{url}?{query_string}"

    timeout = resolve_travel_service_timeout()
    request_body = None
    request_headers = {"Accept": "application/json"}
    request_headers.update(headers or {})
    if payload is not None:
        request_body = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"

    req = request.Request(url, data=request_body, headers=request_headers, method="POST" if payload is not None else "GET")
    try:
        with request.urlopen(req, timeout=timeout) as response:
            raw_body = response.read().decode("utf-8", errors="ignore")
    except error.HTTPError as exc:
        raw_body = exc.read().decode("utf-8", errors="ignore")
        try:
            data = json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError:
            data = {}
        message = data.get("message") or data.get("detail") or f"Travel service responded with HTTP {exc.code}."
        raise TravelProviderError(message) from exc
    except error.URLError as exc:
        raise TravelProviderError("Travel service is not reachable. Please try again later.") from exc
    except TimeoutError as exc:
        raise TravelProviderError("Travel service timed out while processing this request.") from exc

    try:
        return json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError as exc:
        raise TravelProviderError("Travel service returned an invalid response.") from exc


def normalize_travel_search_response(data, *, default_provider):
    return {
        "provider": str(data.get("provider") or default_provider),
        "meta": data.get("meta") if isinstance(data.get("meta"), dict) else {},
        "data": data.get("data") if isinstance(data.get("data"), list) else [],
        "raw": data.get("raw", []),
    }


def get_travel_service_access_token(*, force_refresh=False):
    client_id = resolve_travel_service_client_id()
    client_secret = resolve_travel_service_client_secret()
    if not client_id or not client_secret:
        raise TravelProviderError(
            "Travel service client credentials are not configured. Set TRAVEL_SERVICE_CLIENT_ID and TRAVEL_SERVICE_CLIENT_SECRET."
        )

    current_time = time.time()
    if (
        not force_refresh
        and _TRAVEL_SERVICE_TOKEN_CACHE["access_token"]
        and _TRAVEL_SERVICE_TOKEN_CACHE["expires_at"] > current_time + 30
    ):
        return _TRAVEL_SERVICE_TOKEN_CACHE["access_token"]

    data = fetch_travel_service_json(
        resolve_travel_service_auth_path(),
        payload={
            "clientId": client_id,
            "clientSecret": client_secret,
        },
    )
    access_token = str(data.get("accessToken") or "").strip()
    expires_in = int(data.get("expiresIn") or 0)
    if not access_token:
        raise TravelProviderError("Travel service authorization did not return an access token.")
    _TRAVEL_SERVICE_TOKEN_CACHE["access_token"] = access_token
    _TRAVEL_SERVICE_TOKEN_CACHE["expires_at"] = current_time + max(60, expires_in)
    return access_token


def fetch_authenticated_travel_service_json(path, *, payload=None, query_params=None):
    token = get_travel_service_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    try:
        return fetch_travel_service_json(path, payload=payload, query_params=query_params, headers=headers)
    except TravelProviderError as exc:
        if "401" not in str(exc):
            raise
        refreshed_token = get_travel_service_access_token(force_refresh=True)
        headers["Authorization"] = f"Bearer {refreshed_token}"
        return fetch_travel_service_json(path, payload=payload, query_params=query_params, headers=headers)


def normalize_external_locations_response(data):
    if isinstance(data, list):
        normalized_data = data
    elif isinstance(data.get("data"), list):
        normalized_data = data.get("data", [])
    else:
        normalized_data = []

    return {
        "provider": str(data.get("provider") or "external-travel-service") if isinstance(data, dict) else "external-travel-service",
        "meta": (
            data.get("meta")
            if isinstance(data, dict) and isinstance(data.get("meta"), dict)
            else {"count": len(normalized_data), "keyword": ""}
        ),
        "data": normalized_data,
        "raw": data,
    }


def normalize_external_flight_search_response(data):
    flights = []
    if isinstance(data, dict):
        if isinstance(data.get("flights"), list):
            flights = data.get("flights", [])
        elif isinstance(data.get("data"), list):
            flights = data.get("data", [])

    normalized_results = []
    for index, item in enumerate(flights):
        if not isinstance(item, dict):
            continue
        normalized_results.append(
            {
                "id": str(item.get("id") or f"flight-{index + 1}"),
                "originDestinationId": str(item.get("searchRequestId") or item.get("searchId") or ""),
                "source": str(item.get("provider") or "external-travel-service"),
                "duration": str(item.get("duration") or ""),
                "instantTicketingRequired": bool(item.get("instantTicketingRequired", False)),
                "paymentCardRequired": bool(item.get("paymentCardRequired", False)),
                "carrierCodes": item.get("carrierCodes") if isinstance(item.get("carrierCodes"), list) else [],
                "departureAt": str(item.get("departureAt") or ""),
                "arrivalAt": str(item.get("arrivalAt") or ""),
                "originIataCode": str(item.get("originIataCode") or ""),
                "destinationIataCode": str(item.get("destinationIataCode") or ""),
                "routeSummary": str(item.get("routeSummary") or ""),
                "segments": item.get("segments") if isinstance(item.get("segments"), list) else [],
                "price": item.get("price"),
                "availability": item.get("availability"),
            }
        )

    return {
        "provider": str(data.get("provider") or "external-travel-service") if isinstance(data, dict) else "external-travel-service",
        "meta": {
            "count": len(normalized_results),
            "originLocationCode": normalized_results[0]["originIataCode"] if normalized_results else "",
            "destinationLocationCode": normalized_results[0]["destinationIataCode"] if normalized_results else "",
            "departureDate": normalized_results[0]["departureAt"][:10] if normalized_results else "",
            "adults": 0,
            "searchId": str(data.get("searchId") or "") if isinstance(data, dict) else "",
            "totalResults": int(data.get("totalResults") or len(normalized_results)) if isinstance(data, dict) else len(normalized_results),
        },
        "data": normalized_results,
        "raw": data,
    }


def get_travel_status():
    service_url = resolve_travel_service_url()
    if not service_url:
        return {
            "ready": True,
            "message": "Travel service is using the portal's built-in provider fallback.",
            "command": "built-in fallback",
            "source": "portal-fallback",
        }

    try:
        data = fetch_travel_service_json(resolve_travel_service_status_path())
    except TravelProviderError as exc:
        return {
            "ready": False,
            "message": str(exc),
            "command": service_url,
            "source": "travel-service",
        }

    return {
        "ready": bool(data.get("ready", data.get("status") == "healthy" or True)),
        "message": str(
            data.get("message")
            or ("Travel service is ready." if data.get("ready", data.get("status") == "healthy" or True) else "Travel service is not ready.")
        ),
        "command": service_url,
        "source": str(data.get("source") or "travel-service"),
        "engine": str(data.get("engine") or data.get("provider") or "custom-travel-service"),
    }


def search_flight_availabilities(*, origin_location_code, destination_location_code, departure_date, adults=1):
    if not travel_service_enabled():
        return search_internal_flight_availabilities(
            origin_location_code=origin_location_code,
            destination_location_code=destination_location_code,
            departure_date=departure_date,
            adults=adults,
        )

    response_data = fetch_authenticated_travel_service_json(
        resolve_travel_service_flight_search_path(),
        payload={
            "origin": str(origin_location_code or "").strip().upper(),
            "destination": str(destination_location_code or "").strip().upper(),
            "departureDate": str(departure_date or "").strip(),
            "passengers": max(1, int(adults or 1)),
            "sourceSystem": resolve_travel_service_source_system(),
        },
    )
    normalized = normalize_external_flight_search_response(response_data)
    normalized["meta"]["adults"] = max(1, int(adults or 1))
    return normalized


def search_travel_locations(*, keyword):
    if not travel_service_enabled():
        return search_internal_travel_locations(keyword=keyword)

    response_data = fetch_travel_service_json(
        resolve_travel_service_location_search_path(),
        query_params={"q": str(keyword or "").strip(), "limit": 8},
    )
    normalized = normalize_external_locations_response(response_data)
    normalized["meta"]["keyword"] = str(keyword or "").strip()
    normalized["meta"]["count"] = len(normalized["data"])
    return normalized
