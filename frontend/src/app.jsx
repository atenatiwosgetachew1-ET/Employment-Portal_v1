import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { UiFeedbackProvider } from './context/UiFeedbackContext'
import DashboardLayoutSidebar from './components/layout/DashboardLayoutSidebar'
import ProtectedRoute from './routes/ProtectedRoute'
import './App.css'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const EmployeesLayout = lazy(() => import('./pages/employees/EmployeesLayout'))
const EmployeesListPage = lazy(() => import('./pages/employees/EmployeesListPage'))
const SelectedEmployeesPage = lazy(() => import('./pages/employees/SelectedEmployeesPage'))
const UnderProcessPage = lazy(() => import('./pages/employees/UnderProcessPage'))
const EmployedPage = lazy(() => import('./pages/employees/EmployedPage'))
const ReturnedPage = lazy(() => import('./pages/employees/ReturnedPage'))
const EmployeeRegisterPage = lazy(() => import('./pages/employees/EmployeeRegisterPage'))
const UsersManagementPage = lazy(() => import('./pages/UsersManagementPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ActivityLogPage = lazy(() => import('./pages/ActivityLogPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const ChatsPage = lazy(() => import('./pages/ChatsPage'))
const CompliancesPage = lazy(() => import('./pages/CompliancesPage'))
const CommissionsPage = lazy(() => import('./pages/CommissionsPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const SubscriptionPlansPage = lazy(() => import('./pages/SubscriptionPlansPage'))
const ProfilesPage = lazy(() => import('./pages/ProfilesPage'))
const TravelPage = lazy(() => import('./pages/TravelPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function SuspenseFallback() {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      Loading…
    </div>
  )
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<SuspenseFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayoutSidebar />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="employees" element={<EmployeesLayout />}>
              <Route index element={<EmployeesListPage />} />
              <Route path="list" element={<EmployeesListPage />} />
              <Route path="register" element={<EmployeeRegisterPage />} />
              <Route path="selected" element={<SelectedEmployeesPage />} />
              <Route path="under-process" element={<UnderProcessPage />} />
              <Route path="employed" element={<EmployedPage />} />
              <Route path="returned" element={<ReturnedPage />} />
            </Route>
            <Route path="travel" element={<TravelPage />} />
            <Route path="chats" element={<ChatsPage />} />
            <Route path="compliances" element={<CompliancesPage />} />
            <Route path="commissions" element={<CommissionsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="profiles" element={<ProfilesPage />} />
            <Route
              path="users"
              element={
                <ProtectedRoute
                  requiredPermissions={['users.manage_all', 'users.manage_limited']}
                >
                  <UsersManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="subscription-plans"
              element={
                <ProtectedRoute requiredRoles={['superadmin']}>
                  <SubscriptionPlansPage />
                </ProtectedRoute>
              }
            />
            <Route path="settings" element={<SettingsPage />} />
            <Route
              path="activity"
              element={
                <ProtectedRoute requiredPermissions={['audit.view']}>
                  <ActivityLogPage />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <UiFeedbackProvider>
        <AppRoutes />
      </UiFeedbackProvider>
    </AuthProvider>
  )
}
