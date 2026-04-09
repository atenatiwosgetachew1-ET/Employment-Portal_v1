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
