import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { useDocumentPreview } from '../../context/PortalOverlayContext'
import { useOverlayZIndex } from '../../utils/overlayZIndex'
import { useUiFeedback } from '../../context/UiFeedbackContext'
import * as employeesService from '../../services/employeesService'
import { isAgentSideWorkspace } from '../../utils/profileStore'
import {
  buildProgressDonut,
  computeAge,
  employeeAvailability,
  employedCommissionLabel,
  employeeProfilePhoto,
  employeeStatusBadgeClass,
  employeeStatusBadgeVariantClass,
  employeeStatusLabel,
  employeeWorkflowState,
  fileLabel,
  formatDateTime,
  formatShortDate,
  formatShortTime,
  isEmployeeEmployedInView,
  isEmployeeReturned,
  isImageDocument,
  isPdfDocumentUrl,
  prettyStatus,
  resolveLatestDate,
} from '../../utils/employeeHelpers'

const DOCUMENT_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'passport', label: 'Passport' },
  { id: 'contract', label: 'Contract' },
  { id: 'medical', label: 'Medical' },
  { id: 'photos', label: 'Photos' },
  { id: 'returns', label: 'Returns' },
  { id: 'other', label: 'Other' },
]

export default function EmployeeReviewModal({
  isOpen = true,
  onClose,
  employee: initialEmployee = null,
  employeeId = null,
  // Navigation
  onNavigate = null,
  hasPrevious = false,
  hasNext = false,
  previousEmployee = null,
  nextEmployee = null,
  // Listing & workflow callbacks (optional)
  onStartProcess = null,
  onToggleSelected = null,
  onDeclineProcess = null,
  onMarkProgressComplete = null,
  onAvailabilityAction = null,
  onEdit = null,
  onDelete = null,
  onApproveReturn = null,
  onRefuseReturn = null,
  onCancelReturnRequest = null,
  onReinstateEmployment = null,
  onEmployeeUpdated = null,
  // Configuration
  agentOptions = [],
  attachmentLabels = {},
  readOnly = false,
  currentView = 'list',
  initialMode = 'full', // 'full' | 'request'
}) {
  const { user } = useAuth()
  const { showToast, confirm } = useUiFeedback()
  const { openDocumentPreview, previewDocument } = useDocumentPreview()
  const zIndex = useOverlayZIndex(isOpen)

  // ── Data Resolution (passed or self-fetched) ────────────────────────
  const [fetchedEmployee, setFetchedEmployee] = useState(null)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  const activeEmployeeId = initialEmployee?.id || employeeId

  useEffect(() => {
    if (initialEmployee && Array.isArray(initialEmployee.documents) && initialEmployee.documents.length > 0) {
      setFetchedEmployee(null)
      setFetchError('')
      return
    }

    if (!activeEmployeeId) return

    let cancelled = false
    setFetching(true)
    setFetchError('')

    employeesService
      .fetchEmployee(activeEmployeeId)
      .then((data) => {
        if (!cancelled && data) {
          setFetchedEmployee(data)
        }
      })
      .catch((err) => {
        if (!cancelled && !initialEmployee) {
          setFetchError(err?.message || 'Failed to load candidate profile')
        }
      })
      .finally(() => {
        if (!cancelled) setFetching(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeEmployeeId, initialEmployee])

  const employee = fetchedEmployee || initialEmployee

  // ── Modal Mode & Tabs ───────────────────────────────────────────────
  const [mode, setMode] = useState(initialMode)
  const [activeDocTab, setActiveDocTab] = useState('all')
  const [selectedAgentId, setSelectedAgentId] = useState('')

  useEffect(() => {
    if (initialMode) setMode(initialMode)
  }, [initialMode, activeEmployeeId])

  // ── Scroller & Scroll Buttons ───────────────────────────────────────
  const docScrollerRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const scrollRafRef = useRef(null)

  const updateDocScrollState = useCallback(() => {
    const node = docScrollerRef.current
    if (!node) {
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }
    const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth)
    const left = node.scrollLeft
    setCanScrollLeft(left > 2)
    setCanScrollRight(left < maxScroll - 2)
  }, [])

  const scheduleDocScrollStateUpdate = useCallback(() => {
    if (scrollRafRef.current) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      updateDocScrollState()
    })
  }, [updateDocScrollState])

  const scrollDocsNext = useCallback(() => {
    const node = docScrollerRef.current
    if (!node) return
    const delta = Math.max(240, Math.floor(node.clientWidth * 0.85))
    node.scrollBy({ left: delta, behavior: 'smooth' })
    scheduleDocScrollStateUpdate()
  }, [scheduleDocScrollStateUpdate])

  const scrollDocsPrev = useCallback(() => {
    const node = docScrollerRef.current
    if (!node) return
    const delta = Math.max(240, Math.floor(node.clientWidth * 0.85))
    node.scrollBy({ left: -delta, behavior: 'smooth' })
    scheduleDocScrollStateUpdate()
  }, [scheduleDocScrollStateUpdate])

  useEffect(() => {
    const node = docScrollerRef.current
    if (!node) return
    node.scrollLeft = 0
    scheduleDocScrollStateUpdate()
  }, [activeEmployeeId, activeDocTab, scheduleDocScrollStateUpdate])

  // ── Keyboard Navigation & Esc ───────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !employee || previewDocument) return undefined

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      const activeElement = document.activeElement
      const isTyping = activeElement?.matches?.('input, textarea, select, [contenteditable="true"]')
      if (isTyping) return

      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
        return
      }

      if (event.key === 'ArrowLeft' && hasPrevious && onNavigate) {
        event.preventDefault()
        onNavigate('previous')
      }

      if (event.key === 'ArrowRight' && hasNext && onNavigate) {
        event.preventDefault()
        onNavigate('next')
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [employee, hasNext, hasPrevious, isOpen, onNavigate, onClose, previewDocument])

  // ── Permissions & Roles ─────────────────────────────────────────────
  const isAgentSideUser = isAgentSideWorkspace(user)
  const canEditRecords = !isAgentSideUser
  const isMainAgent = user?.role === 'customer'
  const canManageProcesses = user?.role === 'superadmin' || user?.role === 'admin'
  const canOverrideProgress = canManageProcesses

  // ── Computed Properties ─────────────────────────────────────────────
  const progressDonut = useMemo(() => buildProgressDonut(employee?.progress_status), [employee])
  const profileDoc = useMemo(() => employeeProfilePhoto(employee), [employee])
  const candidateIdDisplay = useMemo(
    () => employee?.candidate_id || employee?.candidate_no || (employee?.id ? String(employee.id) : ''),
    [employee]
  )
  const isReturned = useMemo(() => isEmployeeReturned(employee), [employee])
  const isEmployed = useMemo(() => isEmployeeEmployedInView(employee, currentView), [currentView, employee])
  const workflowState = useMemo(() => employeeWorkflowState(employee), [employee])
  const selectionState = useMemo(() => employee?.selection_state || {}, [employee])
  const isSelectedByCurrentAgent = Boolean(selectionState.selected_by_current_agent)
  const canUnselect = Boolean(selectionState.can_unselect)
  const isUnderProcess = workflowState === 'under_process'
  const isTravelled = workflowState === 'traveled'
  const isAvailable = employeeAvailability(employee) === 'Available'
  const badgeClass = useMemo(() => employeeStatusBadgeClass(employee), [employee])
  const returnRequest = useMemo(() => employee?.return_request || null, [employee])

  const canApproveReturn = Boolean(
    employee &&
    !isReturned &&
    returnRequest?.status === 'pending' &&
    canManageProcesses
  )
  const canRefuseReturn = canApproveReturn
  const canCancelReturnReq = Boolean(
    employee &&
    !isReturned &&
    returnRequest?.status === 'pending' &&
    isAgentSideUser &&
    isSelectedByCurrentAgent
  )
  const canReinstate = Boolean(employee && isReturned && canManageProcesses)

  // ── Document Filtering & Cards ──────────────────────────────────────
  const employeeDocuments = useMemo(() => employee?.documents || [], [employee])

  const reviewDocCategory = useCallback((document) => {
    const rawLabel = document?.label || fileLabel(document, attachmentLabels)
    const label = String(rawLabel || '').toLowerCase()
    const type = String(document?.document_type || '').toLowerCase()
    const haystack = `${type} ${label}`

    if (haystack.includes('return') || haystack.includes('evidence')) return 'returns'
    if (haystack.includes('passport')) return 'passport'
    if (haystack.includes('contract')) return 'contract'
    if (haystack.includes('medical') || haystack.includes('vaccin') || haystack.includes('lab')) return 'medical'
    if (haystack.includes('photo') || haystack.includes('portrait') || haystack.includes('full_photo') || haystack.includes('full photo')) return 'photos'
    return 'other'
  }, [attachmentLabels])

  const returnAttachmentDocs = useMemo(() => {
    return employeeDocuments
      .filter((doc) => String(doc?.document_type || '') === 'return_ticket')
      .map((doc) => ({
        ...doc,
        id: doc.id ?? `return-attachment-${doc.file_url || ''}`,
        label: fileLabel({ ...doc, label: 'Return ticket' }, attachmentLabels),
        is_return_attachment: true
      }))
  }, [attachmentLabels, employeeDocuments])

  const returnEvidenceDocs = useMemo(() => {
    const urls = [
      returnRequest?.evidence_file_1_url,
      returnRequest?.evidence_file_2_url,
      returnRequest?.evidence_file_3_url
    ].filter(Boolean)

    return urls.map((url, idx) => ({
      id: `return-evidence-${idx + 1}`,
      file_url: url,
      document_type: 'returns',
      label: `Return evidence ${idx + 1}`,
      is_return_evidence: true
    }))
  }, [returnRequest])

  const filteredDocs = useMemo(() => {
    if (activeDocTab === 'returns') return returnAttachmentDocs.concat(returnEvidenceDocs)
    if (activeDocTab === 'all') return employeeDocuments.concat(returnEvidenceDocs)
    return employeeDocuments.filter((doc) => reviewDocCategory(doc) === activeDocTab)
  }, [employeeDocuments, reviewDocCategory, activeDocTab, returnAttachmentDocs, returnEvidenceDocs])

  const docCards = useMemo(() => {
    return filteredDocs.map((document) => {
      const label = document?.label || fileLabel(document, attachmentLabels)
      const isPdf = isPdfDocumentUrl(document.file_url)
      const isImg = document?.is_return_evidence ? !isPdf : isImageDocument(document)
      const kind = isPdf ? 'PDF' : isImg ? 'Image' : 'File'
      const isReturnMaterial = Boolean(document?.is_return_evidence || document?.is_return_attachment)
      const returnIsDone = Boolean(isReturned || returnRequest?.approved_at)

      const openPayload = {
        url: document.file_url,
        label,
        name: label,
        subtitle: `${employee?.full_name || 'Candidate'} — ${label}`,
        isImage: isImg,
        isPdf
      }

      return (
        <span
          key={String(document.id)}
          role="button"
          tabIndex={0}
          className="employee-review-doc-card"
          onClick={() => openDocumentPreview(openPayload)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              openDocumentPreview(openPayload)
            }
          }}
        >
          <div className="employee-review-doc-thumb">
            {isReturnMaterial && returnIsDone ? (
              <span className="employee-review-doc-thumb-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                  <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : null}
            {isImg ? (
              <img
                src={document.file_url}
                alt={label}
                loading="eager"
                decoding="async"
              />
            ) : (
              <span>{kind}</span>
            )}
          </div>
          <div className="employee-review-doc-meta employee-review-step-copy">
            <span className="employee-review-step-label" title={label}>{label}</span>
            <span className="employee-review-step-date muted-text">{kind}</span>
          </div>
        </span>
      )
    })
  }, [attachmentLabels, employee?.full_name, filteredDocs, isReturned, openDocumentPreview, returnRequest?.approved_at])

  // ── Standalone Fallback Handlers ────────────────────────────────────
  const handleApproveReturnInternal = useCallback(async () => {
    if (onApproveReturn) {
      onApproveReturn(employee)
      return
    }
    const confirmed = await confirm({
      title: 'Acknowledge & Approve Return',
      message: `Are you sure you want to approve the return of candidate ${employee.full_name}? This will mark them as returned.`,
      confirmLabel: 'Approve Return',
      tone: 'warning'
    })
    if (!confirmed) return

    try {
      setActionBusy(true)
      const updated = await employeesService.approveReturn(employee.id)
      showToast(`Return for ${employee.full_name} approved successfully.`, { tone: 'success' })
      setFetchedEmployee(updated)
      onEmployeeUpdated?.(updated)
    } catch (err) {
      showToast(err?.message || 'Failed to approve return request', { tone: 'danger' })
    } finally {
      setActionBusy(false)
    }
  }, [confirm, employee, onApproveReturn, onEmployeeUpdated, showToast])

  const handleRefuseReturnInternal = useCallback(async () => {
    if (onRefuseReturn) {
      onRefuseReturn(employee)
      return
    }
    const confirmed = await confirm({
      title: 'Refuse Return Request',
      message: `Are you sure you want to decline/refuse this return request for ${employee.full_name}?`,
      confirmLabel: 'Refuse Request',
      tone: 'danger'
    })
    if (!confirmed) return

    try {
      setActionBusy(true)
      const updated = await employeesService.refuseReturn(employee.id)
      showToast(`Return request for ${employee.full_name} refused.`, { tone: 'info' })
      setFetchedEmployee(updated)
      onEmployeeUpdated?.(updated)
    } catch (err) {
      showToast(err?.message || 'Failed to refuse return request', { tone: 'danger' })
    } finally {
      setActionBusy(false)
    }
  }, [confirm, employee, onEmployeeUpdated, onRefuseReturn, showToast])

  const handleCancelReturnInternal = useCallback(async () => {
    if (onCancelReturnRequest) {
      onCancelReturnRequest(employee)
      return
    }
    const confirmed = await confirm({
      title: 'Cancel Return Request',
      message: `Cancel the pending return request for ${employee.full_name}?`,
      confirmLabel: 'Cancel Request',
      tone: 'warning'
    })
    if (!confirmed) return

    try {
      setActionBusy(true)
      const updated = await employeesService.cancelEmployeeReturnRequest(employee.id)
      showToast(`Return request for ${employee.full_name} cancelled.`, { tone: 'info' })
      setFetchedEmployee(updated)
      onEmployeeUpdated?.(updated)
      localStorage.removeItem(`notification_remind_return_${employee.id}`)
      localStorage.setItem('portal:cross_tab_sync', String(Date.now()))
      window.dispatchEvent(new Event('notifications:updated'))
      window.dispatchEvent(new Event('portal:refresh-candidates'))
    } catch (err) {
      showToast(err?.message || 'Failed to cancel return request', { tone: 'danger' })
    } finally {
      setActionBusy(false)
    }
  }, [confirm, employee, onCancelReturnRequest, onEmployeeUpdated, showToast])

  if (!isOpen) return null

  // ── Render Loading / Error State ────────────────────────────────────
  if (fetching) {
    const loadingShell = (
      <div className="employee-review-backdrop" role="presentation" onClick={onClose} style={{ zIndex, '--overlay-z-index': zIndex }}>
        <div className="employee-review-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="employee-review-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '340px' }}>
            <p className="muted-text" style={{ fontSize: '1rem' }}>Loading candidate profile…</p>
          </div>
        </div>
      </div>
    )
    return typeof document !== 'undefined' ? createPortal(loadingShell, document.body) : loadingShell
  }

  if (fetchError || !employee) {
    const errorShell = (
      <div className="employee-review-backdrop" role="presentation" onClick={onClose} style={{ zIndex, '--overlay-z-index': zIndex }}>
        <div className="employee-review-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="employee-review-shell" style={{ padding: '32px', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '12px', color: 'var(--color-danger, #ef4444)' }}>Unable to Load Candidate</h3>
            <p className="muted-text" style={{ marginBottom: '20px' }}>{fetchError || 'Candidate record not found.'}</p>
            <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    )
    return typeof document !== 'undefined' ? createPortal(errorShell, document.body) : errorShell
  }

  // ── Render Full Review Modal ────────────────────────────────────────
  const modalContent = (
    <div className="employee-review-backdrop" role="presentation" onClick={onClose} style={{ zIndex, '--overlay-z-index': zIndex }}>
      {/* Previous candidate navigation button */}
      <button
        type="button"
        className="employee-review-nav-btn employee-review-nav-btn--prev"
        onClick={(event) => {
          event.stopPropagation()
          onNavigate?.('previous')
        }}
        disabled={!hasPrevious}
        aria-label="Previous candidate"
        title={previousEmployee ? `Previous: ${previousEmployee.full_name}` : 'No previous candidate'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5 8 12l7 7" />
        </svg>
      </button>

      <div
        className="employee-review-modal"
        data-badge={badgeClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-review-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="employee-review-shell">
          {/* Header Profile Bar */}
          <header className="employee-review-profile">
            <div className="employee-review-profile-left">
              <div
                className={`employee-card-avatar employee-review-avatar employee-review-avatar--lg${profileDoc?.file_url && isImageDocument(profileDoc) ? ' is-clickable' : ''}`}
                role={profileDoc?.file_url && isImageDocument(profileDoc) ? 'button' : undefined}
                tabIndex={profileDoc?.file_url && isImageDocument(profileDoc) ? 0 : undefined}
                onClick={
                  profileDoc?.file_url && isImageDocument(profileDoc)
                    ? () =>
                        openDocumentPreview({
                          url: profileDoc.file_url,
                          label: `${employee.full_name} portrait`,
                          name: `${employee.full_name} portrait`,
                          subtitle: 'Candidate Portrait',
                          isImage: true,
                          isPdf: false
                        })
                    : undefined
                }
                onKeyDown={
                  profileDoc?.file_url && isImageDocument(profileDoc)
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openDocumentPreview({
                            url: profileDoc.file_url,
                            label: `${employee.full_name} portrait`,
                            name: `${employee.full_name} portrait`,
                            subtitle: 'Candidate Portrait',
                            isImage: true,
                            isPdf: false
                          })
                        }
                      }
                    : undefined
                }
              >
                {profileDoc?.file_url && isImageDocument(profileDoc) ? (
                  <img src={profileDoc.file_url} alt={`${employee.full_name} profile`} />
                ) : (
                  <span>{employee.full_name?.charAt(0) || '?'}</span>
                )}
                {candidateIdDisplay ? (
                  <span className="employee-card-avatar-id" title={`Candidate ID: ${candidateIdDisplay}`}>
                    ID: <strong>{candidateIdDisplay}</strong>
                  </span>
                ) : null}
              </div>

              <div className="employee-review-profile-meta">
                <p className="employee-modal-eyebrow">Candidate review</p>
                <h2 id="employee-review-title" className="employee-review-title">{employee.full_name}</h2>
                <p className="muted-text employee-review-subtitle">
                  {employee.profession || employee.professional_title || '--'}
                </p>
                <div className="employee-review-pills" aria-label="Candidate status">
                  <span className={`badge employee-card-status-badge ${badgeClass} ${employeeStatusBadgeVariantClass(employee)}`.trim()}>
                    {employeeStatusLabel(employee)}
                  </span>
                  <span className="employee-status-pill employee-status-pill--neutral">
                    {(employee.application_countries || [])[0] || '—'}
                  </span>
                  <span className="employee-status-pill employee-status-pill--neutral">{employeeAvailability(employee)}</span>
                  {returnRequest?.status === 'pending' ? (
                    <span className="employee-status-pill employee-status-pill--warning">Return requested</span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="employee-review-actions" aria-label="Candidate actions">
              <div className="employee-review-actions-stack">
                <div className="employee-review-actions-secondary">
                  {/* Initiate Process Dropdown & Button (if permitted and handler passed) */}
                  {canManageProcesses && !isUnderProcess && !isEmployed && !isTravelled && !isReturned && onStartProcess ? (
                    <div className="employee-review-btn-group">
                      <select
                        className="employee-review-select"
                        value={selectedAgentId}
                        onChange={(e) => setSelectedAgentId(e.target.value)}
                        disabled={readOnly || actionBusy}
                      >
                        <option value="">{agentOptions.length <= 1 ? 'Agent auto-selected' : 'Select agent'}</option>
                        {agentOptions.map((agent) => (
                          <option key={agent.id} value={String(agent.id)}>
                            {agent.name || agent.username}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="employee-review-action-btn employee-review-action-btn--primary"
                        onClick={() => onStartProcess(employee, selectedAgentId)}
                        disabled={readOnly || actionBusy || employee.status !== 'approved'}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                        <span>Initiate process</span>
                      </button>
                    </div>
                  ) : null}

                  {/* Select / Unselect Candidate */}
                  {!isEmployed && !isTravelled && !isReturned && !isUnderProcess && isAvailable && onToggleSelected ? (
                    <button
                      type="button"
                      className={`employee-review-action-btn ${isSelectedByCurrentAgent ? 'employee-review-action-btn--unselect' : 'employee-review-action-btn--select'}`}
                      onClick={() => onToggleSelected(employee)}
                      title={isSelectedByCurrentAgent && !canUnselect ? 'Only the selecting account or agent owner can unselect this candidate.' : undefined}
                      disabled={readOnly || !isAgentSideUser || actionBusy || (isSelectedByCurrentAgent && !canUnselect)}
                    >
                      {isSelectedByCurrentAgent ? (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                          <span>Unselect candidate</span>
                        </>
                      ) : (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          <span>Select candidate</span>
                        </>
                      )}
                    </button>
                  ) : null}


                  {/* Process Actions: Decline or Complete */}
                  {canManageProcesses && isUnderProcess && onDeclineProcess ? (
                    <button
                      type="button"
                      className="employee-review-action-btn employee-review-action-btn--danger"
                      onClick={() => onDeclineProcess(employee)}
                      disabled={readOnly || actionBusy}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                      </svg>
                      <span>Decline process</span>
                    </button>
                  ) : null}

                  {canOverrideProgress && isUnderProcess && onMarkProgressComplete && ((employee.progress_status?.overall_completion ?? 0) < 100 || !employee.did_travel) ? (
                    <button
                      type="button"
                      className="employee-review-action-btn employee-review-action-btn--info"
                      onClick={() => onMarkProgressComplete(employee)}
                      disabled={readOnly || actionBusy}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                      <span>
                        {(employee.progress_status?.overall_completion ?? 0) >= 100
                          ? 'Confirm travelled'
                          : 'Mark progress 100%'}
                      </span>
                    </button>
                  ) : null}

                  {/* Availability Workflow Actions (Approve / Reject / Suspend) */}
                  {workflowState === 'pending' && onAvailabilityAction ? (
                    <>
                      <button
                        type="button"
                        className="employee-review-action-btn employee-review-action-btn--success"
                        onClick={() => onAvailabilityAction(employee, 'approved', 'Approved')}
                        disabled={actionBusy || readOnly || isAgentSideUser}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span>Approve</span>
                      </button>
                      <button
                        type="button"
                        className="employee-review-action-btn employee-review-action-btn--danger"
                        onClick={() => onAvailabilityAction(employee, 'rejected', 'Rejected')}
                        disabled={actionBusy || readOnly || isAgentSideUser}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        <span>Reject</span>
                      </button>
                    </>
                  ) : null}

                  {/* Return Decision Buttons (Approve / Refuse) */}
                  {canApproveReturn ? (
                    <button
                      type="button"
                      className="employee-review-action-btn employee-review-action-btn--success"
                      onClick={handleApproveReturnInternal}
                      disabled={actionBusy || readOnly}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span>Approve Return</span>
                    </button>
                  ) : null}
                  {canRefuseReturn ? (
                    <button
                      type="button"
                      className="btn-secondary document-preview-download employee-review-action-btn employee-review-action-btn--neutral"
                      onClick={handleRefuseReturnInternal}
                      disabled={actionBusy || readOnly}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                      </svg>
                      <span>Refuse Return</span>
                    </button>
                  ) : null}
                  {canCancelReturnReq ? (
                    <button
                      type="button"
                      className="btn-secondary document-preview-download employee-review-action-btn employee-review-action-btn--neutral"
                      onClick={handleCancelReturnInternal}
                      disabled={actionBusy || readOnly}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                      <span>Cancel request</span>
                    </button>
                  ) : null}
                  {canReinstate && onReinstateEmployment ? (
                    <button
                      type="button"
                      className="btn-secondary document-preview-download employee-review-action-btn employee-review-action-btn--neutral"
                      onClick={() => onReinstateEmployment(employee)}
                      disabled={actionBusy || readOnly}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M8 3 4 7l4 4"/>
                        <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H4"/>
                      </svg>
                      <span>Reverse to employed</span>
                    </button>
                  ) : null}

                  {/* Edit Candidate Button */}
                  {canEditRecords && onEdit ? (
                    <button
                      type="button"
                      className="btn-secondary document-preview-download employee-review-action-btn employee-review-action-btn--neutral"
                      onClick={() => onEdit(employee.id)}
                      disabled={readOnly}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                      </svg>
                      <span>Edit</span>
                    </button>
                  ) : null}

                  {/* Delete Candidate Button */}
                  {onDelete && !isAgentSideUser && !isUnderProcess ? (
                    <button
                      type="button"
                      className="employee-review-action-btn employee-review-action-btn--danger"
                      onClick={() => onDelete(employee)}
                      disabled={readOnly}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                      </svg>
                      <span>Delete</span>
                    </button>
                  ) : null}

                  {/* Close Button */}
                  <button
                    type="button"
                    className="employee-review-action-btn employee-review-action-btn--close"
                    onClick={onClose}
                    aria-label="Close review"
                    title="Close (Esc)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Body Content */}
          {mode === 'request' ? (
            <div className="employee-review-dashboard employee-review-dashboard--request">
              <section className="employee-review-panel">
                <div className="employee-review-panel-header">
                  <h3>Commission</h3>
                </div>
                <div className="employee-review-kv">
                  <div className="employee-review-kv-row">
                    <span>Status</span>
                    <strong>{employedCommissionLabel(employee)}</strong>
                  </div>
                  <p className="muted-text">Collection from the agent side to the organization is a future settlement concept.</p>
                </div>
              </section>

              <section className="employee-review-panel">
                <div className="employee-review-panel-header">
                  <h3>Return request</h3>
                </div>
                {returnRequest ? (
                  <div className="employee-review-activity">
                    <div className="employee-review-activity-header">
                      <span
                        className={`employee-status-pill employee-status-pill--${returnRequest.status === 'pending' ? 'warning' : returnRequest.status === 'cancelled' || returnRequest.status === 'refused' ? 'danger' : 'neutral'}`}
                        title={returnRequest.requested_by_username ? `Requested by: ${returnRequest.requested_by_username}` : undefined}
                      >
                        {prettyStatus(returnRequest.status)}
                      </span>
                    </div>
                    <div className="employee-review-activity-inline">
                      <span className="employee-review-activity-kv" title={returnRequest.requested_by_username || '--'}>
                        <span className="employee-review-activity-kv-label">Requested by</span>
                        <span className="employee-review-activity-kv-value">{returnRequest.requested_by_username || '--'}</span>
                      </span>
                      <span className="employee-review-activity-kv-sep" aria-hidden="true">·</span>
                      <span className="employee-review-activity-kv" title={formatDateTime(returnRequest.requested_at)}>
                        <span className="employee-review-activity-kv-label">Requested</span>
                        <span className="employee-review-activity-kv-value">{formatShortDate(returnRequest.requested_at)}</span>
                      </span>
                      <span className="employee-review-activity-kv-sep" aria-hidden="true">·</span>
                      <span className="employee-review-activity-kv" title={returnRequest.approved_by_username || '--'}>
                        <span className="employee-review-activity-kv-label">Responded by</span>
                        <span className="employee-review-activity-kv-value">{returnRequest.approved_by_username || '--'}</span>
                      </span>
                      <span className="employee-review-activity-kv-sep" aria-hidden="true">·</span>
                      <span className="employee-review-activity-kv" title={formatDateTime(returnRequest.approved_at)}>
                        <span className="employee-review-activity-kv-label">Responded</span>
                        <span className="employee-review-activity-kv-value">{formatShortDate(returnRequest.approved_at)}</span>
                      </span>
                    </div>
                    {returnRequest.remark ? (
                      <p className="employee-review-activity-remark-line" title={returnRequest.remark}>
                        {returnRequest.remark}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted-text employee-review-empty">None</p>
                )}
              </section>
            </div>
          ) : (
            <>
              <div className="employee-review-dashboard">
                {/* Candidate Overview Panel */}
                <section className="employee-review-panel employee-review-panel--overview">
                  <div className="employee-review-panel-header">
                    <h3 className="employee-review-panel-title">
                      <span className="employee-review-panel-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                          <path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </span>
                      Candidate Overview
                    </h3>
                  </div>
                  <div className="employee-review-overview-grid" aria-label="Candidate overview details">
                    <div className="employee-review-overview-col">
                      <div className="employee-review-overview-item">
                        <span className="employee-review-overview-label">
                          <span className="employee-review-overview-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                              <line x1="16" x2="16" y1="2" y2="6" />
                              <line x1="8" x2="8" y1="2" y2="6" />
                              <line x1="3" x2="21" y1="10" y2="10" />
                            </svg>
                          </span>
                          <span>Age</span>
                        </span>
                        <span className="employee-review-overview-value" title={employee.age || computeAge(employee.date_of_birth) || '—'}>
                          {employee.age || computeAge(employee.date_of_birth) || '—'}
                        </span>
                      </div>
                      <div className="employee-review-overview-item">
                        <span className="employee-review-overview-label">
                          <span className="employee-review-overview-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                              <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                          </span>
                          <span>Availability</span>
                        </span>
                        <span className="employee-review-overview-value" title={employeeAvailability(employee)}>
                          {employeeAvailability(employee)}
                        </span>
                      </div>
                      <div className="employee-review-overview-item">
                        <span className="employee-review-overview-label">
                          <span className="employee-review-overview-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                          </span>
                          <span>Phone</span>
                        </span>
                        <span className="employee-review-overview-value" title={employee.phone || employee.mobile_number || '—'}>
                          {employee.phone || employee.mobile_number || '—'}
                        </span>
                      </div>
                      <div className="employee-review-overview-item">
                        <span className="employee-review-overview-label">
                          <span className="employee-review-overview-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect width="20" height="16" x="2" y="4" rx="2" />
                              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                            </svg>
                          </span>
                          <span>Email</span>
                        </span>
                        <span className="employee-review-overview-value" title={employee.email || '—'}>
                          {employee.email || '—'}
                        </span>
                      </div>
                    </div>

                    <div className="employee-review-overview-col">
                      <div className="employee-review-overview-item">
                        <span className="employee-review-overview-label">
                          <span className="employee-review-overview-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" />
                            </svg>
                          </span>
                          <span>Destination</span>
                        </span>
                        <span className="employee-review-overview-value" title={employee.application_countries?.join(', ') || '—'}>
                          {employee.application_countries?.join(', ') || '—'}
                        </span>
                      </div>
                      <div className="employee-review-overview-item">
                        <span className="employee-review-overview-label">
                          <span className="employee-review-overview-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                          </span>
                          <span>Residence</span>
                        </span>
                        <span className="employee-review-overview-value" title={employee.residence_country || '—'}>
                          {employee.residence_country || '—'}
                        </span>
                      </div>
                      <div className="employee-review-overview-item">
                        <span className="employee-review-overview-label">
                          <span className="employee-review-overview-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <polyline points="16 11 18 13 22 9" />
                            </svg>
                          </span>
                          <span>Registered by</span>
                        </span>
                        <span className="employee-review-overview-value" title={employee.registered_by_username || '—'}>
                          {employee.registered_by_username || '—'}
                        </span>
                      </div>
                      <div className="employee-review-overview-item">
                        <span className="employee-review-overview-label">
                          <span className="employee-review-overview-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 21s7-4.35 7-10a7 7 0 0 0-14 0c0 5.65 7 10 7 10Z" />
                              <path d="M9.5 11.5 11 13l3.5-4" />
                            </svg>
                          </span>
                          <span>
                            {employee.selection_state?.selection
                              ? (employee.selection_state.selection.status === 'under_process' ? 'Process owner' : 'Selected by')
                              : 'Selection'}
                          </span>
                        </span>
                        <span
                          className="employee-review-overview-value"
                          title={employee.selection_state?.selection?.agent_name || (isAvailable ? 'Available' : 'Unassigned')}
                        >
                          {employee.selection_state?.selection?.agent_name || (isAvailable ? 'Available' : 'Unassigned')}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Application Progress Panel */}
                <section className="employee-review-panel employee-review-panel--progress">
                  <div className="employee-review-panel-header">
                    <h3 className="employee-review-panel-title">
                      <span className="employee-review-panel-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                          <path d="M4 18V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M6 15l4-4 3 3 6-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M10 11h0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                          <path d="M13 14h0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                          <path d="M19 6h0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                        </svg>
                      </span>
                      Application Progress
                    </h3>
                  </div>
                  <div className="employee-review-progress">
                    <div className="employee-review-progress-left">
                      <div className="employee-progress-donut" aria-label={`Progress ${progressDonut.overallProgress}%`}>
                        <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
                          <circle cx="60" cy="60" r={progressDonut.radius} className="employee-progress-track" />
                          <circle
                            cx="60"
                            cy="60"
                            r={progressDonut.radius}
                            className="employee-progress-value"
                            style={{ stroke: `var(--employee-progress-tone, ${progressDonut.tone})` }}
                            strokeDasharray={progressDonut.circumference}
                            strokeDashoffset={progressDonut.dashOffset}
                          />
                        </svg>
                        <div className="employee-progress-donut-label">
                          <strong>{progressDonut.overallProgress}%</strong>
                          <span>Overall</span>
                        </div>
                      </div>

                      <div className="employee-review-progress-metrics" aria-label="Progress metrics">
                        <div className="employee-review-progress-metric">
                          <span className="employee-review-progress-metric-label">Fields</span>
                          <span className="employee-review-progress-metric-value">{employee.progress_status?.field_completion ?? 0}%</span>
                        </div>
                        <div className="employee-review-progress-metric">
                          <span className="employee-review-progress-metric-label">Documents</span>
                          <span className="employee-review-progress-metric-value">{employee.progress_status?.document_completion ?? 0}%</span>
                        </div>
                        <div className="employee-review-progress-metric">
                          <span className="employee-review-progress-metric-label">Status</span>
                          <span className="employee-review-progress-metric-value" title={employeeStatusLabel(employee)}>
                            {employeeStatusLabel(employee)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="employee-review-progress-divider" aria-hidden="true" />

                    {(() => {
                      const allProgressSteps = [
                        {
                          key: 'profile',
                          label: 'Profile Completed',
                          done: (employee.progress_status?.field_completion ?? 0) >= 100,
                          date: employee?.created_at
                        },
                        {
                          key: 'documents',
                          label: 'Documents Verified',
                          done: (employee.progress_status?.document_completion ?? 0) >= 100,
                          date: resolveLatestDate(employeeDocuments, ['verified_at', 'updated_at', 'created_at'])
                        },
                        {
                          key: 'selected',
                          label: 'Selected',
                          done: Boolean(employee.selection_state?.selection),
                          date:
                            employee.selection_state?.selection?.created_at ||
                            employee.selection_state?.selection?.selected_at ||
                            ''
                        },
                        {
                          key: 'travel',
                          label: 'Traveled',
                          done: String(employee.travel_status || 'pending') !== 'pending',
                          date: employee.departure_date || employee.travelled_at || employee.traveled_at || ''
                        },
                        {
                          key: 'arrived',
                          label: 'Arrived',
                          done: Boolean(employee.did_travel) || String(employee.travel_status || '').includes('arrived'),
                          date: employee.arrived_at || employee.arrival_date || ''
                        },
                        {
                          key: 'returned',
                          label: 'Returned',
                          done: isReturned,
                          date:
                            employee.return_request?.approved_at ||
                            employee.returned_at ||
                            employee.returned_on ||
                            ''
                        }
                      ]

                      let currentStepIndex = 0
                      for (let i = allProgressSteps.length - 1; i >= 0; i -= 1) {
                        if (allProgressSteps[i].done) {
                          currentStepIndex = i
                          break
                        }
                      }

                      const visibleSteps = allProgressSteps.slice(currentStepIndex)
                      const phasesToShow = visibleSteps.slice(0, 3)
                      const remainingSteps = visibleSteps.slice(3)
                      const hasRemaining = remainingSteps.length > 0
                      const totalItemsCount = phasesToShow.length + (hasRemaining ? 1 : 0)

                      return (
                        <ol
                          className={`employee-review-stepper employee-review-stepper--progress${totalItemsCount <= 1 ? ' is-single-step' : ''}`}
                          aria-label="Progress steps"
                        >
                          {phasesToShow.map((step, idx) => (
                            <li
                              key={step.key}
                              className={`employee-review-step${step.done ? ' is-done' : ''}${idx === 0 ? ' is-current' : ''}`}
                            >
                              <span className="employee-review-step-icon" aria-hidden="true">
                                {step.done ? (
                                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none">
                                    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                ) : null}
                              </span>
                              <div className="employee-review-step-copy">
                                <span className="employee-review-step-label">{step.label}</span>
                                <span className="employee-review-step-date muted-text">
                                  {formatShortDate(step.date)}
                                </span>
                              </div>
                            </li>
                          ))}
                          {hasRemaining ? (
                            <li
                              key="more-steps"
                              className="employee-review-step employee-review-step--more"
                              title={`Remaining phases: ${remainingSteps.map((s) => s.label).join(' → ')}`}
                            >
                              <span className="employee-review-step-icon employee-review-step-icon--more" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor">
                                  <circle cx="4" cy="12" r="2" />
                                  <circle cx="12" cy="12" r="2" />
                                  <circle cx="20" cy="12" r="2" />
                                </svg>
                              </span>
                              <div className="employee-review-step-copy">
                                <span className="employee-review-step-label employee-review-step-label--more">...</span>
                                <span className="employee-review-step-date muted-text">
                                  {remainingSteps.length} more
                                </span>
                              </div>
                            </li>
                          ) : null}
                        </ol>
                      )
                    })()}
                  </div>
                </section>

                {/* Finance / Commission Panel */}
                <section className="employee-review-panel employee-review-panel--finance">
                  <div className="employee-review-panel-header">
                    <h3 className="employee-review-panel-title">
                      <span className="employee-review-panel-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                          <path d="M12 2v20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M17 6.5c0-2-2.2-3.5-5-3.5s-5 1.5-5 3.5 2.2 3.5 5 3.5 5 1.5 5 3.5-2.2 3.5-5 3.5-5-1.5-5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      Commission / Finance
                    </h3>
                  </div>
                  <div className="employee-review-finance-cards">
                    <div className={`employee-review-finance-card${String(employedCommissionLabel(employee)).toLowerCase().includes('pending') ? ' is-pending' : ''}`}>
                      <div className="employee-review-kv employee-review-kv--metrics">
                        <div className="employee-review-kv-row">
                          <span className="employee-review-kv-label">Status</span>
                          <span className="employee-review-kv-value">{employedCommissionLabel(employee)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="employee-review-finance-card">
                      <div className="employee-review-kv employee-review-kv--metrics">
                        <div className="employee-review-kv-row">
                          <span className="employee-review-kv-label">Settlement</span>
                          <span className="employee-review-kv-value">
                            Collection from agent side to the organization is a future settlement concept.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* Documents Scroller Panel */}
              <section className="employee-review-panel employee-review-panel--documents">
                <div className="employee-review-panel-header employee-review-panel-header--split employee-review-panel-header--documents">
                  <h3 className="employee-review-panel-title">
                    <span className="employee-review-panel-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      </svg>
                    </span>
                    Documents
                  </h3>
                  <div className="employee-review-doc-filters">
                    <div className="employee-review-tabs" role="tablist" aria-label="Document filters">
                      {DOCUMENT_CATEGORIES.map((tab) => (
                        <span
                          key={tab.id}
                          role="tab"
                          className={`employee-review-tab${activeDocTab === tab.id ? ' is-active' : ''}`}
                          onClick={() => setActiveDocTab(tab.id)}
                          aria-selected={activeDocTab === tab.id}
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setActiveDocTab(tab.id)
                            }
                          }}
                        >
                          {tab.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="employee-review-doc-scroller-wrap" aria-label="Employee documents">
                  {filteredDocs.length === 0 ? (
                    <p className="muted-text employee-review-empty">No documents found.</p>
                  ) : (
                    <>
                      <div className="employee-review-doc-scroller" ref={docScrollerRef} onScroll={scheduleDocScrollStateUpdate}>
                        <div className="employee-review-doc-grid">
                          {docCards}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="employee-review-doc-scroll-btn employee-review-doc-scroll-btn--left"
                        onClick={scrollDocsPrev}
                        disabled={!canScrollLeft}
                        aria-label="Scroll documents left"
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <path d="M15 18 9 12l6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="employee-review-doc-scroll-btn"
                        onClick={scrollDocsNext}
                        disabled={!canScrollRight}
                        aria-label="Scroll documents right"
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </section>

              {/* Activity / Return Requests Panel */}
              <section className="employee-review-panel employee-review-panel--activity">
                <div className="employee-review-panel-header">
                  <h3 className="employee-review-panel-title">
                    <span className="employee-review-panel-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" stroke="currentColor" strokeWidth="2" />
                        <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    Activity / Return requests
                  </h3>
                </div>
                {returnRequest ? (
                  <div className="employee-review-activity employee-review-activity--timeline">
                    <ol className="employee-review-stepper employee-review-stepper--progress employee-review-stepper--activity" aria-label="Return request activity">
                      <li className="employee-review-step is-done">
                        <span className="employee-review-step-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
                            <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <div className="employee-review-step-copy">
                          <span className="employee-review-step-label">{formatShortDate(returnRequest.requested_at)}</span>
                          <span className="employee-review-step-date muted-text">{formatShortTime(returnRequest.requested_at)}</span>
                        </div>
                      </li>
                    </ol>
                    <div className="employee-review-activity-body">
                      <div className="employee-review-activity-header">
                        <div className="employee-review-activity-title-row">
                          <strong className="employee-review-activity-title">Return Request</strong>
                          <span
                            className={`employee-status-pill employee-status-pill--${
                              returnRequest.status === 'pending'
                                ? 'warning'
                                : returnRequest.status === 'cancelled' || returnRequest.status === 'refused'
                                  ? 'danger'
                                  : 'neutral'
                            }`}
                            title={returnRequest.requested_by_username ? `Requested by: ${returnRequest.requested_by_username}` : undefined}
                          >
                            {prettyStatus(returnRequest.status)}
                          </span>
                        </div>
                      </div>
                      <div className="employee-review-activity-inline">
                        <span className="employee-review-activity-kv" title={returnRequest.requested_by_username || '--'}>
                          <span className="employee-review-activity-kv-label">Requested by</span>
                          <span className="employee-review-activity-kv-value">{returnRequest.requested_by_username || '--'}</span>
                        </span>
                        <span className="employee-review-activity-kv-sep" aria-hidden="true">·</span>
                        <span className="employee-review-activity-kv" title={formatDateTime(returnRequest.requested_at)}>
                          <span className="employee-review-activity-kv-label">Requested</span>
                          <span className="employee-review-activity-kv-value">{formatShortDate(returnRequest.requested_at)}</span>
                        </span>
                        <span className="employee-review-activity-kv-sep" aria-hidden="true">·</span>
                        <span className="employee-review-activity-kv" title={returnRequest.approved_by_username || '--'}>
                          <span className="employee-review-activity-kv-label">Responded by</span>
                          <span className="employee-review-activity-kv-value">{returnRequest.approved_by_username || '--'}</span>
                        </span>
                        <span className="employee-review-activity-kv-sep" aria-hidden="true">·</span>
                        <span className="employee-review-activity-kv" title={formatDateTime(returnRequest.approved_at)}>
                          <span className="employee-review-activity-kv-label">Responded</span>
                          <span className="employee-review-activity-kv-value">{formatShortDate(returnRequest.approved_at)}</span>
                        </span>
                        {employee.returned_recorded_by_username ? (
                          <>
                            <span className="employee-review-activity-kv-sep" aria-hidden="true">·</span>
                            <span className="employee-review-activity-kv" title={employee.returned_recorded_by_username}>
                              <span className="employee-review-activity-kv-label">Recorded by</span>
                              <span className="employee-review-activity-kv-value">{employee.returned_recorded_by_username}</span>
                            </span>
                          </>
                        ) : null}
                      </div>
                      {returnRequest.remark ? (
                        <p className="employee-review-activity-remark-line" title={returnRequest.remark}>
                          {returnRequest.remark}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="muted-text employee-review-empty">No return requests found.</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {/* Next candidate navigation button */}
      <button
        type="button"
        className="employee-review-nav-btn employee-review-nav-btn--next"
        onClick={(event) => {
          event.stopPropagation()
          onNavigate?.('next')
        }}
        disabled={!hasNext}
        aria-label="Next candidate"
        title={nextEmployee ? `Next: ${nextEmployee.full_name}` : 'No next candidate'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body)
  }
  return modalContent
}
