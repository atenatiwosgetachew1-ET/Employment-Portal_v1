import React from 'react'
import {
  employeeProfilePhoto,
  computeAge,
  employeeWorkflowState,
  employeeStatusBadgeClass,
  isEmployeeEmployedInView,
  isEmployeeReturned,
  employeeAvailability,
  resolvedProcessAgentId,
  prettyStatus,
  employeeStatusBadgeVariantClass,
  employeeStatusLabel,
  findEmployeeDocument,
  isImageDocument,
  isPdfDocumentUrl,
  fileLabel,
  LIST_CARD_PREVIEW_DOCUMENTS,
  GRID_CARD_PREVIEW_DOCUMENTS
} from '../../utils/employeeHelpers'

export default function EmployeeCard({
  employee,
  openedEmployeeId,
  expandedEmployeeCardId,
  openEmployeeCardMenuId,
  employeeCardsLayout,
  selectedEmployeeCardIds,
  selectDeniedEmployeeCardIds,
  processAgentAssignments,
  formOptions,
  currentSelectedCardsGroup,
  expandedEmployeeCardReadyId,
  attachmentLabels,
  selectionGroupForEmployee,
  toggleEmployeeCardExpanded,
  toggleEmployeeCardSelected,
  flashEmployeeCardSelectDenied,
  setOpenEmployeeCardMenuId,
  setOpenedEmployeeMode,
  setOpenedEmployeeId,
  handleToggleSelectedEmployee,
  setExpandedEmployeeCardReadyId,
  reflowEmployeeCardsMasonry,
  cancelFloatingAttachmentPreviewClose,
  openFloatingAttachmentPreview,
  scheduleFloatingAttachmentPreviewClose,
  openDocumentPreview,
  employeeCardItemRefs,
  employeeCardResizeObserverRef,
  floatingAttachmentPreviewPopoverRef,
  isAgentSideUser,
  readOnly,
  actionBusyId
}) {
  const profilePhoto = employeeProfilePhoto(employee)
  const isOpened = openedEmployeeId === employee.id
  const isExpanded = expandedEmployeeCardId === employee.id
  const isMenuOpen = isExpanded || openEmployeeCardMenuId === employee.id
  const isListLayout = employeeCardsLayout === 'list'
  const employeeReligion = employee.religion || ''
  const employeeDateOfBirth = employee.date_of_birth || ''
  const employeeAge =
    employee.age ?? computeAge(employeeDateOfBirth) ?? ''
  const selectionState = employee.selection_state || {}
  const selection = selectionState.selection
  const isSelectedByCurrentAgent = Boolean(selectionState.selected_by_current_agent)
  const canUnselectSelection = Boolean(selectionState.can_unselect)
  const workflowState = employeeWorkflowState(employee)
  const badgeClass = employeeStatusBadgeClass(employee)
  const isUnderProcess = workflowState === 'under_process'
  const isEmployedEmployee = isEmployeeEmployedInView(employee)
  const isTravelledEmployee = workflowState === 'traveled'
  const isReturnedEmployee = isEmployeeReturned(employee)
  const isAvailableEmployee = employeeAvailability(employee) === 'Available'
  const assignedAgentId = resolvedProcessAgentId(
    employee,
    processAgentAssignments,
    formOptions.agent_options
  )
  const destinationLabel = employee.application_countries?.length
    ? employee.application_countries.join(', ')
    : '—'
  const hasPassport = Boolean(findEmployeeDocument(employee, ['passport_photo', 'passport_document'])?.file_url)
  const hasMedical = Boolean(findEmployeeDocument(employee, ['medical'])?.file_url)
  const hasClearance = Boolean(findEmployeeDocument(employee, ['clearance'])?.file_url)
  const canSelectCandidate =
    !isEmployedEmployee &&
    !isTravelledEmployee &&
    !isReturnedEmployee &&
    !isUnderProcess &&
    isAvailableEmployee &&
    isAgentSideUser
  const phoneLabel = employee.phone || employee.mobile_number || '—'
  const emailLabel = employee.email || '—'
  const availabilityLabel = employeeAvailability(employee) || '—'
  const residenceCountryLabel = employee.residence_country || '—'
  const progressCompletion = employee.progress_status?.overall_completion ?? 0
  const travelStatusLabel = prettyStatus(employee.travel_status, 'pending')
  const returnStatusLabel = prettyStatus(employee.return_status)
  const candidateId = employee.candidate_id || employee.candidate_no || employee.id
  const professionLabel =
    employee.profession || employee.professional_title || 'No profession set'
  const experienceLabel = (() => {
    if (Array.isArray(employee.experiences) && employee.experiences.length > 0) {
      const valid = employee.experiences.filter(
        (item) => (item?.country || '').trim() || String(item?.years ?? '').trim()
      )
      if (valid.length > 0) {
        return valid
          .map((item) => {
            const country = (item.country || '').trim()
            const years = String(item.years ?? '').trim()
            if (country && years) {
              const numYears = Number(years)
              const ySuffix = !Number.isNaN(numYears) && numYears === 1 ? 'yr' : 'yrs'
              return `${country} (${years} ${ySuffix})`
            }
            if (years) {
              const numYears = Number(years)
              const ySuffix = !Number.isNaN(numYears) && numYears === 1 ? 'yr' : 'yrs'
              return `${years} ${ySuffix}`
            }
            return country
          })
          .join(', ')
      }
    }
    if (typeof employee.experience === 'string' && employee.experience.trim()) {
      return employee.experience.trim()
    }
    return 'Fresher'
  })()

  return (
    <article
      key={employee.id}
      ref={(node) => {
        const map = employeeCardItemRefs.current
        const prevNode = map.get(employee.id)
        const resizeObserver = employeeCardResizeObserverRef.current
        if (prevNode && prevNode !== node && resizeObserver) {
          resizeObserver.unobserve(prevNode)
        }

        if (node) {
          map.set(employee.id, node)
          if (resizeObserver) resizeObserver.observe(node)
        } else {
          map.delete(employee.id)
        }
      }}
      data-badge={badgeClass}
      className={`employee-card${isOpened ? ' is-open' : ''}${isExpanded ? ' is-expanded' : ''}${selectedEmployeeCardIds.has(employee.id) ? ' is-selected' : ''}${selectDeniedEmployeeCardIds.has(employee.id) ? ' is-select-denied' : ''}`}
      onClick={(event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault()
          if (availabilityLabel !== 'Available') {
            flashEmployeeCardSelectDenied(employee.id)
            return
          }
          const employeeGroup = selectionGroupForEmployee(employee)
          const alreadySelected = selectedEmployeeCardIds.has(employee.id)
          if (!alreadySelected && currentSelectedCardsGroup && currentSelectedCardsGroup !== employeeGroup) {
            flashEmployeeCardSelectDenied(employee.id)
            return
          }
          toggleEmployeeCardSelected(employee.id)
          return
        }
        toggleEmployeeCardExpanded(employee.id)
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        const isActivationKey = event.key === 'Enter' || event.key === ' '
        if (isActivationKey && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          if (availabilityLabel !== 'Available') {
            flashEmployeeCardSelectDenied(employee.id)
            return
          }
          const employeeGroup = selectionGroupForEmployee(employee)
          const alreadySelected = selectedEmployeeCardIds.has(employee.id)
          if (!alreadySelected && currentSelectedCardsGroup && currentSelectedCardsGroup !== employeeGroup) {
            flashEmployeeCardSelectDenied(employee.id)
            return
          }
          toggleEmployeeCardSelected(employee.id)
          return
        }
        if (isActivationKey) {
          event.preventDefault()
          toggleEmployeeCardExpanded(employee.id)
        }
      }}
    >
      {!isListLayout ? (
        <div
          className={`employee-card-menu${isMenuOpen ? ' is-open' : ''}`}
          data-menu-employee-id={employee.id}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="employee-card-menu-btn"
            aria-label="Open employee actions"
            aria-expanded={isMenuOpen}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setOpenEmployeeCardMenuId((prev) => (prev === employee.id ? null : employee.id))
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
              <circle cx="5" cy="12" r="1.8" fill="currentColor" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <circle cx="19" cy="12" r="1.8" fill="currentColor" />
            </svg>
          </button>

          <div className="employee-card-menu-panel" role="menu" aria-label="Employee actions">
            <button
              type="button"
              className="employee-card-menu-item employee-card-menu-item--details"
              role="menuitem"
              aria-label={isOpened ? 'Close employee details' : 'Open employee details'}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setOpenEmployeeCardMenuId(null)
                setOpenedEmployeeMode('full')
                setOpenedEmployeeId((prev) => (prev === employee.id ? null : employee.id))
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                {isOpened ? (
                  <path
                    d="M18 6 6 18M6 6l12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : (
                  <path
                    d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
            </button>

            {(!isEmployedEmployee && !isTravelledEmployee) && !isReturnedEmployee && !isUnderProcess && isAvailableEmployee ? (
              <button
                type="button"
                className="employee-card-menu-item employee-card-menu-item--select"
                role="menuitem"
                aria-label={isSelectedByCurrentAgent ? 'Unselect candidate' : 'Select candidate'}
                title={isSelectedByCurrentAgent && !canUnselectSelection ? 'Only the selecting account or agent owner can unselect this candidate.' : undefined}
                disabled={readOnly || !isAgentSideUser || actionBusyId === employee.id || (isSelectedByCurrentAgent && !canUnselectSelection)}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setOpenEmployeeCardMenuId(null)
                  handleToggleSelectedEmployee(employee)
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                  {isSelectedByCurrentAgent ? (
                    <path d="M7 7l10 10M17 7 7 17" style={{ stroke: 'currentColor', strokeWidth: 2.1, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
                  ) : (
                    <path d="M20 6 9 17l-5-5" style={{ stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
                  )}
                </svg>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="employee-card-header">
        <div className="employee-card-identity">
          <div className="employee-card-avatar">
            {profilePhoto?.file_url && isImageDocument(profilePhoto) ? (
              <img src={profilePhoto.file_url} alt={`${employee.full_name} profile`} />
            ) : (
              <span>{employee.full_name?.charAt(0) || '?'}</span>
            )}
            <span className="employee-card-avatar-id" title={`Candidate ID: ${candidateId}`}>
              ID: <strong>{candidateId}</strong>
            </span>
          </div>
          <div className="employee-card-identity-info">
            <h3 className="employee-card-name">{employee.full_name}</h3>
            <div className="employee-card-subhead">
              <span className="employee-card-profession">{professionLabel}</span>
              {employeeReligion && employeeReligion !== '--' ? (
                <span className="employee-card-tag">{employeeReligion}</span>
              ) : null}
            </div>
            {isListLayout ? (
              <div className="employee-card-list-kv muted-text" aria-label="Candidate overview">
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">
                    <span className="employee-card-list-kv-icon" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                        <line x1="16" x2="16" y1="2" y2="6" />
                        <line x1="8" x2="8" y1="2" y2="6" />
                        <line x1="3" x2="21" y1="10" y2="10" />
                      </svg>
                    </span>
                    <span>Age</span>
                  </span>
                  <span className="employee-card-list-kv-value">{employeeAge || '—'}</span>
                </div>
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">
                    <span className="employee-card-list-kv-icon" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </span>
                    <span>Availability</span>
                  </span>
                  <span className="employee-card-list-kv-value">{availabilityLabel}</span>
                </div>
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">
                    <span className="employee-card-list-kv-icon" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </span>
                    <span>Phone</span>
                  </span>
                  <span className="employee-card-list-kv-value">{phoneLabel}</span>
                </div>
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">
                    <span className="employee-card-list-kv-icon" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="20" height="16" x="2" y="4" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                    </span>
                    <span>Email</span>
                  </span>
                  <span className="employee-card-list-kv-value">{emailLabel}</span>
                </div>
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">
                    <span className="employee-card-list-kv-icon" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </span>
                    <span>Residence</span>
                  </span>
                  <span className="employee-card-list-kv-value">{residenceCountryLabel}</span>
                </div>
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">
                    <span className="employee-card-list-kv-icon" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                      </svg>
                    </span>
                    <span>Progress</span>
                  </span>
                  <span className="employee-card-list-kv-value">{progressCompletion}%</span>
                </div>
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">
                    <span className="employee-card-list-kv-icon" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
                      </svg>
                    </span>
                    <span>Travel</span>
                  </span>
                  <span className="employee-card-list-kv-value">{travelStatusLabel}</span>
                </div>
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">
                    <span className="employee-card-list-kv-icon" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                    </span>
                    <span>Return</span>
                  </span>
                  <span className="employee-card-list-kv-value">{returnStatusLabel}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {isListLayout ? (
          <aside className="employee-card-list-side" onClick={(e) => e.stopPropagation()}>
            <div className="employee-card-list-side-top">
              <div className="employee-card-list-side-dest" title={`Target destination: ${destinationLabel}`}>
                <span className="employee-card-list-side-dest-icon" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>
                </span>
                <span className="employee-card-list-side-dest-label">Target:</span>
                <span className="employee-card-list-side-dest-val">{destinationLabel === '—' ? 'Any' : destinationLabel}</span>
              </div>

              <div className="employee-card-list-readiness" aria-label="Key document readiness">
                <span className={`employee-card-list-doc-tag ${hasPassport ? 'is-ready' : 'is-pending'}`} title={hasPassport ? 'Passport uploaded' : 'Passport missing'}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    {hasPassport ? <polyline points="20 6 9 17 4 12"/> : <circle cx="12" cy="12" r="8"/>}
                  </svg>
                  <span>Passport</span>
                </span>
                <span className={`employee-card-list-doc-tag ${hasMedical ? 'is-ready' : 'is-pending'}`} title={hasMedical ? 'Medical check uploaded' : 'Medical check pending'}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    {hasMedical ? <polyline points="20 6 9 17 4 12"/> : <circle cx="12" cy="12" r="8"/>}
                  </svg>
                  <span>Medical</span>
                </span>
                <span className={`employee-card-list-doc-tag ${hasClearance ? 'is-ready' : 'is-pending'}`} title={hasClearance ? 'Clearance uploaded' : 'Clearance pending'}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    {hasClearance ? <polyline points="20 6 9 17 4 12"/> : <circle cx="12" cy="12" r="8"/>}
                  </svg>
                  <span>Clearance</span>
                </span>
              </div>
            </div>

            <div className="employee-card-list-side-actions">
              <button
                type="button"
                className="employee-card-list-side-btn employee-card-list-side-btn--profile"
                title="View full candidate profile"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setOpenedEmployeeMode('full')
                  setOpenedEmployeeId(employee.id)
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <span>Profile</span>
              </button>

              {canSelectCandidate ? (
                <button
                  type="button"
                  className={`employee-card-list-side-btn ${isSelectedByCurrentAgent ? 'employee-card-list-side-btn--unselect' : 'employee-card-list-side-btn--select'}`}
                  disabled={readOnly || actionBusyId === employee.id || (isSelectedByCurrentAgent && !canUnselectSelection)}
                  title={isSelectedByCurrentAgent ? 'Unselect candidate' : 'Select candidate'}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleToggleSelectedEmployee(employee)
                  }}
                >
                  {isSelectedByCurrentAgent ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      <span>Unselect</span>
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      <span>Select</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  className="employee-card-list-side-btn employee-card-list-side-btn--docs"
                  title={isExpanded ? 'Collapse documents' : 'Expand document previews'}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleEmployeeCardExpanded(employee.id)
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span>{isExpanded ? 'Hide Docs' : 'Docs'}</span>
                </button>
              )}
            </div>
          </aside>
        ) : null}
        <div className="employee-card-header-meta">
          {employee.return_request?.status === 'pending' ? <span className="badge badge-warning">Return requested</span> : null}
          <span className={`badge employee-card-status-badge ${employeeStatusBadgeClass(employee)} ${employeeStatusBadgeVariantClass(employee)}`.trim()}>{employeeStatusLabel(employee)}</span>
        </div>
      </div>
      {!isListLayout ? (
        <div className="employee-card-grid-body">
          <div className="employee-card-meta-chips">
            <span className="employee-card-meta-chip" title="Destination">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>
              <span>{destinationLabel === '—' ? 'No destination' : destinationLabel}</span>
            </span>
            <span className="employee-card-meta-chip" title="Contact Phone">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <span>{phoneLabel === '—' ? 'No phone' : phoneLabel}</span>
            </span>
            {employeeAge ? (
              <span className="employee-card-meta-chip employee-card-meta-chip--accent" title="Age">
                <span>{employeeAge} yrs</span>
              </span>
            ) : null}
          </div>

          <div className="employee-card-progress-section">
            <div className="employee-card-progress-meta">
              <span className="employee-card-progress-title">Readiness</span>
              <span className="employee-card-progress-value">{progressCompletion}%</span>
            </div>
            <div className="employee-card-progress-bar" role="progressbar" aria-valuenow={progressCompletion} aria-valuemin="0" aria-valuemax="100">
              <div className="employee-card-progress-fill" style={{ width: `${Math.min(100, Math.max(0, progressCompletion))}%` }} />
            </div>
          </div>

          <div className="employee-card-substatus-row">
            <span className="employee-card-substatus-item">
              <span className="employee-card-substatus-dot" />
              <span>Travel: <strong>{travelStatusLabel}</strong></span>
            </span>
            <span className="employee-card-substatus-item">
              <span className="employee-card-substatus-dot" />
              <span>Return: <strong>{returnStatusLabel}</strong></span>
            </span>
          </div>
        </div>
      ) : null}
      {isListLayout ? (
        <footer className="employee-card-list-footer">
          <div className="employee-card-footer-pill employee-card-footer-pill--profession" title={`Profession: ${professionLabel}`}>
            <span className="employee-card-footer-pill-icon" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </span>
            <span className="employee-card-footer-pill-label">Profession</span>
            <span className="employee-card-footer-pill-value">{professionLabel}</span>
          </div>

          <div className="employee-card-footer-pill employee-card-footer-pill--experience" title={`Experience: ${experienceLabel}`}>
            <span className="employee-card-footer-pill-icon" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <span className="employee-card-footer-pill-label">Experience</span>
            <span className="employee-card-footer-pill-value">{experienceLabel}</span>
          </div>

          <div className="employee-card-footer-pill employee-card-footer-pill--progress" title={`Readiness: ${progressCompletion}%`}>
            <span className="employee-card-footer-pill-icon" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </span>
            <span className="employee-card-footer-pill-label">Progress</span>
            <div className="employee-card-footer-progress-bar" role="progressbar" aria-valuenow={progressCompletion} aria-valuemin="0" aria-valuemax="100">
              <div
                className="employee-card-footer-progress-fill"
                style={{ width: `${Math.min(100, Math.max(0, progressCompletion))}%` }}
              />
            </div>
            <span className="employee-card-footer-pill-value">{progressCompletion}%</span>
          </div>
        </footer>
      ) : null}
      {employee.return_request?.status === 'approved' && employee.return_request?.remark ? (
        <div className="employee-card-remark-banner">
          <span>Return remark:</span> {employee.return_request.remark}
        </div>
      ) : null}
      <div
        className={`employee-card-expand${isExpanded ? ' is-expanded' : ''}${expandedEmployeeCardReadyId === employee.id ? ' is-ready' : ''}`}
        onTransitionEnd={(event) => {
          if (event.propertyName !== 'grid-template-rows') return
          if (typeof window === 'undefined') return
          if (isExpanded) {
            setExpandedEmployeeCardReadyId(employee.id)
          } else {
            setExpandedEmployeeCardReadyId(null)
          }
          window.requestAnimationFrame(() => reflowEmployeeCardsMasonry())
        }}
      >
        <div
          className="employee-card-expand-inner"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.stopPropagation()
            }
          }}
        >
          {employee.urgency_alerts?.length ? (
            <div className="employee-alert-list">
              {employee.urgency_alerts.map((alert) => (
                <span key={`${employee.id}-${alert.field}`} className="badge badge-warning">
                  {alert.label} {alert.days_remaining < 0 ? 'expired' : `${alert.days_remaining}d`}
                </span>
              ))}
            </div>
          ) : null}
          <div className="employee-card-preview-strip">
            {(isListLayout ? LIST_CARD_PREVIEW_DOCUMENTS : GRID_CARD_PREVIEW_DOCUMENTS).map((preview) => {
              const document = findEmployeeDocument(employee, preview.types)
              const hasImage = document?.file_url && isImageDocument(document)
              const url = document?.file_url || ''
              const canOpenPreview = Boolean(url)
              const useFloatingHoverPreview = Boolean(isListLayout && hasImage && url)

              return (
                <div
                  key={`${employee.id}-${preview.key}`}
                  className="employee-doc-preview"
                >
                  <div
                    className="employee-doc-preview-tile"
                    role={canOpenPreview ? 'button' : undefined}
                    tabIndex={canOpenPreview ? 0 : undefined}
                    aria-label={canOpenPreview ? `Open ${preview.label} preview` : undefined}
                    onPointerEnter={(event) => {
                      if (!useFloatingHoverPreview) return
                      cancelFloatingAttachmentPreviewClose()
                      openFloatingAttachmentPreview(event.currentTarget, url, `${employee.full_name} ${preview.label}`)
                    }}
                    onPointerLeave={(event) => {
                      if (!useFloatingHoverPreview) return
                      const next = event?.relatedTarget
                      if (next instanceof Node && floatingAttachmentPreviewPopoverRef.current?.contains(next)) return
                      scheduleFloatingAttachmentPreviewClose()
                    }}
                    onFocus={(event) => {
                      if (!useFloatingHoverPreview) return
                      cancelFloatingAttachmentPreviewClose()
                      openFloatingAttachmentPreview(event.currentTarget, url, `${employee.full_name} ${preview.label}`)
                    }}
                    onBlur={(event) => {
                      if (!useFloatingHoverPreview) return
                      const next = event?.relatedTarget
                      if (next instanceof Node && floatingAttachmentPreviewPopoverRef.current?.contains(next)) return
                      scheduleFloatingAttachmentPreviewClose()
                    }}
                    onClick={(event) => {
                      if (!canOpenPreview) return
                      event.preventDefault()
                      event.stopPropagation()
                      openDocumentPreview({
                        url,
                        label: `${employee.full_name} ${preview.label}`,
                        isImage: hasImage,
                        isPdf: isPdfDocumentUrl(url)
                      })
                    }}
                    onKeyDown={(event) => {
                      if (!canOpenPreview) return
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        openDocumentPreview({
                          url,
                          label: `${employee.full_name} ${preview.label}`,
                          isImage: hasImage,
                          isPdf: isPdfDocumentUrl(url)
                        })
                      }
                    }}
                  >
                    {hasImage ? (
                      <img src={url} alt={`${employee.full_name} ${preview.label}`} />
                    ) : (
                      <span>{preview.label}</span>
                    )}
                  </div>
                  <strong>{preview.label}</strong>
                  {url && !hasImage ? (
                    <div className="employee-doc-preview-popover">
                      <span>{fileLabel(document, attachmentLabels)}</span>
                    </div>
                  ) : null}
                  {url && hasImage && !useFloatingHoverPreview ? (
                    <div className="employee-doc-preview-popover">
                      <img src={url} alt={`${employee.full_name} ${preview.label} preview`} />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </article>
  )
}
