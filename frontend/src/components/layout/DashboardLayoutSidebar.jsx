import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

function isAgentSideWorkspace(user) {
  if (user?.agent_context?.is_agent_side) return true
  if (user?.role === 'customer') return true
  if (user?.role !== 'staff') return false
  const staffSide = (user?.staff_side || '').trim()
  const organizationName = (user?.organization?.name || '').trim()
  return Boolean(staffSide) && staffSide !== organizationName
}

export default function DashboardLayoutSidebar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef(null)

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
  const canViewSubscriptionPlans = user?.role === 'superadmin' && !isAgentSideWorkspace(user)
  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.username ||
    'User'
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
    { to: '/dashboard/chats', label: 'Chats', end: false },
    { to: '/dashboard/compliances', label: 'Compliances', end: false },
    { to: '/dashboard/commissions', label: 'Commissions', end: false },
    { to: '/dashboard/reports', label: 'Reports', end: false },
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

  useEffect(() => {
    function onDocClick(event) {
      if (!profileRef.current?.contains(event.target)) {
        setProfileOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar" aria-label="Main navigation">
        <div className="dashboard-sidebar-top">
          <div className="dashboard-profile-menu" ref={profileRef}>
            <button
              type="button"
              className={`dashboard-profile-trigger${profileOpen ? ' is-open' : ''}${profileImage ? ' has-image' : ''}`}
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((open) => !open)}
              style={profileImage ? { '--profile-trigger-image': `url("${profileImage}")` } : undefined}
            >
              <span className="dashboard-profile-avatar">
                {profileImage ? (
                  <img src={profileImage} alt={`${displayName} profile`} />
                ) : (
                  <span aria-hidden>{initials}</span>
                )}
              </span>
              <span className="dashboard-profile-copy">
                <strong>{displayName}</strong>
                {organization?.name && <span>{organization.name}</span>}
              </span>
            </button>
            {profileOpen && (
              <div className="dashboard-profile-dropdown" role="menu" aria-label="Profile menu">
                <p className="dashboard-profile-dropdown-name">{displayName}</p>
                {user?.username && (
                  <p className="dashboard-profile-dropdown-meta">@{user.username}</p>
                )}
                {subscription?.plan_name && (
                  <p className="dashboard-profile-dropdown-meta">{subscription.plan_name}</p>
                )}
                {subscription?.status && (
                  <p className="dashboard-profile-dropdown-meta">{subscription.status}</p>
                )}
                <button
                  type="button"
                  className="dashboard-profile-logout"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
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
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="dashboard-main">
        <div className="dashboard-content">
          {user?.is_suspended && (
            <div className="dashboard-panel" style={{ marginBottom: 16 }}>
              <strong>Organization suspended.</strong>
              <p className="muted-text" style={{ marginTop: 8 }}>
                Your company needs to resolve licensing before this Employment Portal can be used.
              </p>
            </div>
          )}
          {!user?.is_suspended && user?.is_read_only && (
            <div className="dashboard-panel" style={{ marginBottom: 16 }}>
              <strong>Read-only mode.</strong>
              <p className="muted-text" style={{ marginTop: 8 }}>
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
