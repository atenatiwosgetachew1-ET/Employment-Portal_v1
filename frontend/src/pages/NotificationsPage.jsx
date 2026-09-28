import { useCallback, useEffect, useMemo, useState } from 'react'
import * as notificationsService from '../services/notificationsService'
import { Modal } from '../components/common'
import { useUiFeedback } from '../context/UiFeedbackContext'

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

const REMINDER_PRESETS = [
  {
    id: '1h',
    title: 'In 1 hour',
    getTime: (now) => new Date(now.getTime() + 60 * 60 * 1000)
  },
  {
    id: '4h',
    title: 'In 4 hours',
    getTime: (now) => new Date(now.getTime() + 4 * 60 * 60 * 1000)
  },
  {
    id: 'tomorrow',
    title: 'Tomorrow morning',
    getTime: (now) => {
      const target = new Date(now)
      target.setDate(target.getDate() + 1)
      target.setHours(9, 0, 0, 0)
      return target
    }
  },
  {
    id: '3d',
    title: 'In 3 days',
    getTime: (now) => new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  }
]

function formatReminderTimePreview(date) {
  if (!date || Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow = date.toDateString() === tomorrow.toDateString()

  const timeStr = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (isToday) return `Today, ${timeStr}`
  if (isTomorrow) return `Tomorrow, ${timeStr}`
  return `${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${timeStr}`
}

function buildReminderDate(option, customValue) {
  const now = new Date()
  if (option === 'custom') {
    return customValue ? new Date(customValue) : null
  }
  const preset = REMINDER_PRESETS.find((p) => p.id === option)
  if (preset) {
    return preset.getTime(now)
  }
  return null
}

export function isReminderPending(item) {
  return notificationsService.isReminderPending(item)
}

function getNextReminderDelay(items) {
  const pendingTimes = items
    .filter((item) => isReminderPending(item) && item.remind_at)
    .map((item) => new Date(item.remind_at).getTime())
    .filter((value) => Number.isFinite(value))

  if (pendingTimes.length === 0) return null
  const nextAt = Math.min(...pendingTimes)
  return Math.max(0, nextAt - Date.now())
}

async function restoreDueReminders(items) {
  const dueItems = items.filter((item) => {
    if (!item.remind_at) return false
    const remindAt = new Date(item.remind_at).getTime()
    return Number.isFinite(remindAt) && remindAt <= Date.now()
  })

  if (dueItems.length === 0) return false

  await Promise.all(
    dueItems.map((item) => notificationsService.patchNotification(item.id, { read: false, remind_me: false }))
  )

  return true
}

function formatRelativeTime(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSec < 45) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getCategoryInfo(item) {
  const text = `${item?.title || ''} ${item?.body || ''}`.toLowerCase()
  if (text.includes('travel') || text.includes('flight') || text.includes('ticket') || text.includes('departure') || text.includes('airport')) {
    return {
      type: 'travel',
      label: 'Travel',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
        </svg>
      )
    }
  }
  if (text.includes('commission') || text.includes('settlement') || text.includes('payment') || text.includes('payout') || text.includes('rate') || text.includes('fee')) {
    return {
      type: 'finance',
      label: 'Finance',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="20" height="14" x="2" y="5" rx="2"/>
          <line x1="2" x2="22" y1="10" y2="10"/>
        </svg>
      )
    }
  }
  if (text.includes('employee') || text.includes('candidate') || text.includes('applicant') || text.includes('staff') || text.includes('hired') || text.includes('returned') || text.includes('profile')) {
    return {
      type: 'employee',
      label: 'Candidate',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      )
    }
  }
  if (text.includes('alert') || text.includes('security') || text.includes('fail') || text.includes('error') || text.includes('warning') || text.includes('suspend') || text.includes('denied')) {
    return {
      type: 'security',
      label: 'Security',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
          <line x1="12" x2="12" y1="9" y2="13"/>
          <line x1="12" x2="12.01" y1="17" y2="17"/>
        </svg>
      )
    }
  }
  return {
    type: 'system',
    label: 'System',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
      </svg>
    )
  }
}



