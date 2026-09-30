import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as notificationsService from '../services/notificationsService'
import * as employeesService from '../services/employeesService'
import { Modal } from '../components/common'
import { useCandidateReview, useDocumentPreview } from '../context/PortalOverlayContext'
import { useUiFeedback } from '../context/UiFeedbackContext'
import { useAuth } from '../context/AuthContext'
import { isAgentSideWorkspace } from '../utils/profileStore'
import { employeeProfilePhoto, findEmployeeDocument, formatDateTime, isPdfDocumentUrl } from '../utils/employeeHelpers'

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

  const backendDue = dueItems.filter((i) => !i.isReturnRequest || i.backendNotificationId)
  if (backendDue.length > 0) {
    await Promise.all(
      backendDue.map((item) =>
        notificationsService.patchNotification(item.backendNotificationId || item.id, {
          read: false,
          remind_me: false
        }).catch(() => {})
      )
    )
  }

  dueItems.forEach((item) => {
    if (item.isReturnRequest) {
      localStorage.removeItem(`notification_remind_return_${item.employeeId}`)
    }
    item.remind_at = null
  })

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
  const title = (item?.title || '').toLowerCase()
  const body = (item?.body || '').toLowerCase()
  const text = `${title} ${body}`

  if (item?.isReturnRequest || title.startsWith('return request:') || text.includes('return request')) {
    return {
      type: 'return-request',
      label: 'Return Request',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 3 4 7l4 4"/>
          <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H4"/>
        </svg>
      )
    }
  }

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

  if (text.includes('security') || text.includes('breach') || text.includes('unauthorized') || text.includes('suspend') || text.includes('denied') || text.includes('refuse') || text.includes('fail') || text.includes('error')) {
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

  if (text.includes('warning') || text.includes('alert') || text.includes('attention') || text.includes('pending') || text.includes('caution') || text.includes('expire')) {
    return {
      type: 'warning',
      label: 'Warning',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
      )
    }
  }

  if (text.includes('success') || text.includes('approved') || text.includes('welcome') || text.includes('accepted') || text.includes('completed') || text.includes('acknowledged') || text.includes('reinstated')) {
    return {
      type: 'success',
      label: 'Success',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
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
  const { user } = useAuth()
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
  const [actionBusyId, setActionBusyId] = useState(null)
  const [selectedReturnRequestItem, setSelectedReturnRequestItem] = useState(null)
  const { openCandidateReview, closeCandidateReview } = useCandidateReview()
  const { openDocumentPreview } = useDocumentPreview()
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState(() => new Set())
  const dismissedNotificationIdsRef = useRef(new Set())

  const dismissNotification = useCallback((itemOrId, employeeId) => {
    setDismissedNotificationIds((prev) => {
      const next = new Set(prev)
      if (itemOrId) {
        if (typeof itemOrId === 'object') {
          if (itemOrId.id) next.add(String(itemOrId.id))
          if (itemOrId.backendNotificationId) next.add(String(itemOrId.backendNotificationId))
          if (itemOrId.employeeId) {
            next.add(String(itemOrId.employeeId))
            next.add(`emp-${itemOrId.employeeId}`)
            next.add(`return-req-${itemOrId.employeeId}`)
          }
          if (itemOrId.employee?.id) {
            next.add(String(itemOrId.employee.id))
            next.add(`emp-${itemOrId.employee.id}`)
            next.add(`return-req-${itemOrId.employee.id}`)
          }
        } else {
          next.add(String(itemOrId))
        }
      }
      if (employeeId) {
        next.add(String(employeeId))
        next.add(`emp-${employeeId}`)
        next.add(`return-req-${employeeId}`)
      }
      dismissedNotificationIdsRef.current = next
      return next
    })
    setItems((prev) => prev.filter((row) => {
      if (itemOrId && typeof itemOrId === 'object') {
        if (row.id === itemOrId.id || (itemOrId.backendNotificationId && row.backendNotificationId === itemOrId.backendNotificationId)) return false
        if (itemOrId.employeeId && (row.employeeId === itemOrId.employeeId || row.employee?.id === itemOrId.employeeId)) return false
      } else if (itemOrId) {
        if (String(row.id) === String(itemOrId) || String(row.backendNotificationId) === String(itemOrId)) return false
      }
      if (employeeId && (String(row.employeeId) === String(employeeId) || String(row.employee?.id) === String(employeeId) || row.id === `return-req-${employeeId}`)) return false
      return true
    }))
  }, [])

  useEffect(() => {
    if (!selectedReturnRequestItem) return
    const empId = selectedReturnRequestItem.employeeId || selectedReturnRequestItem.employee?.id
    if (!empId) return
    const currentEmp = selectedReturnRequestItem.employee
    if (!currentEmp?.return_request?.evidence_file_1_url && !currentEmp?.documents) {
      employeesService.fetchEmployee(empId).then((fullEmp) => {
        if (fullEmp) {
          setSelectedReturnRequestItem((prev) =>
            prev && (prev.employeeId === empId || prev.employee?.id === empId)
              ? { ...prev, employee: fullEmp }
              : prev
          )
        }
      }).catch(() => {})
    }
  }, [selectedReturnRequestItem])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
    }
    setError('')
    try {
      const [data, pendingRes] = await Promise.all([
        notificationsService.fetchNotifications().catch(() => []),
        employeesService.fetchEmployees({ returnRequestStatus: 'pending', pageSize: 100 }).catch(() => ({ results: [] }))
      ])

      const normalized = Array.isArray(data) ? data : []
      const pendingEmployees = Array.isArray(pendingRes) ? pendingRes : (pendingRes?.results || [])

      const isUserRequesterForEmployee = (emp) => {
        if (!emp?.return_request) return false
        const req = emp.return_request
        if (req.is_requester !== undefined) {
          return Boolean(req.is_requester)
        }
        if (req.requested_by_id && user?.id && Number(req.requested_by_id) === Number(user.id)) {
          return true
        }
        const userIsAgent = isAgentSideWorkspace(user)
        if (req.requested_by_side) {
          return userIsAgent ? req.requested_by_side === 'agent' : req.requested_by_side === 'organization'
        }
        return false
      }

      const matchedEmployeeIds = new Set()
      const enrichedNotifs = normalized
        .filter((notif) => {
          if (dismissedNotificationIdsRef.current.has(String(notif.id))) return false
          const titleLower = (notif.title || '').toLowerCase()
          if (titleLower.startsWith('return request:')) {
            const matchedEmp = pendingEmployees.find(
              (emp) => titleLower.includes((emp.full_name || '').toLowerCase())
            )
            if (matchedEmp) {
              const empIdStr = String(matchedEmp.id)
              if (dismissedNotificationIdsRef.current.has(empIdStr) ||
                  dismissedNotificationIdsRef.current.has(`emp-${empIdStr}`) ||
                  dismissedNotificationIdsRef.current.has(`return-req-${empIdStr}`)) {
                return false
              }
            }
            if (!matchedEmp || isUserRequesterForEmployee(matchedEmp)) {
              if (!matchedEmp && notif.id) {
                notificationsService.deleteNotification(notif.id).catch(() => {})
              }
              return false
            }
          }
          return true
        })
        .map((notif) => {
          const titleLower = (notif.title || '').toLowerCase()
          if (titleLower.startsWith('return request:')) {
            const matchedEmp = pendingEmployees.find(
              (emp) => titleLower.includes((emp.full_name || '').toLowerCase())
            )
            if (matchedEmp) {
              matchedEmployeeIds.add(matchedEmp.id)
              const remindKey = `notification_remind_return_${matchedEmp.id}`
              const localRemind = localStorage.getItem(remindKey)
              const effectiveRemindAt = notif.remind_at || (localRemind && new Date(localRemind).getTime() > Date.now() ? localRemind : null)

              return {
                ...notif,
                isReturnRequest: true,
                backendNotificationId: notif.id,
                employeeId: matchedEmp.id,
                employee: matchedEmp,
                read: false,
                remind_at: effectiveRemindAt
              }
            }
          }
          return notif
        })

      const syntheticItems = []
      pendingEmployees.forEach((emp) => {
        const empIdStr = String(emp.id)
        if (dismissedNotificationIdsRef.current.has(empIdStr) ||
            dismissedNotificationIdsRef.current.has(`emp-${empIdStr}`) ||
            dismissedNotificationIdsRef.current.has(`return-req-${empIdStr}`)) {
          return
        }
        if (!matchedEmployeeIds.has(emp.id) && !isUserRequesterForEmployee(emp)) {
          const remindKey = `notification_remind_return_${emp.id}`
          const localRemind = localStorage.getItem(remindKey)
          const effectiveRemindAt = localRemind && new Date(localRemind).getTime() > Date.now() ? localRemind : null
          const req = emp.return_request || {}
          const requester = req.requested_by_username ? `requested by ${req.requested_by_username}` : 'pending review'
          const reasonText = req.remark ? `: "${req.remark}"` : ''

          syntheticItems.push({
            id: `return-req-${emp.id}`,
            isReturnRequest: true,
            employeeId: emp.id,
            employee: emp,
            title: `Return request: ${emp.full_name}`,
            body: `Return ${requester}${reasonText}`,
            kind: 'warning',
            read: false,
            remind_at: effectiveRemindAt,
            created_at: req.requested_at || emp.updated_at || new Date().toISOString()
          })
        }
      })

      const combined = [...syntheticItems, ...enrichedNotifs].filter((row) => {
        const idStr = String(row.id)
        const empIdStr = row.employeeId ? String(row.employeeId) : (row.employee?.id ? String(row.employee.id) : null)
        const backendIdStr = row.backendNotificationId ? String(row.backendNotificationId) : null
        if (dismissedNotificationIdsRef.current.has(idStr)) return false
        if (backendIdStr && dismissedNotificationIdsRef.current.has(backendIdStr)) return false
        if (empIdStr && (dismissedNotificationIdsRef.current.has(empIdStr) || dismissedNotificationIdsRef.current.has(`emp-${empIdStr}`) || dismissedNotificationIdsRef.current.has(`return-req-${empIdStr}`))) return false
        return true
      })
      await restoreDueReminders(combined)
      setItems(combined)
      notificationsService.markNotificationsViewed(combined)
      window.dispatchEvent(new Event('notifications:viewed'))
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
  }, [user])

  const matureDueRemindersLocally = useCallback(() => {
    const now = Date.now()
    const maturedItems = []

    setItems((prev) => {
      let changed = false
      const next = prev.map((item) => {
        if (item.remind_at) {
          const dueTime = new Date(item.remind_at).getTime()
          if (Number.isFinite(dueTime) && dueTime <= now) {
            changed = true
            maturedItems.push(item)
            if (item.isReturnRequest) {
              localStorage.removeItem(`notification_remind_return_${item.employeeId}`)
            }
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

      const backendMatured = maturedItems.filter((i) => !i.isReturnRequest || i.backendNotificationId)
      if (backendMatured.length > 0) {
        Promise.all(
          backendMatured.map((item) =>
            notificationsService.patchNotification(item.backendNotificationId || item.id, {
              read: false,
              remind_me: false
            }).catch(() => {})
          )
        ).then(() => {
          window.dispatchEvent(new Event('notifications:updated'))
        })
      }
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

  useEffect(() => {
    const handleSync = () => {
      load({ silent: true })
    }
    const handleStorage = (event) => {
      if (event.key === 'portal:cross_tab_sync') {
        load({ silent: true })
      }
    }
    window.addEventListener('notifications:updated', handleSync)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('notifications:updated', handleSync)
      window.removeEventListener('storage', handleStorage)
    }
  }, [load])

  const unreadCount = useMemo(
    () => items.filter((item) => {
      const idStr = String(item.id)
      const empIdStr = item.employeeId ? String(item.employeeId) : (item.employee?.id ? String(item.employee.id) : null)
      const backendIdStr = item.backendNotificationId ? String(item.backendNotificationId) : null
      if (dismissedNotificationIds.has(idStr)) return false
      if (backendIdStr && dismissedNotificationIds.has(backendIdStr)) return false
      if (empIdStr && (dismissedNotificationIds.has(empIdStr) || dismissedNotificationIds.has(`emp-${empIdStr}`) || dismissedNotificationIds.has(`return-req-${empIdStr}`))) return false
      return !item.read && !isReminderPending(item)
    }).length,
    [dismissedNotificationIds, items]
  )
  const reminderCount = useMemo(() => items.filter((item) => {
    const idStr = String(item.id)
    const empIdStr = item.employeeId ? String(item.employeeId) : (item.employee?.id ? String(item.employee.id) : null)
    const backendIdStr = item.backendNotificationId ? String(item.backendNotificationId) : null
    if (dismissedNotificationIds.has(idStr)) return false
    if (backendIdStr && dismissedNotificationIds.has(backendIdStr)) return false
    if (empIdStr && (dismissedNotificationIds.has(empIdStr) || dismissedNotificationIds.has(`emp-${empIdStr}`) || dismissedNotificationIds.has(`return-req-${empIdStr}`))) return false
    return isReminderPending(item)
  }).length, [dismissedNotificationIds, items])
  const sortedItems = useMemo(() => sortNotifications(items), [items])

  const visibleItems = useMemo(() => {
    let filtered = sortedItems.filter((item) => {
      const idStr = String(item.id)
      const empIdStr = item.employeeId ? String(item.employeeId) : (item.employee?.id ? String(item.employee.id) : null)
      const backendIdStr = item.backendNotificationId ? String(item.backendNotificationId) : null
      if (dismissedNotificationIds.has(idStr)) return false
      if (backendIdStr && dismissedNotificationIds.has(backendIdStr)) return false
      if (empIdStr && (dismissedNotificationIds.has(empIdStr) || dismissedNotificationIds.has(`emp-${empIdStr}`) || dismissedNotificationIds.has(`return-req-${empIdStr}`))) return false
      return true
    })

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
  }, [currentTab, dismissedNotificationIds, searchQuery, sortedItems])

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
      if (currentTab === 'unread') {
        dismissNotification(item)
      }
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
      if (item.isReturnRequest) {
        if (item.backendNotificationId) {
          await notificationsService.patchNotification(item.backendNotificationId, { remind_me: false }).catch(() => {})
        }
        localStorage.removeItem(`notification_remind_return_${item.employeeId}`)
        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id ? { ...row, is_reminder_pending: false, remind_at: null } : row
          )
        )
      } else {
        const data = await notificationsService.patchNotification(item.id, { remind_me: false })
        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id ? { ...row, ...data, is_reminder_pending: false, remind_at: null } : row
          )
        )
      }
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
      if (reminderTarget.isReturnRequest) {
        if (reminderTarget.backendNotificationId) {
          await notificationsService.patchNotification(reminderTarget.backendNotificationId, {
            remind_at: targetDate.toISOString(),
            read: false
          }).catch(() => {})
        }
        localStorage.setItem(`notification_remind_return_${reminderTarget.employeeId}`, targetDate.toISOString())
        setItems((prev) =>
          prev.map((row) =>
            row.id === reminderTarget.id
              ? {
                  ...row,
                  read: false,
                  is_reminder_pending: true,
                  remind_at: targetDate.toISOString()
                }
              : row
          )
        )
      } else {
        const data = await notificationsService.patchNotification(reminderTarget.id, {
          remind_at: targetDate.toISOString(),
          read: false
        })
        setItems((prev) =>
          prev.map((row) =>
            row.id === reminderTarget.id
              ? {
                  ...row,
                  ...data,
                  read: false,
                  is_reminder_pending: true,
                  remind_at: targetDate.toISOString()
                }
              : row
          )
        )
      }
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

  const handleAcknowledgeReturn = async (item, event) => {
    if (event) event.stopPropagation()
    const employeeId = item.employeeId || item.employee?.id
    if (!employeeId) return

    setActionBusyId(item.id)
    dismissNotification(item, employeeId)
    closeCandidateReview()
    setSelectedReturnRequestItem(null)
    localStorage.removeItem(`notification_remind_return_${employeeId}`)
    setError('')
    try {
      await employeesService.approveEmployeeReturnRequest(employeeId)
      showToast(`Return acknowledged for ${item.employee?.full_name || 'candidate'}. Moved to returned list.`, {
        tone: 'success',
        duration: 4000
      })
      window.dispatchEvent(new Event('portal:refresh-candidates'))
      window.dispatchEvent(new Event('notifications:updated'))
    } catch (err) {
      showToast(err.message || 'Failed to acknowledge return request', { tone: 'danger' })
    } finally {
      setActionBusyId(null)
    }
  }

  const handleRefuseReturn = async (item, event) => {
    if (event) event.stopPropagation()
    const employeeId = item.employeeId || item.employee?.id
    if (!employeeId) return

    const candidateName = item.employee?.full_name || 'this candidate'
    const confirmed = window.confirm(`Are you sure you want to refuse the return request for ${candidateName}?`)
    if (!confirmed) return

    setActionBusyId(item.id)
    dismissNotification(item, employeeId)
    closeCandidateReview()
    setSelectedReturnRequestItem(null)
    localStorage.removeItem(`notification_remind_return_${employeeId}`)
    setError('')
    try {
      await employeesService.refuseEmployeeReturnRequest(employeeId)
      showToast(`Return request refused for ${candidateName}.`, {
        tone: 'info',
        duration: 4000
      })
      window.dispatchEvent(new Event('portal:refresh-candidates'))
      window.dispatchEvent(new Event('notifications:updated'))
    } catch (err) {
      showToast(err.message || 'Failed to refuse return request', { tone: 'danger' })
    } finally {
      setActionBusyId(null)
    }
  }

  const handleOpenProfileModal = (employee, event) => {
    if (event) event.stopPropagation()
    if (employee) {
      setSelectedReturnRequestItem(null)
      openCandidateReview(employee, {
        initialMode: 'full',
        onApproveReturn: () => {
          const item = items.find((i) => i.employeeId === employee.id || i.employee?.id === employee.id) || { employeeId: employee.id, employee, id: `return-req-${employee.id}` }
          dismissNotification(item, employee.id)
          handleAcknowledgeReturn(item)
          closeCandidateReview()
        },
        onRefuseReturn: () => {
          const item = items.find((i) => i.employeeId === employee.id || i.employee?.id === employee.id) || { employeeId: employee.id, employee, id: `return-req-${employee.id}` }
          dismissNotification(item, employee.id)
          handleRefuseReturn(item)
          closeCandidateReview()
        },
      })
    }
  }

  const handleMarkAllRead = async () => {
    setItems((prev) =>
      prev.map((item) =>
        item.isReturnRequest
          ? item
          : { ...item, read: true, is_reminder_pending: false, remind_at: null }
      )
    )
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
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
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
            const isUnread = item.isReturnRequest
              ? (!hasReminder)
              : (currentTab === 'reminder' ? true : (!item.read && !hasReminder))
            const showReadButton = item.isReturnRequest
              ? false
              : (currentTab === 'reminder' ? true : (isUnread && !hasReminder))
            const showRemindButton = currentTab !== 'reminder'
            const category = getCategoryInfo(item)
            const relativeTime = formatRelativeTime(item.created_at)
            const fullDate = item.created_at ? new Date(item.created_at).toLocaleString() : ''

            const isDismissed = dismissedNotificationIds.has(String(item.id)) ||
              (item.backendNotificationId && dismissedNotificationIds.has(String(item.backendNotificationId))) ||
              (item.employeeId && (dismissedNotificationIds.has(String(item.employeeId)) || dismissedNotificationIds.has(`emp-${item.employeeId}`)))
            if (isDismissed) return null

            return (
              <article
                key={item.id}
                className={`notifications-page-item${isUnread ? ' is-unread' : ' is-read'}${hasReminder ? ' has-reminder' : ''}${isExpanded ? ' is-expanded' : ''}`}
                style={isDismissed ? { display: 'none !important' } : undefined}
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
                    <span className={`notification-category-badge notification-category-badge--${category.type}`}>{category.label}</span>
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
                      {item.isReturnRequest ? (
                        <>
                          <div className="notification-expanded-row">
                            <span className="notification-detail-label">Candidate</span>
                            <span className="notification-detail-val">{item.employee?.full_name || 'N/A'}</span>
                          </div>
                          <div className="notification-expanded-row">
                            <span className="notification-detail-label">Profession</span>
                            <span className="notification-detail-val">{item.employee?.professional_title || item.employee?.profession || 'N/A'}</span>
                          </div>
                          <div className="notification-expanded-row">
                            <span className="notification-detail-label">Requested by</span>
                            <span className="notification-detail-val">{item.employee?.return_request?.requested_by_username || 'Agent'}</span>
                          </div>
                          <div className="notification-expanded-row">
                            <span className="notification-detail-label">Requested date</span>
                            <span className="notification-detail-val">{formatDateTime(item.employee?.return_request?.requested_at || item.created_at)}</span>
                          </div>
                          {item.employee?.return_request?.remark && (
                            <div className="notification-expanded-row">
                              <span className="notification-detail-label">Reason / Remark</span>
                              <span className="notification-detail-val">{item.employee.return_request.remark}</span>
                            </div>
                          )}
                          <div className="notification-expanded-row">
                            <span className="notification-detail-label">Status</span>
                            <span className="notification-detail-val notification-detail-val--badge">Pending Return Review</span>
                          </div>
                          {item.remind_at && (
                            <div className="notification-expanded-row">
                              <span className="notification-detail-label">Scheduled reminder</span>
                              <span className="notification-detail-val">{new Date(item.remind_at).toLocaleString()}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
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
                        </>
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
                  {item.isReturnRequest ? (
                    <>
                      <button
                        type="button"
                        className="notification-micro-btn notification-micro-btn--acknowledge"
                        onClick={(e) => handleAcknowledgeReturn(item, e)}
                        disabled={actionBusyId === item.id}
                        title="Acknowledge return and mark candidate as returned"
                        aria-label="Acknowledge return"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span className="micro-btn-label">Acknowledge return</span>
                      </button>

                      <button
                        type="button"
                        className="notification-micro-btn notification-micro-btn--refuse"
                        onClick={(e) => handleRefuseReturn(item, e)}
                        disabled={actionBusyId === item.id}
                        title="Refuse return request"
                        aria-label="Refuse request"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        <span className="micro-btn-label">Refuse request</span>
                      </button>

                      <button
                        type="button"
                        className="notification-micro-btn notification-micro-btn--profile"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedReturnRequestItem(item)
                        }}
                        disabled={actionBusyId === item.id}
                        title="Open return request & evidence details"
                        aria-label="Open"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                        <span className="micro-btn-label">Open</span>
                      </button>

                      {showRemindButton && (
                        <button
                          type="button"
                          className={`notification-micro-btn notification-micro-btn--clock${hasReminder ? ' is-active is-disabled' : ''}`}
                          onClick={hasReminder ? undefined : (e) => handleToggleReminder(item, e)}
                          disabled={hasReminder || actionBusyId === item.id}
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
                    </>
                  ) : (
                    <>
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
                    </>
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
                    <span className={`notification-category-pill notification-category-badge--${targetCategory.type}`}>{targetCategory.label}</span>
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

      {/* Return Request Notification Detail Modal */}
      <Modal
        isOpen={Boolean(selectedReturnRequestItem)}
        onClose={() => setSelectedReturnRequestItem(null)}
        title="Return Request Details"
        subtitle="Review return reason, attached evidence documents, and candidate profile."
        maxWidth="580px"
        className="notification-detail-modal-dialog"
        backdropClassName="notification-detail-backdrop"
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '10px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setSelectedReturnRequestItem(null)}
            >
              Close
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={(e) => {
                  const target = selectedReturnRequestItem
                  setSelectedReturnRequestItem(null)
                  handleToggleReminder(target, e)
                }}
                disabled={actionBusyId === selectedReturnRequestItem?.id}
                title="Snooze / Remind me later"
              >
                Remind
              </button>
              <button
                type="button"
                className="btn-secondary notification-profile-btn--refuse"
                onClick={() => handleRefuseReturn(selectedReturnRequestItem)}
                disabled={actionBusyId === selectedReturnRequestItem?.id}
                style={{ color: 'var(--color-danger, #ef4444)' }}
              >
                Refuse request
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleAcknowledgeReturn(selectedReturnRequestItem)}
                disabled={actionBusyId === selectedReturnRequestItem?.id}
              >
                Acknowledge return
              </button>
            </div>
          </div>
        }
      >
        {selectedReturnRequestItem && (() => {
          const emp = selectedReturnRequestItem.employee || {}
          const candidateName = emp.full_name || selectedReturnRequestItem.title?.replace(/^Return request:\s*/i, '') || 'Candidate'
          const candidateProfession = emp.professional_title || emp.profession || 'Candidate'
          const candidateCode = emp.candidate_id || emp.candidate_no || (emp.id ? String(emp.id) : '')
          const agentName = emp.agent?.name || emp.agent_name || emp.organization?.name || ''
          const returnReq = emp.return_request || {}
          const candidatePhotoDoc = employeeProfilePhoto(emp)
          const avatarUrl = candidatePhotoDoc?.file_url || emp.profile_photo_url || emp.avatar_url || ''
          const candidateInitials = candidateName.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'C'

          const rawEvidence = [
            returnReq.evidence_file_1_url,
            returnReq.evidence_file_2_url,
            returnReq.evidence_file_3_url,
            returnReq.evidence_file_1,
            returnReq.evidence_file_2,
            returnReq.evidence_file_3,
          ]

          // Also include any return-related documents from emp.documents if present
          if (Array.isArray(emp.documents)) {
            emp.documents.forEach((doc) => {
              const docType = String(doc.document_type || '').toLowerCase()
              if (docType.includes('return') || doc.is_return_evidence || doc.is_return_attachment) {
                if (doc.file_url) rawEvidence.push(doc.file_url)
                if (doc.url) rawEvidence.push(doc.url)
              }
            })
          }

          const rawUrls = rawEvidence.filter((u) => typeof u === 'string' && u.trim().length > 0)
          const uniqueUrls = [...new Set(rawUrls)]
          const evidenceDocs = uniqueUrls.map((url, idx) => {
            const isPdf = isPdfDocumentUrl(url)
            const label = `Return evidence ${idx + 1}`
            return {
              id: `return-evidence-${idx + 1}`,
              url,
              file_url: url,
              label,
              name: label,
              title: label,
              subtitle: `${candidateName} — ${label}`,
              document_type: 'returns',
              is_return_evidence: true,
              isPdf,
              isImage: !isPdf,
            }
          })

          return (
            <div className="notification-candidate-profile-body">
              {/* Hero with avatar, candidate info, and right-side profile action */}
              <div className="notification-profile-hero">
                <div className="notification-profile-avatar-container">
                  <div className="notification-profile-avatar-wrap">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={candidateName} className="notification-profile-avatar" />
                    ) : (
                      <span className="notification-profile-avatar-fallback" aria-hidden="true">{candidateInitials}</span>
                    )}
                  </div>
                </div>

                <div className="notification-profile-hero-info">
                  <h3 className="notification-profile-name">{candidateName}</h3>
                  <p className="notification-profile-title">{candidateProfession}</p>
                  <div className="notification-profile-badges">
                    {candidateCode && (
                      <span className="notification-profile-badge">
                        <strong>ID:</strong> {candidateCode}
                      </span>
                    )}
                    {agentName && (
                      <span className="notification-profile-badge">
                        <strong>Agent:</strong> {agentName}
                      </span>
                    )}
                    <span className="notification-profile-badge" style={{ color: 'var(--tag-orange-bg)' }}>
                      Pending Return Review
                    </span>
                  </div>
                </div>

                <div className="notification-profile-hero-action">
                  <button
                    type="button"
                    className="btn-secondary notification-profile-btn--profile"
                    onClick={() => handleOpenProfileModal(emp)}
                    title="Open candidate details"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    Profile
                  </button>
                </div>
              </div>

              {/* Return request details & attached evidence */}
              <div className="notification-profile-request-box">
                <div className="notification-profile-request-header">
                  <span className="notification-profile-section-title">Return Request Details</span>
                  <span className="notification-profile-status-pill">Pending Review</span>
                </div>

                <div className="notification-profile-request-grid">
                  <div>
                    <span className="notification-profile-field-label">Requested by</span>
                    <span className="notification-profile-field-value">
                      {returnReq.requested_by_username || 'Agent'}
                    </span>
                  </div>
                  <div>
                    <span className="notification-profile-field-label">Requested Date</span>
                    <span className="notification-profile-field-value">
                      {formatDateTime(returnReq.requested_at || selectedReturnRequestItem.created_at)}
                    </span>
                  </div>

                  {returnReq.remark && (
                    <div className="notification-profile-request-field--full">
                      <span className="notification-profile-field-label">Reason / Remark</span>
                      <p className="notification-profile-field-remark">{returnReq.remark}</p>
                    </div>
                  )}
                </div>

                {/* Evidence files holding */}
                <div className="notification-profile-evidence-wrap">
                  <span className="notification-profile-field-label" style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                    Attached Evidence Documents
                  </span>

                  {evidenceDocs.length > 0 ? (
                    <div className="notification-profile-evidence-list">
                      {evidenceDocs.map((doc, idx) => (
                        <button
                          key={doc.id || `evidence-${idx}`}
                          type="button"
                          className="notification-profile-evidence-link"
                          onClick={() => openDocumentPreview(doc)}
                          title={`Preview ${doc.label || `Evidence ${idx + 1}`}`}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                            <polyline points="10 9 9 9 8 9"/>
                          </svg>
                          <span style={{ fontWeight: 500 }}>{doc.label || `Return Evidence ${idx + 1}`}</span>
                          <span className="notification-profile-evidence-badge">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                            View Document
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="muted-text" style={{ fontSize: '0.82rem', margin: '4px 0 0' }}>
                      No evidence files were attached with this return request.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </Modal>

    </section>
  )
}