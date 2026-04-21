import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { user } = useAuth()
  const org = user?.organization
  const subscription = user?.subscription

  return (
    <section className="dashboard-panel">
      <h1>Employment Portal Dashboard</h1>
      <p className="welcome-text">
        Welcome back{user?.username ? `, ${user.username}` : ''}.
      </p>
      <p className="muted-text">
        Use the menu on the left to open other sections (e.g. Users management).
      </p>
      {org && (
        <div className="dashboard-org-summary">
          <p className="muted-text">
            Organization: <strong>{org.name}</strong>
          </p>
          <p className="muted-text">
            Subscription: <strong>{subscription?.plan_name || 'Unassigned'}</strong>
            {subscription?.status ? ` (${subscription.status})` : ''}
          </p>
        </div>
      )}
    </section>
  )
}
