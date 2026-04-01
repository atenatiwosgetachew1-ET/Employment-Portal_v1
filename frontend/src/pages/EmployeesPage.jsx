import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  ATTACHMENT_FIELDS,
  EMPLOYMENT_TYPE_OPTIONS,
  EXPERIENCE_COUNTRIES,
  GENDER_OPTIONS,
  LANGUAGE_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  PROFESSION_OPTIONS,
  PROFESSION_SKILLS,
  RELIGION_OPTIONS,
  RESIDENCE_COUNTRY_OPTIONS
} from '../constants/employeeOptions'
import * as employeesService from '../services/employeesService'

const emptyExperience = { country: '', years: '' }
const emptyForm = {
  first_name: '', middle_name: '', last_name: '', date_of_birth: '', gender: '',
  id_number: '', passport_number: '', labour_id: '', mobile_number: '', email: '', phone: '',
  application_countries: [], profession: '', skills: [], employment_type: '', experiences: [emptyExperience],
  languages: [], application_salary: '', professional_title: '', summary: '', education: '',
  experience: '', certifications: '', references: '', notes: '', religion: '', marital_status: '',
  children_count: 0, address: '', residence_country: '', nationality: '', birth_place: '',
  weight_kg: '', height_cm: '', contact_person_name: '', contact_person_id_number: '',
  contact_person_mobile: '', did_travel: false, departure_date: '', return_ticket_date: '',
  passport_expires_on: '', medical_expires_on: '', contract_expires_on: '', visa_expires_on: '',
  competency_certificate_expires_on: '', clearance_expires_on: '', insurance_expires_on: '',
  is_active: true
}

