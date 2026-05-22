from datetime import datetime, timedelta


LOCAL_AIRPORT_INDEX = [
    {"id": "ADD", "subType": "AIRPORT", "name": "Bole International Airport", "iataCode": "ADD", "cityName": "Addis Ababa", "countryName": "Ethiopia"},
    {"id": "DXB", "subType": "AIRPORT", "name": "Dubai International Airport", "iataCode": "DXB", "cityName": "Dubai", "countryName": "United Arab Emirates"},
    {"id": "DOH", "subType": "AIRPORT", "name": "Hamad International Airport", "iataCode": "DOH", "cityName": "Doha", "countryName": "Qatar"},
    {"id": "AUH", "subType": "AIRPORT", "name": "Zayed International Airport", "iataCode": "AUH", "cityName": "Abu Dhabi", "countryName": "United Arab Emirates"},
    {"id": "RUH", "subType": "AIRPORT", "name": "King Khalid International Airport", "iataCode": "RUH", "cityName": "Riyadh", "countryName": "Saudi Arabia"},
    {"id": "JED", "subType": "AIRPORT", "name": "King Abdulaziz International Airport", "iataCode": "JED", "cityName": "Jeddah", "countryName": "Saudi Arabia"},
    {"id": "MCT", "subType": "AIRPORT", "name": "Muscat International Airport", "iataCode": "MCT", "cityName": "Muscat", "countryName": "Oman"},
    {"id": "BAH", "subType": "AIRPORT", "name": "Bahrain International Airport", "iataCode": "BAH", "cityName": "Manama", "countryName": "Bahrain"},
    {"id": "KWI", "subType": "AIRPORT", "name": "Kuwait International Airport", "iataCode": "KWI", "cityName": "Kuwait City", "countryName": "Kuwait"},
    {"id": "CAI", "subType": "AIRPORT", "name": "Cairo International Airport", "iataCode": "CAI", "cityName": "Cairo", "countryName": "Egypt"},
    {"id": "IST", "subType": "AIRPORT", "name": "Istanbul Airport", "iataCode": "IST", "cityName": "Istanbul", "countryName": "Turkey"},
    {"id": "SAW", "subType": "AIRPORT", "name": "Sabiha Gokcen International Airport", "iataCode": "SAW", "cityName": "Istanbul", "countryName": "Turkey"},
    {"id": "NBO", "subType": "AIRPORT", "name": "Jomo Kenyatta International Airport", "iataCode": "NBO", "cityName": "Nairobi", "countryName": "Kenya"},
    {"id": "MBA", "subType": "AIRPORT", "name": "Moi International Airport", "iataCode": "MBA", "cityName": "Mombasa", "countryName": "Kenya"},
    {"id": "DAR", "subType": "AIRPORT", "name": "Julius Nyerere International Airport", "iataCode": "DAR", "cityName": "Dar es Salaam", "countryName": "Tanzania"},
    {"id": "ZNZ", "subType": "AIRPORT", "name": "Abeid Amani Karume International Airport", "iataCode": "ZNZ", "cityName": "Zanzibar", "countryName": "Tanzania"},
    {"id": "KGL", "subType": "AIRPORT", "name": "Kigali International Airport", "iataCode": "KGL", "cityName": "Kigali", "countryName": "Rwanda"},
    {"id": "EBB", "subType": "AIRPORT", "name": "Entebbe International Airport", "iataCode": "EBB", "cityName": "Entebbe", "countryName": "Uganda"},
    {"id": "KRT", "subType": "AIRPORT", "name": "Khartoum International Airport", "iataCode": "KRT", "cityName": "Khartoum", "countryName": "Sudan"},
    {"id": "LHR", "subType": "AIRPORT", "name": "Heathrow Airport", "iataCode": "LHR", "cityName": "London", "countryName": "United Kingdom"},
    {"id": "CDG", "subType": "AIRPORT", "name": "Charles de Gaulle Airport", "iataCode": "CDG", "cityName": "Paris", "countryName": "France"},
    {"id": "FRA", "subType": "AIRPORT", "name": "Frankfurt Airport", "iataCode": "FRA", "cityName": "Frankfurt", "countryName": "Germany"},
]


