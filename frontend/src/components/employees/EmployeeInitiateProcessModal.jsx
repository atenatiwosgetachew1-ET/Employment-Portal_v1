import { useEffect, useMemo, useState } from 'react'
import Modal from '../common/Modal'
import { employeeProfilePhoto } from '../../utils/employeeHelpers'

/**
 * Dedicated lightweight modal for selecting an agent and initiating
 * the candidate recruitment process from candidate cards or actions.
 */
export default function EmployeeInitiateProcessModal({
  isOpen,
  onClose,
  employee,
  agentOptions = [],
  assignedAgentId = '',
  onConfirm,
  busy = false,
  readOnly = false
}) {
  const [selectedAgentId, setSelectedAgentId] = useState('')

  useEffect(() => {
    if (!isOpen || !employee) return
    const preselected =
      assignedAgentId ||
      (employee.selection_state?.selection?.agent
        ? String(employee.selection_state.selection.agent)
        : (agentOptions?.length === 1 ? String(agentOptions[0].id) : ''))
    setSelectedAgentId(preselected ? String(preselected) : (agentOptions?.length === 1 ? String(agentOptions[0].id) : ''))
  }, [isOpen, employee, assignedAgentId, agentOptions])

  const photo = useMemo(() => employeeProfilePhoto(employee), [employee])
  const candidateId = employee?.candidate_id || employee?.candidate_no || employee?.id || '—'
  const initials = useMemo(() => {
    return (employee?.full_name || '')
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'CA'
  }, [employee?.full_name])

  const handleInitiate = async () => {
    if (!selectedAgentId || busy || readOnly || !employee) return
    if (onConfirm) {
      await onConfirm(employee, selectedAgentId)
    }
  }

  if (!isOpen || !employee) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Initiate Candidate Process"
      subtitle="Select an agent to initiate the employment process on their behalf"
      maxWidth="520px"
      className="employee-initiate-modal"
      footer={
        <div className="employee-initiate-modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="employee-review-action-btn employee-review-action-btn--primary"
            onClick={handleInitiate}
            disabled={busy || readOnly || !selectedAgentId || employee.status !== 'approved'}
            title={!selectedAgentId ? 'Select an agent to initiate process' : 'Initiate process'}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>{busy ? 'Initiating…' : 'Initiate process'}</span>
          </button>
        </div>
      }
    >
      {/* Candidate summary snippet */}
      <div className="employee-initiate-candidate-card" aria-label="Selected candidate details">
        <div className="employee-initiate-candidate-avatar">
          {photo ? (
            <img src={photo} alt={employee.full_name || 'Candidate'} />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <div className="employee-initiate-candidate-info">
          <div className="employee-initiate-candidate-header">
            <h3 className="employee-initiate-candidate-name">{employee.full_name}</h3>
            <span className="employee-initiate-candidate-id">
              ID: <strong>{candidateId}</strong>
            </span>
          </div>
          <div className="employee-initiate-candidate-meta">
            <span className="employee-initiate-candidate-prof">
              {employee.profession || employee.professional_title || 'General'}
            </span>
            {(employee.application_countries || [])[0] ? (
              <span className="employee-status-pill employee-status-pill--neutral">
                {employee.application_countries[0]}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Informative remark banner */}
      <div className="employee-initiate-remark" role="note">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          Please select an agent to initiate the process on their behalf. The chosen agent will be notified to begin organizing and handling the candidate documentation.
        </span>
      </div>

      {/* Agent Selection Field */}
      <div className="employee-initiate-field-group">
        <label htmlFor="employee-initiate-agent-select" className="employee-initiate-label">
          Assigned Agent <span className="employee-initiate-required">*</span>
        </label>
        <div className="employee-review-select-wrap employee-initiate-select-wrap">
          <select
            id="employee-initiate-agent-select"
            className="employee-review-select employee-initiate-select"
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            disabled={busy || readOnly}
            aria-required="true"
            aria-label="Select agent to handle process"
          >
            <option value="">
              {agentOptions.length <= 1 ? 'Agent auto-selected' : 'Select an agent…'}
            </option>
            {agentOptions.map((agent) => (
              <option key={agent.id} value={String(agent.id)}>
                {agent.name || agent.username}
              </option>
            ))}
          </select>
          <span className="employee-review-select-chevron" aria-hidden="true">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>
      </div>
    </Modal>
  )
}