function computeAge(value) {
  if (!value) return ''
  const birth = new Date(value)
  if (Number.isNaN(birth.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1
  return age >= 0 ? age : ''
}

function normalizeEmployeeForm(employee) {
  return {
    ...emptyForm,
    ...employee,
    application_countries: Array.isArray(employee.application_countries) ? employee.application_countries : [],
    skills: Array.isArray(employee.skills) ? employee.skills : [],
    experiences: Array.isArray(employee.experiences) && employee.experiences.length > 0
      ? employee.experiences.map((item) => ({ country: item.country || '', years: item.years ?? '' }))
      : [emptyExperience],
    languages: Array.isArray(employee.languages) ? employee.languages : [],
    children_count: employee.children_count ?? 0,
    application_salary: employee.application_salary == null ? '' : String(employee.application_salary),
    weight_kg: employee.weight_kg == null ? '' : String(employee.weight_kg),
    height_cm: employee.height_cm == null ? '' : String(employee.height_cm),
    did_travel: Boolean(employee.did_travel),
    is_active: Boolean(employee.is_active)
  }
}

function fileLabel(document, attachmentLabels) {
  if (document.label) return document.label
  return attachmentLabels[document.document_type] || document.document_type
}

export default function EmployeesPage() {
  const { user } = useAuth()
  const [employeesData, setEmployeesData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState({ q: '', isActive: '' })
  const [editingEmployeeId, setEditingEmployeeId] = useState(null)
  const [busyEmployeeId, setBusyEmployeeId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formOptions, setFormOptions] = useState({ destination_countries: [], salary_options_by_country: {} })
  const [attachmentFiles, setAttachmentFiles] = useState({})
  const [attachmentLabels, setAttachmentLabels] = useState({})

  const canManageEmployees = Boolean(user?.feature_flags?.employees_enabled)
  const readOnly = Boolean(user?.is_read_only || user?.is_suspended)

  const loadEmployees = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await employeesService.fetchEmployees({ page, q: filters.q, isActive: filters.isActive })
      setEmployeesData(data)
    } catch (err) {
      setError(err.message || 'Failed to load employees')
      setEmployeesData(null)
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  const loadFormOptions = useCallback(async () => {
    try {
      setFormOptions(await employeesService.fetchEmployeeFormOptions())
    } catch {
      setFormOptions({ destination_countries: [], salary_options_by_country: {} })
    }
  }, [])

  useEffect(() => {
    if (canManageEmployees) {
      loadEmployees()
      loadFormOptions()
    } else {
      setLoading(false)
    }
  }, [canManageEmployees, loadEmployees, loadFormOptions])

  const availableSkillOptions = useMemo(() => PROFESSION_SKILLS[form.profession] || [], [form.profession])
  const salaryOptions = useMemo(() => {
    const values = new Set()
    form.application_countries.forEach((country) => {
      ;(formOptions.salary_options_by_country[country] || []).forEach((salary) => values.add(salary))
    })
    return Array.from(values)
  }, [form.application_countries, formOptions.salary_options_by_country])

  const resetForm = useCallback(() => {
    setEditingEmployeeId(null)
    setForm(emptyForm)
    setAttachmentFiles({})
    setAttachmentLabels({})
  }, [])

  const handleCheckboxList = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(value) ? prev[field].filter((item) => item !== value) : [...prev[field], value]
    }))
  }

  const handleExperienceChange = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      experiences: prev.experiences.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item)
    }))
  }

  const handleAttachmentPick = (key, file) => setAttachmentFiles((prev) => ({ ...prev, [key]: file || null }))

  const uploadPendingAttachments = async (employeeId) => {
    const uploads = ATTACHMENT_FIELDS.filter((item) => attachmentFiles[item.key]).map((item) =>
      employeesService.uploadEmployeeDocument(
        employeeId,
        item.key,
        attachmentLabels[item.key] || item.label,
        attachmentFiles[item.key],
        item.expiryField ? form[item.expiryField] : ''
      )
    )
    if (uploads.length > 0) await Promise.all(uploads)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        ...form,
        professional_title: form.professional_title.trim() || form.profession,
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        experiences: form.experiences.filter((item) => item.country || item.years).map((item) => ({ country: item.country.trim(), years: Number(item.years || 0) })),
        application_salary: form.application_salary ? String(form.application_salary) : null,
        weight_kg: form.weight_kg ? String(form.weight_kg) : null,
        height_cm: form.height_cm ? String(form.height_cm) : null
      }
      const employee = editingEmployeeId ? await employeesService.updateEmployee(editingEmployeeId, payload) : await employeesService.createEmployee(payload)
      await uploadPendingAttachments(employee.id)
      setNotice(editingEmployeeId ? 'Employee updated successfully.' : 'Employee registered successfully.')
      resetForm()
      await Promise.all([loadEmployees(), loadFormOptions()])
    } catch (err) {
      setError(err.message || 'Could not save employee')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (employeeId) => {
    setBusyEmployeeId(employeeId)
    setError('')
    setNotice('')
    try {
      const employee = await employeesService.fetchEmployee(employeeId)
      setEditingEmployeeId(employee.id)
      setForm(normalizeEmployeeForm(employee))
      const nextLabels = {}
      ;(employee.documents || []).forEach((document) => { nextLabels[document.document_type] = document.label || '' })
      setAttachmentLabels(nextLabels)
      setAttachmentFiles({})
    } catch (err) {
      setError(err.message || 'Could not load employee details')
    } finally {
      setBusyEmployeeId(null)
    }
  }

  const handleDelete = async (employee) => {
    if (!window.confirm(`Remove employee "${employee.full_name}"?`)) return
    setError('')
    setNotice('')
    try {
      await employeesService.deleteEmployee(employee.id)
      if (editingEmployeeId === employee.id) resetForm()
      setNotice('Employee removed.')
      await loadEmployees()
    } catch (err) {
      setError(err.message || 'Could not delete employee')
    }
  }

  const handleDeleteDocument = async (documentId) => {
    setError('')
    setNotice('')
    try {
      await employeesService.deleteEmployeeDocument(documentId)
      setNotice('Document removed.')
      await loadEmployees()
    } catch (err) {
      setError(err.message || 'Could not delete document')
    }
  }

  if (!canManageEmployees) return <Navigate to="/dashboard" replace />

  const employees = employeesData?.results ?? []
  const total = employeesData?.count ?? employees.length
  const hasNext = Boolean(employeesData?.next)
  const hasPrev = Boolean(employeesData?.previous)
  const age = computeAge(form.date_of_birth)

  return (
    <section className="dashboard-panel employees-page">
      <div className="users-management-header">
        <div>
          <h1>Employees</h1>
          <p className="muted-text">Employee registration now follows a structured 8-section dossier, including travel dates, expiry tracking, and attachment management.</p>
          {readOnly ? <p className="muted-text">Employee changes are disabled while this organization is read-only.</p> : null}
        </div>
        <button type="button" className="btn-secondary" onClick={loadEmployees} disabled={loading}>Refresh</button>
      </div>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters((prev) => ({ ...prev, q: searchInput.trim() })) }} style={{ marginBottom: 16, alignItems: 'end' }}>
        <label>
          Search
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Name, passport, mobile, profession" />
        </label>
        <label>
          Status
          <select value={filters.isActive} onChange={(event) => { setPage(1); setFilters((prev) => ({ ...prev, isActive: event.target.value })) }}>
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Archived</option>
          </select>
        </label>
        <button type="submit" className="btn-secondary">Apply filters</button>
      </form>

      {error ? <p className="error-message">{error}</p> : null}
      {notice ? <p className="muted-text" style={{ marginBottom: 16 }}>{notice}</p> : null}

      <div className="users-grid">
        <form className="user-create-card employee-form-card" onSubmit={handleSubmit}>
          <h2>{editingEmployeeId ? 'Update employee' : 'Register employee'}</h2>
          <div className="employee-fieldsets">
            <fieldset className="employee-fieldset">
              <legend>1. Personal informations</legend>
              <div className="form-grid">
                <label>First name *<input value={form.first_name} onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))} required /></label>
                <label>Middle name *<input value={form.middle_name} onChange={(event) => setForm((prev) => ({ ...prev, middle_name: event.target.value }))} required /></label>
                <label>Last name *<input value={form.last_name} onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))} required /></label>
                <label>Date of birth *<input type="date" value={form.date_of_birth} onChange={(event) => setForm((prev) => ({ ...prev, date_of_birth: event.target.value }))} required /></label>
                <label>Age<input value={age} readOnly /></label>
                <label>
                  Gender *
                  <select value={form.gender} onChange={(event) => setForm((prev) => ({ ...prev, gender: event.target.value }))} required>
                    <option value="">Select gender</option>
                    {GENDER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="employee-fieldset">
              <legend>2. Identifications</legend>
              <div className="form-grid">
                <label>ID Number<input value={form.id_number} onChange={(event) => setForm((prev) => ({ ...prev, id_number: event.target.value }))} /></label>
                <label>Passport Number *<input value={form.passport_number} onChange={(event) => setForm((prev) => ({ ...prev, passport_number: event.target.value }))} required /></label>
                <label>Labour ID<input value={form.labour_id} onChange={(event) => setForm((prev) => ({ ...prev, labour_id: event.target.value }))} /></label>
                <label>Mobile Number *<input value={form.mobile_number} onChange={(event) => setForm((prev) => ({ ...prev, mobile_number: event.target.value }))} required /></label>
              </div>
            </fieldset>

            <fieldset className="employee-fieldset">
              <legend>3. Application</legend>
              <div className="form-grid">
                <div className="employee-span-two">
                  <span className="employee-group-label">Country *</span>
                  <div className="checkbox-grid">
                    {formOptions.destination_countries.length === 0 ? <span className="muted-text">Create active agent accounts with countries first.</span> : formOptions.destination_countries.map((country) => (
                      <label key={country} className="checkbox-pill">
                        <input type="checkbox" checked={form.application_countries.includes(country)} onChange={() => handleCheckboxList('application_countries', country)} />
                        <span>{country}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <label>
                  Profession *
                  <select value={form.profession} onChange={(event) => setForm((prev) => ({ ...prev, profession: event.target.value, skills: prev.skills.filter((item) => (PROFESSION_SKILLS[event.target.value] || []).includes(item)) }))} required>
                    <option value="">Select profession</option>
                    {PROFESSION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Type *
                  <select value={form.employment_type} onChange={(event) => setForm((prev) => ({ ...prev, employment_type: event.target.value }))} required>
                    <option value="">Select type</option>
                    {EMPLOYMENT_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Salary
                  <select value={form.application_salary} onChange={(event) => setForm((prev) => ({ ...prev, application_salary: event.target.value }))}>
                    <option value="">Select salary</option>
                    {salaryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>Professional title<input value={form.professional_title} onChange={(event) => setForm((prev) => ({ ...prev, professional_title: event.target.value }))} /></label>
                <div className="employee-span-two">
                  <span className="employee-group-label">Skills</span>
                  <div className="checkbox-grid">
                    {availableSkillOptions.length === 0 ? <span className="muted-text">Choose a profession to load matching skills.</span> : availableSkillOptions.map((skill) => (
                      <label key={skill} className="checkbox-pill">
                        <input type="checkbox" checked={form.skills.includes(skill)} onChange={() => handleCheckboxList('skills', skill)} />
                        <span>{skill}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="employee-span-two">
                  <span className="employee-group-label">Experiences</span>
                  <div className="experience-list">
                    {form.experiences.map((item, index) => (
                      <div key={`${index}-${item.country}`} className="experience-row">
                        <select value={item.country} onChange={(event) => handleExperienceChange(index, 'country', event.target.value)}>
                          <option value="">Select country</option>
                          {EXPERIENCE_COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
                        </select>
                        <input type="number" min="0" value={item.years} onChange={(event) => handleExperienceChange(index, 'years', event.target.value)} placeholder="Years" />
                        {form.experiences.length > 1 ? <button type="button" className="btn-secondary" onClick={() => setForm((prev) => ({ ...prev, experiences: prev.experiences.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button> : null}
                      </div>
                    ))}
                    <button type="button" className="btn-secondary" onClick={() => setForm((prev) => ({ ...prev, experiences: [...prev.experiences, { ...emptyExperience }] }))}>+ Add experience</button>
                  </div>
                </div>
                <div className="employee-span-two">
                  <span className="employee-group-label">Languages</span>
                  <div className="checkbox-grid">
                    {LANGUAGE_OPTIONS.map((language) => (
                      <label key={language} className="checkbox-pill">
                        <input type="checkbox" checked={form.languages.includes(language)} onChange={() => handleCheckboxList('languages', language)} />
                        <span>{language}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </fieldset>
            <fieldset className="employee-fieldset">
              <legend>4. Social status</legend>
              <div className="form-grid">
                <label>
                  Religion
                  <select value={form.religion} onChange={(event) => setForm((prev) => ({ ...prev, religion: event.target.value }))}>
                    <option value="">Select religion</option>
                    {RELIGION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Marital status
                  <select value={form.marital_status} onChange={(event) => setForm((prev) => ({ ...prev, marital_status: event.target.value }))}>
                    <option value="">Select marital status</option>
                    {MARITAL_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>Childrens<input type="number" min="0" value={form.children_count} onChange={(event) => setForm((prev) => ({ ...prev, children_count: event.target.value }))} /></label>
              </div>
            </fieldset>

            <fieldset className="employee-fieldset">
              <legend>5. Address</legend>
              <div className="form-grid">
                <label>
                  Residence country
                  <select value={form.residence_country} onChange={(event) => setForm((prev) => ({ ...prev, residence_country: event.target.value }))}>
                    <option value="">Select country</option>
                    {RESIDENCE_COUNTRY_OPTIONS.map((country) => <option key={country} value={country}>{country}</option>)}
                  </select>
                </label>
                <label>Nationality<input value={form.nationality} onChange={(event) => setForm((prev) => ({ ...prev, nationality: event.target.value }))} /></label>
                <label>Birth place<input value={form.birth_place} onChange={(event) => setForm((prev) => ({ ...prev, birth_place: event.target.value }))} /></label>
                <label className="employee-span-two">Address<input value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} /></label>
              </div>
            </fieldset>

            <fieldset className="employee-fieldset">
              <legend>6. Physique</legend>
              <div className="form-grid">
                <label>
                  Weight
                  <div className="input-suffix">
                    <input type="number" min="0" value={form.weight_kg} onChange={(event) => setForm((prev) => ({ ...prev, weight_kg: event.target.value }))} />
                    <span>Kg</span>
                  </div>
                </label>
                <label>
                  Height
                  <div className="input-suffix">
                    <input type="number" min="0" value={form.height_cm} onChange={(event) => setForm((prev) => ({ ...prev, height_cm: event.target.value }))} />
                    <span>Cm</span>
                  </div>
                </label>
              </div>
            </fieldset>

            <fieldset className="employee-fieldset">
              <legend>7. Contact informations</legend>
              <div className="form-grid">
                <label>Contact person name<input value={form.contact_person_name} onChange={(event) => setForm((prev) => ({ ...prev, contact_person_name: event.target.value }))} /></label>
                <label>Contact person ID.No<input value={form.contact_person_id_number} onChange={(event) => setForm((prev) => ({ ...prev, contact_person_id_number: event.target.value }))} /></label>
                <label>Contact person mobile<input value={form.contact_person_mobile} onChange={(event) => setForm((prev) => ({ ...prev, contact_person_mobile: event.target.value }))} /></label>
                <label>Email<input type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} /></label>
                <label>Secondary phone<input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} /></label>
              </div>
            </fieldset>

            <fieldset className="employee-fieldset">
              <legend>8. Attachments and status tracking</legend>
              <div className="form-grid">
                <label className="checkbox-label">
                  <input type="checkbox" checked={form.did_travel} onChange={(event) => setForm((prev) => ({ ...prev, did_travel: event.target.checked }))} />
                  Did the employee travel
                </label>
                <label>Departure date<input type="date" value={form.departure_date} onChange={(event) => setForm((prev) => ({ ...prev, departure_date: event.target.value }))} /></label>
                <label>Return ticket date<input type="date" value={form.return_ticket_date} onChange={(event) => setForm((prev) => ({ ...prev, return_ticket_date: event.target.value }))} /></label>
                <div className="employee-span-two attachment-grid">
                  {ATTACHMENT_FIELDS.map((attachment) => (
                    <label key={attachment.key} className="attachment-box">
                      <span className="attachment-box-title">{attachment.label}</span>
                      {attachment.key.startsWith('att_option_') ? <input type="text" value={attachmentLabels[attachment.key] || ''} onChange={(event) => setAttachmentLabels((prev) => ({ ...prev, [attachment.key]: event.target.value }))} placeholder="Attachment name" /> : null}
                      {attachment.expiryField ? <input type="date" value={form[attachment.expiryField]} onChange={(event) => setForm((prev) => ({ ...prev, [attachment.expiryField]: event.target.value }))} /> : null}
                      <span className="attachment-file-name">{attachmentFiles[attachment.key]?.name || 'Choose file'}</span>
                      <input type="file" className="visually-hidden-file" onChange={(event) => handleAttachmentPick(attachment.key, event.target.files?.[0] || null)} />
                    </label>
                  ))}
                </div>
                <label className="checkbox-label">
                  <input type="checkbox" checked={form.is_active} onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))} />
                  Active employee
                </label>
              </div>
            </fieldset>

            <fieldset className="employee-fieldset">
              <legend>Notes and narrative</legend>
              <div className="form-grid">
                {[
                  ['summary', 'Summary'],
                  ['education', 'Education'],
                  ['experience', 'Experience'],
                  ['certifications', 'Certificate notes'],
                  ['references', 'References'],
                  ['notes', 'Notes']
                ].map(([key, label]) => (
                  <label key={key} className="employee-span-two">
                    {label}
                    <textarea value={form[key]} onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))} rows={4} />
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="employee-form-actions">
            <button type="submit" disabled={saving || readOnly}>{saving ? 'Saving...' : editingEmployeeId ? 'Update employee' : 'Register employee'}</button>
            {editingEmployeeId ? <button type="button" className="btn-secondary" onClick={resetForm}>Cancel edit</button> : null}
          </div>
        </form>
        <div className="users-table-wrap">
          <h2>Employee records</h2>
          {!loading ? <p className="muted-text" style={{ marginBottom: 12 }}>Showing {employees.length} of {total} employees.</p> : null}
          {loading ? (
            <p className="muted-text">Loading employees...</p>
          ) : employees.length === 0 ? (
            <p className="muted-text">No employees found.</p>
          ) : (
            <div className="employee-cards">
              {employees.map((employee) => (
                <article key={employee.id} className="employee-card">
                  <div className="employee-card-header">
                    <div>
                      <h3>{employee.full_name}</h3>
                      <p className="muted-text">{employee.profession || employee.professional_title || 'No profession set'}</p>
                    </div>
                    <span className={`badge ${employee.is_active ? 'badge-success' : 'badge-muted'}`}>{employee.is_active ? 'Active' : 'Archived'}</span>
                  </div>
                  <p className="muted-text">{employee.application_countries?.join(', ') || 'No destination country'} | {employee.phone || 'No phone'}</p>
                  <p className="muted-text">Progress {employee.progress_status?.overall_completion ?? 0}% | Travel {employee.travel_status || 'pending'} | Return {employee.return_status || 'n/a'}</p>
                  {employee.urgency_alerts?.length ? (
                    <div className="employee-alert-list">
                      {employee.urgency_alerts.map((alert) => (
                        <span key={`${employee.id}-${alert.field}`} className="badge badge-warning">
                          {alert.label} {alert.days_remaining < 0 ? 'expired' : `${alert.days_remaining}d`}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="employee-card-actions">
                    <button type="button" className="btn-secondary" onClick={() => handleEdit(employee.id)} disabled={busyEmployeeId === employee.id || readOnly}>
                      {busyEmployeeId === employee.id ? 'Loading...' : 'Edit'}
                    </button>
                    <button type="button" className="btn-danger" onClick={() => handleDelete(employee)} disabled={readOnly}>Delete</button>
                  </div>
                  {employee.documents?.length ? (
                    <div className="employee-documents">
                      <strong>Documents</strong>
                      {employee.documents.map((document) => (
                        <div key={document.id} className="employee-document-row">
                          <a href={document.file_url} target="_blank" rel="noreferrer">{fileLabel(document, attachmentLabels)}</a>
                          <button type="button" className="link-button" onClick={() => handleDeleteDocument(document.id)} disabled={readOnly}>Remove</button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
          {!loading && employees.length > 0 ? (
            <div className="activity-log-pagination">
              <button type="button" className="btn-secondary" disabled={!hasPrev} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Previous</button>
              <span className="muted-text">Page {page}</span>
              <button type="button" className="btn-secondary" disabled={!hasNext} onClick={() => setPage((prev) => prev + 1)}>Next</button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
