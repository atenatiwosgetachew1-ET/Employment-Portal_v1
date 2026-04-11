import { useRef } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { isAgentSideWorkspace } from '../../utils/profileStore'

export default function DashboardLayoutSidebar() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const profileRef = useRef(null)

  const permissions = user?.permissions || []
  const features = user?.feature_flags || {}
  const organization = user?.organization
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
      ? [{ to: '/dashboard/travel', label: 'Travel', end: false, disabled: true }]
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

  const handleProfileNavigate = () => {
    navigate('/dashboard/profiles?tab=profile')
  }

  return (
    <div className="dashboard-shell">
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
          {navItems.map(({ to, label, end, disabled }) => (
            disabled ? (
              <span key={to} className="dashboard-nav-link is-disabled" aria-disabled="true">
                {label}
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
                {label}
              </NavLink>
            )
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
