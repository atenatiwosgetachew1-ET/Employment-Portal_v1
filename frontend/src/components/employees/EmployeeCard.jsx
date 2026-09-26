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
  const phoneLabel = employee.phone || employee.mobile_number || '—'
  const emailLabel = employee.email || '—'
  const availabilityLabel = employeeAvailability(employee) || '—'
  const residenceCountryLabel = employee.residence_country || '—'
  const progressCompletion = employee.progress_status?.overall_completion ?? 0
  const travelStatusLabel = prettyStatus(employee.travel_status, 'pending')
  const returnStatusLabel = prettyStatus(employee.return_status)

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
              aria-label={isSelectedByCurrentAgent ? 'Unselect employee' : 'Select employee'}
              title={isSelectedByCurrentAgent && !canUnselectSelection ? 'Only the selecting account or agent owner can unselect this employee.' : undefined}
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
      <div className="employee-card-header">
        <div className="employee-card-identity">
          <div className="employee-card-avatar">
            {profilePhoto?.file_url && isImageDocument(profilePhoto) ? (
              <img src={profilePhoto.file_url} alt={`${employee.full_name} profile`} />
            ) : (
              <span>{employee.full_name?.charAt(0) || '?'}</span>
            )}
          </div>
          <div>
            <h3>{employee.full_name}</h3>
            <p className="muted-text">{employee.profession || employee.professional_title || 'No profession set'}</p>
            <p className="muted-text"><strong>{employeeReligion || '--'}</strong></p>
            {isListLayout ? (
              <div className="employee-card-list-kv muted-text" aria-label="Candidate overview">
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">Age</span>
                  <span className="employee-card-list-kv-value">{employeeAge || '—'}</span>
                </div>
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">Availability</span>
                  <span className="employee-card-list-kv-value">{availabilityLabel}</span>
                </div>
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">Phone</span>
                  <span className="employee-card-list-kv-value">{phoneLabel}</span>
                </div>
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">Email</span>
                  <span className="employee-card-list-kv-value">{emailLabel}</span>
                </div>
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">Residence</span>
                  <span className="employee-card-list-kv-value">{residenceCountryLabel}</span>
                </div>
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">Progress</span>
                  <span className="employee-card-list-kv-value">{progressCompletion}%</span>
                </div>
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">Travel</span>
                  <span className="employee-card-list-kv-value">{travelStatusLabel}</span>
                </div>
                <div className="employee-card-list-kv-row">
                  <span className="employee-card-list-kv-label">Return</span>
                  <span className="employee-card-list-kv-value">{returnStatusLabel}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="employee-card-header-meta">
          {employee.return_request?.status === 'pending' ? <span className="badge badge-warning">Return requested</span> : null}
          <span className={`badge employee-card-status-badge ${employeeStatusBadgeClass(employee)} ${employeeStatusBadgeVariantClass(employee)}`.trim()}>{employeeStatusLabel(employee)}</span>
        </div>
      </div>
      {!isListLayout ? (
        <>
          <p className="muted-text">{destinationLabel === '—' ? 'No destination country' : destinationLabel} | {phoneLabel === '—' ? 'No phone' : phoneLabel}</p>
          <p className="muted-text"><strong>Age</strong> <strong>{employeeAge || '--'}</strong></p>
        </>
      ) : null}
      {employee.return_request?.status === 'approved' && employee.return_request?.remark ? (
        <p className="muted-text">Return remark: {employee.return_request.remark}</p>
      ) : null}
      {!isListLayout ? (
        <p className="muted-text">Progress {employee.progress_status?.overall_completion ?? 0}% | Travel {prettyStatus(employee.travel_status, 'pending')} | Return {prettyStatus(employee.return_status)}</p>
      ) : null}
      <div
        className={`employee-card-expand${isExpanded ? ' is-expanded' : ''}${expandedEmployeeCardReadyId === employee.id ? ' is-ready' : ''}`}
        onTransitionEnd={(event) => {
          if (event.propertyName !== 'grid-template-rows') return
          if (typeof window === 'undefined') return
          setExpandedEmployeeCardReadyId(employee.id)
          window.requestAnimationFrame(() => reflowEmployeeCardsMasonry())
        }}
      >
        <div className="employee-card-expand-inner">
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
