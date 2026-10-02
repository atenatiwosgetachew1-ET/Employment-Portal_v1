import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { isAgentSideWorkspace } from '../../utils/profileStore'

export default function EmployeesLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleSaveTemplate = useCallback(() => {
    window.dispatchEvent(new CustomEvent('portal:save-registration-template'))
  }, [])

  const handleBatchRegistration = useCallback(() => {
    window.dispatchEvent(new CustomEvent('portal:open-batch-registration'))
  }, [])

  const handleRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent('portal:refresh-candidates', { detail: { explicit: true } }))
  }, [])

  const handleOpenReturnRequest = useCallback(() => {
    window.dispatchEvent(new CustomEvent('portal:open-return-request'))
  }, [])

  useEffect(() => {
    const handleLoading = (event) => {
      setIsRefreshing(Boolean(event?.detail?.loading))
    }
    window.addEventListener('portal:candidates-loading', handleLoading)
    return () => {
      window.removeEventListener('portal:candidates-loading', handleLoading)
    }
  }, [])

  const features = user?.feature_flags || {}
  const canManageEmployees = features.employees_enabled
  const isAgentSideUser = isAgentSideWorkspace(user)
  const readOnly = Boolean(user?.organization?.is_read_only)

  // Backward compatibility: handle ?view=... query param and redirect to nested sub-route
  useEffect(() => {
    const isRootCandidates =
      location.pathname === '/dashboard/candidates' ||
      location.pathname === '/dashboard/candidates/'
    const isRootEmployees =
      location.pathname === '/dashboard/employees' ||
      location.pathname === '/dashboard/employees/'
    if (isRootCandidates || isRootEmployees) {
      const view = (searchParams.get('view') || 'list').trim()
      const remainingParams = new URLSearchParams(searchParams)
      remainingParams.delete('view')
      const searchStr = remainingParams.toString() ? `?${remainingParams.toString()}` : ''
      const targetBase = isRootEmployees ? '/dashboard/employees' : '/dashboard/candidates'
      navigate(`${targetBase}/${view}${searchStr}`, { replace: true })
    }
  }, [searchParams, location.pathname, navigate])


  const isRegisterRoute =
    location.pathname.startsWith('/dashboard/candidates/register') ||
    location.pathname.startsWith('/dashboard/employees/register')
  const isEditMode = isRegisterRoute && Boolean(searchParams.get('edit'))

  const pageTitle = useMemo(() => {
    if (isRegisterRoute) {
      return isEditMode ? 'Edit Candidate' : 'Register Candidates'
    }
    if (location.pathname.includes('/selected')) return 'Selected Candidates'
    if (location.pathname.includes('/under-process')) return 'Under Process Candidates'
    if (location.pathname.includes('/employed')) return 'Employed Candidates'
    if (location.pathname.includes('/returned')) return 'Returned Candidates'
    return 'Candidates'
  }, [isRegisterRoute, isEditMode, location.pathname])

  const pageDescription = useMemo(() => {
    if (isRegisterRoute) {
      return isEditMode
        ? 'Update candidate identity, credentials, attachments, and application information.'
        : 'Register new candidates, upload credentials, verify identity details with OCR, and submit applications.'
    }
    if (location.pathname.includes('/selected')) {
      return 'Review candidates selected for processing and agent deployment.'
    }
    if (location.pathname.includes('/under-process')) {
      return 'Track candidate background verification, medical reports, visa processing, and deployment readiness.'
    }
    if (location.pathname.includes('/employed')) {
      return 'View actively placed and employed candidates across organizations and overseas placements.'
    }
    if (location.pathname.includes('/returned')) {
      return 'Manage return requests, arrival status, and post-employment returns.'
    }
    return isAgentSideUser
      ? 'Select candidates from the organization list, then complete the remaining information and attachments for your agent side.'
      : 'Register candidates from the organization side, monitor selections, and review progress directly on the page.'
  }, [isRegisterRoute, isEditMode, isAgentSideUser, location.pathname])

  if (!canManageEmployees) {
    return <Navigate to="/dashboard" replace />
  }

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
            <h1>{pageTitle}</h1>
          </div>
          <p className="muted-text">{pageDescription}</p>
          {readOnly ? <p className="muted-text">Candidate changes are disabled while this organization is read-only.</p> : null}
        </div>

        {isRegisterRoute ? (
          <div className="notifications-page-actions page-panel-actions">
            <button
              type="button"
              className="btn-secondary notifications-action-btn"
              onClick={handleBatchRegistration}
              title="Batch register multiple candidates via spreadsheet"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Batch registration</span>
            </button>
            <button
              type="button"
              className="btn-secondary notifications-action-btn"
              onClick={handleSaveTemplate}
              title="Save current fields as default template for new candidates"
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
        ) : (
          <div className="notifications-page-actions page-panel-actions">
            {location.pathname.includes('/returned') && (
              <button
                type="button"
                className="btn-secondary notifications-action-btn"
                onClick={handleOpenReturnRequest}
                disabled={readOnly}
                title="Initiate return of an employee"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 3 4 7l4 4"/>
                  <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H4"/>
                </svg>
                <span>Initiate Return</span>
              </button>
            )}
            <button
              type="button"
              className="btn-secondary notifications-action-btn"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh candidates"
            >
              <svg
                className={`notifications-btn-icon${isRefreshing ? ' is-spinning' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
              <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>
          </div>
        )}
      </div>

      <Outlet />
    </section>
  )
}
