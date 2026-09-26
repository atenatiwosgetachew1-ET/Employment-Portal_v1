import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="page centered-page">
      <div className="auth-form" style={{ textAlign: 'center' }}>
        <h1>404</h1>
        <p className="muted-text">The page you're looking for doesn't exist or has been moved.</p>
        <p className="auth-links">
          <Link to="/dashboard">Back to dashboard</Link>
        </p>
      </div>
    </div>
  )
}