class TravelProviderError(Exception):
    pass


def _airport_lookup(code):
    normalized = str(code or "").strip().upper()
    return next((airport for airport in LOCAL_AIRPORT_INDEX if airport["iataCode"] == normalized), None)


def _iso_datetime(date_value, hour, minute):
    return f"{date_value}T{hour:02d}:{minute:02d}:00"


def _route_summary(origin_code, destination_code, via_code=""):
    values = [origin_code]
    if via_code:
        values.append(via_code)
    values.append(destination_code)
    return " -> ".join([value for value in values if value])


def search_travel_locations(*, keyword):
    query = str(keyword or "").strip()
    if len(query) < 2:
        return {
            "provider": "local-airport-index",
            "meta": {"count": 0, "keyword": query},
            "data": [],
            "raw": [],
        }

    normalized_query = query.lower()
    matches = []
    for airport in LOCAL_AIRPORT_INDEX:
        haystack = " ".join(
            [
                airport.get("iataCode", ""),
                airport.get("name", ""),
                airport.get("cityName", ""),
                airport.get("countryName", ""),
            ]
        ).lower()
        if normalized_query in haystack:
            matches.append(airport)

    matches.sort(
        key=lambda airport: (
            airport.get("iataCode", "") != query.upper(),
            airport.get("cityName", ""),
            airport.get("name", ""),
        )
    )
    limited = matches[:8]
    return {
        "provider": "local-airport-index",
        "meta": {
            "count": len(limited),
            "keyword": query,
        },
        "data": limited,
        "raw": limited,
    }


