import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { PortalOverlayProvider } from '../../context/PortalOverlayContext'
import { isAgentSideWorkspace, readProfileOverride } from '../../utils/profileStore'
import * as notificationsService from '../../services/notificationsService'

const DEFAULT_PROFILE_BG = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
  <defs>
    <linearGradient id="ep-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <radialGradient id="ep-glow1" cx="20%" cy="25%" r="65%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.6"/>
      <stop offset="50%" stop-color="#1d4ed8" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ep-glow2" cx="85%" cy="75%" r="60%">
      <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.55"/>
      <stop offset="60%" stop-color="#6d28d9" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ep-glow3" cx="50%" cy="100%" r="55%">
      <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#ep-bg)"/>
  <rect width="100%" height="100%" fill="url(#ep-glow1)"/>
  <rect width="100%" height="100%" fill="url(#ep-glow2)"/>
  <rect width="100%" height="100%" fill="url(#ep-glow3)"/>
</svg>
`.trim())}`

function formatCssUrl(val) {
  if (!val) return ''
  const trimmed = String(val).trim()
  if (trimmed.startsWith('url(')) return trimmed
  return `url("${trimmed.replace(/"/g, '\\"')}")`
}

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
  if (to.startsWith('/dashboard/employees') || to.startsWith('/dashboard/candidates')) return 'employees'
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

