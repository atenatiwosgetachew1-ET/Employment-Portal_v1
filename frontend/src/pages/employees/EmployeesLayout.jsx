import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { isAgentSideWorkspace } from '../../utils/profileStore'
import { EMPLOYEE_VIEW_TABS } from '../../utils/employeeHelpers'

export default function EmployeesLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const handleSaveTemplate = useCallback(() => {
    window.dispatchEvent(new CustomEvent('portal:save-registration-template'))
  }, [])

  const features = user?.feature_flags || {}
  const canManageEmployees = features.employees_enabled
  const isAgentSideUser = isAgentSideWorkspace(user)
  const canEditEmployeeRecords = !isAgentSideUser
  const readOnly = Boolean(user?.organization?.is_read_only)

  // Backward compatibility: handle ?view=... query param and redirect to nested sub-route
  useEffect(() => {
    const isRootEmployees = location.pathname === '/dashboard/employees' || location.pathname === '/dashboard/employees/'
    if (isRootEmployees) {
      const view = (searchParams.get('view') || 'list').trim()
      const remainingParams = new URLSearchParams(searchParams)
      remainingParams.delete('view')
      const searchStr = remainingParams.toString() ? `?${remainingParams.toString()}` : ''
      navigate(`/dashboard/employees/${view}${searchStr}`, { replace: true })
    }
  }, [searchParams, location.pathname, navigate])

  const visibleTabs = useMemo(() => {
    return EMPLOYEE_VIEW_TABS.filter((tab) => {
      if (tab.id === 'selected') return isAgentSideUser
      if (tab.id === 'register') return canEditEmployeeRecords
      return true
    })
  }, [canEditEmployeeRecords, isAgentSideUser])

  if (!canManageEmployees) {
    return <Navigate to="/dashboard" replace />
  }

  const isRegisterRoute = location.pathname.startsWith('/dashboard/employees/register')
  const isEditMode = isRegisterRoute && Boolean(searchParams.get('edit'))

  return (
    <section className="dashboard-panel employees-page">
      <div className="page-panel-header notifications-page-header">
        <div className="notifications-header-left page-panel-header-left">
          <div className="notifications-title-row page-panel-title-row">
            <div className="notifications-title-icon-tile page-panel-title-icon-tile" aria-hidden="true">
              {isRegisterRoute ? (
                isEditMode ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                )
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              )}
            </div>
            <h1>{isRegisterRoute ? (isEditMode ? 'Edit Employee' : 'Register Employees') : 'Employees'}</h1>
          </div>
          <p className="muted-text">
            {isRegisterRoute
              ? (isEditMode
                  ? 'Update employee identity, credentials, attachments, and application information.'
                  : 'Register new candidates, upload credentials, verify identity details with OCR, and submit applications.')
              : isAgentSideUser
                ? 'Select employees from the organization list, then complete the remaining information and attachments for your agent side.'
                : 'Register employees from the organization side, monitor selections, and review progress directly on the page.'}
          </p>
          {readOnly ? <p className="muted-text">Employee changes are disabled while this organization is read-only.</p> : null}
        </div>

        {isRegisterRoute ? (
          <div className="notifications-page-actions page-panel-actions">
            <button
              type="button"
              className="btn-secondary notifications-action-btn"
              onClick={handleSaveTemplate}
              title="Save current fields as default template for new employees"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M8 13h8" />
                <path d="M8 17h5" />
              </svg>
              <span>Save Template</span>
            </button>
          </div>
        ) : null}
      </div>

      {!isRegisterRoute ? (
        <div className="employees-tabs-container">
          <div className="employee-subtabs employees-tabs" role="tablist" aria-label="Employee sections">
            {visibleTabs.map((tab) => (
              <NavLink
                key={tab.id}
                to={`/dashboard/employees/${tab.id}`}
                className={({ isActive }) =>
                  `employee-subtab employees-tab${isActive ? ' is-active' : ''}`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </div>
      ) : null}

      <Outlet />
    </section>
  )
}
