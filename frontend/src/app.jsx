import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { UiFeedbackProvider } from './context/UiFeedbackContext'
import DashboardLayoutSidebar from './components/layout/DashboardLayoutSidebar'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import DashboardPage from './pages/DashboardPage'
import EmployeesPage from './pages/EmployeesPage'
import UsersManagementPage from './pages/UsersManagementPage'
import SettingsPage from './pages/SettingsPage'
import ActivityLogPage from './pages/ActivityLogPage'
import NotificationsPage from './pages/NotificationsPage'
import ChatsPage from './pages/ChatsPage'
import CompliancesPage from './pages/CompliancesPage'
import CommissionsPage from './pages/CommissionsPage'
import ReportsPage from './pages/ReportsPage'
import SubscriptionPlansPage from './pages/SubscriptionPlansPage'
import ProfilesPage from './pages/ProfilesPage'
import TravelPage from './pages/TravelPage'
import ProtectedRoute from './routes/ProtectedRoute'
import { applyAccent, applyTheme } from './utils/theme'
import './App.css'

function AppRoutes() {
  useEffect(() => {
    applyTheme('dark')
    applyAccent('natural')
  }, [])

  return (
    <BrowserRouter>
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
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="chats" element={<ChatsPage />} />
          <Route path="compliances" element={<CompliancesPage />} />
          <Route path="commissions" element={<CommissionsPage />} />
          <Route path="travel" element={<TravelPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="profiles" element={<ProfilesPage />} />
          <Route path="users" element={<UsersManagementPage />} />
          <Route path="subscription-plans" element={<SubscriptionPlansPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="activity" element={<ActivityLogPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
