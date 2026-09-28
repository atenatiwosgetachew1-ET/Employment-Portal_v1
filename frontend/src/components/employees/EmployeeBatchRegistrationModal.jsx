import React, { useState, useRef, useMemo } from 'react'
import { Modal } from '../common'
import { createEmployee } from '../../services/employeesService'
import {
  buildEmployeePayload,
  emptyForm,
  computeAge,
  MINIMUM_EMPLOYEE_AGE,
  isValidPhoneNumber
} from '../../utils/employeeHelpers'
import { PROFESSION_SKILLS } from '../../constants/employeeOptions'
import { useUiFeedback } from '../../context/UiFeedbackContext'

export const CSV_TEMPLATE_HEADERS = [
  'First Name',
  'Middle Name',
  'Last Name',
  'Gender',
  'Date of Birth (YYYY-MM-DD)',
  'Passport Number',
  'Mobile Number',
  'Nationality',
  'Residence Country',
  'Religion',
  'Marital Status',
  'Birth Place',
  'Profession',
  'Destination Country',
  'Skills',
  'Employment Type',
  'Salary',
  'Contact Person Name',
  'Contact Person Mobile',
  'Contact Person Relationship'
]

export const CSV_SAMPLE_ROWS = []

export function cleanCsvValue(val) {
  if (val == null) return ''
  let s = String(val).trim()
  if (s.startsWith('=')) {
    s = s.slice(1).trim()
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim()
  }
  if (s.startsWith("'")) {
    s = s.slice(1).trim()
  }
  return s
}

