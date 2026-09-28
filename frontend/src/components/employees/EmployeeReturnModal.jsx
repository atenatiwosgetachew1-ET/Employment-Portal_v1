import React from 'react'

export default function EmployeeReturnModal({
  isOpen,
  closeReturnRequestModal,
  returnRequestError,
  returnRequestSearch,
  setReturnRequestSearch,
  loadReturnRequestEmployees,
  returnRequestLoading,
  returnRequestEmployees,
  selectedReturnEmployeeId,
  setSelectedReturnEmployeeId,
  returnRequestRemark,
  setReturnRequestRemark,
  handleReturnRequestEvidencePick,
  handleSubmitReturnRequest,
  readOnly,
}) {
  if (!isOpen) return null

  return (
    <div className="employee-review-backdrop" role="presentation" onClick={closeReturnRequestModal}>
      <div className="employee-review-modal" role="dialog" aria-modal="true" aria-label="Create return request" onClick={(event) => event.stopPropagation()}>
        <div className="employee-review-header">
          <div>
            <p className="employee-modal-eyebrow">Returned list</p>
            <h2>Create return request</h2>
            <p className="muted-text">Initiate a return from the employed candidates and attach at least one evidence file.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={closeReturnRequestModal}>Close</button>
        </div>
        {returnRequestError ? <p className="error-message employee-modal-error">{returnRequestError}</p> : null}
        <div className="employee-summary-grid">
          <div className="employee-summary-card">
            <h3>Choose candidate</h3>
            <label>
              Search employed candidates 
              <input
                value={returnRequestSearch}
                onChange={(event) => setReturnRequestSearch(event.target.value)}
                placeholder="Search employed candidate"
              />
            </label>
            <div className="inline-actions inline-actions--mt-12">
              <button type="button" className="btn-secondary return-request-picker-search" onClick={() => loadReturnRequestEmployees(returnRequestSearch)} disabled={returnRequestLoading}>
                {returnRequestLoading ? 'Loading...' : 'Search'}
              </button>
            </div>
            <div className="return-request-picker-list">
              {returnRequestEmployees.map((employee) => (
                <button
                  type="button"
                  key={`return-request-${employee.id}`}
                  className={`return-request-picker-option${selectedReturnEmployeeId === String(employee.id) ? ' is-selected' : ''}`}
                  onClick={() => setSelectedReturnEmployeeId(String(employee.id))}
                  aria-pressed={selectedReturnEmployeeId === String(employee.id)}
                >
                  <span>
                    <strong>{employee.full_name}</strong>
                    <span className="return-request-picker-meta">
                      {employee.profession || employee.professional_title || '--'}
                    </span>
                  </span>
                  <span className="return-request-picker-state">
                    {selectedReturnEmployeeId === String(employee.id) ? 'Selected' : 'Select'}
                  </span>
                </button>
              ))}
              {!returnRequestLoading && returnRequestEmployees.length === 0 ? (
                <span className="muted-text">No eligible employed candidates found.</span>
              ) : null}
            </div>
          </div>
          <div className="employee-summary-card">
            <h3>Reason and evidence</h3>
            <label>
              Remark
              <textarea
                value={returnRequestRemark}
                onChange={(event) => setReturnRequestRemark(event.target.value)}
                rows={5}
                placeholder="Explain the reason for initiating this return."
              />
            </label>
            <div className="form-grid form-grid--mt-12">
              {[0, 1, 2].map((index) => (
                <label key={`return-evidence-${index}`}>
                  Evidence {index + 1}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(event) => handleReturnRequestEvidencePick(index, event.target.files?.[0] || null)}
                  />
                </label>
              ))}
            </div>
            <div className="inline-actions inline-actions--mt-16">
              <button type="button" onClick={handleSubmitReturnRequest} disabled={returnRequestLoading || readOnly}>
                {returnRequestLoading ? 'Saving...' : 'Submit return'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
