import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function TravelPage() {
  const { user } = useAuth()
  const features = user?.feature_flags || {}

  if (features.employees_enabled === false) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <section className="dashboard-panel">
      <div className="users-management-header">
        <div>
          <h1>Travel</h1>
          <p className="muted-text">
            Under development.
          </p>
        </div>
      </div>

      <article className="employee-summary-card">
        <h3>Travel workspace</h3>
        <p className="muted-text">
          This page is currently hidden while the travel-agency integration and related ticket workflows are being prepared.
        </p>
      </article>
    </section>
  )
}