export function normalizeDateToYMD(val) {
  if (!val) return ''
  let str = cleanCsvValue(val)
  if (!str) return ''

  // Already standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str
  }

  // YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Excel serial date number (e.g. 35897 -> 1998-04-12)
  if (/^\d{4,5}$/.test(str)) {
    const serial = parseInt(str, 10)
    if (serial >= 10000 && serial <= 60000) {
      const utcDays = serial - 25569
      const date = new Date(utcDays * 86400 * 1000)
      if (!Number.isNaN(date.getTime())) {
        const y = date.getUTCFullYear()
        const m = String(date.getUTCMonth() + 1).padStart(2, '0')
        const d = String(date.getUTCDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
      }
    }
  }

  // DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
  if (dmyMatch) {
    let [, p1, p2, year] = dmyMatch
    if (year.length === 2) {
      const curYearLast2 = new Date().getFullYear() % 100
      const yNum = parseInt(year, 10)
      year = yNum > curYearLast2 ? `19${year}` : `20${year}`
    }
    const num1 = parseInt(p1, 10)
    const num2 = parseInt(p2, 10)

    let day, month
    if (num1 > 12) {
      day = num1
      month = num2
    } else if (num2 > 12) {
      day = num2
      month = num1
    } else {
      // Default to DD/MM/YYYY (international/Ethiopian standard)
      day = num1
      month = num2
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // Textual dates e.g. "12 Apr 1998" or "April 12, 1998"
  const parsedTimestamp = Date.parse(str)
  if (!Number.isNaN(parsedTimestamp)) {
    const d = new Date(parsedTimestamp)
    const year = d.getFullYear()
    if (year > 1900 && year < 2100) {
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${m}-${day}`
    }
  }

  return str
}

export function normalizePhoneNumber(val) {
  if (!val) return ''
  let s = cleanCsvValue(val)
  if (!s) return ''

  // 1. Scientific notation e.g. 2.51941E+11, 2.51911e+11
  if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/i.test(s)) {
    const num = Number(s)
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      const expanded = BigInt(Math.round(num)).toString()
      if (expanded.startsWith('251')) {
        return `+${expanded}`
      }
      if (expanded.startsWith('9') && expanded.length === 9) {
        return `0${expanded}`
      }
      return expanded
    }
  }

  // 2. Remove whitespace, dashes, parentheses
  const cleanChars = s.replace(/[\s()-]/g, '')

  // 3. If 12 digits starting with 251 (e.g. 251911998877)
  if (/^251\d{9}$/.test(cleanChars)) {
    return `+${cleanChars}`
  }

  // 4. If 9 digits starting with 9 (Excel stripped the leading 0 from 09XXXXXXXX)
  const digitsOnly = cleanChars.replace(/\D/g, '')
  if (digitsOnly.length === 9 && digitsOnly.startsWith('9')) {
    return `0${digitsOnly}`
  }

  return cleanChars
}

function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

export function mapHeaderToKey(header) {
  const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '')

  // Specific multi-word fields first to avoid prefix collisions
  if (normalized.includes('birthplace') || normalized.includes('placeofbirth') || normalized.includes('pob')) {
    return 'birth_place'
  }
  if (
    normalized.includes('dateofbirth') ||
    normalized.includes('birthdate') ||
    normalized.includes('dob') ||
    normalized.includes('birth')
  ) {
    return 'date_of_birth'
  }

  // Destination / Application Countries
  if (
    normalized.includes('destination') ||
    normalized.includes('targetcountry') ||
    normalized.includes('destinationcountry') ||
    normalized.includes('applicationcountr')
  ) {
    return 'application_countries'
  }

  // Skills
  if (normalized.includes('skill')) {
    return 'skills'
  }

  // Employment Type
  if (
    normalized.includes('employmenttype') ||
    normalized.includes('contracttype') ||
    normalized === 'type'
  ) {
    return 'employment_type'
  }

  // Salary
  if (normalized.includes('salary') || normalized.includes('wage')) {
    return 'application_salary'
  }

  // Contact Person sub-fields
  if (normalized.includes('contact') || normalized.includes('emergency')) {
    if (normalized.includes('mobile') || normalized.includes('phone') || normalized.includes('cell')) {
      return 'contact_person_mobile'
    }
    if (normalized.includes('relationship') || normalized.includes('relation')) {
      return 'contact_person_relationship'
    }
    if (normalized.includes('name') || normalized.includes('person')) {
      return 'contact_person_name'
    }
    return 'contact_person_name'
  }

  if (normalized.includes('relationship') || normalized.includes('relation')) {
    return 'contact_person_relationship'
  }

  if (normalized.includes('firstname')) return 'first_name'
  if (normalized.includes('middlename') || normalized.includes('fathername')) return 'middle_name'
  if (normalized.includes('lastname') || normalized.includes('grandfathername') || normalized.includes('surname')) return 'last_name'
  if (normalized.includes('gender') || normalized.includes('sex')) return 'gender'
  if (normalized.includes('passport')) return 'passport_number'
  if (normalized.includes('mobile') || normalized.includes('phone') || normalized.includes('cell')) return 'mobile_number'
  if (normalized.includes('nationality')) return 'nationality'
  if (normalized.includes('residence')) return 'residence_country'
  if (normalized.includes('religion')) return 'religion'
  if (normalized.includes('marital') || normalized.includes('marriage')) return 'marital_status'
  if (normalized.includes('profession') || normalized.includes('job') || normalized.includes('title') || normalized.includes('occupation')) return 'profession'

  return null
}

export function validateRow(row) {
  const errors = []
  if (!row.first_name?.trim()) errors.push('First name is required')
  if (!row.last_name?.trim()) errors.push('Last name is required')
  if (!row.gender?.trim()) errors.push('Gender is required')
  if (!row.date_of_birth?.trim()) {
    errors.push('Date of birth is required')
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_birth)) {
    errors.push('DOB must be YYYY-MM-DD')
  } else {
    const age = computeAge(row.date_of_birth)
    if (age === '' || Number.isNaN(age)) {
      errors.push('Invalid date of birth')
    } else if (age < MINIMUM_EMPLOYEE_AGE) {
      errors.push(`Age (${age}) must be >= ${MINIMUM_EMPLOYEE_AGE}`)
    }
  }
  if (!row.passport_number?.trim()) errors.push('Passport is required')
  if (!row.mobile_number?.trim()) {
    errors.push('Mobile is required')
  } else if (!isValidPhoneNumber(row.mobile_number)) {
    errors.push('Invalid mobile number')
  }
  return errors
}

export function buildCsvTemplateContent(rows = CSV_SAMPLE_ROWS) {
  const headerLine = CSV_TEMPLATE_HEADERS.join(',')
  if (!rows || rows.length === 0) {
    return `${headerLine}\r\n`
  }
  return [
    headerLine,
    ...rows.map((row) =>
      row
        .map((val) => {
          const str = String(val)
          // Format Date of Birth and Phone Numbers as Excel text formulas ="..." so Excel displays literal YYYY-MM-DD and preserves leading zero
          if (/^\d{4}-\d{2}-\d{2}$/.test(str) || /^0\d{8,11}$/.test(str) || /^\+\d{10,15}$/.test(str)) {
            return `="${str}"`
          }
          return `"${str.replace(/"/g, '""')}"`
        })
        .join(',')
    )
  ].join('\r\n') + '\r\n'
}

