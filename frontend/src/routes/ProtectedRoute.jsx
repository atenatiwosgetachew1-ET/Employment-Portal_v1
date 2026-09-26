import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, requiredRoles, requiredPermissions }) {
  const { user, isAuthenticated, bootstrapping } = useAuth()
  const location = useLocation()

  if (bootstrapping) {
    return (
      <div className="loading-screen" role="status" aria-live="polite">
        Loading…
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (requiredRoles && requiredRoles.length > 0) {
    if (!user?.role || !requiredRoles.includes(user.role)) {
      return <Navigate to="/dashboard" replace />
    }
  }

  if (requiredPermissions && requiredPermissions.length > 0) {
    const userPermissions = user?.permissions || []
    const hasPermission = requiredPermissions.some((perm) => userPermissions.includes(perm))
    if (!hasPermission) {
      return <Navigate to="/dashboard" replace />
    }
  }

  return children
}
