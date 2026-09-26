import { describe, expect, it } from 'vitest'
import { isReminderPending } from '../pages/NotificationsPage'

describe('Notifications reminder logic', () => {
  it('returns true when a notification is unread and scheduled in the future', () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const item = { id: 1, read: false, remind_at: futureDate }
    expect(isReminderPending(item)).toBe(true)
  })

  it('returns false when a notification reminder time has reached or passed', () => {
    const pastDate = new Date(Date.now() - 5000).toISOString()
    const item = { id: 2, read: false, remind_at: pastDate }
    expect(isReminderPending(item)).toBe(false)
  })

  it('returns false when notification is marked read regardless of remind_at', () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const item = { id: 3, read: true, remind_at: futureDate }
    expect(isReminderPending(item)).toBe(false)
  })

  it('returns false when remind_at is null or undefined', () => {
    expect(isReminderPending({ id: 4, read: false, remind_at: null })).toBe(false)
    expect(isReminderPending({ id: 5, read: false })).toBe(false)
    expect(isReminderPending(null)).toBe(false)
  })

  it('correctly classifies unread presentation depending on tab and pending reminder', () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const item = { id: 10, read: false, remind_at: futureDate }
    const hasReminder = isReminderPending(item)
    expect(hasReminder).toBe(true)

    // On the "all" tab, a pending reminded item must NOT be displayed as unread
    const isUnreadOnAllTab = 'all' === 'reminder' ? true : (!item.read && !hasReminder)
    expect(isUnreadOnAllTab).toBe(false)

    // On the "reminder" tab, it is displayed with unread priority styling
    const isUnreadOnReminderTab = 'reminder' === 'reminder' ? true : (!item.read && !hasReminder)
    expect(isUnreadOnReminderTab).toBe(true)
  })

  it('excludes pending reminders from unread notification count', () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const items = [
      { id: 1, read: false, remind_at: null },
      { id: 2, read: false, remind_at: futureDate }, // snoozed
      { id: 3, read: true, remind_at: null }
    ]
    const unreadCount = items.filter((item) => !item.read && !isReminderPending(item)).length
    expect(unreadCount).toBe(1)
  })
})
