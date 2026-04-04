import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function isAgentSideWorkspace(user) {
  if (user?.agent_context?.is_agent_side) return true
  if (user?.role === 'customer') return true
  if (user?.role !== 'staff') return false
  const staffSide = (user?.staff_side || '').trim()
  const organizationName = (user?.organization?.name || '').trim()
  return Boolean(staffSide) && staffSide !== organizationName
}

function ConceptSection({ title, items }) {
  return (
    <section className="concept-section">
      <h2>{title}</h2>
      <div className="concept-grid">
        {items.map((item) => (
          <article key={item.title} className="concept-card">
            <p className="concept-card-kicker">{item.kicker}</p>
            <h3>{item.title}</h3>
            <p className="muted-text">{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export default function OperationsConceptPage({
  title,
  description,
  roadmap,
  foundation,
  superadminOnly = false
}) {
  const { user } = useAuth()
  const isOrgSuperadmin = user?.role === 'superadmin' && !isAgentSideWorkspace(user)

  if (superadminOnly && !isOrgSuperadmin) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <section className="dashboard-panel concept-page">
      <div className="users-management-header">
        <div>
          <h1>{title}</h1>
          <p className="muted-text">{description}</p>
        </div>
      </div>

      <div className="concept-summary-strip">
        <div className="concept-summary-pill">
          <strong>Scope</strong>
          <span>{isAgentSideWorkspace(user) ? 'Agent-side aware' : 'Organization-side aware'}</span>
        </div>
        <div className="concept-summary-pill">
          <strong>Status</strong>
          <span>Initial stance</span>
        </div>
        <div className="concept-summary-pill">
          <strong>Built on</strong>
          <span>Employees, selections, returns, roles, subscription context</span>
        </div>
      </div>

      <ConceptSection title="What This Should Own First" items={foundation} />
      <ConceptSection title="Initial Product Stance" items={roadmap} />
    </section>
  )
}
