import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import NotificationBell from '../notifications/NotificationBell'

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
    case 'employees':
      return (
        <svg {...common}>
          <path d="M16 11a3 3 0 1 0-2.9-3 3 3 0 0 0 2.9 3Z" />
          <path d="M8 11a3 3 0 1 0-2.9-3A3 3 0 0 0 8 11Z" />
          <path d="M3.5 20a5.5 5.5 0 0 1 9-4.2" />
          <path d="M12.5 20a5 5 0 0 1 10 0" />
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

function iconForRoute(to) {
  if (to === '/dashboard') return 'dashboard'
  if (to.startsWith('/dashboard/employees')) return 'employees'
  if (to.startsWith('/dashboard/users')) return 'users'
  if (to.startsWith('/dashboard/settings')) return 'settings'
  if (to.startsWith('/dashboard/activity')) return 'activity'
  return 'dashboard'
}

export default function DashboardLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const permissions = user?.permissions || []
  const features = user?.feature_flags || {}
  const organization = user?.organization
  const subscription = user?.subscription
  const canManageUsers =
    features.users_management_enabled &&
    (permissions.includes('users.manage_all') || permissions.includes('users.manage_limited'))
  const canManageEmployees = features.employees_enabled
  const canViewAudit =
    features.audit_log_enabled && permissions.includes('audit.view')

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', end: true },
    ...(canManageEmployees
      ? [{ to: '/dashboard/employees', label: 'Employees', end: false }]
      : []),
    ...(canManageUsers
      ? [{ to: '/dashboard/users', label: 'Users management', end: false }]
      : []),
    { to: '/dashboard/settings', label: 'Settings', end: false },
    ...(canViewAudit
      ? [{ to: '/dashboard/activity', label: 'Activity log', end: false }]
      : [])
  ]

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar" aria-label="Main navigation">
        <div className="dashboard-brand">Employment Portal</div>
        <nav className="dashboard-nav">
          {navItems.map(({ to, label, end }) => (
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
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-header">
          <div className="dashboard-header-left">
            <NotificationBell />
            <div>
              <p className="dashboard-header-user">
                Signed in as{' '}
                <strong>
                  {[user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
                    user?.username ||
                    'User'}
                </strong>
                {user?.username &&
                  [user?.first_name, user?.last_name].filter(Boolean).length > 0 && (
                    <span className="dashboard-header-username"> ({user.username})</span>
                  )}
              </p>
              {organization && (
                <p className="muted-text muted-text--mt-4">
                  {organization.name}
                  {subscription?.plan_name ? ` • ${subscription.plan_name}` : ''}
                  {subscription?.status ? ` • ${subscription.status}` : ''}
                </p>
              )}
            </div>
          </div>
          <button type="button" className="dashboard-logout" onClick={handleLogout}>
            Logout
          </button>
        </header>

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
    </div>
  )
}