function DashboardSidebar({
  isMobileOpen,
  setIsMobileOpen,
  isDesktopExpanded,
  setIsDesktopExpanded,
  navCounts,
  expandedMenus,
  setExpandedMenus
}) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const profileRef = useRef(null)

  const isEmployeesRoute =
    location.pathname === '/dashboard/candidates' ||
    location.pathname.startsWith('/dashboard/candidates/') ||
    location.pathname === '/dashboard/employees' ||
    location.pathname.startsWith('/dashboard/employees/')
  const employeesView = isEmployeesRoute
    ? (location.pathname.startsWith('/dashboard/candidates/')
        ? location.pathname.replace('/dashboard/candidates/', '').split('/')[0] || 'list'
        : location.pathname.startsWith('/dashboard/employees/')
          ? location.pathname.replace('/dashboard/employees/', '').split('/')[0] || 'list'
          : (new URLSearchParams(location.search).get('view') || 'list'))
    : ''

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
  const brandInitials =
    brandName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'EP'

  const [, setProfileVersion] = useState(0)

  useEffect(() => {
    const handleProfileUpdate = () => {
      setProfileVersion((v) => v + 1)
    }
    window.addEventListener('profile:updated', handleProfileUpdate)
    return () => window.removeEventListener('profile:updated', handleProfileUpdate)
  }, [])

  const override = user?.id ? readProfileOverride(user.id) : null
  const profileImage =
    override?.profilePhotoUrl ||
    user?.profile_photo_url ||
    user?.avatar_url ||
    user?.image_url ||
    user?.photo_url ||
    user?.profile_image_url ||
    user?.profilePhotoUrl ||
    ''

  const activeProfileBg = profileImage || DEFAULT_PROFILE_BG
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
      ? [{ to: '/dashboard/candidates', label: 'Candidates', end: false }]
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
          ? [{ to: '/dashboard/candidates/register', label: 'Register candidate', id: 'register' }]
          : []),
        { to: '/dashboard/candidates/list', label: 'All candidates', id: 'list' },
        { to: '/dashboard/candidates/selected', label: 'Selected candidates', id: 'selected' },
        { to: '/dashboard/candidates/under-process', label: 'Under process', id: 'under-process' },
        { to: '/dashboard/candidates/employed', label: 'Employed', id: 'employed' },
        { to: '/dashboard/candidates/returned', label: 'Returned', id: 'returned' }
      ]
    : []

  useEffect(() => {
    if (!canManageEmployees) return
    if (!location.pathname.startsWith('/dashboard/candidates') && !location.pathname.startsWith('/dashboard/employees')) return

    setExpandedMenus((prev) => {
      if (prev.employees) return prev
      return { ...prev, employees: true }
    })
  }, [canManageEmployees, location.pathname, setExpandedMenus])

  const handleProfileNavigate = () => {
    setIsMobileOpen(false)
    navigate('/dashboard/profiles?tab=profile')
  }

  const handleLogout = async () => {
    setIsMobileOpen(false)
    await signOut()
    navigate('/login', { replace: true })
  }

  const handleNavClick = () => {
    setIsMobileOpen(false)
  }

  const handleDesktopToggle = () => {
    setIsDesktopExpanded((prev) => {
      const next = !prev
      try {
        localStorage.setItem('portal:sidebar_expanded', String(next))
      } catch {}
      return next
    })
  }

  return (
    <aside
      className={`dashboard-sidebar${isMobileOpen ? ' is-mobile-open' : ''}${isDesktopExpanded ? ' is-expanded' : ' is-collapsed'}${profileImage ? ' has-custom-image' : ''}`}
      style={{
        '--profile-bg-image': formatCssUrl(activeProfileBg)
      }}
      aria-label="Main navigation"
    >
      {/* Mobile drawer close header */}
      <div className="dashboard-sidebar-mobile-header">
        <span className="dashboard-sidebar-mobile-brand">{brandName}</span>
        <button
          type="button"
          className="dashboard-sidebar-mobile-close"
          aria-label="Close navigation menu"
          onClick={() => setIsMobileOpen(false)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Profile banner with blurred photo background + covering gradient */}
      <div
        className={`dashboard-sidebar-top has-profile-bg${profileImage ? ' has-custom-image' : ''}`}
        style={{
          '--profile-bg-image': formatCssUrl(activeProfileBg)
        }}
      >
        <div className="dashboard-sidebar-top-backdrop" aria-hidden="true">
          <div
            className="dashboard-sidebar-top-bg"
            style={{ backgroundImage: formatCssUrl(activeProfileBg) }}
          />
          <div className="dashboard-sidebar-top-overlay" />
        </div>
        <div className="dashboard-profile-menu" ref={profileRef}>
          <div
            className={`dashboard-profile-trigger${profileImage ? ' has-image' : ''}`}
            role="button"
            tabIndex={0}
            aria-label="Open profiles page"
            title={!isDesktopExpanded ? displayName : undefined}
            onClick={handleProfileNavigate}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleProfileNavigate()
              }
            }}
          >
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

      {/* Brand Row + Desktop Collapse Toggle */}
      <div className="dashboard-brand-row">
        <div className="dashboard-brand" title={brandName}>
          <span className="dashboard-brand-full">{brandName}</span>
          <span className="dashboard-brand-compact">{brandInitials}</span>
        </div>
        <button
          type="button"
          className="dashboard-sidebar-collapse-toggle"
          aria-label={isDesktopExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          title={isDesktopExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          onClick={handleDesktopToggle}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`dashboard-collapse-icon${isDesktopExpanded ? '' : ' is-collapsed'}`}
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {/* Navigation items - on desktop rail, icons are centered; on mobile/expanded, icons + labels */}
      <nav className="dashboard-nav">
        {navItems.map(({ to, label, end, disabled }) => {
          const count = navCounts[to] || 0
          const isCurrent = end
            ? location.pathname === to
            : location.pathname === to || location.pathname.startsWith(`${to}/`)
          const badge = count > 0 && !isCurrent ? (count > 99 ? '99+' : String(count)) : null

          if (!disabled && (to === '/dashboard/candidates' || to === '/dashboard/employees')) {
            const expanded = Boolean(expandedMenus.employees)
            return (
              <div key={to} className={`dashboard-nav-group${expanded ? ' is-expanded' : ''}`}>
                <button
                  type="button"
                  className={`dashboard-nav-trigger dashboard-nav-group-link${isEmployeesRoute ? ' is-active' : ''}`}
                  aria-label={expanded ? 'Collapse candidates menu' : 'Expand candidates menu'}
                  aria-expanded={expanded}
                  title={label}
                  onClick={() => {
                    if (!isDesktopExpanded && typeof window !== 'undefined' && window.innerWidth >= 1024) {
                      setIsDesktopExpanded(true)
                      setExpandedMenus((prev) => ({ ...prev, employees: true }))
                    } else {
                      setExpandedMenus((prev) => ({ ...prev, employees: !expanded }))
                    }
                  }}
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
                  <div className="dashboard-nav-submenu" role="group" aria-label="Candidates views">
                    {employeeSubItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={false}
                        title={item.label}
                        onClick={handleNavClick}
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
            <span key={to} className="dashboard-nav-link is-disabled" aria-disabled="true" title={label}>
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
              title={label}
              onClick={handleNavClick}
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

      {/* Account / Logout */}
      <div className="dashboard-sidebar-actions">
        <p className="dashboard-sidebar-actions-title">Account</p>
        <button
          type="button"
          className="dashboard-sidebar-action dashboard-logout"
          onClick={handleLogout}
          title="Logout"
          aria-label="Logout"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="dashboard-logout-icon"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="dashboard-logout-text">Logout</span>
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
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isDesktopExpanded, setIsDesktopExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem('portal:sidebar_expanded')
      if (saved !== null) return saved === 'true'
      return typeof window !== 'undefined' ? window.innerWidth >= 1200 : false
    } catch {
      return false
    }
  })
  const [navCounts, setNavCounts] = useState({})
  const [expandedMenus, setExpandedMenus] = useState(() => ({
    employees: false
  }))
  const isNotificationsRoute =
    location.pathname === '/dashboard/notifications' ||
    location.pathname.startsWith('/dashboard/notifications/')

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.username ||
    'User'
  const organization = user?.organization
  const brandName = organization?.name || 'Employment Portal'
  const override = user?.id ? readProfileOverride(user.id) : null
  const profileImage =
    override?.profilePhotoUrl ||
    user?.profile_photo_url ||
    user?.avatar_url ||
    user?.image_url ||
    user?.photo_url ||
    user?.profile_image_url ||
    user?.profilePhotoUrl ||
    ''
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'

  const notificationCount = navCounts['/dashboard/notifications'] || 0

  const loadNavCounts = useCallback(async () => {
    try {
      const notifications = await notificationsService.fetchNotifications()
      const count = isNotificationsRoute
        ? 0
        : (Array.isArray(notifications)
            ? notifications.filter((item) => !item.read && !notificationsService.isReminderPending(item)).length
            : 0)

      setNavCounts((prev) => {
        const next = { '/dashboard/notifications': count }
        if (prev && prev['/dashboard/notifications'] === count && Object.keys(prev).length === 1) {
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
      if (document.visibilityState === 'visible') {
        loadNavCounts()
      }
    }, 30000)

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        loadNavCounts()
      }
    }

    window.addEventListener('focus', handleVisibilityOrFocus)
    document.addEventListener('visibilitychange', handleVisibilityOrFocus)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleVisibilityOrFocus)
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
    }
  }, [loadNavCounts])

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

    const handleCrossTabSync = (event) => {
      if (event.key === 'portal:cross_tab_sync') {
        window.dispatchEvent(new Event('notifications:updated'))
        window.dispatchEvent(new Event('portal:refresh-candidates'))
      }
    }

    window.addEventListener('notifications:updated', handleNotificationsUpdated)
    window.addEventListener('notifications:viewed', handleNotificationsUpdated)
    window.addEventListener('storage', handleCrossTabSync)

    return () => {
      window.removeEventListener('notifications:updated', handleNotificationsUpdated)
      window.removeEventListener('notifications:viewed', handleNotificationsUpdated)
      window.removeEventListener('storage', handleCrossTabSync)
    }
  }, [isNotificationsRoute, loadNavCounts])

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false)
  }, [location.pathname, location.search])

  // Close mobile drawer on Escape key and lock body scroll when open
  useEffect(() => {
    if (!isMobileOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsMobileOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMobileOpen])

  return (
    <PortalOverlayProvider>
      <div
        className={`dashboard-shell${isDesktopExpanded ? ' is-sidebar-expanded' : ' is-sidebar-collapsed'}${isMobileOpen ? ' is-mobile-open' : ''}`}
      >
        {/* Full-width mobile navbar (across the entire top of the screen on mobile view) */}
        <header className="dashboard-mobile-header">
          <button
            type="button"
            className="dashboard-mobile-toggle"
            aria-label={isMobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileOpen}
            onClick={() => setIsMobileOpen((prev) => !prev)}
          >
            {isMobileOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>

          <div
            className="dashboard-mobile-brand"
            role="button"
            tabIndex={0}
            onClick={() => {
              setIsMobileOpen(false)
              navigate('/dashboard')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setIsMobileOpen(false)
                navigate('/dashboard')
              }
            }}
          >
            <span>{brandName}</span>
          </div>

          <div className="dashboard-mobile-actions">
            <button
              type="button"
              className="dashboard-mobile-action-btn"
              aria-label="View notifications"
              title="Notifications"
              onClick={() => {
                setIsMobileOpen(false)
                navigate('/dashboard/notifications')
              }}
            >
              <NavIcon name="notifications" />
              {notificationCount > 0 ? (
                <span className="dashboard-mobile-badge">{notificationCount > 99 ? '99+' : notificationCount}</span>
              ) : null}
            </button>
            <button
              type="button"
              className="dashboard-mobile-avatar-btn"
              aria-label="View profile"
              title={displayName}
              onClick={() => {
                setIsMobileOpen(false)
                navigate('/dashboard/profiles?tab=profile')
              }}
            >
              {profileImage ? (
                <img src={profileImage} alt="" />
              ) : (
                <span>{initials}</span>
              )}
            </button>
          </div>
        </header>

        {/* Backdrop for mobile drawer (strictly behind open sidebar, above page content) */}
        {isMobileOpen && (
          <div
            className="dashboard-sidebar-backdrop"
            onClick={() => setIsMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar Navigation */}
        <DashboardSidebar
          isMobileOpen={isMobileOpen}
          setIsMobileOpen={setIsMobileOpen}
          isDesktopExpanded={isDesktopExpanded}
          setIsDesktopExpanded={setIsDesktopExpanded}
          navCounts={navCounts}
          expandedMenus={expandedMenus}
          setExpandedMenus={setExpandedMenus}
        />

        {/* Main Content Area */}
        <DashboardMain />
      </div>
    </PortalOverlayProvider>
  )
}