def search_flight_availabilities(*, origin_location_code, destination_location_code, departure_date, adults=1):
    origin_code = str(origin_location_code or "").strip().upper()
    destination_code = str(destination_location_code or "").strip().upper()
    date_value = str(departure_date or "").strip()

    if len(origin_code) != 3 or len(destination_code) != 3:
        raise TravelProviderError("Origin and destination must be valid 3-letter IATA airport codes.")
    if not date_value:
        raise TravelProviderError("Departure date is required.")

    origin_airport = _airport_lookup(origin_code)
    destination_airport = _airport_lookup(destination_code)
    try:
        parsed_date = datetime.strptime(date_value, "%Y-%m-%d")
    except ValueError as exc:
        raise TravelProviderError("Departure date must be in YYYY-MM-DD format.") from exc

    via_airport = next(
        (
            airport for airport in LOCAL_AIRPORT_INDEX
            if airport["iataCode"] not in {origin_code, destination_code}
        ),
        None,
    )
    first_duration_minutes = 255
    second_duration_minutes = 345
    third_duration_minutes = 405

    results = [
        {
            "id": f"{origin_code}-{destination_code}-1",
            "originDestinationId": "1",
            "source": "LOCAL",
            "duration": "PT4H15M",
            "instantTicketingRequired": False,
            "paymentCardRequired": False,
            "carrierCodes": ["EP"],
            "departureAt": _iso_datetime(date_value, 8, 15),
            "arrivalAt": _iso_datetime(date_value, 12, 30),
            "originIataCode": origin_code,
            "destinationIataCode": destination_code,
            "routeSummary": _route_summary(origin_code, destination_code),
            "segments": [
                {
                    "id": f"{origin_code}-{destination_code}-1a",
                    "carrierCode": "EP",
                    "flightNumber": "101",
                    "departureIataCode": origin_code,
                    "departureAt": _iso_datetime(date_value, 8, 15),
                    "arrivalIataCode": destination_code,
                    "arrivalAt": _iso_datetime(date_value, 12, 30),
                    "numberOfStops": 0,
                    "aircraftCode": "320",
                    "availabilityClasses": [
                        {"class": "Y", "numberOfBookableSeats": max(2, int(adults or 1) + 2)},
                        {"class": "M", "numberOfBookableSeats": max(2, int(adults or 1) + 1)},
                    ],
                }
            ],
        },
        {
            "id": f"{origin_code}-{destination_code}-2",
            "originDestinationId": "2",
            "source": "LOCAL",
            "duration": "PT5H45M",
            "instantTicketingRequired": False,
            "paymentCardRequired": False,
            "carrierCodes": ["EP", "CN"],
            "departureAt": _iso_datetime(date_value, 13, 10),
            "arrivalAt": _iso_datetime(date_value, 18, 55),
            "originIataCode": origin_code,
            "destinationIataCode": destination_code,
            "routeSummary": _route_summary(origin_code, destination_code, via_airport["iataCode"] if via_airport else ""),
            "segments": [
                {
                    "id": f"{origin_code}-{destination_code}-2a",
                    "carrierCode": "EP",
                    "flightNumber": "214",
                    "departureIataCode": origin_code,
                    "departureAt": _iso_datetime(date_value, 13, 10),
                    "arrivalIataCode": via_airport["iataCode"] if via_airport else destination_code,
                    "arrivalAt": (parsed_date + timedelta(minutes=first_duration_minutes)).strftime("%Y-%m-%dT%H:%M:00"),
                    "numberOfStops": 0,
                    "aircraftCode": "738",
                    "availabilityClasses": [{"class": "Y", "numberOfBookableSeats": max(2, int(adults or 1) + 3)}],
                },
                {
                    "id": f"{origin_code}-{destination_code}-2b",
                    "carrierCode": "CN",
                    "flightNumber": "552",
                    "departureIataCode": via_airport["iataCode"] if via_airport else origin_code,
                    "departureAt": (parsed_date + timedelta(minutes=first_duration_minutes + 55)).strftime("%Y-%m-%dT%H:%M:00"),
                    "arrivalIataCode": destination_code,
                    "arrivalAt": (parsed_date + timedelta(minutes=second_duration_minutes)).strftime("%Y-%m-%dT%H:%M:00"),
                    "numberOfStops": 0,
                    "aircraftCode": "321",
                    "availabilityClasses": [{"class": "M", "numberOfBookableSeats": max(2, int(adults or 1) + 1)}],
                },
            ],
        },
        {
            "id": f"{origin_code}-{destination_code}-3",
            "originDestinationId": "3",
            "source": "LOCAL",
            "duration": "PT6H45M",
            "instantTicketingRequired": False,
            "paymentCardRequired": False,
            "carrierCodes": ["SV"],
            "departureAt": _iso_datetime(date_value, 21, 0),
            "arrivalAt": (parsed_date + timedelta(minutes=third_duration_minutes)).strftime("%Y-%m-%dT%H:%M:00"),
            "originIataCode": origin_code,
            "destinationIataCode": destination_code,
            "routeSummary": _route_summary(origin_code, destination_code),
            "segments": [
                {
                    "id": f"{origin_code}-{destination_code}-3a",
                    "carrierCode": "SV",
                    "flightNumber": "903",
                    "departureIataCode": origin_code,
                    "departureAt": _iso_datetime(date_value, 21, 0),
                    "arrivalIataCode": destination_code,
                    "arrivalAt": (parsed_date + timedelta(minutes=third_duration_minutes)).strftime("%Y-%m-%dT%H:%M:00"),
                    "numberOfStops": 0,
                    "aircraftCode": "789",
                    "availabilityClasses": [{"class": "K", "numberOfBookableSeats": max(2, int(adults or 1) + 4)}],
                }
            ],
        },
    ]

    return {
        "provider": "local-flight-index",
        "meta": {
            "count": len(results),
            "originLocationCode": origin_code,
            "destinationLocationCode": destination_code,
            "departureDate": date_value,
            "adults": max(1, int(adults or 1)),
            "originName": origin_airport["name"] if origin_airport else "",
            "destinationName": destination_airport["name"] if destination_airport else "",
        },
        "data": results,
        "raw": results,
    }
