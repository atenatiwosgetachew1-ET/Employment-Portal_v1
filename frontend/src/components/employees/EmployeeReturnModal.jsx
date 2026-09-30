import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '../common/Modal'

export default function EmployeeReturnModal({
  isOpen,
  closeReturnRequestModal,
  returnRequestError,
  setReturnRequestError,
  returnRequestSearch,
  setReturnRequestSearch,
  loadReturnRequestEmployees,
  returnRequestLoading,
  returnRequestEmployees = [],
  selectedReturnEmployeeId,
  setSelectedReturnEmployeeId,
  returnRequestRemark,
  setReturnRequestRemark,
  returnRequestEvidenceFiles = [null, null, null],
  handleReturnRequestEvidencePick,
  handleSubmitReturnRequest,
  readOnly,
}) {
  const fileInputRefs = [useRef(null), useRef(null), useRef(null)]

  const [step, setStep] = useState(1)
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('name-asc')
  const [professionFilter, setProfessionFilter] = useState('all')
  const pageSize = 6

  // Reset step whenever modal is closed/reopened
  useEffect(() => {
    if (!isOpen) {
      setStep(1)
    } else if (!returnRequestEmployees || returnRequestEmployees.length === 0) {
      loadReturnRequestEmployees?.('')
    }
  }, [isOpen, returnRequestEmployees, loadReturnRequestEmployees])

  const selectedEmployee = useMemo(() => {
    return (returnRequestEmployees || []).find(
      (emp) => String(emp.id) === String(selectedReturnEmployeeId)
    ) || null
  }, [returnRequestEmployees, selectedReturnEmployeeId])

  const selectedInitials = useMemo(() => {
    if (!selectedEmployee) return 'C'
    return (selectedEmployee.full_name || '')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || 'C'
  }, [selectedEmployee])

  const attachedCount = useMemo(() => {
    return (returnRequestEvidenceFiles || []).filter(Boolean).length
  }, [returnRequestEvidenceFiles])

  // Extract unique professions for filter dropdown
  const uniqueProfessions = useMemo(() => {
    const set = new Set()
    ;(returnRequestEmployees || []).forEach((emp) => {
      const p = emp.profession || emp.professional_title
      if (p && typeof p === 'string' && p.trim()) {
        set.add(p.trim())
      }
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [returnRequestEmployees])

  // Processed employees with instant client filter and sorting
  const processedEmployees = useMemo(() => {
    let list = Array.isArray(returnRequestEmployees) ? [...returnRequestEmployees] : []

    // Client-side search matching
    if (returnRequestSearch?.trim()) {
      const q = returnRequestSearch.trim().toLowerCase()
      list = list.filter((emp) => {
        const name = (emp.full_name || '').toLowerCase()
        const code = String(emp.candidate_id || emp.candidate_no || emp.id || '').toLowerCase()
        const prof = (emp.profession || emp.professional_title || '').toLowerCase()
        const passport = (emp.passport_number || '').toLowerCase()
        return name.includes(q) || code.includes(q) || prof.includes(q) || passport.includes(q)
      })
    }

    // Profession filtering
    if (professionFilter !== 'all') {
      list = list.filter((emp) => {
        const prof = (emp.profession || emp.professional_title || '').trim()
        return prof === professionFilter
      })
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'name-asc') {
        return (a.full_name || '').localeCompare(b.full_name || '')
      }
      if (sortBy === 'name-desc') {
        return (b.full_name || '').localeCompare(a.full_name || '')
      }
      if (sortBy === 'id-desc') {
        const aId = Number(a.candidate_id || a.candidate_no || a.id) || 0
        const bId = Number(b.candidate_id || b.candidate_no || b.id) || 0
        return bId - aId
      }
      if (sortBy === 'id-asc') {
        const aId = Number(a.candidate_id || a.candidate_no || a.id) || 0
        const bId = Number(b.candidate_id || b.candidate_no || b.id) || 0
        return aId - bId
      }
      return 0
    })

    return list
  }, [returnRequestEmployees, returnRequestSearch, professionFilter, sortBy])

  // Reset to first page when search, filter, or sorting changes
  useEffect(() => {
    setPage(1)
  }, [returnRequestSearch, professionFilter, sortBy])

  const totalCount = processedEmployees.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(page, totalPages)
  const startIndex = (safePage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalCount)

  const paginatedEmployees = useMemo(() => {
    return processedEmployees.slice(startIndex, endIndex)
  }, [processedEmployees, startIndex, endIndex])

  const handleCandidateKeyDown = (e, index) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = (index + 1) % paginatedEmployees.length
      setSelectedReturnEmployeeId(String(paginatedEmployees[nextIndex].id))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = (index - 1 + paginatedEmployees.length) % paginatedEmployees.length
      setSelectedReturnEmployeeId(String(paginatedEmployees[prevIndex].id))
    }
  }

  if (!isOpen) return null

  const handleClearFile = (index, e) => {
    e.preventDefault()
    e.stopPropagation()
    handleReturnRequestEvidencePick?.(index, null)
    if (fileInputRefs[index]?.current) {
      fileInputRefs[index].current.value = ''
    }
  }

  const formatFileSize = (bytes) => {
    if (!bytes || Number.isNaN(bytes)) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const modalTitle = step === 1 ? 'Initiate Candidate Return' : 'Return Reason & Evidence'
  const modalSubtitle = step === 1
    ? 'Select an employed candidate to initiate the return process.'
    : 'Provide the return remark and attach supporting evidence documentation.'

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeReturnRequestModal}
      title={modalTitle}
      subtitle={modalSubtitle}
      maxWidth="1092px"
      className="employee-return-modal-dialog"
      backdropClassName="employee-return-backdrop"
      footer={
        step === 1 ? (
          <div className="employee-return-modal-footer">
            <div className="employee-return-footer-selected">
              {selectedEmployee ? (
                <>
                  <span className="employee-return-footer-dot" aria-hidden="true" />
                  <span>
                    Selected: <strong>{selectedEmployee.full_name}</strong>
                    {selectedEmployee.candidate_id || selectedEmployee.candidate_no ? (
                      <span className="employee-return-footer-id">
                        (ID: {selectedEmployee.candidate_id || selectedEmployee.candidate_no})
                      </span>
                    ) : null}
                  </span>
                </>
              ) : (
                <span className="muted-text">Select an employed candidate to continue</span>
              )}
            </div>

            <div className="employee-return-footer-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeReturnRequestModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary employee-return-continue-btn"
                onClick={() => setStep(2)}
                disabled={!selectedReturnEmployeeId}
                title={!selectedReturnEmployeeId ? 'Please select a candidate first' : 'Proceed to return details'}
              >
                <span>Continue</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <div className="employee-return-modal-footer">
            <button
              type="button"
              className="btn-secondary employee-return-back-btn"
              onClick={() => {
                setStep(1)
                setReturnRequestError?.('')
              }}
              disabled={returnRequestLoading}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Back</span>
            </button>

            <div className="employee-return-footer-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeReturnRequestModal}
                disabled={returnRequestLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary employee-return-submit-btn"
                onClick={handleSubmitReturnRequest}
                disabled={returnRequestLoading || readOnly || !selectedReturnEmployeeId}
                title={
                  !returnRequestRemark?.trim()
                    ? 'Please enter the return remark'
                    : attachedCount === 0
                    ? 'Please attach at least one evidence file'
                    : 'Submit return request'
                }
              >
                {returnRequestLoading ? (
                  <>
                    <svg className="is-spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 21h5v-5" />
                    </svg>
                    <span>Saving…</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M8 3 4 7l4 4" />
                      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H4" />
                    </svg>
                    <span>Submit Return</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )
      }
    >
      <div className="employee-return-modal-content">
        {/* STEP 1: Candidate Selection (Full Width) */}
        {step === 1 && (
          <div className="employee-return-step employee-return-step--candidates">
            {/* Structured Search & Filters Toolbar */}
            <div className="employee-return-toolbar">
              {/* Primary Search Bar */}
              <div className="employee-return-search-row">
                <div className="employee-return-search-box">
                  <svg className="employee-return-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    className="employee-return-search-input"
                    value={returnRequestSearch}
                    onChange={(e) => setReturnRequestSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        loadReturnRequestEmployees(returnRequestSearch)
                      }
                    }}
                    placeholder="Search candidate by name, ID, passport, or profession…"
                    autoComplete="off"
                    spellCheck="false"
                  />
                  {returnRequestSearch && (
                    <button
                      type="button"
                      className="employee-return-search-clear"
                      onClick={() => {
                        setReturnRequestSearch('')
                        loadReturnRequestEmployees('')
                      }}
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="btn-secondary employee-return-search-btn"
                  onClick={() => loadReturnRequestEmployees(returnRequestSearch)}
                  disabled={returnRequestLoading}
                  title="Search from server"
                >
                  {returnRequestLoading ? (
                    <svg className="is-spinning" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  )}
                  <span>Search</span>
                </button>

                <button
                  type="button"
                  className="btn-secondary employee-return-reset-btn"
                  onClick={() => {
                    setReturnRequestSearch('')
                    setProfessionFilter('all')
                    setSortBy('name-asc')
                    loadReturnRequestEmployees('')
                  }}
                  disabled={returnRequestLoading}
                  title="Reset search and filters"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  <span>Reset</span>
                </button>
              </div>

              {/* Sub-bar: Status count & Filter Group */}
              <div className="employee-return-controls-row">
                <div className="employee-return-controls-meta">
                  <span className="employee-return-count-badge">
                    <strong>{totalCount}</strong> {totalCount === 1 ? 'candidate' : 'candidates'}
                  </span>
                  {(returnRequestSearch || professionFilter !== 'all' || sortBy !== 'name-asc') && (
                    <button
                      type="button"
                      className="employee-return-reset-link"
                      onClick={() => {
                        setReturnRequestSearch('')
                        setProfessionFilter('all')
                        setSortBy('name-asc')
                        loadReturnRequestEmployees('')
                      }}
                      title="Reset all filters and sort"
                    >
                      Reset filters
                    </button>
                  )}
                </div>

                <div className="employee-return-controls-group">
                  {/* Profession Filter Select */}
                  {uniqueProfessions.length > 0 && (
                    <div className="employee-return-select-wrap" title="Filter by profession">
                      <svg className="employee-return-select-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                      </svg>
                      <select
                        id="employee-return-prof-select"
                        className="employee-return-select"
                        value={professionFilter}
                        onChange={(e) => setProfessionFilter(e.target.value)}
                        aria-label="Filter by profession"
                      >
                        <option value="all">All Professions ({uniqueProfessions.length})</option>
                        {uniqueProfessions.map((prof) => (
                          <option key={prof} value={prof}>
                            {prof}
                          </option>
                        ))}
                      </select>
                      <svg className="employee-return-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  )}

                  {/* Sort Options Select */}
                  <div className="employee-return-select-wrap" title="Sort candidate listing">
                    <svg className="employee-return-select-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m3 16 4 4 4-4" />
                      <path d="M7 20V4" />
                      <path d="m21 8-4-4-4 4" />
                      <path d="M17 4v16" />
                    </svg>
                    <select
                      id="employee-return-sort-select"
                      className="employee-return-select"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      aria-label="Sort candidates"
                    >
                      <option value="name-asc">Sort: Name (A → Z)</option>
                      <option value="name-desc">Sort: Name (Z → A)</option>
                      <option value="id-desc">Sort: ID (Newest)</option>
                      <option value="id-asc">Sort: ID (Oldest)</option>
                    </select>
                    <svg className="employee-return-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Candidate Table Container */}
            <div className="employee-return-table-wrap">
              {/* Table Column Headers */}
              <div className="employee-return-table-header" aria-hidden="true">
                <span className="employee-return-th-prefix" />
                <span className="employee-return-th employee-return-th--name">Candidate</span>
                <span className="employee-return-th employee-return-th--profession">Profession</span>
                <span className="employee-return-th employee-return-th--status">Status</span>
              </div>

              {/* Candidate Options Scroll Area */}
              <div className="employee-return-candidate-list" role="radiogroup" aria-label="Employed candidates">
                {returnRequestLoading ? (
                  <div className="employee-return-picker-empty">
                    <svg className="is-spinning" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 21h5v-5" />
                    </svg>
                    <span className="muted-text">Loading employed candidates…</span>
                  </div>
                ) : paginatedEmployees && paginatedEmployees.length > 0 ? (
                  paginatedEmployees.map((emp, idx) => {
                    const isSelected = selectedReturnEmployeeId === String(emp.id)
                    const initials = (emp.full_name || '')
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join('')
                      .toUpperCase() || 'C'
                    const code = emp.candidate_id || emp.candidate_no || emp.id
                    const profession = emp.profession || emp.professional_title || 'Employed candidate'

                    return (
                      <button
                        type="button"
                        key={`return-candidate-${emp.id}`}
                        className={`employee-return-candidate-row${isSelected ? ' is-selected' : ''}`}
                        onClick={() => setSelectedReturnEmployeeId(String(emp.id))}
                        onDoubleClick={() => {
                          setSelectedReturnEmployeeId(String(emp.id))
                          setStep(2)
                        }}
                        onKeyDown={(e) => handleCandidateKeyDown(e, idx)}
                        role="radio"
                        aria-checked={isSelected}
                      >
                        <div className="employee-return-radio-wrap" aria-hidden="true">
                          <span className="employee-return-radio-dot" />
                        </div>

                        <div className="employee-return-candidate-avatar" aria-hidden="true">
                          {initials}
                        </div>

                        <div className="employee-return-col-name">
                          <span className="employee-return-candidate-name" title={emp.full_name}>
                            {emp.full_name}
                          </span>
                          <span className="employee-return-candidate-id-badge">
                            ID: {code}{emp.passport_number ? ` • ${emp.passport_number}` : ''}
                          </span>
                        </div>

                        <div className="employee-return-col-profession">
                          <span className="employee-return-profession-pill" title={profession}>
                            {profession}
                          </span>
                        </div>

                        <div className="employee-return-col-status">
                          <span className="employee-return-status-pill">
                            <span className="employee-return-status-dot" />
                            Employed
                          </span>
                        </div>
                      </button>
                    )
                  })
                ) : (
                  <div className="employee-return-picker-empty">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span className="muted-text">
                      {returnRequestSearch || professionFilter !== 'all'
                        ? 'No candidates match your search filters.'
                        : 'No eligible employed candidates found.'}
                    </span>
                    {(returnRequestSearch || professionFilter !== 'all') && (
                      <button
                        type="button"
                        className="btn-secondary employee-return-clear-filters-btn"
                        onClick={() => {
                          setReturnRequestSearch('')
                          setProfessionFilter('all')
                          loadReturnRequestEmployees('')
                        }}
                      >
                        Reset filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Pagination Controls */}
              <div className="employee-return-pagination">
                <div className="employee-return-pagination-info">
                  {totalCount > 0 ? (
                    <span>
                      Showing <strong>{paginatedEmployees.length}</strong> of <strong>{totalCount}</strong> candidates
                    </span>
                  ) : (
                    <span>0 candidates</span>
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="employee-return-pagination-nav">
                    <button
                      type="button"
                      className="employee-return-page-btn"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      title="Previous page"
                      aria-label="Previous page"
                    >
                      ‹
                    </button>
                    <span className="employee-return-page-indicator">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="employee-return-page-btn"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      title="Next page"
                      aria-label="Next page"
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Return Reason & Evidence Documentation (Full Width) */}
        {step === 2 && selectedEmployee && (
          <div className="employee-return-step employee-return-step--details">
            {/* Error Alert Banner (Only appears on Step 2) */}
            {returnRequestError && (
              <div className="notification-reminder-error-badge employee-return-error-banner" role="alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{returnRequestError}</span>
              </div>
            )}

            {/* Target Notification Context Card (Exact Notification Reminder Style) */}
            <div className="employee-return-target-card">
              <div className="employee-return-target-avatar" aria-hidden="true">
                {selectedInitials}
              </div>
              <div className="employee-return-target-info">
                <div className="employee-return-target-meta">
                  <span className="employee-return-target-badge">Selected Candidate</span>
                  <span className="employee-return-target-id">
                    ID: {selectedEmployee.candidate_id || selectedEmployee.candidate_no || selectedEmployee.id}
                  </span>
                </div>
                <div className="employee-return-target-name">{selectedEmployee.full_name}</div>
                <div className="employee-return-target-profession">
                  {selectedEmployee.profession || selectedEmployee.professional_title || 'Employed Candidate'}
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary employee-return-target-change-btn"
                onClick={() => {
                  setStep(1)
                  setReturnRequestError?.('')
                }}
                title="Choose a different candidate"
              >
                Change
              </button>
            </div>

            {/* Remark Section */}
            <div className="employee-return-section">
              <label htmlFor="return-request-remark-input" className="employee-return-section-label">
                <span>Return Reason / Remark</span>
                <span className="employee-return-required-badge">* Required</span>
              </label>
              <textarea
                id="return-request-remark-input"
                className="employee-return-textarea"
                value={returnRequestRemark}
                onChange={(e) => setReturnRequestRemark(e.target.value)}
                rows={4}
                placeholder="Explain the detailed reason for initiating this candidate's return (e.g. contract completion, employer request, medical grounds, etc.)…"
              />
            </div>

            {/* Evidence Section */}
            <div className="employee-return-section">
              <div className="employee-return-section-label">
                <span>Supporting Evidence Documents</span>
                <span className="employee-return-attached-pill">
                  {attachedCount} attached (at least 1 required)
                </span>
              </div>

              <div className="employee-return-evidence-grid">
                {[0, 1, 2].map((index) => {
                  const file = returnRequestEvidenceFiles[index]
                  return (
                    <div
                      key={`return-evidence-slot-${index}`}
                      className={`employee-return-evidence-slot${file ? ' has-file' : ''}`}
                    >
                      <input
                        ref={fileInputRefs[index]}
                        type="file"
                        id={`return-evidence-input-${index}`}
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const picked = e.target.files?.[0] || null
                          handleReturnRequestEvidencePick(index, picked)
                        }}
                        className="employee-return-hidden-input"
                      />

                      <label
                        htmlFor={`return-evidence-input-${index}`}
                        className="employee-return-evidence-label"
                      >
                        <div className="employee-return-evidence-icon" aria-hidden="true">
                          {file ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="9" y1="15" x2="15" y2="15" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                          )}
                        </div>

                        <div className="employee-return-evidence-info">
                          <span className="employee-return-evidence-name">
                            {file ? file.name : `Evidence Slot ${index + 1}`}
                          </span>
                          <span className="employee-return-evidence-hint">
                            {file
                              ? `${formatFileSize(file.size)} • Click to replace`
                              : index === 0
                              ? 'Required • PDF, JPG, or PNG document'
                              : 'Optional document • Click to browse'}
                          </span>
                        </div>

                        {file && (
                          <button
                            type="button"
                            className="employee-return-evidence-remove"
                            onClick={(e) => handleClearFile(index, e)}
                            title="Remove attachment"
                            aria-label={`Remove evidence file ${index + 1}`}
                          >
                            ×
                          </button>
                        )}
                      </label>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
