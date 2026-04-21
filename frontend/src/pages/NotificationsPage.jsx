import { useCallback, useEffect, useMemo, useState } from 'react'
import * as notificationsService from '../services/notificationsService'

function sortNotifications(items) {
  return [...items].sort((a, b) => {
    if (Boolean(a.read) !== Boolean(b.read)) {
      return a.read ? 1 : -1
    }

    const timeA = new Date(a.created_at || 0).getTime()
    const timeB = new Date(b.created_at || 0).getTime()
    if (timeA !== timeB) {
      return timeB - timeA
    }

    return Number(b.id || 0) - Number(a.id || 0)
  })
}

function toLocalInputValue(date) {
  const target = new Date(date)
  target.setSeconds(0, 0)
  const pad = (value) => String(value).padStart(2, '0')
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`
}

function buildReminderDate(option, customValue) {
  const now = new Date()
  if (option === 'custom') {
    return customValue ? new Date(customValue) : null
  }
  if (option === '1h') {
    return new Date(now.getTime() + 60 * 60 * 1000)
  }
  if (option === '4h') {
    return new Date(now.getTime() + 4 * 60 * 60 * 1000)
  }
  if (option === 'tomorrow') {
    const target = new Date(now)
    target.setDate(target.getDate() + 1)
    target.setHours(9, 0, 0, 0)
    return target
  }
  if (option === '3d') {
    return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  }
  return null
}

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

export default function NotificationsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentTab, setCurrentTab] = useState('all')
  const [reminderTarget, setReminderTarget] = useState(null)
  const [reminderOption, setReminderOption] = useState('tomorrow')
  const [customReminderAt, setCustomReminderAt] = useState(() => toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)))
  const [reminderSaving, setReminderSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await notificationsService.fetchNotifications()
      const normalized = Array.isArray(data) ? data : []
      const restored = await restoreDueReminders(normalized)
      if (restored) {
        const refreshed = await notificationsService.fetchNotifications()
        const nextItems = Array.isArray(refreshed) ? refreshed : []
        setItems(nextItems)
      } else {
        setItems(normalized)
      }
      window.dispatchEvent(new Event('notifications:updated'))
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

  useEffect(() => {
    const delay = getNextReminderDelay(items)
    if (delay == null) return undefined

    const timeoutId = window.setTimeout(() => {
      load()
    }, delay)

    return () => window.clearTimeout(timeoutId)
  }, [items, load])

  const unread = useMemo(() => items.filter((item) => !item.read).length, [items])
  const sortedItems = useMemo(() => sortNotifications(items), [items])
  const visibleItems = useMemo(() => {
    if (currentTab === 'reminder') {
      return sortedItems.filter((item) => item.is_reminder_pending)
    }

    return sortedItems
  }, [currentTab, sortedItems])

  const handleMarkRead = async (item) => {
    if (item.read) return
    try {
      await notificationsService.patchNotification(item.id, { read: true })
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, read: true } : row)))
      window.dispatchEvent(new Event('notifications:updated'))
    } catch (err) {
      setError(err.message || 'Could not update notification')
    }
  }

  const handleToggleReminder = async (item) => {
    if (!item.read) return
    if (!item.is_reminder_pending) {
      setReminderOption('tomorrow')
      setCustomReminderAt(toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)))
      setReminderTarget(item)
      return
    }
    try {
      const data = await notificationsService.patchNotification(item.id, { remind_me: !item.is_reminder_pending })
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, ...data } : row)))
      window.dispatchEvent(new Event('notifications:updated'))
    } catch (err) {
      setError(err.message || 'Could not update notification')
    }
  }

  const closeReminderModal = () => {
    if (reminderSaving) return
    setReminderTarget(null)
  }

  const handleScheduleReminder = async () => {
    if (!reminderTarget) return
    const targetDate = buildReminderDate(reminderOption, customReminderAt)
    if (!targetDate || Number.isNaN(targetDate.getTime())) {
      setError('Choose a valid reminder time.')
      return
    }
    setReminderSaving(true)
    setError('')
    try {
      const data = await notificationsService.patchNotification(reminderTarget.id, {
        remind_at: targetDate.toISOString()
      })
      setItems((prev) => prev.map((row) => (row.id === reminderTarget.id ? { ...row, ...data } : row)))
      setReminderTarget(null)
      window.dispatchEvent(new Event('notifications:updated'))
    } catch (err) {
      setError(err.message || 'Could not schedule reminder')
    } finally {
      setReminderSaving(false)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationsService.markAllNotificationsRead()
      setItems((prev) => prev.map((item) => ({ ...item, read: true })))
      window.dispatchEvent(new Event('notifications:updated'))
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

      <div className="employee-subtabs notifications-tabs" role="tablist" aria-label="Notification categories">
        {[
          { id: 'all', label: 'All notifications' },
          { id: 'reminder', label: 'Reminder' }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={currentTab === tab.id}
            className={`employee-subtab${currentTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setCurrentTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      <div className="notifications-page-list">
        {loading ? (
          <p className="notifications-page-empty muted-text">Loading notifications...</p>
        ) : visibleItems.length === 0 ? (
          <p className="notifications-page-empty muted-text">No notifications yet.</p>
        ) : (
          visibleItems.map((item) => (
            <article
              key={item.id}
              className={`notification-item notifications-page-item${item.read ? '' : ' is-unread'}${item.is_reminder_pending ? ' has-reminder' : ''}`}
            >
              <div className="notification-item-main">
                <span className="notification-item-title">{item.title}</span>
                {item.body ? <span className="notification-item-body">{item.body}</span> : null}
                <span className="notification-item-time">
                  {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                </span>
                {item.is_reminder_pending && item.remind_at ? (
                  <span className="notification-item-reminder">
                    Reminder set for {new Date(item.remind_at).toLocaleString()}
                  </span>
                ) : null}
              </div>
              <div className="notification-item-actions">
                {item.read ? (
                  <button type="button" className="btn-secondary" onClick={() => handleToggleReminder(item)}>
                    {item.is_reminder_pending ? 'Cancel reminder' : 'Remind me'}
                  </button>
                ) : (
                  <button type="button" className="btn-secondary" onClick={() => handleMarkRead(item)}>
                    Mark read
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      {reminderTarget ? (
        <div className="app-confirm-backdrop" role="presentation" onClick={closeReminderModal}>
          <div
            className="app-confirm-dialog notification-reminder-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-reminder-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="app-confirm-header">
              <h2 id="notification-reminder-title">Schedule reminder</h2>
            </div>
            <p className="app-confirm-message">
              Choose when you want to be reminded about "{reminderTarget.title}".
            </p>
            <div className="notification-reminder-options" role="radiogroup" aria-label="Reminder time options">
              {[
                ['1h', 'In 1 hour'],
                ['4h', 'In 4 hours'],
                ['tomorrow', 'Tomorrow at 9:00 AM'],
                ['3d', 'In 3 days'],
                ['custom', 'Pick date and time']
              ].map(([value, label]) => (
                <label key={value} className={`notification-reminder-option${reminderOption === value ? ' is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="notification-reminder-option"
                    value={value}
                    checked={reminderOption === value}
                    onChange={() => setReminderOption(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {reminderOption === 'custom' ? (
              <label className="notification-reminder-custom">
                Reminder date and time
                <input
                  type="datetime-local"
                  value={customReminderAt}
                  onChange={(event) => setCustomReminderAt(event.target.value)}
                />
              </label>
            ) : null}
            <div className="app-confirm-actions">
              <button type="button" className="btn-secondary" onClick={closeReminderModal} disabled={reminderSaving}>
                Cancel
              </button>
              <button type="button" className="btn-secondary" onClick={handleScheduleReminder} disabled={reminderSaving}>
                {reminderSaving ? 'Saving...' : 'Set reminder'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
