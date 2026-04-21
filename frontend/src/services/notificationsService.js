import { apiFetch } from '../api/client'

const NOTIFICATIONS_LAST_SEEN_ID_KEY = 'employment-portal.notifications.lastSeenId'

export async function fetchNotifications() {
  const response = await apiFetch('/api/notifications/')
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to load notifications')
  }
  return response.json()
}

export async function patchNotification(id, payload) {
  const response = await apiFetch(`/api/notifications/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.detail || 'Failed to update notification')
  }
  return data
}

export async function markAllNotificationsRead() {
  const response = await apiFetch('/api/notifications/mark-all-read/', {
    method: 'POST',
    body: JSON.stringify({})
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to mark notifications read')
  }
  return response.json()
}

function getMaxNotificationId(items = []) {
  return Array.isArray(items)
    ? items.reduce((maxId, item) => {
        const itemId = Number(item?.id)
        return Number.isFinite(itemId) ? Math.max(maxId, itemId) : maxId
      }, 0)
    : 0
}

export function getLastSeenNotificationId() {
  if (typeof window === 'undefined') return 0

  const raw = Number(window.sessionStorage.getItem(NOTIFICATIONS_LAST_SEEN_ID_KEY))
  return Number.isFinite(raw) ? raw : 0
}

export function markNotificationsViewed(items = []) {
  if (typeof window === 'undefined') return 0

  const nextSeenId = Math.max(getLastSeenNotificationId(), getMaxNotificationId(items))
  window.sessionStorage.setItem(NOTIFICATIONS_LAST_SEEN_ID_KEY, String(nextSeenId))
  window.dispatchEvent(new CustomEvent('notifications:viewed', { detail: { lastSeenId: nextSeenId } }))
  return nextSeenId
}

export function countNewNotifications(items, lastSeenId = getLastSeenNotificationId()) {
  const seenCutoff = Number(lastSeenId)

  return Array.isArray(items)
    ? items.filter((item) => {
        const itemId = Number(item?.id)
        return Number.isFinite(itemId) && itemId > seenCutoff && !item?.read
      }).length
    : 0
}
