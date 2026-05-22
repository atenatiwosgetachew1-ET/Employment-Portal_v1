from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_utils import feature_enabled
from .employee_views import EmployeesEnabled
from .licensing import get_access_restriction
from .travel_service import (
    TravelProviderError,
    get_travel_status,
    search_flight_availabilities,
    search_travel_locations,
)


class TravelStatusView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def get(self, request):
        restriction = get_access_restriction(request.user, write=False)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        if not feature_enabled("employees_enabled"):
            return Response({"detail": "Travel is not enabled for this workspace."}, status=status.HTTP_403_FORBIDDEN)
        return Response(get_travel_status(), status=status.HTTP_200_OK)


class TravelFlightAvailabilitySearchView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def post(self, request):
        restriction = get_access_restriction(request.user, write=False)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)
        if not feature_enabled("employees_enabled"):
            return Response({"detail": "Travel is not enabled for this workspace."}, status=status.HTTP_403_FORBIDDEN)

        origin_location_code = str(request.data.get("originLocationCode") or "").strip().upper()
        destination_location_code = str(request.data.get("destinationLocationCode") or "").strip().upper()
        departure_date = str(request.data.get("departureDate") or "").strip()
        adults = request.data.get("adults", 1)

        if len(origin_location_code) != 3 or len(destination_location_code) != 3:
            return Response(
                {"detail": "Origin and destination must be valid 3-letter IATA airport codes."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not departure_date:
            return Response({"detail": "Departure date is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            adults = max(1, int(adults))
        except (TypeError, ValueError):
            return Response({"detail": "Adults must be a positive number."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = search_flight_availabilities(
                origin_location_code=origin_location_code,
                destination_location_code=destination_location_code,
                departure_date=departure_date,
                adults=adults,
            )
        except TravelProviderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response(result, status=status.HTTP_200_OK)


class TravelLocationSearchView(APIView):
    permission_classes = [IsAuthenticated, EmployeesEnabled]

    def get(self, request):
        restriction = get_access_restriction(request.user, write=False)
        if restriction:
            return Response({"detail": restriction}, status=status.HTTP_403_FORBIDDEN)

        keyword = str(request.query_params.get("q") or "").strip()
        if len(keyword) < 2:
            return Response(
                {"provider": "local-airport-index", "meta": {"count": 0, "keyword": keyword}, "data": [], "raw": []},
                status=status.HTTP_200_OK,
            )

        try:
            result = search_travel_locations(keyword=keyword)
        except TravelProviderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response(result, status=status.HTTP_200_OK)