export default function NotificationsPage() {
  const { showToast } = useUiFeedback()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentTab, setCurrentTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [reminderTarget, setReminderTarget] = useState(null)
  const [reminderOption, setReminderOption] = useState('tomorrow')
  const [customReminderAt, setCustomReminderAt] = useState(() => toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)))
  const [reminderSaving, setReminderSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [expandedNotificationIds, setExpandedNotificationIds] = useState(() => new Set())

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
    }
    setError('')
    try {
      const data = await notificationsService.fetchNotifications()
      const normalized = Array.isArray(data) ? data : []
      const restored = await restoreDueReminders(normalized)
      if (restored) {
        const refreshed = await notificationsService.fetchNotifications()
        const nextItems = Array.isArray(refreshed) ? refreshed : []
        setItems(nextItems)
        notificationsService.markNotificationsViewed(nextItems)
      } else {
        setItems(normalized)
        notificationsService.markNotificationsViewed(normalized)
      }
      window.dispatchEvent(new Event('notifications:updated'))
    } catch (err) {
      if (!silent) {
        setError(err.message || 'Could not load notifications')
        setItems([])
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  const matureDueRemindersLocally = useCallback(() => {
    const now = Date.now()
    const maturedItems = []

    setItems((prev) => {
      let changed = false
      const next = prev.map((item) => {
        if (!item.read && item.remind_at) {
          const dueTime = new Date(item.remind_at).getTime()
          if (Number.isFinite(dueTime) && dueTime <= now) {
            changed = true
            maturedItems.push(item)
            return {
              ...item,
              read: false,
              remind_at: null,
              is_reminder_pending: false
            }
          }
        }
        return item
      })
      return changed ? next : prev
    })

    if (maturedItems.length > 0) {
      maturedItems.forEach((item) => {
        showToast(item.title || 'Your scheduled reminder is due.', {
          title: 'Reminder Alert',
          tone: 'info',
          duration: 5000
        })
      })

      Promise.all(
        maturedItems.map((item) =>
          notificationsService.patchNotification(item.id, { read: false, remind_me: false }).catch(() => {})
        )
      ).then(() => {
        window.dispatchEvent(new Event('notifications:updated'))
      })
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    matureDueRemindersLocally()

    const delay = getNextReminderDelay(items)
    if (delay == null) return undefined

    const timerId = window.setTimeout(() => {
      matureDueRemindersLocally()
    }, delay + 50)

    const intervalId = window.setInterval(() => {
      matureDueRemindersLocally()
    }, 2500)

    const handleSync = () => {
      matureDueRemindersLocally()
    }
    window.addEventListener('focus', handleSync)
    document.addEventListener('visibilitychange', handleSync)

    return () => {
      window.clearTimeout(timerId)
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleSync)
      document.removeEventListener('visibilitychange', handleSync)
    }
  }, [items, matureDueRemindersLocally])

  const unreadCount = useMemo(
    () => items.filter((item) => !item.read && !isReminderPending(item)).length,
    [items]
  )
  const reminderCount = useMemo(() => items.filter((item) => isReminderPending(item)).length, [items])
  const sortedItems = useMemo(() => sortNotifications(items), [items])

  const visibleItems = useMemo(() => {
    let filtered = sortedItems

    if (currentTab === 'unread') {
      filtered = filtered.filter((item) => !item.read && !isReminderPending(item))
    } else if (currentTab === 'reminder') {
      filtered = filtered.filter((item) => isReminderPending(item))
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      filtered = filtered.filter((item) =>
        (item.title && item.title.toLowerCase().includes(query)) ||
        (item.body && item.body.toLowerCase().includes(query))
      )
    }

    return filtered
  }, [currentTab, searchQuery, sortedItems])

  const handleMarkRead = async (item, event) => {
    if (event) event.stopPropagation()
    try {
      const data = await notificationsService.patchNotification(item.id, {
        read: true,
        remind_me: false
      })
      setItems((prev) => prev.map((row) => (
        row.id === item.id 
          ? { 
              ...row, 
              ...data, 
              read: true, 
              is_reminder_pending: false, 
              remind_at: null 
            } 
          : row
      )))
      if (currentTab === 'reminder') {
        showToast('Reminder marked as read.', { tone: 'success', duration: 3000 })
      }
      window.dispatchEvent(new Event('notifications:updated'))
    } catch (err) {
      setError(err.message || 'Could not update notification')
    }
  }

  const handleToggleReminder = async (item, event) => {
    if (event) event.stopPropagation()
    if (!isReminderPending(item)) {
      setReminderOption('tomorrow')
      setCustomReminderAt(toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)))
      setModalError('')
      setReminderTarget(item)
      return
    }
    try {
      const data = await notificationsService.patchNotification(item.id, { remind_me: false })
      setItems((prev) => prev.map((row) => (
        row.id === item.id 
          ? { ...row, ...data, is_reminder_pending: false, remind_at: null } 
          : row
      )))
      showToast('Reminder cancelled.', { tone: 'info', duration: 3000 })
      window.dispatchEvent(new Event('notifications:updated'))
    } catch (err) {
      setError(err.message || 'Could not cancel reminder')
    }
  }

  const closeReminderModal = () => {
    if (reminderSaving) return
    setReminderTarget(null)
    setModalError('')
  }

  const handleScheduleReminder = async () => {
    if (!reminderTarget) return
    setModalError('')
    const targetDate = buildReminderDate(reminderOption, customReminderAt)
    if (!targetDate || Number.isNaN(targetDate.getTime())) {
      setModalError('Choose a valid reminder date & time.')
      return
    }
    if (targetDate.getTime() <= Date.now()) {
      setModalError('Reminder time must be set in the future.')
      return
    }
    setReminderSaving(true)
    setError('')
    try {
      const data = await notificationsService.patchNotification(reminderTarget.id, {
        remind_at: targetDate.toISOString(),
        read: false
      })
      setItems((prev) => prev.map((row) => (
        row.id === reminderTarget.id 
          ? { 
              ...row, 
              ...data, 
              read: false,
              is_reminder_pending: true, 
              remind_at: targetDate.toISOString() 
            } 
          : row
      )))
      setReminderTarget(null)
      window.dispatchEvent(new Event('notifications:updated'))
      const timePreview = formatReminderTimePreview(targetDate)
      showToast(`Reminder set for ${timePreview}.`, {
        title: 'Reminder scheduled',
        tone: 'success',
        duration: 4000
      })
    } catch (err) {
      setModalError(err.message || 'Could not schedule reminder.')
    } finally {
      setReminderSaving(false)
    }
  }

  const handleMarkAllRead = async () => {
    setItems((prev) => prev.map((item) => ({ ...item, read: true, is_reminder_pending: false, remind_at: null })))
    try {
      await notificationsService.markAllNotificationsRead()
      window.dispatchEvent(new Event('notifications:updated'))
    } catch (err) {
      setError(err.message || 'Could not mark notifications as read')
    }
  }

  const toggleNotificationExpanded = useCallback((item) => {
    setExpandedNotificationIds((prev) => {
      const next = new Set(prev)
      if (next.has(item.id)) {
        next.delete(item.id)
      } else {
        next.add(item.id)
      }
      return next
    })
  }, [])

  return (
    <section className="dashboard-panel notifications-page">
      {/* Top Header Bar */}
      <div className="notifications-page-header">
        <div className="notifications-header-left">
          <div className="notifications-title-row">
            <div className="notifications-title-icon-tile" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <h1>Notifications</h1>
            {unreadCount > 0 && (
              <span className="notifications-unread-pill" title={`${unreadCount} unread notifications`}>
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="muted-text">
            Stay up to date with activity, candidate movements, settlements, and system updates.
          </p>
        </div>

        <div className="notifications-page-actions">
          {/* Fixed Search Bar without overlapping icons */}
          <div className="notifications-search-wrap">
            <svg className="notifications-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" x2="16.65" y1="21" y2="16.65"/>
            </svg>
            <input
              type="text"
              className="notifications-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notifications…"
              aria-label="Search notifications"
              autoComplete="off"
              spellCheck="false"
              style={{ paddingLeft: '44px', paddingRight: '34px' }}
            />
            {searchQuery && (
              <button
                type="button"
                className="notifications-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn-secondary notifications-action-btn"
            onClick={() => load()}
            disabled={loading}
            title="Refresh notifications"
          >
            <svg className={`notifications-btn-icon${loading ? ' is-spinning' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 21h5v-5"/>
            </svg>
            <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            className="btn-secondary notifications-action-btn"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            title="Mark all notifications as read"
          >
            <svg className="notifications-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Mark all read</span>
          </button>
        </div>
      </div>

      {/* Modern Filter Tabs */}
      <div className="notifications-tabs-container">
        <div className="employee-subtabs notifications-tabs" role="tablist" aria-label="Notification categories">
          {[
            { id: 'all', label: 'All', count: items.length },
            { id: 'unread', label: 'Unread', count: unreadCount, highlight: unreadCount > 0 },
            { id: 'reminder', label: 'Reminders', count: reminderCount }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={currentTab === tab.id}
              className={`employee-subtab notifications-tab${currentTab === tab.id ? ' is-active' : ''}`}
              onClick={() => setCurrentTab(tab.id)}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className={`notifications-tab-count${tab.highlight ? ' has-unread' : ''}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {searchQuery && (
          <span className="muted-text notifications-filter-summary">
            Filtering by &ldquo;{searchQuery}&rdquo; ({visibleItems.length} found)
          </span>
        )}
      </div>

      {error ? (
        <div className="error-message message-block--mb-16" role="alert">
          {error}
        </div>
      ) : null}

      {/* Notification List Surface with expanded height */}
      <div className="notifications-page-list">
        {loading ? (
          <div className="notifications-page-empty notifications-page-loading" role="status" aria-live="polite">
            <div className="notifications-loading-icon-wrap" aria-hidden="true">
              <div className="notifications-loading-spinner-ring" />
              <div className="notifications-loading-center-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              </div>
            </div>
            <h3>{items.length > 0 ? 'Refreshing notifications…' : 'Loading notifications…'}</h3>
            <p className="muted-text">
              {items.length > 0
                ? 'Updating your inbox with latest events and reminders.'
                : 'Fetching latest updates and reminders from the portal.'}
            </p>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="notifications-page-empty">
            <div className="notifications-empty-icon">
              {searchQuery ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" x2="16.65" y1="21" y2="16.65"/>
                </svg>
              ) : currentTab === 'unread' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              ) : currentTab === 'reminder' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
                </svg>
              )}
            </div>

            <h3>
              {searchQuery
                ? 'No matching notifications'
                : currentTab === 'unread'
                ? 'All caught up!'
                : currentTab === 'reminder'
                ? 'No pending reminders'
                : 'No notifications yet'}
            </h3>

            <p className="muted-text">
              {searchQuery
                ? `No notifications found matching "${searchQuery}". Try different keywords.`
                : currentTab === 'unread'
                ? 'You have reviewed all incoming messages and alerts.'
                : currentTab === 'reminder'
                ? 'You have no notifications scheduled for later.'
                : 'When new activity or alerts arrive, they will appear here.'}
            </p>

            {searchQuery && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSearchQuery('')}
                style={{ marginTop: '8px' }}
              >
                Clear search filter
              </button>
            )}
          </div>
        ) : (
          visibleItems.map((item) => {
            const hasBody = Boolean(item.body)
            const isExpanded = expandedNotificationIds.has(item.id)
            const hasReminder = isReminderPending(item)
            const isUnread = currentTab === 'reminder' ? true : (!item.read && !hasReminder)
            const showReadButton = currentTab === 'reminder' ? true : (isUnread && !hasReminder)
            const showRemindButton = currentTab !== 'reminder'
            const category = getCategoryInfo(item)
            const relativeTime = formatRelativeTime(item.created_at)
            const fullDate = item.created_at ? new Date(item.created_at).toLocaleString() : ''

            return (
              <article
                key={item.id}
                className={`notifications-page-item${isUnread ? ' is-unread' : ' is-read'}${hasReminder ? ' has-reminder' : ''}${isExpanded ? ' is-expanded' : ''}`}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => toggleNotificationExpanded(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    toggleNotificationExpanded(item)
                  }
                }}
              >
                {/* 1. Unread Status Dot (clean absolute indicator in left gutter) */}
                {isUnread && (
                  <span className="notification-unread-dot" title="Unread notification" aria-label="Unread" />
                )}

                {/* 2. Categorized Icon Tile (cleanly aligned on left) */}
                <div className={`notification-icon-tile notification-icon-tile--${category.type}`} title={category.label}>
                  {category.icon}
                </div>

                {/* 3. Main Notification Body & Expandable Meta */}
                <div className="notification-item-main">
                  <div className="notification-item-title-row">
                    <span className="notification-item-title">{item.title}</span>
                    <span className="notification-category-badge">{category.label}</span>
                    <time className="notification-item-time" dateTime={item.created_at} title={fullDate}>
                      {relativeTime}
                    </time>
                  </div>

                  {hasBody && (
                    <div className="notification-item-body-wrap">
                      <p className="notification-item-body">{item.body}</p>
                    </div>
                  )}

                  {hasReminder && item.remind_at && (
                    <div className="notification-reminder-pill">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                      <span>Remind: {new Date(item.remind_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}

                  {/* Expanded Detail Drawer with full timestamp and status */}
                  {isExpanded && (
                    <div className="notification-item-expanded-meta">
                      <div className="notification-expanded-row">
                        <span className="notification-detail-label">Received</span>
                        <span className="notification-detail-val">{fullDate || 'Recently'}</span>
                      </div>
                      <div className="notification-expanded-row">
                        <span className="notification-detail-label">Status</span>
                        <span className="notification-detail-val">{hasReminder ? 'Reminded' : (item.read ? 'Read' : 'Unread')}</span>
                      </div>
                      {item.remind_at && (
                        <div className="notification-expanded-row">
                          <span className="notification-detail-label">Scheduled reminder</span>
                          <span className="notification-detail-val">{new Date(item.remind_at).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 4. Action Ergonomics: Compact Micro-Action Buttons */}
                <div
                  className="notification-item-actions"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {showReadButton && (
                    <button
                      type="button"
                      className="notification-micro-btn notification-micro-btn--check"
                      onClick={(e) => handleMarkRead(item, e)}
                      title="Mark as read"
                      aria-label="Mark as read"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span className="micro-btn-label">Read</span>
                    </button>
                  )}

                  {showRemindButton && (
                    <button
                      type="button"
                      className={`notification-micro-btn notification-micro-btn--clock${hasReminder ? ' is-active is-disabled' : ''}`}
                      onClick={hasReminder ? undefined : (e) => handleToggleReminder(item, e)}
                      disabled={hasReminder}
                      title={hasReminder ? 'Reminder active (snoozed)' : 'Snooze / Remind me later'}
                      aria-label={hasReminder ? 'Reminder active' : 'Remind me'}
                      aria-disabled={hasReminder}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                      <span className="micro-btn-label">{hasReminder ? 'Snoozed' : 'Remind'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className={`notification-expand-chevron${isExpanded ? ' is-expanded' : ''}`}
                    aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                    title={isExpanded ? 'Collapse details' : 'Expand details'}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleNotificationExpanded(item)
                    }}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      width="14"
                      height="14"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      {isExpanded ? (
                        <path d="M5.5 12.5h9L10 6.5l-4.5 6z" />
                      ) : (
                        <path d="M5.5 7.5h9L10 13.5l-4.5-6z" />
                      )}
                    </svg>
                  </button>
                </div>
              </article>
            )
          })
        )}
      </div>

      {/* Accessible Reminder Modal using Common Primitive */}
      <Modal
        isOpen={Boolean(reminderTarget)}
        onClose={closeReminderModal}
        title="Schedule Reminder"
        subtitle="Choose when to bring this notification back to the top of your inbox."
        maxWidth="500px"
        className="notification-reminder-modal-dialog"
        backdropClassName="notification-reminder-backdrop"
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={closeReminderModal}
              disabled={reminderSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleScheduleReminder}
              disabled={reminderSaving}
            >
              {reminderSaving ? (
                <>
                  <span
                    className="notifications-btn-icon is-spinning"
                    style={{ display: 'inline-flex', marginRight: '6px' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  </span>
                  <span>Saving…</span>
                </>
              ) : (
                'Set reminder'
              )}
            </button>
          </>
        }
      >
        {reminderTarget && (() => {
          const targetCategory = getCategoryInfo(reminderTarget)
          const targetRelativeTime = formatRelativeTime(reminderTarget.created_at)
          const now = new Date()

          return (
            <div className="notification-reminder-modal-content">
              {/* Target Notification Preview Card */}
              <div className="notification-reminder-target-card">
                <div
                  className={`notification-icon-tile notification-icon-tile--${targetCategory.type}`}
                  aria-hidden="true"
                >
                  {targetCategory.icon}
                </div>
                <div className="notification-reminder-target-info">
                  <div className="notification-reminder-target-meta">
                    <span className="notification-category-pill">{targetCategory.label}</span>
                    {targetRelativeTime && (
                      <span className="notification-reminder-target-time">{targetRelativeTime}</span>
                    )}
                  </div>
                  <div className="notification-reminder-target-title">{reminderTarget.title}</div>
                  {reminderTarget.body && (
                    <p className="notification-reminder-target-body">{reminderTarget.body}</p>
                  )}
                </div>
              </div>

              {/* Section Prompt */}
              <div className="notification-reminder-section-label">Remind me at</div>

              {/* Quick Preset Options (2x2 Grid) */}
              <div className="notification-reminder-grid" role="radiogroup" aria-label="Reminder presets">
                {REMINDER_PRESETS.map((preset) => {
                  const isSelected = reminderOption === preset.id
                  const targetTime = preset.getTime(now)
                  return (
                    <label
                      key={preset.id}
                      className={`notification-reminder-card-option${isSelected ? ' is-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="notification-reminder-option"
                        value={preset.id}
                        checked={isSelected}
                        onChange={() => {
                          setReminderOption(preset.id)
                          setModalError('')
                        }}
                        className="notification-reminder-radio-input"
                      />
                      <span className="notification-reminder-radio-indicator" aria-hidden="true" />
                      <div className="notification-reminder-option-text">
                        <span className="notification-reminder-option-title">{preset.title}</span>
                        <span className="notification-reminder-option-time">
                          {formatReminderTimePreview(targetTime)}
                        </span>
                      </div>
                    </label>
                  )
                })}
              </div>

              {/* Custom Date & Time Option Card */}
              <label
                className={`notification-reminder-card-option notification-reminder-card-option--custom${reminderOption === 'custom' ? ' is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="notification-reminder-option"
                  value="custom"
                  checked={reminderOption === 'custom'}
                  onChange={() => {
                    setReminderOption('custom')
                    setModalError('')
                  }}
                  className="notification-reminder-radio-input"
                />
                <span className="notification-reminder-radio-indicator" aria-hidden="true" />
                <div className="notification-reminder-option-text">
                  <span className="notification-reminder-option-title">Custom date & time</span>
                  <span className="notification-reminder-option-time">Pick an exact time from calendar</span>
                </div>
              </label>

              {/* Custom Datetime Input Area */}
              {reminderOption === 'custom' && (
                <div className="notification-reminder-custom-date">
                  <div className="notification-reminder-custom-header">
                    <label htmlFor="custom-reminder-input">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                        <line x1="16" x2="16" y1="2" y2="6" />
                        <line x1="8" x2="8" y1="2" y2="6" />
                        <line x1="3" x2="21" y1="10" y2="10" />
                      </svg>
                      <span>Select Date & Time</span>
                    </label>
                    {customReminderAt && (
                      <span className="notification-reminder-custom-preview">
                        Will alert: {formatReminderTimePreview(new Date(customReminderAt))}
                      </span>
                    )}
                  </div>
                  <div className="notification-reminder-input-wrap">
                    <input
                      id="custom-reminder-input"
                      type="datetime-local"
                      min={toLocalInputValue(new Date())}
                      value={customReminderAt}
                      onChange={(event) => {
                        setCustomReminderAt(event.target.value)
                        setModalError('')
                      }}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Inline Modal Error Message */}
              {modalError && (
                <div className="notification-reminder-error-badge" role="alert">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" x2="12" y1="8" y2="12" />
                    <line x1="12" x2="12.01" y1="16" y2="16" />
                  </svg>
                  <span>{modalError}</span>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>
    </section>
  )
}