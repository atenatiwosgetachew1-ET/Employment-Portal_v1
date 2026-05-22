import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { isAgentSideWorkspace } from '../../utils/profileStore'
import * as notificationsService from '../../services/notificationsService'

function NavIcon({ name }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': 'true',
    focusable: 'false'
  }

  switch (name) {
    case 'dashboard':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="8" height="8" rx="1" />
          <rect x="13" y="3" width="8" height="5" rx="1" />
          <rect x="13" y="10" width="8" height="11" rx="1" />
          <rect x="3" y="13" width="8" height="8" rx="1" />
        </svg>
      )
    case 'notifications':
      return (
        <svg {...common}>
          <path d="M12 22a2.3 2.3 0 0 0 2.2-1.6" />
          <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0v3.2c0 .7.3 1.4.8 2l1 1.1H4.7l1-1.1c.5-.6.8-1.3.8-2V9.5Z" />
        </svg>
      )
    case 'employees':
      return (
        <svg {...common}>
          <path d="M16 11a3 3 0 1 0-2.9-3 3 3 0 0 0 2.9 3Z" />
          <path d="M8 11a3 3 0 1 0-2.9-3A3 3 0 0 0 8 11Z" />
          <path d="M3.5 20a5.5 5.5 0 0 1 9-4.2" />
          <path d="M12.5 20a5 5 0 0 1 10 0" />
        </svg>
      )
    case 'travel':
      return (
        <svg {...common}>
          <path d="M3 13l18-7-6.2 8.1" />
          <path d="M3 13l6.2 2.1L12 21l2.2-4.6L21 6" />
          <path d="M9.2 15.1 8 21l3.4-2.1" />
        </svg>
      )
    case 'chats':
      return (
        <svg {...common}>
          <path d="M4 5h16v11H7l-3 3V5Z" />
          <path d="M7 9h10" />
          <path d="M7 12h7" />
        </svg>
      )
    case 'compliances':
      return (
        <svg {...common}>
          <path d="M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4Z" />
          <path d="M8.5 12l2.3 2.3L15.5 9.6" />
        </svg>
      )
    case 'commissions':
      return (
        <svg {...common}>
          <path d="M12 3v18" />
          <path d="M16.5 7.5c0-2-1.8-3.5-4.5-3.5S7.5 5.5 7.5 7.5 9.3 11 12 11s4.5 1.5 4.5 3.5S14.7 18 12 18 7.5 16.5 7.5 14.5" />
        </svg>
      )
    case 'reports':
      return (
        <svg {...common}>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M7 15l3-4 3 2 4-6" />
        </svg>
      )
    case 'profiles':
      return (
        <svg {...common}>
          <path d="M7 3h10v18H7V3Z" />
          <path d="M9 7h6" />
          <path d="M9 11h6" />
          <path d="M9 15h4" />
        </svg>
      )
    case 'users':
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="3.5" />
          <path d="M22 21v-2a3.5 3.5 0 0 0-2.6-3.4" />
          <path d="M16.5 3.3a3.5 3.5 0 0 1 0 7.4" />
        </svg>
      )
    case 'subscription':
      return (
        <svg {...common}>
          <path d="M4 7h16v10H4V7Z" />
          <path d="M4 10h16" />
          <path d="M7 14h3" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <path d="M12 15.5a3.5 3.5 0 1 0-3.5-3.5 3.5 3.5 0 0 0 3.5 3.5Z" />
          <path d="M19.4 15a7.8 7.8 0 0 0 .1-1l2-1.2-2-3.5-2.3.7a7.5 7.5 0 0 0-1.7-1L15 6h-6l-.5 2.2a7.5 7.5 0 0 0-1.7 1l-2.3-.7-2 3.5 2 1.2a7.8 7.8 0 0 0 0 2l-2 1.2 2 3.5 2.3-.7a7.5 7.5 0 0 0 1.7 1L9 22h6l.5-2.2a7.5 7.5 0 0 0 1.7-1l2.3.7 2-3.5-2-1.2Z" />
        </svg>
      )
    case 'activity':
      return (
        <svg {...common}>
          <path d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z" />
          <path d="M12 6v6l4 2" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <path d="M5 12h14" />
        </svg>
      )
  }
}

