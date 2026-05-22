import { apiFetch } from '../api/client'

function responseError(data, fallback) {
  if (typeof data?.detail === 'string') return data.detail
  if (typeof data?.message === 'string') return data.message
  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
      .join(' ')
  }
  return fallback
}

export async function verifyTicketWithAgency({ pnr, lastName }) {
  const response = await apiFetch('/api/travel/tickets/verify/', {
    method: 'POST',
    body: JSON.stringify({
      pnr: String(pnr || '').trim().toUpperCase(),
      last_name: String(lastName || '').trim()
    })
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Ticket verification failed'))
  }
  return data
}

export async function searchFlightAvailabilities({
  originLocationCode,
  destinationLocationCode,
  departureDate,
  adults = 1
}) {
  const response = await apiFetch('/api/travel/flight-availabilities/', {
    method: 'POST',
    body: JSON.stringify({
      originLocationCode: String(originLocationCode || '').trim().toUpperCase(),
      destinationLocationCode: String(destinationLocationCode || '').trim().toUpperCase(),
      departureDate: String(departureDate || '').trim(),
      adults: Number(adults || 1)
    })
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Flight availability search failed'))
  }
  return {
    provider: typeof data.provider === 'string' ? data.provider : 'local-flight-index',
    meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
    data: Array.isArray(data.data) ? data.data : [],
    raw: data.raw
  }
}

export async function searchTravelLocations(query) {
  const normalizedQuery = String(query || '').trim()
  const response = await apiFetch(`/api/travel/locations/?q=${encodeURIComponent(normalizedQuery)}`)

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Travel location search failed'))
  }
  return {
    provider: typeof data.provider === 'string' ? data.provider : 'local-airport-index',
    meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
    data: Array.isArray(data.data) ? data.data : [],
    raw: data.raw
  }
}