export default function EmployeeBatchRegistrationModal({
  isOpen,
  onClose,
  onBatchSuccess
}) {
  const { showToast } = useUiFeedback()
  const fileInputRef = useRef(null)
  const [candidates, setCandidates] = useState([])
  const [fileName, setFileName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [submitResults, setSubmitResults] = useState(null)

  const handleDownloadTemplate = () => {
    const csvContent = buildCsvTemplateContent()

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'candidate_batch_registration_template.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    processFile(file)
  }

  const processFile = (file) => {
    setFileName(file.name)
    setSubmitResults(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text !== 'string') return
      try {
        const lines = text.split(/\r?\n/).filter((line) => line.trim())
        if (lines.length < 2) {
          showToast('CSV must include a header line and at least one candidate row.', 'error')
          return
        }
        const headers = parseCsvLine(lines[0])
        const keyMap = headers.map(mapHeaderToKey)

        const parsed = []
        for (let i = 1; i < lines.length; i++) {
          const values = parseCsvLine(lines[i])
          if (!values.some((v) => v.trim())) continue
          const candidate = { ...emptyForm }
          keyMap.forEach((key, idx) => {
            if (key && values[idx] !== undefined) {
              const rawVal = values[idx]
              if (key === 'date_of_birth') {
                candidate[key] = normalizeDateToYMD(rawVal)
              } else if (key === 'mobile_number' || key === 'contact_person_mobile' || key === 'phone') {
                candidate[key] = normalizePhoneNumber(rawVal)
              } else if (key === 'application_countries') {
                const cleaned = cleanCsvValue(rawVal)
                candidate[key] = cleaned
                  ? cleaned.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
                  : []
              } else if (key === 'skills') {
                const cleaned = cleanCsvValue(rawVal)
                candidate[key] = cleaned
                  ? cleaned.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
                  : []
              } else {
                candidate[key] = cleanCsvValue(rawVal)
              }
            }
          })

          // Normalize gender capitalization
          if (candidate.gender) {
            const g = candidate.gender.toLowerCase()
            candidate.gender = g.startsWith('m') ? 'Male' : g.startsWith('f') ? 'Female' : candidate.gender
          }

          candidate._errors = validateRow(candidate)
          candidate._id = `batch-${i}-${Date.now()}`
          parsed.push(candidate)
        }

        setCandidates(parsed)
        if (parsed.length === 0) {
          showToast('No valid rows found in CSV.', 'error')
        } else {
          showToast(`Loaded ${parsed.length} candidate rows from file.`, 'info')
        }
      } catch (err) {
        showToast('Error parsing CSV file: ' + err.message, 'error')
      }
    }
    reader.readAsText(file)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    const file = event.dataTransfer?.files?.[0]
    if (file) processFile(file)
  }

  const handleRemoveCandidate = (index) => {
    setCandidates((prev) => prev.filter((_, i) => i !== index))
  }

  const validCandidates = useMemo(
    () => candidates.filter((c) => !c._errors || c._errors.length === 0),
    [candidates]
  )

  const handleBatchSubmit = async () => {
    if (validCandidates.length === 0) return
    setIsSubmitting(true)
    setProgress({ current: 0, total: validCandidates.length })

    let successCount = 0
    let failureCount = 0
    const errors = []

    for (let i = 0; i < validCandidates.length; i++) {
      const candidate = validCandidates[i]
      setProgress({ current: i + 1, total: validCandidates.length })
      try {
        let appCountries = Array.isArray(candidate.application_countries)
          ? candidate.application_countries.filter(Boolean)
          : typeof candidate.application_countries === 'string' && candidate.application_countries.trim()
          ? candidate.application_countries.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
          : []
        if (appCountries.length === 0) {
          appCountries = ['Saudi Arabia']
        }

        let skillsList = Array.isArray(candidate.skills)
          ? candidate.skills.filter(Boolean)
          : typeof candidate.skills === 'string' && candidate.skills.trim()
          ? candidate.skills.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
          : []
        if (skillsList.length === 0) {
          skillsList = (candidate.profession && PROFESSION_SKILLS[candidate.profession]) || ['General Services']
        }

        const payload = buildEmployeePayload({
          ...emptyForm,
          ...candidate,
          application_countries: appCountries,
          skills: skillsList,
          employment_type: candidate.employment_type || 'Contract',
          application_salary: candidate.application_salary ? String(candidate.application_salary) : '1200',
          date_of_birth: normalizeDateToYMD(candidate.date_of_birth),
          mobile_number: normalizePhoneNumber(candidate.mobile_number),
          contact_person_mobile: normalizePhoneNumber(candidate.contact_person_mobile),
          religion: candidate.religion || 'Other',
          marital_status: candidate.marital_status || 'Single',
          nationality: candidate.nationality || 'Ethiopian',
          residence_country: candidate.residence_country || 'Ethiopia',
          birth_place: candidate.birth_place || 'Addis Ababa',
          contact_person_relationship: candidate.contact_person_relationship || 'Other'
        })
        await createEmployee(payload)
        successCount++
      } catch (err) {
        failureCount++
        errors.push(`${candidate.first_name} ${candidate.last_name}: ${err.message}`)
      }
    }

    setIsSubmitting(false)
    setSubmitResults({ successCount, failureCount, errors })

    if (successCount > 0) {
      showToast(`Batch completed: ${successCount} candidates registered successfully.`, 'success')
      if (typeof onBatchSuccess === 'function') {
        onBatchSuccess(successCount)
      }
    }
    if (failureCount > 0) {
      showToast(`${failureCount} candidates failed to register. Check error details.`, 'error')
    }
  }

  const handleReset = () => {
    setCandidates([])
    setFileName('')
    setSubmitResults(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      title="Batch Candidate Registration"
      subtitle="Register multiple candidates at once using a CSV spreadsheet or our standardized template."
      maxWidth="840px"
      className="employee-scan-modal employee-batch-modal"
      backdropClassName="employee-scan-backdrop"
      footer={
        <div className="employee-scan-modal-footer">
          <div className="employee-scan-modal-actions-left">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleDownloadTemplate}
              title="Download standardized CSV template"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '6px' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Template
            </button>
          </div>
          <div className="employee-scan-modal-actions-right">
            {candidates.length > 0 && !isSubmitting && !submitResults ? (
              <button type="button" className="btn-secondary" onClick={handleReset}>
                Clear
              </button>
            ) : null}
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {submitResults ? 'Close' : 'Cancel'}
            </button>
            {candidates.length > 0 && !submitResults ? (
              <button
                type="button"
                className="btn-primary"
                onClick={handleBatchSubmit}
                disabled={validCandidates.length === 0 || isSubmitting}
              >
                {isSubmitting
                  ? `Registering ${progress.current} of ${progress.total}...`
                  : `Register ${validCandidates.length} Candidates`}
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="employee-batch-modal-content">
        {candidates.length === 0 ? (
          <div
            className="employee-batch-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload CSV spreadsheet"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".csv,text/csv,text/plain"
              style={{ display: 'none' }}
            />
            <div className="employee-batch-dropzone-icon" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <polyline points="9 15 12 12 15 15" />
              </svg>
            </div>
            <strong>Select or drag &amp; drop candidate spreadsheet (.csv)</strong>
            <p className="muted-text">
              Upload standard format CSV file containing multiple candidate rows to queue and register them together.
            </p>
          </div>
        ) : (
          <div className="employee-batch-preview-container">
            <div className="employee-batch-summary-bar">
              <div>
                <strong>{fileName || 'Uploaded CSV'}</strong>
                <span className="muted-text" style={{ marginLeft: '8px' }}>
                  ({candidates.length} candidates loaded, {validCandidates.length} valid)
                </span>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ height: '28px', fontSize: '0.78rem', padding: '0 10px' }}
                onClick={() => fileInputRef.current?.click()}
              >
                Change File
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".csv,text/csv,text/plain"
                style={{ display: 'none' }}
              />
            </div>

            {submitResults ? (
              <div className="employee-batch-results-panel">
                <h4>Batch Registration Summary</h4>
                <p>
                  <strong>{submitResults.successCount}</strong> candidates registered successfully.
                  {submitResults.failureCount > 0 ? (
                    <span style={{ color: 'var(--color-danger, #ef4444)', marginLeft: '8px' }}>
                      {submitResults.failureCount} failed.
                    </span>
                  ) : null}
                </p>
                {submitResults.errors?.length > 0 ? (
                  <ul className="employee-batch-error-list">
                    {submitResults.errors.map((err, idx) => (
                      <li key={`err-${idx}`}>{err}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="employee-batch-table-wrapper">
              <table className="employee-batch-table">
                <thead>
                  <tr>
                    <th style={{ width: '36px' }}>#</th>
                    <th>Candidate Name</th>
                    <th>Gender</th>
                    <th>DOB</th>
                    <th>Passport</th>
                    <th>Mobile</th>
                    <th>Status</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((cand, idx) => {
                    const hasError = cand._errors && cand._errors.length > 0
                    return (
                      <tr key={cand._id || `cand-${idx}`} className={hasError ? 'is-invalid-row' : ''}>
                        <td>{idx + 1}</td>
                        <td>
                          <strong>
                            {[cand.first_name, cand.middle_name, cand.last_name].filter(Boolean).join(' ') || '—'}
                          </strong>
                        </td>
                        <td>{cand.gender || '—'}</td>
                        <td>{cand.date_of_birth || '—'}</td>
                        <td><code>{cand.passport_number || '—'}</code></td>
                        <td>{cand.mobile_number || '—'}</td>
                        <td>
                          {hasError ? (
                            <span className="badge badge-danger" title={cand._errors.join(', ')}>
                              {cand._errors[0] || 'Missing fields'}
                            </span>
                          ) : (
                            <span className="badge badge-success">Ready</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="employee-batch-row-remove"
                            onClick={() => handleRemoveCandidate(idx)}
                            title="Remove candidate from batch"
                            disabled={isSubmitting}
                          >
                            &times;
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