function ChevronIcon({ expanded }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={`dashboard-nav-chevron${expanded ? ' is-expanded' : ''}`}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function iconForRoute(to) {
  if (to === '/dashboard') return 'dashboard'
  if (to.startsWith('/dashboard/notifications')) return 'notifications'
  if (to.startsWith('/dashboard/employees')) return 'employees'
  if (to.startsWith('/dashboard/travel')) return 'travel'
  if (to.startsWith('/dashboard/chats')) return 'chats'
  if (to.startsWith('/dashboard/compliances')) return 'compliances'
  if (to.startsWith('/dashboard/commissions')) return 'commissions'
  if (to.startsWith('/dashboard/reports')) return 'reports'
  if (to.startsWith('/dashboard/profiles')) return 'profiles'
  if (to.startsWith('/dashboard/users')) return 'users'
  if (to.startsWith('/dashboard/subscription-plans')) return 'subscription'
  if (to.startsWith('/dashboard/settings')) return 'settings'
  if (to.startsWith('/dashboard/activity')) return 'activity'
  return 'dashboard'
}

function DashboardSidebar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const profileRef = useRef(null)
  const [navCounts, setNavCounts] = useState({})
  const [expandedMenus, setExpandedMenus] = useState(() => ({
    employees: false
  }))
  const isEmployeesRoute =
    location.pathname === '/dashboard/employees' ||
    location.pathname.startsWith('/dashboard/employees/')
  const employeesView = isEmployeesRoute
    ? (new URLSearchParams(location.search).get('view') || 'list')
    : ''
  const isNotificationsRoute =
    location.pathname === '/dashboard/notifications' ||
    location.pathname.startsWith('/dashboard/notifications/')

  const permissions = user?.permissions || []
  const features = user?.feature_flags || {}
  const organization = user?.organization
  const canManageUsers =
    features.users_management_enabled &&
    (permissions.includes('users.manage_all') || permissions.includes('users.manage_limited'))
  const canManageEmployees = features.employees_enabled
  const isAgentSideUser = isAgentSideWorkspace(user)
  const canEditEmployeeRecords = !isAgentSideUser
  const canViewAudit =
    features.audit_log_enabled && permissions.includes('audit.view')
  const canViewSubscriptionPlans = user?.role === 'superadmin' && !isAgentSideWorkspace(user)
  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.username ||
    'User'
  const brandName = organization?.name || 'Employment Portal'
  const profileImage =
    user?.profile_photo_url ||
    user?.avatar_url ||
    user?.image_url ||
    user?.photo_url ||
    user?.profile_image_url ||
    ''
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', end: true },
    { to: '/dashboard/notifications', label: 'Notifications', end: false },
    ...(canManageEmployees
      ? [{ to: '/dashboard/employees', label: 'Employees', end: false }]
      : []),
    ...(canManageEmployees
      ? [{ to: '/dashboard/travel', label: 'Travel', end: false }]
      : []),
    { to: '/dashboard/chats', label: 'Chats', end: false },
    { to: '/dashboard/compliances', label: 'Compliances', end: false },
    { to: '/dashboard/commissions', label: 'Commissions', end: false },
    { to: '/dashboard/reports', label: 'Reports', end: false },
    { to: '/dashboard/profiles', label: 'Profiles', end: false },
    ...(canManageUsers
      ? [{ to: '/dashboard/users', label: 'Users management', end: false }]
      : []),
    ...(canViewSubscriptionPlans
      ? [{ to: '/dashboard/subscription-plans', label: 'Subscription plans', end: false }]
      : []),
    { to: '/dashboard/settings', label: 'Settings', end: false },
    ...(canViewAudit
      ? [{ to: '/dashboard/activity', label: 'Activity log', end: false }]
      : [])
  ]

  const employeeSubItems = canManageEmployees
    ? [
        ...(canEditEmployeeRecords
          ? [{ to: '/dashboard/employees?view=register', label: 'Register employee', id: 'register' }]
          : []),
        { to: '/dashboard/employees?view=list', label: 'Employees list', id: 'list' },
        ...(isAgentSideUser
          ? [{ to: '/dashboard/employees?view=selected', label: 'Selected employees', id: 'selected' }]
          : []),
        { to: '/dashboard/employees?view=under-process', label: 'Under process', id: 'under-process' },
        { to: '/dashboard/employees?view=employed', label: 'Employed', id: 'employed' },
        { to: '/dashboard/employees?view=returned', label: 'Returned', id: 'returned' }
      ]
    : []

  const loadNavCounts = useCallback(async () => {
    try {
      const notifications = await notificationsService.fetchNotifications()
      const notificationCount = isNotificationsRoute
        ? 0
        : (Array.isArray(notifications) ? notifications.filter((item) => !item.read).length : 0)

      setNavCounts((prev) => {
        const next = { '/dashboard/notifications': notificationCount }
        if (prev && prev['/dashboard/notifications'] === notificationCount && Object.keys(prev).length === 1) {
          return prev
        }
        return next
      })
    } catch {
      setNavCounts((prev) => (prev && Object.keys(prev).length ? {} : prev))
    }
  }, [isNotificationsRoute])

  useEffect(() => {
    loadNavCounts()
  }, [loadNavCounts])

  useEffect(() => {
    if (!isNotificationsRoute) return

    setNavCounts((prev) => {
      if (!prev['/dashboard/notifications']) return prev
      return {
        ...prev,
        '/dashboard/notifications': 0
      }
    })
  }, [isNotificationsRoute])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadNavCounts()
    }, 5000)

    const handleWindowFocus = () => {
      loadNavCounts()
    }

    window.addEventListener('focus', handleWindowFocus)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [loadNavCounts])

  useEffect(() => {
    if (!canManageEmployees) return
    if (!location.pathname.startsWith('/dashboard/employees')) return

    setExpandedMenus((prev) => {
      if (prev.employees) return prev
      return { ...prev, employees: true }
    })
  }, [canManageEmployees, location.pathname])

  useEffect(() => {
    const handleNotificationsUpdated = () => {
      if (isNotificationsRoute) {
        setNavCounts((prev) => ({
          ...prev,
          '/dashboard/notifications': 0
        }))
        return
      }

      loadNavCounts()
    }

    window.addEventListener('notifications:updated', handleNotificationsUpdated)
    window.addEventListener('notifications:viewed', handleNotificationsUpdated)

    return () => {
      window.removeEventListener('notifications:updated', handleNotificationsUpdated)
      window.removeEventListener('notifications:viewed', handleNotificationsUpdated)
    }
  }, [isNotificationsRoute, loadNavCounts])

  const handleProfileNavigate = () => {
    navigate('/dashboard/profiles?tab=profile')
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="dashboard-sidebar" aria-label="Main navigation">
        <div className="dashboard-sidebar-top">
          <div className="dashboard-profile-menu" ref={profileRef}>
            <div
              className={`dashboard-profile-trigger${profileImage ? ' has-image' : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Open profiles page"
              onClick={handleProfileNavigate}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleProfileNavigate()
                }
              }}
              style={profileImage ? { '--profile-trigger-image': `url("${profileImage}")` } : undefined}
            >
              {profileImage ? <span className="dashboard-profile-trigger-bg" aria-hidden="true" /> : null}
              <span className="dashboard-profile-avatar">
                {profileImage ? (
                  <img src={profileImage} alt={`${displayName} profile`} />
                ) : (
                  <span aria-hidden>{initials}</span>
                )}
              </span>
              <span className="dashboard-profile-copy">
                <strong title={displayName}>{displayName}</strong>
                {organization?.name && <span title={organization.name}>{organization.name}</span>}
              </span>
            </div>
          </div>
        </div>
        <div className="dashboard-brand" title={brandName}>{brandName}</div>
        <nav className="dashboard-nav">
          {navItems.map(({ to, label, end, disabled }) => {
            const count = navCounts[to] || 0
            const isCurrent = end
              ? location.pathname === to
              : location.pathname === to || location.pathname.startsWith(`${to}/`)
            const badge = count > 0 && !isCurrent ? (count > 99 ? '99+' : String(count)) : null

            if (!disabled && to === '/dashboard/employees') {
              const expanded = Boolean(expandedMenus.employees)
              return (
                <div key={to} className={`dashboard-nav-group${expanded ? ' is-expanded' : ''}`}>
                  <button
                    type="button"
                    className={`dashboard-nav-trigger dashboard-nav-group-link${isEmployeesRoute ? ' is-active' : ''}`}
                    aria-label={expanded ? 'Collapse employees menu' : 'Expand employees menu'}
                    aria-expanded={expanded}
                    onClick={() => setExpandedMenus((prev) => ({ ...prev, employees: !expanded }))}
                  >
                    <span className="dashboard-nav-icon">
                      <NavIcon name="employees" />
                    </span>
                    <span className="dashboard-nav-link-copy">{label}</span>
                    {badge ? <span className="dashboard-nav-badge">{badge}</span> : null}
                    <span className="dashboard-nav-group-toggle" aria-hidden="true">
                      <ChevronIcon expanded={expanded} />
                    </span>
                  </button>

                  {expanded ? (
                    <div className="dashboard-nav-submenu" role="group" aria-label="Employees views">
                      {employeeSubItems.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={false}
                          className={`dashboard-nav-sublink${isEmployeesRoute && employeesView === item.id ? ' is-active' : ''}`}
                        >
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            }

            return disabled ? (
              <span key={to} className="dashboard-nav-link is-disabled" aria-disabled="true">
                <span className="dashboard-nav-icon">
                  <NavIcon name={iconForRoute(to)} />
                </span>
                <span className="dashboard-nav-link-copy">{label}</span>
                {badge ? <span className="dashboard-nav-badge">{badge}</span> : null}
              </span>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `dashboard-nav-link${isActive ? ' is-active' : ''}`
                }
              >
                <span className="dashboard-nav-icon">
                  <NavIcon name={iconForRoute(to)} />
                </span>
                <span className="dashboard-nav-link-copy">{label}</span>
                {badge ? <span className="dashboard-nav-badge">{badge}</span> : null}
              </NavLink>
            )
          })}
        </nav>
        <div className="dashboard-sidebar-actions">
          <p className="dashboard-sidebar-actions-title">Account</p>
          <button type="button" className="dashboard-sidebar-action dashboard-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
    </aside>
  )
}

function DashboardMain() {
  const { user } = useAuth()

  return (
    <div className="dashboard-main">
      <div className="dashboard-content">
        {user?.is_suspended && (
          <div className="dashboard-panel dashboard-panel--spaced">
            <strong>Organization suspended.</strong>
            <p className="muted-text muted-text--mt-8">
              Your company needs to resolve licensing before this Employment Portal can be used.
            </p>
          </div>
        )}
        {!user?.is_suspended && user?.is_read_only && (
          <div className="dashboard-panel dashboard-panel--spaced">
            <strong>Read-only mode.</strong>
            <p className="muted-text muted-text--mt-8">
              This Employment Portal is active for viewing only because the organization
              subscription is cancelled or restricted.
            </p>
          </div>
        )}
        <Outlet />
      </div>
    </div>
  )
}

export default function DashboardLayoutSidebar() {
  return (
    <div className="dashboard-shell">
      <DashboardSidebar />
      <DashboardMain />
    </div>
  )
}
