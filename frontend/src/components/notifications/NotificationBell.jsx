import { useCallback, useEffect, useRef, useState } from 'react'
import * as notificationsService from '../../services/notificationsService'

function getNextReminderDelay(items) {
  const pendingTimes = items
    .filter((item) => item.is_reminder_pending && item.remind_at)
    .map((item) => new Date(item.remind_at).getTime())
    .filter((value) => Number.isFinite(value))

  if (pendingTimes.length === 0) return null
  const nextAt = Math.min(...pendingTimes)
  return Math.max(1000, nextAt - Date.now())
}

async function restoreDueReminders(items) {
  const dueItems = items.filter((item) => {
    if (!item.read || !item.remind_at) return false
    const remindAt = new Date(item.remind_at).getTime()
    return Number.isFinite(remindAt) && remindAt <= Date.now()
  })

  if (dueItems.length === 0) return false

  await Promise.all(
    dueItems.map((item) => notificationsService.patchNotification(item.id, { read: false }))
  )

  return true
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await notificationsService.fetchNotifications()
      const normalized = Array.isArray(data) ? data : []
      const restored = await restoreDueReminders(normalized)
      if (restored) {
        const refreshed = await notificationsService.fetchNotifications()
        setItems(Array.isArray(refreshed) ? refreshed : [])
      } else {
        setItems(normalized)
      }
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const delay = getNextReminderDelay(items)
    if (delay == null) return undefined

    const timeoutId = window.setTimeout(() => {
      load()
    }, delay)

    return () => window.clearTimeout(timeoutId)
  }, [items, load])

  useEffect(() => {
    if (!open) return
    load()
  }, [open, load])

  useEffect(() => {
    function onDocClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const unread = items.filter((n) => !n.read).length

  const markRead = async (row) => {
    if (row.read) return
    try {
      await notificationsService.patchNotification(row.id, { read: true })
      setItems((prev) =>
        prev.map((n) => (n.id === row.id ? { ...n, read: true } : n))
      )
    } catch {
      /* ignore */
    }
  }

  const markAllRead = async () => {
    try {
      await notificationsService.markAllNotificationsRead()
      setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="notification-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="notification-bell-btn"
        aria-expanded={open}
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="notification-bell-icon" aria-hidden>
          &#128276;
        </span>
        {unread > 0 && <span className="notification-bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="notification-dropdown" role="dialog" aria-label="Notifications list">
          <div className="notification-dropdown-header">
            <span>Notifications</span>
            {unread > 0 && (
              <button type="button" className="notification-mark-all" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div className="notification-dropdown-body">
            {loading && <p className="muted-text">Loading…</p>}
            {!loading && items.length === 0 && (
              <p className="muted-text notification-empty">No notifications yet.</p>
            )}
            {!loading &&
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`notification-item${n.read ? '' : ' is-unread'}`}
                  onClick={() => markRead(n)}
                >
                  <span className="notification-item-title">{n.title}</span>
                  {n.body && <span className="notification-item-body">{n.body}</span>}
                  <span className="notification-item-time">
                    {n.created_at
                      ? new Date(n.created_at).toLocaleString()
                      : ''}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
