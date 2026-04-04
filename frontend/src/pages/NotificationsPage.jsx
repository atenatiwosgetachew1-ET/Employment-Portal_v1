import { useCallback, useEffect, useMemo, useState } from 'react'
import * as notificationsService from '../services/notificationsService'

export default function NotificationsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await notificationsService.fetchNotifications()
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Could not load notifications')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const unread = useMemo(() => items.filter((item) => !item.read).length, [items])

  const handleMarkRead = async (item) => {
    if (item.read) return
    try {
      await notificationsService.patchNotification(item.id, { read: true })
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, read: true } : row)))
    } catch (err) {
      setError(err.message || 'Could not update notification')
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationsService.markAllNotificationsRead()
      setItems((prev) => prev.map((item) => ({ ...item, read: true })))
    } catch (err) {
      setError(err.message || 'Could not mark notifications as read')
    }
  }

  return (
    <section className="dashboard-panel notifications-page">
      <div className="notifications-page-header">
        <div>
          <h1>Notifications</h1>
          <p className="muted-text">
            Review recent activity, alerts, and system messages in one place.
          </p>
        </div>
        <div className="notifications-page-actions">
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleMarkAllRead} disabled={unread === 0}>
            Mark all read
          </button>
        </div>
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      <div className="notifications-page-list">
        {loading ? (
          <p className="notifications-page-empty muted-text">Loading notifications...</p>
        ) : items.length === 0 ? (
          <p className="notifications-page-empty muted-text">No notifications yet.</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`notification-item notifications-page-item${item.read ? '' : ' is-unread'}`}
              onClick={() => handleMarkRead(item)}
            >
              <span className="notification-item-title">{item.title}</span>
              {item.body ? <span className="notification-item-body">{item.body}</span> : null}
              <span className="notification-item-time">
                {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  )
}
