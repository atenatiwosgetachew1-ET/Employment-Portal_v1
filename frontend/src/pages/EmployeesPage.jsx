import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUiFeedback } from '../context/UiFeedbackContext'
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
import {
  ASPRISE_SCANNER_LINKS,
  checkAspriseScannerService,
  resetAspriseScannerService,
  scanWithAspriseScanner
} from '../services/aspriseScannerService'
import * as employeesService from '../services/employeesService'
import { normalizeSearchValue } from '../utils/filtering'

const MINIMUM_EMPLOYEE_AGE = 18
const PHONE_ALLOWED_CHARS = /^[+\d\s()-]+$/
const DOCUMENT_NUMBER_PATTERN = /^[A-Za-z0-9\s/-]+$/
const OPTIONAL_DATE_FIELDS = [
  'departure_date',
  'return_ticket_date',
  'passport_expires_on',
  'medical_expires_on',
  'contract_expires_on',
  'visa_expires_on',
  'competency_certificate_expires_on',
  'clearance_expires_on',
  'insurance_expires_on'
]
const MANDATORY_ATTACHMENT_KEYS = ['portrait_photo', 'full_photo', 'passport_document']
const ALLOWED_ATTACHMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const ALLOWED_ATTACHMENT_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png']
const REGISTRATION_TEMPLATE_STORAGE_KEY = 'employment-portal.employee-registration-template'
const TRAVEL_CONFIRMATION_DECLINED_STORAGE_KEY = 'employment-portal.travel-confirmation-declined'
const TRAVEL_CONFIRMATION_CONFIRMED_STORAGE_KEY = 'employment-portal.travel-confirmation-confirmed'
const COMMISSION_SETTLEMENT_STORAGE_KEY = 'employment-portal.commission-settlements'
const COMMISSION_STORAGE_DB_NAME = 'employment-portal-storage'
const COMMISSION_STORAGE_DB_VERSION = 1
const COMMISSION_STORAGE_SETTLEMENT_STORE = 'commission-settlements'
const COMMISSION_STORAGE_PRIMARY_KEY = 'primary'
const TEMPLATE_FORM_FIELDS = [
  'application_countries',
  'profession',
  'skills',
  'employment_type',
  'experiences',
  'languages',
  'application_salary',
  'professional_title',
  'summary',
  'education',
  'experience',
  'certifications',
  'references',
  'notes',
  'religion',
  'marital_status',
  'children_count',
  'address',
  'residence_country',
  'nationality',
  'birth_place',
  'weight_kg',
  'height_cm'
]
const EMPLOYEE_OCR_FIELD_LABELS = {
  application_countries: 'Application countries',
  profession: 'Profession',
  employment_type: 'Employment type',
  application_salary: 'Application salary',
  professional_title: 'Professional title',
  languages: 'Languages',
  religion: 'Religion',
  marital_status: 'Marital status',
  children_count: 'Children count',
  address: 'Address',
  residence_country: 'Residence country',
  nationality: 'Nationality',
  birth_place: 'Birth place',
  weight_kg: 'Weight',
  height_cm: 'Height',
  summary: 'Summary',
  education: 'Education',
  experience: 'Experience',
  contact_person_name: 'Contact person name',
  contact_person_id_number: 'Contact person ID',
  contact_person_mobile: 'Contact person mobile',
  email: 'Email',
  phone: 'Phone',
  references: 'References',
  notes: 'Notes'
}
const OCR_UNREACHABLE_MESSAGE = 'OCR service is not reachable. Please try again later.'

function normalizeOcrStatusMessage(message) {
  if (!message) return OCR_UNREACHABLE_MESSAGE
  const normalized = String(message).trim()
  if (!normalized) return OCR_UNREACHABLE_MESSAGE
  if (normalized.toLowerCase().includes('ocr service is not reachable')) {
    return OCR_UNREACHABLE_MESSAGE
  }
  return normalized
}

function readCssCustomProperty(name) {
  if (typeof window === 'undefined') return ''
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value
}
const emptyExperience = { country: '', years: '' }
const REGISTRATION_STEPS = [
  { id: 'personal', label: 'Personal' },
  { id: 'profile', label: 'Profile' },
  { id: 'contact', label: 'Contact' },
  { id: 'application', label: 'Application' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'summary', label: 'Summary' }
]
const EMPLOYEE_VIEW_TABS = [
  { id: 'register', label: 'Register employee' },
  { id: 'list', label: 'Employees list' },
  { id: 'selected', label: 'Selected Employees' },
  { id: 'under-process', label: 'Under process Employees' },
  { id: 'employed', label: 'Employed' },
  { id: 'returned', label: 'Returned list' }
]
const EMPLOYEE_TAG_FILTER_OPTIONS = [
  { value: '', label: 'All tags' },
  { value: 'available', label: 'Available' },
  { value: 'not_available', label: 'Not available' },
  { value: 'pending', label: 'Pending approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'selected', label: 'Selected' },
  { value: 'under_process', label: 'Under process' },
  { value: 'traveled', label: 'Traveled' },
  { value: 'employed', label: 'Employed' },
  { value: 'returned', label: 'Returned' }
]
const CARD_PREVIEW_DOCUMENTS = [
  { key: 'portrait', label: 'Portrait', types: ['portrait_photo'] },
  { key: 'full', label: 'Full photo', types: ['full_photo'] },
  { key: 'passport', label: 'Passport', types: ['passport_photo', 'passport_document'] }
]

function buildOcrCacheKey(file) {
  if (!file) return ''
  return [
    file.name || 'scan',
    file.size || 0,
    file.lastModified || 0,
    file.type || ''
  ].join('::')
}

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
  employee_id_expires_on: '', contact_person_id_expires_on: '',
  competency_certificate_expires_on: '', clearance_expires_on: '', insurance_expires_on: '',
  status: 'pending',
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

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load the scanned image for attachment.'))
    image.src = url
  })
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

function buildRegistrationTemplate(form) {
  return TEMPLATE_FORM_FIELDS.reduce((template, field) => {
    if (field === 'application_countries' || field === 'skills' || field === 'languages') {
      template[field] = Array.isArray(form[field]) ? [...form[field]] : []
      return template
    }
    if (field === 'experiences') {
      template[field] = Array.isArray(form.experiences) && form.experiences.length > 0
        ? form.experiences.map((item) => ({ country: item.country || '', years: item.years ?? '' }))
        : [emptyExperience]
      return template
    }
    template[field] = form[field]
    return template
  }, {})
}

function applyRegistrationTemplate(template) {
  if (!template) return { ...emptyForm, experiences: [emptyExperience] }

  return {
    ...emptyForm,
    ...template,
    application_countries: Array.isArray(template.application_countries) ? [...template.application_countries] : [],
    skills: Array.isArray(template.skills) ? [...template.skills] : [],
    experiences: Array.isArray(template.experiences) && template.experiences.length > 0
      ? template.experiences.map((item) => ({ country: item.country || '', years: item.years ?? '' }))
      : [emptyExperience],
    languages: Array.isArray(template.languages) ? [...template.languages] : []
  }
}

function fileLabel(document, attachmentLabels) {
  if (document.label) return document.label
  return attachmentLabels[document.document_type] || document.document_type
}

function findEmployeeDocument(employee, documentTypes) {
  return (employee?.documents || []).find((document) => documentTypes.includes(document.document_type)) || null
}

function isImageDocument(document) {
  if (!document?.file_url) return false
  const value = document.file_url.toLowerCase()
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].some((extension) => value.includes(extension))
}

function isPdfDocumentUrl(value) {
  if (!value) return false
  return String(value).toLowerCase().includes('.pdf')
}

function buildDownloadName(label, url) {
  const safeLabel = (label || 'document')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'document'
  const lowerUrl = String(url || '').toLowerCase()
  if (lowerUrl.includes('.pdf')) return `${safeLabel}.pdf`
  if (lowerUrl.includes('.png')) return `${safeLabel}.png`
  if (lowerUrl.includes('.jpeg') || lowerUrl.includes('.jpg')) return `${safeLabel}.jpg`
  if (lowerUrl.includes('.webp')) return `${safeLabel}.webp`
  return safeLabel
}

async function fetchPreviewBlob(url) {
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Could not load file for preview action.')
  }
  return response.blob()
}

function attachmentFileAllowed(file) {
  if (!file) return true
  const lowerName = (file.name || '').toLowerCase()
  const hasAllowedExtension = ALLOWED_ATTACHMENT_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
  const mimeType = (file.type || '').toLowerCase()
  const hasAllowedMime = !mimeType || ALLOWED_ATTACHMENT_MIME_TYPES.includes(mimeType)
  return hasAllowedExtension && hasAllowedMime
}

function attachmentDisplayName(document, attachmentLabels) {
  if (!document) return ''
  if (document.label) return document.label
  if (document.file) {
    const parts = String(document.file).split('/')
    return parts[parts.length - 1] || document.file
  }
  return attachmentLabels[document.document_type] || document.document_type
}

function employeeProfilePhoto(employee) {
  return (
    findEmployeeDocument(employee, ['portrait_photo']) ||
    findEmployeeDocument(employee, ['full_photo']) ||
    findEmployeeDocument(employee, ['passport_photo', 'passport_document'])
  )
}

function isEmployeeReturned(employee) {
  return Boolean(
    employee?.returned_from_employment ||
    employee?.return_request?.status === 'approved'
  )
}

function normalizedTravelStatus(employee) {
  return String(employee?.travel_status || '').trim().toLowerCase().replace(/\s+/g, '_')
}

function isEmployeeTravelled(employee) {
  const travelStatus = normalizedTravelStatus(employee)
  return Boolean(
    !isEmployeeReturned(employee) &&
    !employee?.did_travel &&
    ['traveled', 'travelled'].includes(travelStatus)
  )
}

function isEmployeeEmployed(employee) {
  return Boolean(
    !isEmployeeReturned(employee) &&
    !isEmployeeTravelled(employee) &&
    employee?.did_travel
  )
}

function isEmployeeUnderProcess(employee) {
  return Boolean(
    !isEmployeeReturned(employee) &&
    !isEmployeeTravelled(employee) &&
    !isEmployeeEmployed(employee) &&
    employee?.selection_state?.selection?.status === 'under_process'
  )
}

function isEmployeeReadyForEmploymentStage(employee) {
  return Boolean(
    isEmployeeUnderProcess(employee) &&
    employee?.progress_override_complete &&
    !employee?.did_travel
  )
}

function isEmployeeTravelConfirmationPending(employee) {
  return Boolean(
    isEmployeeReadyForEmploymentStage(employee) &&
    !isEmployeeTravelled(employee)
  )
}

function isEmployeeSelected(employee) {
  return Boolean(
    !isEmployeeReturned(employee) &&
    !isEmployeeTravelled(employee) &&
    !isEmployeeEmployed(employee) &&
    !isEmployeeUnderProcess(employee) &&
    (
      employee?.selection_state?.selected_by_current_agent ||
      employee?.selection_state?.is_selected ||
      employee?.selection_state?.selection?.status === 'selected'
    )
  )
}

function readTravelConfirmationDeclinedIds() {
  if (typeof window === 'undefined') return []
  try {
    const stored = window.localStorage.getItem(TRAVEL_CONFIRMATION_DECLINED_STORAGE_KEY)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeTravelConfirmationDeclinedIds(ids) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TRAVEL_CONFIRMATION_DECLINED_STORAGE_KEY, JSON.stringify(ids))
}

function readTravelConfirmationConfirmedIds() {
  if (typeof window === 'undefined') return []
  try {
    const stored = window.localStorage.getItem(TRAVEL_CONFIRMATION_CONFIRMED_STORAGE_KEY)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeTravelConfirmationConfirmedIds(ids) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TRAVEL_CONFIRMATION_CONFIRMED_STORAGE_KEY, JSON.stringify(ids))
}

function patchEmployeeCollection(list, employeeId, changes) {
  return (list || []).map((employee) => (
    employee.id === employeeId
      ? {
          ...employee,
          ...changes
        }
      : employee
  ))
}

function isEmployeeInEmployedStage(employee) {
  return isEmployeeTravelled(employee) || isEmployeeEmployed(employee)
}

function isEmployeeEmployedInView(employee) {
  return isEmployeeEmployed(employee)
}

function employeeWorkflowState(employee) {
  if (isEmployeeReturned(employee)) return 'returned'
  if (isEmployeeEmployed(employee)) return 'employed'
  if (isEmployeeTravelled(employee)) return 'traveled'
  if (isEmployeeUnderProcess(employee)) return 'under_process'
  if (isEmployeeSelected(employee)) return 'selected'
  if (employee?.status === 'approved') return 'approved'
  if (employee?.status === 'suspended') return 'suspended'
  if (employee?.status === 'rejected') return 'rejected'
  return 'pending'
}

async function fetchAllEmployeePages(params = {}) {
  let page = 1
  let aggregated = []
  let pageCount = 1

  while (page <= pageCount) {
    const response = await employeesService.fetchEmployees({
      ...params,
      page
    })
    aggregated = aggregated.concat(response.results || [])
    pageCount = response.total_pages || response.totalPages || 1
    page += 1
  }

  return aggregated
}

function prettyStatus(value, fallback = '--') {
  if (!value) return fallback
  if (value === '--') return value
  return String(value).replaceAll('_', ' ')
}

function employeeAvailability(employee) {
  const workflowState = employeeWorkflowState(employee)
  return ['approved', 'selected'].includes(workflowState) ? 'Available' : 'Not available'
}

function employeeStatusLabel(employee) {
  switch (employeeWorkflowState(employee)) {
    case 'approved':
      return 'Approved'
    case 'selected':
      return 'Selected'
    case 'under_process':
      return 'Under process'
    case 'traveled':
      return 'Traveled'
    case 'employed':
      return 'Employed'
    case 'returned':
      return 'Returned'
    case 'suspended':
      return 'Suspended'
    case 'rejected':
      return 'Rejected'
    default:
      return 'Pending approval'
  }
}

function employeeStatusBadgeClass(employee) {
  switch (employeeWorkflowState(employee)) {
    case 'approved':
      return 'badge-success'
    case 'selected':
      return 'badge-info'
    case 'under_process':
      return 'badge-info'
    case 'traveled':
      return 'badge-warning'
    case 'employed':
      return 'badge-success'
    case 'returned':
      return 'badge-muted'
    case 'suspended':
    case 'rejected':
      return 'badge-danger'
    default:
      return 'badge-warning'
  }
}

function employeeStatusBadgeVariantClass(employee) {
  if (['traveled', 'employed'].includes(employeeWorkflowState(employee))) return 'employee-card-status-badge--employed'
  return ''
}

function employeeMatchesTagFilter(employee, tag) {
  const normalizedTag = String(tag || '').trim().toLowerCase()
  if (!normalizedTag) return true
  const workflowState = employeeWorkflowState(employee)

  switch (normalizedTag) {
    case 'available':
      return employeeAvailability(employee) === 'Available'
    case 'not_available':
      return employeeAvailability(employee) !== 'Available'
    case 'pending':
      return workflowState === 'pending'
    case 'approved':
      return workflowState === 'approved'
    case 'rejected':
      return workflowState === 'rejected'
    case 'suspended':
      return workflowState === 'suspended'
    case 'selected':
      return workflowState === 'selected'
    case 'under_process':
      return workflowState === 'under_process'
    case 'traveled':
      return workflowState === 'traveled'
    case 'employed':
      return workflowState === 'employed'
    case 'returned':
      return workflowState === 'returned'
    default:
      return true
  }
}

function statusTone(status) {
  const normalized = String(status || '').trim().toLowerCase().replace(/\s+/g, '_')
  if (!normalized) return ''
  if (['pending', 'requested', 'pending_approval', 'traveled'].includes(normalized)) return 'pending'
  if (['approved', 'active', 'fully_signed', 'success', 'employed', 'returned'].includes(normalized)) return 'success'
  if (normalized === 'selected') return 'selected'
  if (normalized === 'settled') return 'settled'
  if (['declined', 'failed', 'expired', 'cancelled', 'rejected', 'suspended'].includes(normalized)) return 'declined'
  return ''
}

function employedEmployeesHelpText() {
  return 'Employees whose travel was recorded or whose employment is already active are listed here.'
}

function returnedEmployeesHelpText() {
  return 'Employees whose employment has already been discontinued and recorded as returned are listed here.'
}

function normalizeAgentMatchValue(value) {
  return normalizeSearchValue(value)
}

function employeeBelongsToCurrentAgent(employee, user) {
  const currentAgentId = user?.agent_context?.agent_id || (user?.role === 'customer' ? user?.id : null)
  const employeeAgentId = employee?.selection_state?.selection?.agent || null

  if (currentAgentId && employeeAgentId) {
    return String(currentAgentId) === String(employeeAgentId)
  }

  const userCandidates = [
    [user?.first_name, user?.last_name].filter(Boolean).join(' '),
    user?.staff_side,
    user?.username,
    user?.email
  ]
    .map(normalizeAgentMatchValue)
    .filter(Boolean)

  const employeeCandidates = [
    employee?.selection_state?.selection?.agent_name,
    employee?.selection_state?.selection?.selected_by_username,
    employee?.selection_state?.agent_name,
    employee?.registered_by_username
  ]
    .map(normalizeAgentMatchValue)
    .filter(Boolean)

  return employeeCandidates.some((candidate) => userCandidates.includes(candidate))
}

function formatDateTime(value) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function employedCommissionLabel(employee) {
  if (employee?.settled_commission) return 'Settled commission'
  return employee?.did_travel ? 'Unsettled commission' : 'Commission pending travel'
}

function openCommissionStorageDb() {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(COMMISSION_STORAGE_DB_NAME, COMMISSION_STORAGE_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(COMMISSION_STORAGE_SETTLEMENT_STORE)) {
        db.createObjectStore(COMMISSION_STORAGE_SETTLEMENT_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open browser storage'))
  })
}

async function readStoredSettlements() {
  if (typeof window === 'undefined') return []
  try {
    const db = await openCommissionStorageDb()
    if (db) {
      const settlements = await new Promise((resolve, reject) => {
        const transaction = db.transaction(COMMISSION_STORAGE_SETTLEMENT_STORE, 'readonly')
        const store = transaction.objectStore(COMMISSION_STORAGE_SETTLEMENT_STORE)
        const request = store.get(COMMISSION_STORAGE_PRIMARY_KEY)
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : [])
        request.onerror = () => reject(request.error || new Error('Could not read settlements'))
      })
      db.close()
      if (settlements.length > 0) return settlements
    }
  } catch {
    // fall through to legacy localStorage
  }

  try {
    const raw = window.localStorage.getItem(COMMISSION_SETTLEMENT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function progressTone(progress) {
  if (progress >= 90) return 'var(--progress-tone-high)'
  if (progress >= 60) return 'var(--progress-tone-mid)'
  return 'var(--progress-tone-low)'
}

function buildProgressDonut(progressStatus) {
  const overallProgress = Math.max(0, Math.min(100, Number(progressStatus?.overall_completion ?? 0)))
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (overallProgress / 100) * circumference

  return {
    overallProgress,
    radius,
    circumference,
    dashOffset,
    tone: progressTone(overallProgress)
  }
}

function formatDateForPrompt(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function isAgentSideWorkspace(user) {
  if (user?.agent_context?.is_agent_side) return true
  if (user?.role === 'customer') return true
  if (user?.role !== 'staff') return false
  const staffSide = (user?.staff_side || '').trim()
  const organizationName = (user?.organization?.name || '').trim()
  return Boolean(staffSide) && staffSide !== organizationName
}

function selectedEmployeesHelpText(user) {
  return isAgentSideWorkspace(user)
    ? 'Employees your agent side marked for follow-up are listed here. Selection is not exclusive; ownership starts only after your agent initiates the process.'
    : 'Employees selected by agents are listed here as market interest only. Ownership starts only after one agent initiates the process.'
}

function underProcessEmployeesHelpText(user) {
  return `Employees under process for ${user?.first_name || user?.username || 'this agent'} are listed here.`
}

function resolvedProcessAgentId(employee, processAgentAssignments, agentOptions) {
  if (processAgentAssignments[employee.id]) return String(processAgentAssignments[employee.id])
  if (employee.selection_state?.selection?.agent) return String(employee.selection_state.selection.agent)
  if (agentOptions.length === 1) return String(agentOptions[0].id)
  return ''
}

function isValidPhoneNumber(value) {
  const raw = (value || '').trim()
  if (!raw) return true
  if (!PHONE_ALLOWED_CHARS.test(raw)) return false
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

function isValidDocumentNumber(value) {
  const raw = (value || '').trim()
  if (!raw) return true
  return DOCUMENT_NUMBER_PATTERN.test(raw)
}

function isValidEmailAddress(value) {
  const raw = (value || '').trim()
  if (!raw) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
}

function getValidationStep(errorMessage) {
  const target = getValidationTarget(errorMessage)
  return target && target.selector ? target.step : null
}

function getValidationTarget(errorMessage) {
  const message = (errorMessage || '').toLowerCase()

  if (!message) return null

  if (
    message.includes('first name')
  ) return { step: 0, selector: '[name="first_name"]' }
  if (message.includes('middle name')) return { step: 0, selector: '[name="middle_name"]' }
  if (message.includes('last name')) return { step: 0, selector: '[name="last_name"]' }
  if (message.includes('date of birth')) return { step: 0, selector: '[name="date_of_birth"]' }
  if (
    message.includes('years old') ||
    (message.includes('at least') && message.includes('year'))
  ) return { step: 0, selector: '[name="date_of_birth"]' }
  if (message.includes('gender')) return { step: 0, selector: '[name="gender"]' }
  if (message.includes('passport number')) return { step: 0, selector: '[name="passport_number"]' }
  if (message.includes('mobile number')) return { step: 0, selector: '[name="mobile_number"]' }
  if (message.includes('labour id')) return { step: 0, selector: '[name="labour_id"]' }
  if (message.includes('id number')) return { step: 0, selector: '[name="id_number"]' }
  if (
    message.includes('passport expires on') ||
    message.includes('passport_expires_on')
  ) return { step: 4, selector: '[name="passport_expires_on"]' }

  if (
    message.includes('destination country') ||
    message.includes('application_countries')
  ) return { step: 3, selector: '[name="application_countries"]' }
  if (message.includes('profession')) return { step: 3, selector: '[name="profession"]' }
  if (message.includes('type is required') || message.includes('employment type')) return { step: 3, selector: '[name="employment_type"]' }
  if (message.includes('salary')) return { step: 3, selector: '[name="application_salary"]' }
  if (message.includes('skill')) return { step: 3, selector: '[name="skills"]' }
  if (message.includes('language')) return { step: 3, selector: '[name="languages"]' }
  if (message.includes('experience') || message.includes('years')) return { step: 3, selector: '[name^="experience_country_"]' }

  if (
    message.includes('religion')
  ) return { step: 1, selector: '[name="religion"]' }
  if (message.includes('marital status')) return { step: 1, selector: '[name="marital_status"]' }
  if (message.includes('residence country')) return { step: 1, selector: '[name="residence_country"]' }
  if (message.includes('nationality')) return { step: 1, selector: '[name="nationality"]' }
  if (message.includes('birth place')) return { step: 1, selector: '[name="birth_place"]' }
  if (message.includes('weight')) return { step: 1, selector: '[name="weight_kg"]' }
  if (message.includes('height')) return { step: 1, selector: '[name="height_cm"]' }
  if (message.includes('children count')) return { step: 1, selector: '[name="children_count"]' }

  if (
    message.includes('contact person name')
  ) return { step: 2, selector: '[name="contact_person_name"]' }
  if (message.includes('contact person mobile')) return { step: 2, selector: '[name="contact_person_mobile"]' }
  if (message.includes('contact person id')) return { step: 2, selector: '[name="contact_person_id_number"]' }
  if (message.includes('secondary phone')) return { step: 2, selector: '[name="phone"]' }
  if (message.includes('email')) return { step: 2, selector: '[name="email"]' }

  if (
    message.includes('portrait photo')
  ) return { step: 4, selector: '[name="portrait_photo"]' }
  if (message.includes('full photo')) return { step: 4, selector: '[name="full_photo"]' }
  if (message.includes('passport is required') || message.includes('passport_document')) return { step: 4, selector: '[name="passport_document"]' }
  if (message.includes('departure date') || message.includes('departure_date')) return { step: 4, selector: '[name="departure_date"]' }
  if (message.includes('return ticket date') || message.includes('return_ticket_date')) return { step: 4, selector: '[name="return_ticket_date"]' }
  if (message.includes('medical result date') || message.includes('medical_expires_on')) return { step: 4, selector: '[name="medical_expires_on"]' }
  if (message.includes('contract') || message.includes('contract_expires_on')) return { step: 4, selector: '[name="contract_expires_on"]' }
  if (message.includes('visa') || message.includes('visa_expires_on')) return { step: 4, selector: '[name="visa_expires_on"]' }
  if (message.includes('competency') || message.includes('competency_certificate_expires_on')) return { step: 4, selector: '[name="competency_certificate_expires_on"]' }
  if (message.includes('clearance') || message.includes('clearance_expires_on')) return { step: 4, selector: '[name="clearance_expires_on"]' }
  if (message.includes('insurance') || message.includes('insurance_expires_on')) return { step: 4, selector: '[name="insurance_expires_on"]' }
  if (message.includes('attachment')) return { step: 4, selector: '[name="portrait_photo"]' }

  return null
}

function validateEmployeeForm(form) {
  if (form.application_salary === '') return 'Salary is required.'
  if (!Array.isArray(form.skills) || form.skills.length === 0) return 'Select at least one skill.'
  const selectedExperiences = Array.isArray(form.experiences)
    ? form.experiences.filter((item) => (item.country || '').trim())
    : []
  const hasMissingYearsForSelectedCountry = selectedExperiences.some((item) => String(item.years ?? '').trim() === '')
  if (hasMissingYearsForSelectedCountry) return 'Fill in years for each selected experience country.'
  if (!form.religion) return 'Religion is required.'
  if (!form.marital_status) return 'Marital status is required.'
  if (!form.residence_country) return 'Residence country is required.'
  if (!(form.contact_person_name || '').trim()) return 'Contact person name is required.'
  if (!(form.contact_person_mobile || '').trim()) return 'Contact person mobile is required.'
  if (!isValidPhoneNumber(form.mobile_number)) return 'Enter a valid mobile number.'
  if (!isValidPhoneNumber(form.phone)) return 'Enter a valid secondary phone number.'
  if (!isValidPhoneNumber(form.contact_person_mobile)) return 'Enter a valid contact person mobile number.'
  if (!isValidEmailAddress(form.email)) return 'Enter a valid email address.'
  if (!isValidDocumentNumber(form.passport_number)) return 'Passport number may only contain letters, numbers, spaces, slashes, and hyphens.'
  if (!isValidDocumentNumber(form.id_number)) return 'ID number may only contain letters, numbers, spaces, slashes, and hyphens.'
  if (!isValidDocumentNumber(form.labour_id)) return 'Labour ID may only contain letters, numbers, spaces, slashes, and hyphens.'
  if (!isValidDocumentNumber(form.contact_person_id_number)) return 'Contact person ID number may only contain letters, numbers, spaces, slashes, and hyphens.'
  if (form.application_salary !== '' && Number(form.application_salary) < 0) return 'Salary cannot be negative.'
  if (form.weight_kg !== '' && Number(form.weight_kg) < 0) return 'Weight cannot be negative.'
  if (form.height_cm !== '' && Number(form.height_cm) < 0) return 'Height cannot be negative.'
  if (Number(form.children_count || 0) < 0) return 'Children count cannot be negative.'
  return ''
}

function validateStepFields(form, stepIndex, ageRestrictionError, validateAttachmentDates) {
  if (stepIndex === 0) {
    if (!form.first_name.trim()) return 'First name is required.'
    if (!form.middle_name.trim()) return 'Middle name is required.'
    if (!form.last_name.trim()) return 'Last name is required.'
    if (!form.date_of_birth) return 'Date of birth is required.'
    if (ageRestrictionError) return ageRestrictionError
    if (!form.gender) return 'Gender is required.'
    if (!form.passport_number.trim()) return 'Passport number is required.'
    if (!form.mobile_number.trim()) return 'Mobile number is required.'
    if (!isValidPhoneNumber(form.mobile_number)) return 'Enter a valid mobile number.'
    if (!isValidDocumentNumber(form.passport_number)) return 'Passport number may only contain letters, numbers, spaces, slashes, and hyphens.'
    if (!isValidDocumentNumber(form.id_number)) return 'ID number may only contain letters, numbers, spaces, slashes, and hyphens.'
    if (!isValidDocumentNumber(form.labour_id)) return 'Labour ID may only contain letters, numbers, spaces, slashes, and hyphens.'
    return ''
  }

  if (stepIndex === 1) {
    if (!form.religion) return 'Religion is required.'
    if (!form.marital_status) return 'Marital status is required.'
    if (!form.residence_country) return 'Residence country is required.'
    if (form.weight_kg !== '' && Number(form.weight_kg) < 0) return 'Weight cannot be negative.'
    if (form.height_cm !== '' && Number(form.height_cm) < 0) return 'Height cannot be negative.'
    if (Number(form.children_count || 0) < 0) return 'Children count cannot be negative.'
    return ''
  }

  if (stepIndex === 2) {
    if (!(form.contact_person_name || '').trim()) return 'Contact person name is required.'
    if (!(form.contact_person_mobile || '').trim()) return 'Contact person mobile is required.'
    if (!isValidPhoneNumber(form.phone)) return 'Enter a valid secondary phone number.'
    if (!isValidPhoneNumber(form.contact_person_mobile)) return 'Enter a valid contact person mobile number.'
    if (!isValidEmailAddress(form.email)) return 'Enter a valid email address.'
    if (!isValidDocumentNumber(form.contact_person_id_number)) return 'Contact person ID number may only contain letters, numbers, spaces, slashes, and hyphens.'
    return ''
  }

  if (stepIndex === 3) {
    if (form.application_countries.length === 0) return 'Select at least one destination country.'
    if (!form.profession) return 'Profession is required.'
    if (!form.employment_type) return 'Type is required.'
    if (form.application_salary === '') return 'Salary is required.'
    if (!Array.isArray(form.skills) || form.skills.length === 0) return 'Select at least one skill.'
    if (!Array.isArray(form.languages) || form.languages.length === 0) return 'Select at least one language.'
    const selectedExperiences = Array.isArray(form.experiences)
      ? form.experiences.filter((item) => (item.country || '').trim())
      : []
    if (selectedExperiences.some((item) => String(item.years ?? '').trim() === '')) return 'Fill in years for each selected experience country.'
    if (form.application_salary !== '' && Number(form.application_salary) < 0) return 'Salary cannot be negative.'
    return ''
  }

  if (stepIndex === 4) {
    try {
      validateAttachmentDates()
    } catch (error) {
      return error.message || 'Please complete the required attachments.'
    }
  }

  return ''
}

function buildEmployeePayload(form, editingEmployeeId) {
  const payload = {
    ...form,
    did_travel: false,
    status: editingEmployeeId ? form.status || 'pending' : 'pending',
    professional_title: form.professional_title.trim() || form.profession,
    email: form.email.trim(),
    phone: form.phone.trim(),
    address: form.address.trim(),
    experiences: form.experiences
      .filter((item) => (item.country || '').trim())
      .map((item) => ({ country: item.country.trim(), years: Number(item.years || 0) })),
    application_salary: form.application_salary ? String(form.application_salary) : null,
    weight_kg: form.weight_kg ? String(form.weight_kg) : null,
    height_cm: form.height_cm ? String(form.height_cm) : null
  }

  OPTIONAL_DATE_FIELDS.forEach((field) => {
    payload[field] = form[field] ? form[field] : null
  })

  return payload
}

export default function EmployeesPage() {
  const { user } = useAuth()
  const { showToast, confirm } = useUiFeedback()
  const [searchParams, setSearchParams] = useSearchParams()
  const [employeesData, setEmployeesData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState('')
  const [modalError, setModalError] = useState('')
  const [modalNotice, setModalNotice] = useState('')
  const [notice, setNotice] = useState('')
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState({ q: '', isActive: '', tag: '' })
  const [editingEmployeeId, setEditingEmployeeId] = useState(null)
  const [busyEmployeeId, setBusyEmployeeId] = useState(null)
  const [actionBusyId, setActionBusyId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formOptions, setFormOptions] = useState({ destination_countries: [], salary_options_by_country: {}, agent_options: [] })
  const [attachmentFiles, setAttachmentFiles] = useState({})
  const [attachmentLabels, setAttachmentLabels] = useState({})
  const [existingAttachmentDocs, setExistingAttachmentDocs] = useState({})
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState({})
  const [savedTemplate, setSavedTemplate] = useState(null)
  const [processAgentAssignments, setProcessAgentAssignments] = useState({})
  const [openedEmployeeId, setOpenedEmployeeId] = useState(null)
  const [openedEmployeeMode, setOpenedEmployeeMode] = useState('full')
  const [returnRequestModalOpen, setReturnRequestModalOpen] = useState(false)
  const [returnRequestLoading, setReturnRequestLoading] = useState(false)
  const [returnRequestError, setReturnRequestError] = useState('')
  const [returnRequestSearch, setReturnRequestSearch] = useState('')
  const [returnRequestEmployees, setReturnRequestEmployees] = useState([])
  const [selectedReturnEmployeeId, setSelectedReturnEmployeeId] = useState('')
  const [returnRequestRemark, setReturnRequestRemark] = useState('')
  const [returnRequestEvidenceFiles, setReturnRequestEvidenceFiles] = useState([null, null, null])
  const [requestedReturns, setRequestedReturns] = useState([])
  const [requestedReturnsLoading, setRequestedReturnsLoading] = useState(false)
  const [previewDocument, setPreviewDocument] = useState(null)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 })
  const [previewDragging, setPreviewDragging] = useState(false)
  const [travelConfirmationDeclinedIds, setTravelConfirmationDeclinedIds] = useState(() => readTravelConfirmationDeclinedIds())
  const [travelConfirmationConfirmedIds, setTravelConfirmationConfirmedIds] = useState(() => readTravelConfirmationConfirmedIds())
  const [settledCommissionIds, setSettledCommissionIds] = useState([])
  const [activeStep, setActiveStep] = useState(0)
  const [dragOverAttachmentKey, setDragOverAttachmentKey] = useState('')
  const [otherDocumentsModalOpen, setOtherDocumentsModalOpen] = useState(false)
  const [floatingAttachmentPreview, setFloatingAttachmentPreview] = useState(null)
  const floatingAttachmentPreviewCloseTimer = useRef(null)
  const employeeModalFormRef = useRef(null)
  const [invalidStepErrors, setInvalidStepErrors] = useState({})
  const [attemptedRegistrationSteps, setAttemptedRegistrationSteps] = useState({})
  const [scanImportModalOpen, setScanImportModalOpen] = useState(false)
  const [cameraCaptureModalOpen, setCameraCaptureModalOpen] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const [cameraError, setCameraError] = useState('')
  const [uploadDocumentModalOpen, setUploadDocumentModalOpen] = useState(false)
  const [uploadDraftFile, setUploadDraftFile] = useState(null)
  const [uploadDocumentPurpose, setUploadDocumentPurpose] = useState('ocr')
  const [uploadError, setUploadError] = useState('')
  const [uploadDragActive, setUploadDragActive] = useState(false)
  const [scannerModalOpen, setScannerModalOpen] = useState(false)
  const [scannerStatus, setScannerStatus] = useState('idle')
  const [scannerDevices, setScannerDevices] = useState([])
  const [selectedScannerIndex, setSelectedScannerIndex] = useState(0)
  const [scannerError, setScannerError] = useState('')
  const [ocrImportSource, setOcrImportSource] = useState('')
  const [ocrImportFileName, setOcrImportFileName] = useState('')
  const [ocrImportFile, setOcrImportFile] = useState(null)
  const [ocrImportPreviewUrl, setOcrImportPreviewUrl] = useState('')
  const [attachmentStageFileName, setAttachmentStageFileName] = useState('')
  const [attachmentStageFile, setAttachmentStageFile] = useState(null)
  const [attachmentStagePreviewUrl, setAttachmentStagePreviewUrl] = useState('')
  const [ocrCachedResult, setOcrCachedResult] = useState(null)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrSetupModalOpen, setOcrSetupModalOpen] = useState(false)
  const [ocrStatus, setOcrStatus] = useState({ ready: false, message: '' })
  const [ocrStatusLoading, setOcrStatusLoading] = useState(false)
  const [scanAttachmentModalOpen, setScanAttachmentModalOpen] = useState(false)
  const [scanAttachmentSourceMode, setScanAttachmentSourceMode] = useState('scan')
  const [scanAttachmentKeys, setScanAttachmentKeys] = useState([])
  const [scanAttachmentRotation, setScanAttachmentRotation] = useState(0)
  const [scanAttachmentFlipX, setScanAttachmentFlipX] = useState(false)
  const [scanAttachmentFlipY, setScanAttachmentFlipY] = useState(false)
  const [scanAttachmentZoom, setScanAttachmentZoom] = useState(1)
  const [scanAttachmentOffset, setScanAttachmentOffset] = useState({ x: 0, y: 0 })
  const [scanAttachmentDragging, setScanAttachmentDragging] = useState(false)

  const openFloatingAttachmentPreview = useCallback((anchorEl, url, label) => {
    if (!anchorEl || !url) return
    const rect = anchorEl.getBoundingClientRect()
    const POPUP_WIDTH = 260
    const POPUP_HEIGHT = 190
    const OFFSET = 10
    const EDGE = 8

    let left = rect.left + rect.width / 2 - POPUP_WIDTH / 2
    left = Math.max(EDGE, Math.min(left, window.innerWidth - EDGE - POPUP_WIDTH))

    let top = rect.bottom + OFFSET
    if (top + POPUP_HEIGHT > window.innerHeight - EDGE) {
      top = rect.top - OFFSET - POPUP_HEIGHT
    }
    top = Math.max(EDGE, Math.min(top, window.innerHeight - EDGE - POPUP_HEIGHT))

    setFloatingAttachmentPreview({
      url,
      label: label || '',
      left,
      top,
      width: POPUP_WIDTH
    })
  }, [])

  const cancelFloatingAttachmentPreviewClose = useCallback(() => {
    if (floatingAttachmentPreviewCloseTimer.current) {
      window.clearTimeout(floatingAttachmentPreviewCloseTimer.current)
      floatingAttachmentPreviewCloseTimer.current = null
    }
  }, [])

  const scheduleFloatingAttachmentPreviewClose = useCallback(() => {
    cancelFloatingAttachmentPreviewClose()
    floatingAttachmentPreviewCloseTimer.current = window.setTimeout(() => {
      setFloatingAttachmentPreview(null)
    }, 120)
  }, [cancelFloatingAttachmentPreviewClose])
  const [scanAttachmentError, setScanAttachmentError] = useState('')
  const registrationRef = useRef(null)
  const scanUploadInputRef = useRef(null)
  const scanCameraVideoRef = useRef(null)
  const scanCameraCanvasRef = useRef(null)
  const scanCameraStreamRef = useRef(null)
  const scanCameraRequestRef = useRef(0)
  const scanAttachmentFrameRef = useRef(null)
  const scanAttachmentDragRef = useRef({ startX: 0, startY: 0, originX: 0, originY: 0 })
  const previewDragRef = useRef({ startX: 0, startY: 0, originX: 0, originY: 0 })
  const hasLoadedOnceRef = useRef(false)

  const canManageEmployees = Boolean(user?.feature_flags?.employees_enabled)
  const readOnly = Boolean(user?.is_read_only || user?.is_suspended)
  const isAgentSideUser = isAgentSideWorkspace(user)
  const canEditEmployeeRecords = !isAgentSideUser
  const isMainAgentAccount = user?.role === 'customer'
  const canManageOrganizationProcesses = user?.role === 'superadmin' || user?.role === 'admin'
  const canOverrideProgress = canManageOrganizationProcesses
  const selectedScope = isAgentSideUser ? 'mine' : 'organization'
  const age = computeAge(form.date_of_birth)

  const allowedEmployeeViewIds = useMemo(() => {
    return EMPLOYEE_VIEW_TABS
      .filter((tab) => {
        if (tab.id === 'selected') return isAgentSideUser
        if (tab.id === 'register') return canEditEmployeeRecords
        return true
      })
      .map((tab) => tab.id)
  }, [canEditEmployeeRecords, isAgentSideUser])

  const currentView = useMemo(() => {
    const raw = (searchParams.get('view') || '').trim()
    if (raw && allowedEmployeeViewIds.includes(raw)) return raw
    if (allowedEmployeeViewIds.includes('list')) return 'list'
    return allowedEmployeeViewIds[0] || 'list'
  }, [allowedEmployeeViewIds, searchParams])

  const setView = useCallback((nextView, { replace = false } = {}) => {
    const next = new URLSearchParams(searchParams)
    const current = (searchParams.get('view') || '').trim()
    if (current === nextView) return
    next.set('view', nextView)
    setSearchParams(next, { replace })
  }, [searchParams, setSearchParams])
  const stopCameraCapture = useCallback(() => {
    if (scanCameraStreamRef.current) {
      scanCameraStreamRef.current.getTracks().forEach((track) => track.stop())
      scanCameraStreamRef.current = null
    }
    if (scanCameraVideoRef.current) {
      scanCameraVideoRef.current.srcObject = null
    }
    setCameraStream(null)
  }, [])

  const closeCameraCapture = useCallback(() => {
    scanCameraRequestRef.current += 1
    stopCameraCapture()
    setCameraCaptureModalOpen(false)
    setCameraError('')
  }, [stopCameraCapture])

  const isTravelConfirmationDeclined = useCallback(
    (employee) => travelConfirmationDeclinedIds.includes(employee?.id),
    [travelConfirmationDeclinedIds]
  )
  const ageRestrictionError = age !== '' && age < MINIMUM_EMPLOYEE_AGE
    ? `Employee must be at least ${MINIMUM_EMPLOYEE_AGE} years old.`
    : ''

  const loadEmployees = useCallback(async (
    viewOverride,
    declinedIdsOverride = travelConfirmationDeclinedIds,
    confirmedIdsOverride = travelConfirmationConfirmedIds
  ) => {
    const shouldShowLoading = !hasLoadedOnceRef.current
    if (shouldShowLoading) setLoading(true)
    setPageError('')
    try {
      const isDeclinedById = (employee) => declinedIdsOverride.includes(employee?.id)
      const isVisibleForCurrentAgent = (employee) => !isAgentSideUser || employeeBelongsToCurrentAgent(employee, user)
      const applyTravelOverrides = (employee) => (
        confirmedIdsOverride.includes(employee?.id)
          ? {
              ...employee,
              did_travel: true,
              progress_override_complete: true
            }
          : employee
      )

      if (viewOverride === 'under-process') {
        const scope = isAgentSideUser ? 'mine' : 'organization'
        const baseEmployees = await fetchAllEmployeePages({
          q: filters.q,
          processScope: scope
        })
        const visibleProcessEmployees = baseEmployees.map(applyTravelOverrides).filter(
          (employee) =>
            isVisibleForCurrentAgent(employee) &&
            isEmployeeUnderProcess(employee) &&
            !isDeclinedById(employee)
        )
        setEmployeesData({
          count: visibleProcessEmployees.length,
          results: visibleProcessEmployees,
          next: null,
          previous: null
        })
        return
      }

      if (viewOverride === 'list') {
        const baseEmployees = await fetchAllEmployeePages({
          q: filters.q
        })
        let visibleListEmployees = baseEmployees.map(applyTravelOverrides)

        if (isAgentSideUser) {
          visibleListEmployees = visibleListEmployees.filter((employee) =>
            employeeAvailability(employee) === 'Available'
          )
        }

        if (filters.isActive === 'true') {
          visibleListEmployees = visibleListEmployees.filter((employee) => employeeAvailability(employee) === 'Available')
        }

        if (filters.isActive === 'false') {
          visibleListEmployees = visibleListEmployees.filter((employee) => employeeAvailability(employee) === 'Not available')
        }

        if (filters.tag) {
          visibleListEmployees = visibleListEmployees.filter((employee) =>
            employeeMatchesTagFilter(employee, filters.tag)
          )
        }

        setEmployeesData({
          count: visibleListEmployees.length,
          results: visibleListEmployees,
          next: null,
          previous: null
        })
        return
      }

      if (viewOverride === 'employed') {
        const scope = isAgentSideUser ? 'mine' : 'organization'
        const [baseEmployees, processEmployees] = await Promise.all([
          isAgentSideUser
            ? fetchAllEmployeePages({
                q: filters.q,
                employedScope: scope
              })
            : fetchAllEmployeePages({
                q: filters.q
              }),
          fetchAllEmployeePages({
            q: filters.q,
            processScope: scope
          })
        ])
        const stageEmployees = new Map()
        baseEmployees
          .map(applyTravelOverrides)
          .filter((employee) => isVisibleForCurrentAgent(employee) && isEmployeeInEmployedStage(employee))
          .forEach((employee) => stageEmployees.set(employee.id, employee))
        processEmployees
          .map(applyTravelOverrides)
          .filter((employee) => isVisibleForCurrentAgent(employee) && isEmployeeInEmployedStage(employee))
          .forEach((employee) => {
            if (!stageEmployees.has(employee.id)) {
              stageEmployees.set(employee.id, employee)
            }
          })
        const visibleEmployedEmployees = Array.from(stageEmployees.values())
          .filter((employee) => isEmployeeInEmployedStage(employee))
          .filter((employee) => !isDeclinedById(employee))
        setEmployeesData({
          count: visibleEmployedEmployees.length,
          results: visibleEmployedEmployees,
          next: null,
          previous: null
        })
        return
      }

      if (viewOverride === 'selected' && isAgentSideUser) {
        const baseEmployees = await fetchAllEmployeePages({
          q: filters.q
        })
        const visibleSelectedEmployees = baseEmployees
          .map(applyTravelOverrides)
          .filter((employee) => isEmployeeSelected(employee))
          .filter((employee) => isVisibleForCurrentAgent(employee))
        setEmployeesData({
          count: visibleSelectedEmployees.length,
          results: visibleSelectedEmployees,
          next: null,
          previous: null
        })
        return
      }

      if (viewOverride === 'returned' && isAgentSideUser) {
        const baseEmployees = await fetchAllEmployeePages({
          q: filters.q
        })
        const visibleReturnedEmployees = baseEmployees
          .map(applyTravelOverrides)
          .filter((employee) => isVisibleForCurrentAgent(employee) && isEmployeeReturned(employee))
        setEmployeesData({
          count: visibleReturnedEmployees.length,
          results: visibleReturnedEmployees,
          next: null,
          previous: null
        })
        return
      }

      const data = await employeesService.fetchEmployees({
        page,
        q: filters.q,
        isActive: '',
        selectedScope: viewOverride === 'selected' ? selectedScope : '',
        processScope: viewOverride === 'under-process' ? (isAgentSideUser ? 'mine' : 'organization') : '',
        employedScope: viewOverride === 'employed' ? (isAgentSideUser ? 'mine' : 'organization') : '',
        returnedScope: viewOverride === 'returned' ? (isAgentSideUser ? 'mine' : 'organization') : ''
      })
      setEmployeesData(data)
      hasLoadedOnceRef.current = true
    } catch (err) {
      setPageError(err.message || 'Failed to load employees')
      setEmployeesData(null)
    } finally {
      if (shouldShowLoading) setLoading(false)
    }
  }, [filters, isAgentSideUser, page, selectedScope, travelConfirmationDeclinedIds, travelConfirmationConfirmedIds])

  const loadFormOptions = useCallback(async () => {
    try {
      setFormOptions(await employeesService.fetchEmployeeFormOptions())
    } catch {
      setFormOptions({ destination_countries: [], salary_options_by_country: {}, agent_options: [] })
    }
  }, [])

  useEffect(() => {
    if (canManageEmployees) {
      loadFormOptions()
    } else {
      setLoading(false)
    }
  }, [canManageEmployees, loadFormOptions])

  useEffect(() => {
    if (!canManageEmployees) return
    loadEmployees(currentView)
  }, [canManageEmployees, currentView, loadEmployees])

  const loadReturnRequestEmployees = useCallback(async (search = '') => {
    setReturnRequestLoading(true)
    try {
      const scope = isAgentSideUser ? 'mine' : 'organization'
      const [baseEmployees, processEmployees] = await Promise.all([
        isAgentSideUser
          ? fetchAllEmployeePages({
              q: search,
              employedScope: scope
            })
          : fetchAllEmployeePages({
              q: search
            }),
        fetchAllEmployeePages({
          q: search,
          processScope: scope
        })
      ])
      const stageEmployees = new Map()
      baseEmployees
        .map((employee) => (
          travelConfirmationConfirmedIds.includes(employee?.id)
            ? { ...employee, did_travel: true, progress_override_complete: true }
            : employee
        ))
        .filter((employee) => isEmployeeEmployed(employee))
        .forEach((employee) => stageEmployees.set(employee.id, employee))
      processEmployees
        .map((employee) => (
          travelConfirmationConfirmedIds.includes(employee?.id)
            ? { ...employee, did_travel: true, progress_override_complete: true }
            : employee
        ))
        .filter((employee) => isEmployeeEmployed(employee))
        .forEach((employee) => {
          if (!stageEmployees.has(employee.id)) {
            stageEmployees.set(employee.id, employee)
          }
        })
      setReturnRequestEmployees(
        Array.from(stageEmployees.values()).filter((employee) => (
          isEmployeeEmployed(employee) &&
          employee.return_request?.status !== 'pending'
        ))
      )
    } catch (err) {
      setPageError(err.message || 'Could not load employed employees')
      setReturnRequestEmployees([])
    } finally {
      setReturnRequestLoading(false)
    }
  }, [isAgentSideUser, travelConfirmationConfirmedIds])

  const loadRequestedReturns = useCallback(async () => {
    if (currentView !== 'returned') {
      setRequestedReturns([])
      return
    }
    setRequestedReturnsLoading(true)
    try {
      const data = await employeesService.fetchEmployees({
        page: 1,
        q: filters.q,
        employedScope: isAgentSideUser ? 'mine' : 'organization'
      })
      setRequestedReturns((data.results || []).filter((employee) => employee.return_request?.status === 'pending'))
    } catch (err) {
      setPageError(err.message || 'Could not load requested returns')
      setRequestedReturns([])
    } finally {
      setRequestedReturnsLoading(false)
    }
  }, [currentView, filters.q, isAgentSideUser])

  useEffect(() => {
    if (!canManageEmployees || currentView !== 'returned') {
      setRequestedReturns([])
      setRequestedReturnsLoading(false)
      return
    }
    loadRequestedReturns()
  }, [canManageEmployees, currentView, loadRequestedReturns])

  useEffect(() => {
    if (notice) showToast(notice, { tone: 'success' })
  }, [notice, showToast])

  useEffect(() => {
    if (pageError) showToast(pageError, { tone: 'danger', title: 'Action failed' })
  }, [pageError, showToast])

  useEffect(() => {
    if (modalNotice) showToast(modalNotice, { tone: 'success' })
  }, [modalNotice, showToast])

  useEffect(() => {
    if (modalError) showToast(modalError, { tone: 'danger', title: 'Action failed' })
  }, [modalError, showToast])

  useEffect(() => {
    if (!scanCameraVideoRef.current) return
    scanCameraVideoRef.current.srcObject = cameraStream
  }, [cameraStream])

  useEffect(() => () => {
    stopCameraCapture()
  }, [stopCameraCapture])

  useEffect(() => () => {
    if (ocrImportPreviewUrl && typeof URL !== 'undefined') {
      URL.revokeObjectURL(ocrImportPreviewUrl)
    }
  }, [ocrImportPreviewUrl])

  useEffect(() => {
    if (typeof URL === 'undefined') return () => {}
    const nextUrls = {}
    for (const [key, file] of Object.entries(attachmentFiles || {})) {
      if (!file) continue
      nextUrls[key] = URL.createObjectURL(file)
    }

    setAttachmentPreviewUrls((prev) => {
      for (const url of Object.values(prev || {})) {
        if (!url) continue
        URL.revokeObjectURL(url)
      }
      return nextUrls
    })

    return () => {
      for (const url of Object.values(nextUrls)) {
        if (!url) continue
        URL.revokeObjectURL(url)
      }
    }
  }, [attachmentFiles])

  useEffect(() => () => {
    if (attachmentStagePreviewUrl && typeof URL !== 'undefined') {
      URL.revokeObjectURL(attachmentStagePreviewUrl)
    }
  }, [attachmentStagePreviewUrl])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const rawTemplate = window.localStorage.getItem(REGISTRATION_TEMPLATE_STORAGE_KEY)
      if (!rawTemplate) return
      setSavedTemplate(applyRegistrationTemplate(JSON.parse(rawTemplate)))
    } catch {
      setSavedTemplate(null)
    }
  }, [])

  const patchEmployeeCollections = useCallback((employeeId, updater) => {
    setEmployeesData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        results: prev.results
          .map((employee) => (employee.id === employeeId ? updater(employee) : employee))
          .filter(Boolean)
      }
    })

    setRequestedReturns((prev) =>
      prev
        .map((employee) => (employee.id === employeeId ? updater(employee) : employee))
        .filter(Boolean)
    )
  }, [])

  useEffect(() => {
    if (!previewDragging) return undefined

    function handlePointerMove(event) {
      const { startX, startY, originX, originY } = previewDragRef.current
      setPreviewOffset({
        x: originX + (event.clientX - startX),
        y: originY + (event.clientY - startY)
      })
    }

    function handlePointerUp() {
      setPreviewDragging(false)
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)

    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [previewDragging])

  useEffect(() => {
    if (!scanAttachmentDragging) return undefined

    function handlePointerMove(event) {
      const { startX, startY, originX, originY } = scanAttachmentDragRef.current
      setScanAttachmentOffset({
        x: originX + (event.clientX - startX),
        y: originY + (event.clientY - startY)
      })
    }

    function handlePointerUp() {
      setScanAttachmentDragging(false)
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)

    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [scanAttachmentDragging])

  useEffect(() => {
    if (currentView !== 'register') return
    const stepError = invalidStepErrors[activeStep]
    if (!stepError) return
    const target = getValidationTarget(stepError)
    if (!target || target.step !== activeStep || !target.selector || !registrationRef.current) return
    const timer = window.setTimeout(() => {
      const element = registrationRef.current?.querySelector(target.selector)
      if (element && typeof element.focus === 'function') {
        element.focus()
        if (typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    }, 40)
    return () => window.clearTimeout(timer)
  }, [activeStep, currentView, invalidStepErrors])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const settlements = await readStoredSettlements()
      if (cancelled) return
      setSettledCommissionIds(
        settlements.flatMap((settlement) => (settlement.employeeIds || []).map((id) => String(id)))
      )
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const availableSkillOptions = useMemo(() => PROFESSION_SKILLS[form.profession] || [], [form.profession])
  const salaryOptions = useMemo(() => {
    const values = new Set()
    form.application_countries.forEach((country) => {
      ;(formOptions.salary_options_by_country[country] || []).forEach((salary) => values.add(salary))
    })
    return Array.from(values)
  }, [form.application_countries, formOptions.salary_options_by_country])

  const hasSavedTemplate = Boolean(savedTemplate)
  const createFormFromTemplate = useCallback(() => applyRegistrationTemplate(savedTemplate), [savedTemplate])
  const activeOcrCacheKey = buildOcrCacheKey(ocrImportFile)
  const hasAnalyzedScan = Boolean(activeOcrCacheKey && ocrCachedResult?.cacheKey === activeOcrCacheKey)
  const scanAttachmentSourceFile = scanAttachmentSourceMode === 'upload' ? attachmentStageFile : ocrImportFile
  const scanAttachmentSourceFileName = scanAttachmentSourceMode === 'upload' ? attachmentStageFileName : ocrImportFileName
  const scanAttachmentSourcePreviewUrl = scanAttachmentSourceMode === 'upload' ? attachmentStagePreviewUrl : ocrImportPreviewUrl

  const clearScannedDocument = useCallback(() => {
    setOcrImportSource('')
    setOcrImportFileName('')
    setOcrImportFile(null)
    setOcrImportPreviewUrl('')
    setOcrCachedResult(null)
    setOcrBusy(false)
    setScanAttachmentModalOpen(false)
    setScanAttachmentSourceMode('scan')
    setScanAttachmentKeys([])
    setScanAttachmentRotation(0)
    setScanAttachmentFlipX(false)
    setScanAttachmentFlipY(false)
    setScanAttachmentZoom(1)
    setScanAttachmentOffset({ x: 0, y: 0 })
    setScanAttachmentDragging(false)
    setScanAttachmentError('')
  }, [])

  const clearAttachmentStageDocument = useCallback(() => {
    setAttachmentStageFileName('')
    setAttachmentStageFile(null)
    setAttachmentStagePreviewUrl('')
  }, [])

  const resetForm = useCallback(() => {
    setEditingEmployeeId(null)
    setForm(emptyForm)
    setAttachmentFiles({})
    setAttachmentLabels({})
    setExistingAttachmentDocs({})
    setActiveStep(0)
    setScanImportModalOpen(false)
    clearScannedDocument()
    setModalError('')
    setModalNotice('')
  }, [clearScannedDocument])

  const openCreateModal = () => {
    setEditingEmployeeId(null)
    setForm(createFormFromTemplate())
    setAttachmentFiles({})
    setAttachmentLabels({})
    setExistingAttachmentDocs({})
    setActiveStep(0)
    setPageError('')
    setModalError('')
    setModalNotice('')
    setNotice('')
    setScanImportModalOpen(false)
    clearScannedDocument()
    setPage(1)
    setView('register')
  }

  const handleSaveTemplate = () => {
    const nextTemplate = buildRegistrationTemplate(form)
    setSavedTemplate(nextTemplate)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(REGISTRATION_TEMPLATE_STORAGE_KEY, JSON.stringify(nextTemplate))
    }
    setNotice('')
    setModalNotice('Registration template saved for future new employees.')
  }

  const handleClearTemplate = () => {
    setSavedTemplate(null)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(REGISTRATION_TEMPLATE_STORAGE_KEY)
    }
    setNotice('')
    setModalNotice('Registration template cleared.')
  }

  const handleResetRegistrationToTemplate = () => {
    const hasTemplate = Boolean(savedTemplate)
    setForm(hasTemplate ? createFormFromTemplate() : emptyForm)
    setAttachmentFiles({})
    setAttachmentLabels({})
    setExistingAttachmentDocs({})
    setActiveStep(0)
    setModalError('')
    setModalNotice(
      hasTemplate
        ? 'Registration reset to the saved template. Current scanned document is still available for Auto fill.'
        : 'Registration reset to a blank form. Current scanned document is still available for Auto fill.'
    )
  }

  const openScanImportModal = () => {
    setScanImportModalOpen(true)
    setModalError('')
  }

  const checkOcrStatus = async () => {
    setOcrStatusLoading(true)
    try {
      const status = await employeesService.fetchEmployeeOcrStatus()
      const normalizedStatus = status.ready
        ? status
        : { ...status, message: normalizeOcrStatusMessage(status.message) }
      setOcrStatus(normalizedStatus)
      if (normalizedStatus.ready) {
        setOcrSetupModalOpen(false)
        setModalNotice('OCR service is ready. Try Auto fill again.')
      }
      return normalizedStatus
    } catch (err) {
      const status = { ready: false, message: normalizeOcrStatusMessage(err?.message) }
      setOcrStatus(status)
      return status
    } finally {
      setOcrStatusLoading(false)
    }
  }

  const openOcrSetupModal = async () => {
    setOcrSetupModalOpen(true)
    await checkOcrStatus()
  }

  const closeOcrSetupModal = () => {
    setOcrSetupModalOpen(false)
  }

  const closeScanImportModal = () => {
    setScanImportModalOpen(false)
  }

  const openUploadDocumentModal = (purpose = 'ocr') => {
    setScanImportModalOpen(false)
    setUploadDocumentPurpose(purpose)
    setUploadDocumentModalOpen(true)
    setUploadDraftFile(null)
    setUploadError('')
    setUploadDragActive(false)
    if (scanUploadInputRef.current) {
      scanUploadInputRef.current.value = ''
    }
  }

  const closeUploadDocumentModal = () => {
    setUploadDocumentModalOpen(false)
    setUploadDraftFile(null)
    setUploadDocumentPurpose('ocr')
    setUploadError('')
    setUploadDragActive(false)
    if (scanUploadInputRef.current) {
      scanUploadInputRef.current.value = ''
    }
  }

  const backToScanOptionsFromUpload = () => {
    closeUploadDocumentModal()
    setScanImportModalOpen(true)
  }

  const handleUploadDraftPick = (file) => {
    if (!file) return
    if (!attachmentFileAllowed(file)) {
      setUploadDraftFile(null)
      setUploadError('Upload must be a PDF, JPG, JPEG, or PNG file.')
      return
    }
    setUploadError('')
    setUploadDraftFile(file)
  }

  const handleUploadDrop = (event) => {
    event.preventDefault()
    setUploadDragActive(false)
    handleUploadDraftPick(event.dataTransfer.files?.[0] || null)
  }

  const submitUploadDocument = () => {
    if (!uploadDraftFile) {
      setUploadError('Choose a document before continuing.')
      return
    }
    const selectedFile = uploadDraftFile
    const purpose = uploadDocumentPurpose
    closeUploadDocumentModal()
    if (purpose === 'attachment') {
      handleAttachmentStagePick(selectedFile)
      setTimeout(() => {
        setScanAttachmentError('')
        setScanAttachmentKeys([ATTACHMENT_FIELDS[0].key])
        setScanAttachmentRotation(0)
        setScanAttachmentFlipX(false)
        setScanAttachmentFlipY(false)
        setScanAttachmentZoom(1)
        setScanAttachmentOffset({ x: 0, y: 0 })
        setScanAttachmentDragging(false)
        setScanAttachmentModalOpen(true)
        setModalNotice('Generic document uploaded. Adjust it and attach the visible area to the selected attachment slots.')
      }, 0)
      return
    }
    handleOcrDocumentPick('upload', selectedFile)
  }

  const checkScannerService = async () => {
    setScannerStatus('checking')
    setScannerError('')
    try {
      const { devices } = await checkAspriseScannerService()
      setScannerDevices(devices)
      setSelectedScannerIndex(0)
      setScannerStatus(devices.length > 0 ? 'ready' : 'no-devices')
      if (devices.length === 0) {
        setScannerError('No scanner source was found. Connect a scanner and install its TWAIN/WIA driver, then check again.')
      }
    } catch (err) {
      setScannerDevices([])
      setScannerStatus('service-missing')
      setScannerError(err?.message || 'Asprise Scanner or its local scan app is not ready.')
    }
  }

  const openScannerModal = () => {
    setScanImportModalOpen(false)
    setScannerModalOpen(true)
    setScannerDevices([])
    setSelectedScannerIndex(0)
    setScannerError('')
    setScannerStatus('checking')
    window.setTimeout(() => {
      checkScannerService()
    }, 0)
  }

  const closeScannerModal = () => {
    resetAspriseScannerService()
    setScannerModalOpen(false)
    setScannerError('')
  }

  const backToScanOptionsFromScanner = () => {
    closeScannerModal()
    setScanImportModalOpen(true)
  }

  const backToScanOptionsFromCamera = () => {
    closeCameraCapture()
    setScanImportModalOpen(true)
  }

  const scanFromSelectedScanner = async () => {
    const device = scannerDevices[selectedScannerIndex]
    setScannerStatus('scanning')
    setScannerError('')
    try {
      const file = await scanWithAspriseScanner(device)
      closeScannerModal()
      handleOcrDocumentPick('scanner', file)
    } catch (err) {
      setScannerStatus(scannerDevices.length > 0 ? 'ready' : 'service-missing')
      setScannerError(err?.message || 'Scanner acquisition failed.')
    }
  }

  const openCameraCapture = async () => {
    const requestId = scanCameraRequestRef.current + 1
    scanCameraRequestRef.current = requestId
    setScanImportModalOpen(false)
    setCameraError('')

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraCaptureModalOpen(true)
      setCameraError('This browser does not support direct camera capture. Use scanner or upload instead.')
      return
    }

    try {
      stopCameraCapture()
      setCameraCaptureModalOpen(true)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1600 },
          height: { ideal: 1200 }
        },
        audio: false
      })
      if (scanCameraRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      scanCameraStreamRef.current = stream
      setCameraStream(stream)
    } catch (err) {
      setCameraCaptureModalOpen(true)
      setCameraError(err?.message || 'Could not access the camera. Check browser permissions and try again.')
    }
  }

  const triggerScanImport = (source) => {
    if (source === 'camera') {
      openCameraCapture()
      return
    }
    if (source === 'upload') {
      openUploadDocumentModal()
      return
    }
    if (source === 'scanner') {
      openScannerModal()
      return
    }
    const inputRef = scanUploadInputRef
    setScanImportModalOpen(false)
    if (!inputRef.current) return
    inputRef.current.value = ''
    inputRef.current.click()
  }

  const captureCameraDocument = () => {
    const video = scanCameraVideoRef.current
    const canvas = scanCameraCanvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setCameraError('Camera preview is not ready yet.')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      setCameraError('Could not prepare the camera capture.')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError('Could not capture the camera frame.')
        return
      }
      const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
      closeCameraCapture()
      handleOcrDocumentPick('camera', file)
    }, 'image/jpeg', 0.92)
  }

  const handleOcrDocumentPick = (source, file) => {
    if (!file) return
    if (!attachmentFileAllowed(file)) {
      setModalError('Scan imports must be PDF, JPG, JPEG, or PNG files only.')
      return
    }
    setModalError('')
    setActiveStep(0)
    setOcrImportSource(source)
    setOcrImportFileName(file.name || 'Selected document')
    setOcrImportFile(file)
    setOcrImportPreviewUrl(typeof URL !== 'undefined' ? URL.createObjectURL(file) : '')
    setOcrCachedResult(null)
    setOcrBusy(false)
    setScanAttachmentError('')
    const sourceLabel =
      source === 'camera'
        ? 'Camera capture'
        : source === 'scanner'
          ? 'Scanner import'
          : 'Document upload'

    setModalNotice(
      `${sourceLabel} is ready for OCR. ` +
      'Move through the registration steps and use Auto fill to map detected text into the matching fields.'
    )
  }

  const handleAttachmentStagePick = (file) => {
    if (!file) return
    if (!attachmentFileAllowed(file)) {
      setUploadError('Upload must be a PDF, JPG, JPEG, or PNG file.')
      return
    }
    setAttachmentStageFileName(file.name || 'Selected document')
    setAttachmentStageFile(file)
    setAttachmentStagePreviewUrl(typeof URL !== 'undefined' ? URL.createObjectURL(file) : '')
  }

  const handleAutoFillFromScan = async () => {
    if (!ocrImportFile) {
      setModalNotice('')
      setModalError('Scan, capture, or upload a document from the first step before using auto fill.')
      setActiveStep(0)
      return
    }
    const cacheKey = buildOcrCacheKey(ocrImportFile)
    const hasCachedResult = ocrCachedResult?.cacheKey === cacheKey
    if (!hasCachedResult) {
      setModalNotice('')
      setModalError('Analyze the scanned document first, then use Auto fill for the current step.')
      return
    }
    setModalError('')
    setModalNotice(
      `Using the analyzed OCR result for ${REGISTRATION_STEPS[activeStep].label.toLowerCase()} fields...`
    )

    try {
      const result = ocrCachedResult
      const updatesByStep = result?.updatesByStep && typeof result.updatesByStep === 'object' ? result.updatesByStep : {}
      const updates = updatesByStep[String(activeStep)] && typeof updatesByStep[String(activeStep)] === 'object'
        ? updatesByStep[String(activeStep)]
        : result?.updates && typeof result.updates === 'object'
          ? result.updates
          : {}
      const updatedFields = Object.keys(updates)
      if (updatedFields.length === 0) {
        setModalNotice(
          'OCR finished, but no matching fields were found for this step.'
        )
        return
      }

      setForm((prev) => ({ ...prev, ...updates }))
      const fieldLabels = updatedFields
        .map((field) => EMPLOYEE_OCR_FIELD_LABELS[field] || field.replace(/_/g, ' '))
        .slice(0, 5)
        .join(', ')
      setModalNotice(
        `OCR filled ${updatedFields.length} ${updatedFields.length === 1 ? 'field' : 'fields'} for ${REGISTRATION_STEPS[activeStep].label.toLowerCase()}: ` +
        `${fieldLabels}${updatedFields.length > 5 ? ', ...' : ''}.`
      )
    } catch (err) {
      setModalNotice('')
      const rawMessage = err?.message || 'OCR could not read this scanned document.'
      const message = normalizeOcrStatusMessage(rawMessage)
      setModalError(message)
      if (rawMessage.includes('Backend OCR is not configured yet') || rawMessage.toLowerCase().includes('ocr service is not reachable')) {
        setOcrStatus({ ready: false, message })
        await openOcrSetupModal()
      }
    }
  }

  const handleAnalyzeScan = async () => {
    if (!ocrImportFile) {
      setModalNotice('')
      setModalError('Scan, capture, or upload a document from the first step before analyzing it.')
      setActiveStep(0)
      return
    }
    setModalError('')
    setOcrBusy(true)
    const cacheKey = buildOcrCacheKey(ocrImportFile)
    const hasCachedResult = ocrCachedResult?.cacheKey === cacheKey
    if (hasCachedResult) {
      setModalNotice('This scanned document is already analyzed. Use Auto fill on any step to apply the detected fields.')
      setOcrBusy(false)
      return
    }

    setModalNotice(`Analyzing ${ocrImportFileName || 'the scanned document'} and preparing OCR matches for all registration steps...`)

    try {
      const result = await employeesService.extractEmployeeDocumentFields(ocrImportFile, 0, formOptions)
      const updatesByStep = result?.updatesByStep && typeof result.updatesByStep === 'object' ? result.updatesByStep : {}
      const mappedFieldCount = Object.values(updatesByStep).reduce((count, value) => {
        if (!value || typeof value !== 'object') return count
        return count + Object.keys(value).length
      }, 0)
      setOcrCachedResult({ ...result, cacheKey })
      setModalNotice(
        mappedFieldCount > 0
          ? `Analysis completed. OCR found ${mappedFieldCount} mapped ${mappedFieldCount === 1 ? 'field' : 'fields'} across the registration steps.`
          : 'Analysis completed, but no matching registration fields were found. You can still rescan or attach the document.'
      )
    } catch (err) {
      setModalNotice('')
      const rawMessage = err?.message || 'OCR could not read this scanned document.'
      const message = normalizeOcrStatusMessage(rawMessage)
      setModalError(message)
      if (rawMessage.includes('Backend OCR is not configured yet') || rawMessage.toLowerCase().includes('ocr service is not reachable')) {
        setOcrStatus({ ready: false, message })
        await openOcrSetupModal()
      }
    } finally {
      setOcrBusy(false)
    }
  }

  const openScanAttachmentModal = (sourceMode = 'scan') => {
    const selectedSourceFile = sourceMode === 'upload' ? attachmentStageFile : ocrImportFile
    const missingMessage = sourceMode === 'upload'
      ? 'Upload a generic document before attaching it.'
      : 'Select or analyze a scanned document from step 1 before attaching it.'
    if (!selectedSourceFile) {
      setModalNotice('')
      setModalError(missingMessage)
      return
    }
    setScanAttachmentSourceMode(sourceMode)
    const missingRequiredKeys = MANDATORY_ATTACHMENT_KEYS.filter((key) => !attachmentFiles[key] && !existingAttachmentDocs[key])
    setScanAttachmentKeys(missingRequiredKeys.length > 0 ? missingRequiredKeys : [ATTACHMENT_FIELDS[0].key])
    setScanAttachmentRotation(0)
    setScanAttachmentFlipX(false)
    setScanAttachmentFlipY(false)
    setScanAttachmentZoom(1)
    setScanAttachmentOffset({ x: 0, y: 0 })
    setScanAttachmentDragging(false)
    setScanAttachmentError('')
    setModalError('')
    setScanAttachmentModalOpen(true)
  }

  const closeScanAttachmentModal = () => {
    setScanAttachmentModalOpen(false)
    setScanAttachmentDragging(false)
    setScanAttachmentError('')
  }

  const handleScanAttachmentKeyToggle = (key) => {
    setScanAttachmentKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    )
  }

  const handleScanAttachmentWheel = (event) => {
    if (!scanAttachmentSourceFile?.type?.startsWith('image/')) return
    event.preventDefault()
    const frame = scanAttachmentFrameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    const point = {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2
    }
    setScanAttachmentZoom((prev) => {
      const next = Math.min(5, Math.max(1, Number((prev + (event.deltaY < 0 ? 0.18 : -0.18)).toFixed(2))))
      setScanAttachmentOffset((offset) => {
        if (next === 1) return { x: 0, y: 0 }
        const ratio = next / prev
        return {
          x: point.x - (point.x - offset.x) * ratio,
          y: point.y - (point.y - offset.y) * ratio
        }
      })
      return next
    })
  }

  useEffect(() => {
    const frame = scanAttachmentFrameRef.current
    if (!frame || !scanAttachmentModalOpen || !scanAttachmentSourceFile?.type?.startsWith('image/')) return undefined
    const handleWheel = (event) => handleScanAttachmentWheel(event)
    frame.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      frame.removeEventListener('wheel', handleWheel)
    }
  }, [handleScanAttachmentWheel, scanAttachmentModalOpen, scanAttachmentSourceFile])

  const handleScanAttachmentPointerDown = (event) => {
    if (!scanAttachmentSourceFile?.type?.startsWith('image/') || scanAttachmentZoom <= 1) return
    scanAttachmentDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: scanAttachmentOffset.x,
      originY: scanAttachmentOffset.y
    }
    setScanAttachmentDragging(true)
  }

  const resetScanAttachmentView = () => {
    setScanAttachmentZoom(1)
    setScanAttachmentOffset({ x: 0, y: 0 })
    setScanAttachmentDragging(false)
  }

  const buildAdjustedScanAttachment = async () => {
    if (!scanAttachmentSourceFile) throw new Error('No scanned document is ready.')
    if (!scanAttachmentSourceFile.type?.startsWith('image/')) return scanAttachmentSourceFile
    if (typeof document === 'undefined' || !scanAttachmentSourcePreviewUrl) return scanAttachmentSourceFile

    const image = await loadImageFromUrl(scanAttachmentSourcePreviewUrl)
    const frame = scanAttachmentFrameRef.current
    const frameWidth = Math.max(1, Math.round(frame?.clientWidth || image.naturalWidth))
    const frameHeight = Math.max(1, Math.round(frame?.clientHeight || image.naturalHeight))
    const pixelRatio = 2
    const imageRatio = image.naturalWidth / image.naturalHeight
    const frameRatio = frameWidth / frameHeight
    const drawWidth = imageRatio > frameRatio ? frameWidth : frameHeight * imageRatio
    const drawHeight = imageRatio > frameRatio ? frameWidth / imageRatio : frameHeight
    const rotation = ((scanAttachmentRotation % 360) + 360) % 360
    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = Math.round(frameWidth * pixelRatio)
    outputCanvas.height = Math.round(frameHeight * pixelRatio)
    const outputContext = outputCanvas.getContext('2d')
    if (!outputContext) throw new Error('Could not prepare the adjusted scanned image.')
    outputContext.fillStyle = '#ffffff'
    outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height)
    outputContext.scale(pixelRatio, pixelRatio)
    outputContext.translate(frameWidth / 2 + scanAttachmentOffset.x, frameHeight / 2 + scanAttachmentOffset.y)
    outputContext.rotate((rotation * Math.PI) / 180)
    outputContext.scale(
      (scanAttachmentFlipX ? -1 : 1) * scanAttachmentZoom,
      (scanAttachmentFlipY ? -1 : 1) * scanAttachmentZoom
    )
    outputContext.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)

    const blob = await new Promise((resolve, reject) => {
      outputCanvas.toBlob((nextBlob) => {
        if (nextBlob) resolve(nextBlob)
        else reject(new Error('Could not create the adjusted scanned attachment.'))
      }, 'image/jpeg', 0.92)
    })
    return new File([blob], `scan-attachment-${Date.now()}.jpg`, { type: 'image/jpeg' })
  }

  const attachSelectedFromScan = async () => {
    if (scanAttachmentKeys.length === 0) {
      setScanAttachmentError('Select at least one attachment type.')
      return
    }
    setScanAttachmentError('')
    try {
      const file = await buildAdjustedScanAttachment()
      setAttachmentFiles((prev) => {
        const next = { ...prev }
        scanAttachmentKeys.forEach((key) => {
          next[key] = file
        })
        return next
      })
      setModalNotice(`${scanAttachmentKeys.length} attachment${scanAttachmentKeys.length === 1 ? '' : 's'} attached from the scanned document.`)
      closeScanAttachmentModal()
    } catch (err) {
      setScanAttachmentError(err?.message || 'Could not attach from the scanned document.')
    }
  }

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

  const handleAttachmentPick = (key, file) => {
    if (file && !attachmentFileAllowed(file)) {
      setModalError('Attachments must be PDF, JPG, JPEG, or PNG files only.')
      return
    }
    setModalError('')
    setAttachmentFiles((prev) => ({ ...prev, [key]: file || null }))
  }

  const validateAttachmentDates = () => {
    for (const attachment of ATTACHMENT_FIELDS) {
      if (!attachment.expiryField) continue
      if (attachmentFiles[attachment.key] && !form[attachment.expiryField]) {
        throw new Error(`${attachment.label} date is required when a file is selected.`)
      }
    }
    for (const key of MANDATORY_ATTACHMENT_KEYS) {
      const existingDocument = editingEmployeeId ? Boolean(existingAttachmentDocs[key]) : false
      if (!attachmentFiles[key] && !existingDocument) {
        const attachment = ATTACHMENT_FIELDS.find((item) => item.key === key)
        throw new Error(`${attachment?.label || key} is required.`)
      }
    }
  }

  const uploadPendingAttachments = async (employeeId) => {
    validateAttachmentDates()
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

  const submitRegistration = async () => {
    if (!canEditEmployeeRecords) {
      setModalError('Only organization-side users can edit employee records.')
      return
    }
    if (ageRestrictionError) {
      setModalError(ageRestrictionError)
      setActiveStep(0)
      return
    }
    const validationError = validateEmployeeForm(form)
    if (validationError) {
      setModalError(validationError)
      const targetStep = getValidationStep(validationError)
      if (targetStep !== null) setActiveStep(targetStep)
      return
    }
    setSaving(true)
    setModalError('')
    setNotice('')
    setModalNotice('')
    try {
      const payload = buildEmployeePayload(form, editingEmployeeId)
      const employee = editingEmployeeId ? await employeesService.updateEmployee(editingEmployeeId, payload) : await employeesService.createEmployee(payload)
      await uploadPendingAttachments(employee.id)
      if (editingEmployeeId) {
        setNotice('Employee updated successfully.')
        setPage(1)
        setView('list')
        resetForm()
      } else {
        setNotice('Employee registered successfully.')
        setModalNotice('Employee registered successfully. The form is ready for the next employee.')
        setEditingEmployeeId(null)
        setForm(createFormFromTemplate())
        setAttachmentFiles({})
        setAttachmentLabels({})
        setExistingAttachmentDocs({})
        setActiveStep(0)
        clearScannedDocument()
        setPage(1)
        setView('register')
      }
      await Promise.all([loadEmployees(currentView), loadFormOptions()])
    } catch (err) {
      const nextError = err.message || 'Could not save employee'
      setModalError(nextError)
      const targetStep = getValidationStep(nextError)
      if (targetStep !== null) setActiveStep(targetStep)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (employeeId) => {
    if (!canEditEmployeeRecords) {
      setPageError('Only organization-side users can edit employee records.')
      return
    }
    setBusyEmployeeId(employeeId)
    setPageError('')
    setModalError('')
    setModalNotice('')
    setNotice('')
    try {
      const employee = await employeesService.fetchEmployee(employeeId)
      setEditingEmployeeId(employee.id)
      setForm(normalizeEmployeeForm(employee))
      const nextLabels = {}
      const nextExistingDocs = {}
      ;(employee.documents || []).forEach((document) => {
        nextLabels[document.document_type] = document.label || ''
        nextExistingDocs[document.document_type] = document
      })
      setAttachmentLabels(nextLabels)
      setExistingAttachmentDocs(nextExistingDocs)
      setAttachmentFiles({})
      setActiveStep(0)
      clearScannedDocument()
      setPage(1)
      setView('register')
    } catch (err) {
      setPageError(err.message || 'Could not load employee details')
    } finally {
      setBusyEmployeeId(null)
    }
  }

  const handleDelete = async (employee) => {
    const confirmed = await confirm({
      title: 'Remove employee',
      message: `Remove employee "${employee.full_name}"?`,
      confirmLabel: 'Remove',
      cancelLabel: 'Keep',
      tone: 'danger'
    })
    if (!confirmed) return
    setPageError('')
    setNotice('')
    try {
      await employeesService.deleteEmployee(employee.id)
      if (editingEmployeeId === employee.id) resetForm()
      setNotice('Employee removed.')
      await loadEmployees(currentView)
    } catch (err) {
      setPageError(err.message || 'Could not delete employee')
    }
  }

  const handleDeleteDocument = async (documentId) => {
    setPageError('')
    setNotice('')
    try {
      await employeesService.deleteEmployeeDocument(documentId)
      setNotice('Document removed.')
      await loadEmployees(currentView)
    } catch (err) {
      setPageError(err.message || 'Could not delete document')
    }
  }

  const openReturnRequestModal = async () => {
    setReturnRequestModalOpen(true)
    setReturnRequestError('')
    setReturnRequestSearch('')
    setSelectedReturnEmployeeId('')
    setReturnRequestRemark('')
    setReturnRequestEvidenceFiles([null, null, null])
    await loadReturnRequestEmployees('')
  }

  const closeReturnRequestModal = () => {
    setReturnRequestModalOpen(false)
    setReturnRequestError('')
    setReturnRequestSearch('')
    setSelectedReturnEmployeeId('')
    setReturnRequestRemark('')
    setReturnRequestEvidenceFiles([null, null, null])
  }

  const handleReturnRequestEvidencePick = (index, file) => {
    if (file && !attachmentFileAllowed(file)) {
      setReturnRequestError('Attachments must be PDF, JPG, JPEG, or PNG files only.')
      return
    }
    setReturnRequestError('')
    setReturnRequestEvidenceFiles((prev) => prev.map((item, itemIndex) => itemIndex === index ? file || null : item))
  }

  const handleSubmitReturnRequest = async () => {
    if (!selectedReturnEmployeeId) {
      setReturnRequestError('Choose an employed employee first.')
      return
    }
    if (!returnRequestRemark.trim()) {
      setReturnRequestError('Add a remark explaining the reason for initiating the return.')
      return
    }
    if (!returnRequestEvidenceFiles.some(Boolean)) {
      setReturnRequestError('Attach at least one evidence document.')
      return
    }

    setReturnRequestLoading(true)
    setReturnRequestError('')
    setNotice('')
    try {
      await employeesService.createEmployeeReturnRequest(selectedReturnEmployeeId, {
        remark: returnRequestRemark.trim(),
        evidenceFiles: returnRequestEvidenceFiles.filter(Boolean)
      })
      setNotice('Return request submitted successfully.')
      closeReturnRequestModal()
      await Promise.all([loadEmployees(currentView), loadRequestedReturns()])
    } catch (err) {
      setReturnRequestError(err.message || 'Could not create return request')
    } finally {
      setReturnRequestLoading(false)
    }
  }

  const handleApproveEmploymentReturn = async (employee) => {
    const confirmed = await confirm({
      title: 'Acknowledge return',
      message: 'Acknowledge this return request and move the employee to Returned list?',
      confirmLabel: 'Acknowledge',
      cancelLabel: 'Cancel',
      tone: 'warning'
    })
    if (!confirmed) return
    setActionBusyId(employee.id)
    setPageError('')
    setNotice('')
    try {
      await employeesService.approveEmployeeReturnRequest(employee.id)
      patchEmployeeCollections(employee.id, (current) => ({
        ...current,
        returned_from_employment: true,
        return_status: 'returned',
        return_request: current.return_request
          ? { ...current.return_request, status: 'approved' }
          : { status: 'approved' }
      }))
      setRequestedReturns((prev) => prev.filter((item) => item.id !== employee.id))
      setNotice('Return request approved and employee moved to Returned list.')
    } catch (err) {
      setPageError(err.message || 'Could not approve employee return')
    } finally {
      setActionBusyId(null)
    }
  }

  const handleRefuseEmployeeReturnRequest = async (employee) => {
    const confirmed = await confirm({
      title: 'Refuse return request',
      message: 'Refuse this return request and keep the employee in the Employed list?',
      confirmLabel: 'Refuse request',
      cancelLabel: 'Cancel',
      tone: 'danger'
    })
    if (!confirmed) return
    setActionBusyId(employee.id)
    setPageError('')
    setNotice('')
    try {
      await employeesService.refuseEmployeeReturnRequest(employee.id)
      patchEmployeeCollections(employee.id, (current) => ({
        ...current,
        return_request: current.return_request
          ? { ...current.return_request, status: 'refused' }
          : null
      }))
      setRequestedReturns((prev) => prev.filter((item) => item.id !== employee.id))
      setNotice('Return request refused.')
    } catch (err) {
      setPageError(err.message || 'Could not refuse return request')
    } finally {
      setActionBusyId(null)
    }
  }

  const handleCancelEmployeeReturnRequest = async (employee) => {
    const confirmed = await confirm({
      title: 'Cancel return request',
      message: 'Cancel this return request?',
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep',
      tone: 'warning'
    })
    if (!confirmed) return
    setActionBusyId(employee.id)
    setPageError('')
    setNotice('')
    try {
      await employeesService.cancelEmployeeReturnRequest(employee.id)
      patchEmployeeCollections(employee.id, (current) => ({
        ...current,
        return_request: null
      }))
      setRequestedReturns((prev) => prev.filter((item) => item.id !== employee.id))
      setNotice('Return request cancelled.')
    } catch (err) {
      setPageError(err.message || 'Could not cancel return request')
    } finally {
      setActionBusyId(null)
    }
  }

  const handleReinstateEmployeeEmployment = async (employee) => {
    const confirmed = await confirm({
      title: 'Restore employed status',
      message: 'Move this employee from Returned list back to Employed?',
      confirmLabel: 'Restore',
      cancelLabel: 'Cancel',
      tone: 'warning'
    })
    if (!confirmed) return
    setActionBusyId(employee.id)
    setPageError('')
    setNotice('')
    try {
      await employeesService.updateEmployee(employee.id, {
        returned_from_employment: false
      })
      patchEmployeeCollections(employee.id, (current) => {
        const nextEmployee = {
          ...current,
          returned_from_employment: false,
          return_status: 'pending',
          return_request: current.return_request
            ? { ...current.return_request, status: 'reinstated' }
            : null
        }

        if (currentView === 'returned') return null
        return nextEmployee
      })
      setNotice('Employee moved back to Employed.')
    } catch (err) {
      setPageError(err.message || 'Could not restore employee to employed')
    } finally {
      setActionBusyId(null)
    }
  }

  const handleAvailabilityAction = async (employee, nextStatus, actionLabel) => {
    setActionBusyId(employee.id)
    setPageError('')
    setNotice('')
    try {
      await employeesService.updateEmployee(employee.id, { status: nextStatus })
      setNotice(`Employee ${actionLabel.toLowerCase()} successfully.`)
      await loadEmployees(currentView)
    } catch (err) {
      setPageError(err.message || `Could not ${actionLabel.toLowerCase()} employee`)
    } finally {
      setActionBusyId(null)
    }
  }

  const handleToggleSelectedEmployee = async (employee) => {
    setActionBusyId(employee.id)
    setPageError('')
    setNotice('')
    try {
      if (employee.selection_state?.selected_by_current_agent) {
        await employeesService.unselectEmployee(employee.id)
        setNotice('Employee removed from Selected Employees.')
        await loadEmployees(currentView === 'selected' ? 'selected' : currentView)
      } else {
        await employeesService.selectEmployee(employee.id)
        setNotice('Employee added to Selected Employees.')
        setPage(1)
        await loadEmployees(currentView)
      }
    } catch (err) {
      setPageError(err.message || 'Could not update employee selection')
    } finally {
      setActionBusyId(null)
    }
  }

  const handleStartProcess = async (employee) => {
    const organizationName = user?.organization?.name || 'organization'
    const assignedAgentId = resolvedProcessAgentId(employee, processAgentAssignments, formOptions.agent_options)
    if (employee.status !== 'approved') {
      setPageError('Only approved employees can have a process initiated.')
      return
    }
    if (canManageOrganizationProcesses && !assignedAgentId) {
      setPageError('Choose an agent before starting the process.')
      return
    }
    const confirmed = await confirm({
      title: 'Initiate process',
      message: `Initiating a procees will inform the ${organizationName} to proceed to the arrangement of the employee documents.`,
      confirmLabel: 'Initiate',
      cancelLabel: 'Cancel',
      tone: 'warning'
    })
    if (!confirmed) return

    setActionBusyId(employee.id)
    setPageError('')
    setNotice('')
    try {
      await employeesService.startEmployeeProcess(employee.id, {
        agentId: canManageOrganizationProcesses ? assignedAgentId : undefined
      })
      const isReadyForNextStage = (employee?.progress_status?.overall_completion ?? 0) >= 100
      const nextProcessNotice = employee?.did_travel
        ? 'Employee process started and the employee is now visible in Employed.'
        : isReadyForNextStage
          ? 'Employee process started and the employee is now visible in Employed under Travel confirmation pending.'
          : 'Employee moved to Under process Employees.'
      setNotice(nextProcessNotice)
      if (currentView !== 'under-process') {
        setOpenedEmployeeId((prev) => (prev === employee.id ? null : prev))
      }
      await loadEmployees(currentView)
    } catch (err) {
      setPageError(err.message || 'Could not start employee process')
    } finally {
      setActionBusyId(null)
    }
  }

  const handleDeclineProcess = async (employee) => {
    const confirmed = await confirm({
      title: 'Decline process',
      message: 'Declining this process will remove the employee from Under process Employees and return them to the selected employees workflow.',
      confirmLabel: 'Decline',
      cancelLabel: 'Keep',
      tone: 'danger'
    })
    if (!confirmed) return

    setActionBusyId(employee.id)
    setPageError('')
    setNotice('')
    try {
      await employeesService.declineEmployeeProcess(employee.id)
      setNotice('Employee removed from Under process Employees and returned to Selected Employees.')
      if (currentView === 'under-process') {
        setOpenedEmployeeId((prev) => (prev === employee.id ? null : prev))
      }
      await loadEmployees(currentView)
    } catch (err) {
      setPageError(err.message || 'Could not decline employee process')
    } finally {
      setActionBusyId(null)
    }
  }

  const handleMarkProgressComplete = async (employee) => {
    const currentProgress = employee.progress_status?.overall_completion ?? 0
    const alreadyComplete = currentProgress >= 100

    if (alreadyComplete) {
      const didTravel = await confirm({
        title: 'Confirm travel',
        message: 'Has this employee travelled now? Confirming travel will move the employee into Employed.',
        confirmLabel: 'Yes',
        cancelLabel: 'No',
        tone: 'warning'
      })

      setActionBusyId(employee.id)
      setPageError('')
      setNotice('')
      try {
        const nextDeclinedIds = didTravel
          ? travelConfirmationDeclinedIds.filter((id) => id !== employee.id)
          : Array.from(new Set([...travelConfirmationDeclinedIds, employee.id]))
        const nextConfirmedIds = didTravel
          ? Array.from(new Set([...travelConfirmationConfirmedIds, employee.id]))
          : travelConfirmationConfirmedIds.filter((id) => id !== employee.id)
        setTravelConfirmationDeclinedIds(nextDeclinedIds)
        writeTravelConfirmationDeclinedIds(nextDeclinedIds)
        setTravelConfirmationConfirmedIds(nextConfirmedIds)
        writeTravelConfirmationConfirmedIds(nextConfirmedIds)
        await employeesService.updateEmployee(employee.id, {
          progress_override_complete: didTravel,
          did_travel: didTravel
        })
        const refreshedEmployee = await employeesService.fetchEmployee(employee.id)
        setEmployeesData((prev) => {
          if (!prev) return prev
          const otherEmployees = (prev.results || []).filter((item) => item.id !== employee.id)
          return didTravel
            ? {
                ...prev,
                results: [refreshedEmployee, ...otherEmployees]
              }
            : {
                ...prev,
                results: otherEmployees
              }
        })
        setNotice(
          didTravel
            ? 'Employee travel confirmed and moved into Employed.'
            : 'Employee returned to Under process until travel is confirmed.'
        )
        await loadEmployees(currentView, nextDeclinedIds, nextConfirmedIds)
      } catch (err) {
        setPageError(err.message || 'Could not confirm employee travel')
      } finally {
        setActionBusyId(null)
      }
      return
    }

    const today = new Date()
    const departureDate = employee.departure_date ? new Date(employee.departure_date) : null
    const hasValidDepartureDate = Boolean(departureDate && !Number.isNaN(departureDate.getTime()))
    const hasDepartureReached = hasValidDepartureDate
      ? departureDate <= new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)
      : false
    const departureText = hasValidDepartureDate
      ? ` The recorded departure date is ${formatDateForPrompt(employee.departure_date)}.`
      : ''
    const didTravel = await confirm({
      title: 'Confirm travel',
      message: `Did this Employee Travled?${departureText}${hasDepartureReached ? ' The departure date is today or earlier.' : ''}`,
      confirmLabel: 'Yes',
      cancelLabel: 'No',
      tone: 'warning'
    })

    setActionBusyId(employee.id)
    setPageError('')
    setNotice('')
    try {
      const nextDeclinedIds = travelConfirmationDeclinedIds.filter((id) => id !== employee.id)
      const nextConfirmedIds = didTravel
        ? Array.from(new Set([...travelConfirmationConfirmedIds, employee.id]))
        : travelConfirmationConfirmedIds.filter((id) => id !== employee.id)
      setTravelConfirmationDeclinedIds(nextDeclinedIds)
      writeTravelConfirmationDeclinedIds(nextDeclinedIds)
      setTravelConfirmationConfirmedIds(nextConfirmedIds)
      writeTravelConfirmationConfirmedIds(nextConfirmedIds)
      await employeesService.updateEmployee(employee.id, {
        progress_override_complete: true,
        did_travel: didTravel
      })
      setNotice(
        didTravel
          ? 'Employee progress marked as 100% and travel confirmed.'
          : 'Employee progress marked as 100%. Travel remains pending.'
      )
      await loadEmployees(currentView, nextDeclinedIds, nextConfirmedIds)
    } catch (err) {
      setPageError(err.message || 'Could not mark employee progress complete')
    } finally {
      setActionBusyId(null)
    }
  }

  const validateStep = (stepIndex) => {
    return validateStepFields(form, stepIndex, ageRestrictionError, validateAttachmentDates)
  }

  const computeInvalidStepErrors = (attemptedSteps) => {
    const errors = {}
    for (let index = 0; index <= 4; index += 1) {
      if (!attemptedSteps || !attemptedSteps[index]) continue
      const message = validateStep(index)
      if (message) errors[index] = message
    }
    return errors
  }

  const syncEmployeeModalFieldValidity = useCallback((formEl, stepIndex) => {
    if (!formEl) return

    const setValidity = (fieldName, message) => {
      if (!fieldName) return
      const el = formEl.querySelector(`[name="${CSS.escape(fieldName)}"]`)
      if (el && typeof el.setCustomValidity === 'function') {
        el.setCustomValidity(message || '')
      }
    }

    // Clear previous custom validity.
    ;[
      'mobile_number',
      'passport_number',
      'id_number',
      'labour_id',
      'contact_person_mobile',
      'phone',
      'email',
      'contact_person_id_number'
    ].forEach((name) => setValidity(name, ''))
    formEl.querySelectorAll('input[name^="experience_years_"]').forEach((el) => {
      if (el && typeof el.setCustomValidity === 'function') el.setCustomValidity('')
    })

    if (stepIndex === 0) {
      if (ageRestrictionError) {
        setValidity('date_of_birth', ageRestrictionError)
      }
      if (form.mobile_number.trim() && !isValidPhoneNumber(form.mobile_number)) {
        setValidity('mobile_number', 'Enter a valid mobile number.')
      }
      if (form.passport_number.trim() && !isValidDocumentNumber(form.passport_number)) {
        setValidity('passport_number', 'Passport number is invalid.')
      }
      if (form.id_number.trim() && !isValidDocumentNumber(form.id_number)) {
        setValidity('id_number', 'ID number is invalid.')
      }
      if (form.labour_id.trim() && !isValidDocumentNumber(form.labour_id)) {
        setValidity('labour_id', 'Labour ID is invalid.')
      }
    }

    if (stepIndex === 2) {
      if (!isValidPhoneNumber(form.phone)) {
        setValidity('phone', 'Enter a valid secondary phone number.')
      }
      if ((form.contact_person_mobile || '').trim() && !isValidPhoneNumber(form.contact_person_mobile)) {
        setValidity('contact_person_mobile', 'Enter a valid contact person mobile number.')
      }
      if (!isValidEmailAddress(form.email)) {
        setValidity('email', 'Enter a valid email address.')
      }
      if (!isValidDocumentNumber(form.contact_person_id_number)) {
        setValidity('contact_person_id_number', 'Contact person ID number is invalid.')
      }
    }
  }, [form])

  const getValidationFieldForStep = useCallback((message, stepIndex) => {
    if (!message) return ''
    const normalized = String(message).toLowerCase()

    if (stepIndex === 0) {
      if (normalized.includes('first name is required')) return 'first_name'
      if (normalized.includes('middle name is required')) return 'middle_name'
      if (normalized.includes('last name is required')) return 'last_name'
      if (normalized.includes('date of birth is required')) return 'date_of_birth'
      if (normalized.includes('at least') && normalized.includes('age')) return 'date_of_birth'
      if (normalized.includes('gender is required')) return 'gender'
      if (normalized.includes('passport number is required')) return 'passport_number'
      if (normalized.includes('mobile number is required')) return 'mobile_number'
      if (normalized.includes('valid mobile number')) return 'mobile_number'
      if (normalized.includes('passport number may only')) return 'passport_number'
      if (normalized.includes('id number may only')) return 'id_number'
      if (normalized.includes('labour id may only')) return 'labour_id'
      return ''
    }

    if (stepIndex === 1) {
      if (normalized.includes('religion is required')) return 'religion'
      if (normalized.includes('marital status is required')) return 'marital_status'
      if (normalized.includes('residence country is required')) return 'residence_country'
      if (normalized.includes('weight cannot be negative')) return 'weight_kg'
      if (normalized.includes('height cannot be negative')) return 'height_cm'
      if (normalized.includes('children count cannot be negative')) return 'children_count'
      return ''
    }

    if (stepIndex === 2) {
      if (normalized.includes('contact person name is required')) return 'contact_person_name'
      if (normalized.includes('contact person mobile is required')) return 'contact_person_mobile'
      if (normalized.includes('valid secondary phone')) return 'phone'
      if (normalized.includes('valid contact person mobile')) return 'contact_person_mobile'
      if (normalized.includes('valid email')) return 'email'
      if (normalized.includes('contact person id number')) return 'contact_person_id_number'
      return ''
    }

    if (stepIndex === 3) {
      if (normalized.includes('destination country')) return 'application_countries'
      if (normalized.includes('profession is required')) return 'profession'
      if (normalized.includes('type is required')) return 'employment_type'
      if (normalized.includes('salary is required')) return 'application_salary'
      if (normalized.includes('select at least one skill')) return 'skills'
      if (normalized.includes('select at least one language')) return 'languages'
      if (normalized.includes('fill in years')) return 'experiences'
      if (normalized.includes('salary cannot be negative')) return 'application_salary'
      return ''
    }

    return ''
  }, [])

  const highlightEmployeeModalValidationTarget = useCallback((message, stepIndex) => {
    const formEl = employeeModalFormRef.current
    if (!formEl) return

    // Clear existing invalid markers first.
    formEl.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'))

    syncEmployeeModalFieldValidity(formEl, stepIndex)
    const fieldName = getValidationFieldForStep(message, stepIndex)
    if (!fieldName) return

    let target = formEl.querySelector(`[name="${CSS.escape(fieldName)}"]`)

    // Special-case: "Experiences" validation is about the *years* input for the first selected country.
    if (fieldName === 'experiences') {
      const rows = Array.from(formEl.querySelectorAll('.experience-row'))
      const firstInvalidYears = rows
        .map((row) => ({
          country: row.querySelector('select[name^="experience_country_"]'),
          years: row.querySelector('input[name^="experience_years_"]')
        }))
        .find(({ country, years }) => {
          const countryValue = country && 'value' in country ? String(country.value || '').trim() : ''
          const yearsValue = years && 'value' in years ? String(years.value || '').trim() : ''
          return countryValue && !yearsValue
        })?.years

      if (firstInvalidYears instanceof HTMLElement) {
        target = firstInvalidYears
        if (typeof target.setCustomValidity === 'function') {
          target.setCustomValidity('Years is required.')
        }
      }
    }

    if (!(target instanceof HTMLElement)) return
    target.setAttribute('aria-invalid', 'true')
    const checkboxGrid = target.closest('.checkbox-grid')
    if (checkboxGrid instanceof HTMLElement) checkboxGrid.setAttribute('aria-invalid', 'true')
    if (typeof target.focus === 'function') target.focus()
  }, [getValidationFieldForStep, syncEmployeeModalFieldValidity])

  useEffect(() => {
    const formEl = employeeModalFormRef.current
    if (!formEl) return
    const handler = (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (!(target.matches('input, select, textarea'))) return
      if (!target.hasAttribute('aria-invalid')) return
      if (typeof target.checkValidity === 'function' && target.checkValidity()) {
        target.removeAttribute('aria-invalid')
      }
    }
    formEl.addEventListener('input', handler, true)
    formEl.addEventListener('change', handler, true)
    return () => {
      formEl.removeEventListener('input', handler, true)
      formEl.removeEventListener('change', handler, true)
    }
  }, [])

  const goToNextStep = () => {
    const stepError = validateStep(activeStep)
    if (stepError) {
      setModalError(stepError)
      const targetStep = getValidationStep(stepError)
      if (targetStep !== null) setActiveStep(targetStep)
      const nextAttempted = {
        ...attemptedRegistrationSteps,
        [activeStep]: true,
        ...(targetStep !== null ? { [targetStep]: true } : {})
      }
      setAttemptedRegistrationSteps(nextAttempted)
      setInvalidStepErrors(computeInvalidStepErrors(nextAttempted))
      requestAnimationFrame(() => {
        highlightEmployeeModalValidationTarget(stepError, targetStep ?? activeStep)
      })
      return
    }
    setModalError('')
    const nextAttempted = { ...attemptedRegistrationSteps, [activeStep]: true }
    setAttemptedRegistrationSteps(nextAttempted)
    setInvalidStepErrors(computeInvalidStepErrors(nextAttempted))
    setActiveStep((prev) => Math.min(REGISTRATION_STEPS.length - 1, prev + 1))
  }

  const goToPreviousStep = () => {
    setModalError('')
    setActiveStep((prev) => Math.max(0, prev - 1))
  }

  if (!canManageEmployees) return <Navigate to="/dashboard" replace />

  const employees = employeesData?.results ?? []
  const visibleEmployees = employees.map((employee) => ({
    ...employee,
    settled_commission: employee?.settled_commission || settledCommissionIds.includes(String(employee.id))
  }))
  const primaryVisibleEmployees = visibleEmployees
  const total = employeesData?.count ?? employees.length
  const hasNext = Boolean(employeesData?.next)
  const hasPrev = Boolean(employeesData?.previous)
  const modalEmployees = [...visibleEmployees, ...requestedReturns]
  const openedEmployee = openedEmployeeId
    ? modalEmployees.find((employee) => employee.id === openedEmployeeId) || null
    : null
  const visibleTabs = EMPLOYEE_VIEW_TABS.filter((tab) => {
    if (tab.id === 'selected') return isAgentSideUser
    if (tab.id === 'register') return canEditEmployeeRecords
    return true
  })
  const openedEmployeeProgress = buildProgressDonut(openedEmployee?.progress_status)
  const openedEmployeeProfileDocument = employeeProfilePhoto(openedEmployee)
  const openedEmployeeIsReturned = isEmployeeReturned(openedEmployee)
  const openedEmployeeIsEmployed = isEmployeeEmployedInView(openedEmployee, currentView)
  const openedEmployeeReturnRequest = openedEmployee?.return_request || null
  const canApproveOpenedEmployeeReturn = Boolean(
    openedEmployee &&
    !openedEmployeeIsReturned &&
    openedEmployeeReturnRequest?.status === 'pending' &&
    canManageOrganizationProcesses
  )
  const canRefuseOpenedEmployeeReturn = canApproveOpenedEmployeeReturn
  const canCancelOpenedEmployeeReturnRequest = Boolean(
    openedEmployee &&
    !openedEmployeeIsReturned &&
    openedEmployeeReturnRequest?.status === 'pending' &&
    isAgentSideUser &&
    openedEmployee.selection_state?.selected_by_current_agent
  )
  const canReinstateOpenedEmployeeEmployment = Boolean(
    openedEmployee &&
    openedEmployeeIsReturned &&
    canManageOrganizationProcesses
  )
  const openDocumentPreview = useCallback((payload) => {
    setPreviewDocument(payload)
    setPreviewZoom(1)
    setPreviewOffset({ x: 0, y: 0 })
    setPreviewDragging(false)
  }, [])
  const closeDocumentPreview = useCallback(() => {
    setPreviewDocument(null)
    setPreviewZoom(1)
    setPreviewOffset({ x: 0, y: 0 })
    setPreviewDragging(false)
  }, [])
  const handlePreviewZoomIn = useCallback(() => {
    setPreviewZoom((prev) => Math.min(4, Number((prev + 0.25).toFixed(2))))
  }, [])
  const handlePreviewZoomOut = useCallback(() => {
    setPreviewZoom((prev) => {
      const next = Math.max(1, Number((prev - 0.25).toFixed(2)))
      if (next === 1) setPreviewOffset({ x: 0, y: 0 })
      return next
    })
  }, [])
  const handlePreviewReset = useCallback(() => {
    setPreviewZoom(1)
    setPreviewOffset({ x: 0, y: 0 })
    setPreviewDragging(false)
  }, [])
  const handlePreviewDownload = useCallback(async () => {
    if (!previewDocument?.url || typeof window === 'undefined') return
    try {
      const blob = await fetchPreviewBlob(previewDocument.url)
      const objectUrl = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = buildDownloadName(previewDocument.label, previewDocument.url)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      const anchor = document.createElement('a')
      anchor.href = previewDocument.url
      anchor.download = buildDownloadName(previewDocument.label, previewDocument.url)
      anchor.rel = 'noreferrer'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    }
  }, [previewDocument])
  const handlePreviewPrint = useCallback(async () => {
    if (!previewDocument?.url || typeof window === 'undefined') return
    let objectUrl = ''
    try {
      const blob = await fetchPreviewBlob(previewDocument.url)
      objectUrl = window.URL.createObjectURL(blob)
      const printWindow = window.open('', '_blank')
      if (!printWindow) return

      const escapedTitle = String(previewDocument.label || 'Document preview')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
      const previewScreenBackground = readCssCustomProperty('--preview-window-screen-bg') || 'Canvas'
      const previewPaperBackground = readCssCustomProperty('--preview-window-paper-bg') || 'Canvas'

      if (previewDocument.isImage) {
        printWindow.document.write(`
          <!doctype html>
          <html>
            <head>
              <title>${escapedTitle}</title>
              <style>
                html, body { margin: 0; background: ${previewScreenBackground}; }
                body {
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                }
                img {
                  max-width: 100%;
                  max-height: 100vh;
                  object-fit: contain;
                }
                @media print {
                  html, body { background: ${previewPaperBackground}; }
                }
              </style>
            </head>
            <body>
              <img src="${objectUrl}" alt="${escapedTitle}" onload="setTimeout(() => window.print(), 150)" />
            </body>
          </html>
        `)
        printWindow.document.close()
      } else {
        printWindow.location.href = objectUrl
        window.setTimeout(() => {
          try {
            printWindow.focus()
            printWindow.print()
          } catch {}
        }, 700)
      }

      window.setTimeout(() => {
        if (objectUrl) window.URL.revokeObjectURL(objectUrl)
      }, 60000)
    } catch {
      const fallbackWindow = window.open(previewDocument.url, '_blank')
      if (!fallbackWindow) return
      window.setTimeout(() => {
        try {
          fallbackWindow.focus()
          fallbackWindow.print()
        } catch {}
      }, 700)
    }
  }, [previewDocument])
  const handlePreviewWheel = useCallback((event) => {
    if (!previewDocument?.isImage) return
    event.preventDefault()
    if (event.deltaY < 0) {
      setPreviewZoom((prev) => Math.min(4, Number((prev + 0.2).toFixed(2))))
      return
    }
    setPreviewZoom((prev) => {
      const next = Math.max(1, Number((prev - 0.2).toFixed(2)))
      if (next === 1) setPreviewOffset({ x: 0, y: 0 })
      return next
    })
  }, [previewDocument])
  const handlePreviewPointerDown = useCallback((event) => {
    if (!previewDocument?.isImage || previewZoom <= 1) return
    previewDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: previewOffset.x,
      originY: previewOffset.y
    }
    setPreviewDragging(true)
  }, [previewDocument, previewOffset, previewZoom])

  return (
    <section className="dashboard-panel employees-page">
      <div className="page-panel-header">
        <div>
          <h1>Employees</h1>
          <p className="muted-text">
            {isAgentSideUser
              ? 'Select employees from the organization list, then complete the remaining information and attachments for your agent side.'
              : 'Register employees from the organization side, monitor selections, and review progress directly on the page.'}
          </p>
          {readOnly ? <p className="muted-text">Employee changes are disabled while this organization is read-only.</p> : null}
        </div>
        <div className="employees-header-actions">
          <button type="button" className="btn-secondary" onClick={loadEmployees} disabled={loading}>Refresh</button>
        </div>
      </div>
      {currentView !== 'register' ? (
        <form className="form-grid employees-filter-grid" onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters((prev) => ({ ...prev, q: searchInput.trim() })) }}>
          <label>
            Search
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Name, passport, mobile, profession" />
          </label>
          <label>
            Availability
            <select value={filters.isActive} onChange={(event) => { setPage(1); setFilters((prev) => ({ ...prev, isActive: event.target.value })) }}>
              <option value="">All employees</option>
              <option value="true">Available</option>
              <option value="false">Not available</option>
            </select>
          </label>
          <label>
            Tag
            <select value={filters.tag} onChange={(event) => { setPage(1); setFilters((prev) => ({ ...prev, tag: event.target.value })) }}>
              {EMPLOYEE_TAG_FILTER_OPTIONS.map((option) => (
                <option key={option.value || 'all-tags'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-secondary">Apply filters</button>
        </form>
      ) : null}
      {pageError ? <p className="error-message">{pageError}</p> : null}
      {notice && currentView !== 'register' ? <p className="muted-text message-block--mb-16">{notice}</p> : null}
      {currentView === 'register' ? (
        <div className="users-table-wrap employee-registration-surface">
          <div ref={registrationRef} className="employee-modal employee-modal--flat" aria-labelledby="employee-modal-title">
            {!editingEmployeeId ? (
              null
            ) : null}
            <div className="employee-registration-layout">
              <aside className="employee-registration-sidebar">
                <div className="employee-registration-sidebar-header">
                  <div>
                    <h2 id="employee-modal-title">Employee Registration</h2>
                    <p className="muted-text">Step {activeStep + 1} of {REGISTRATION_STEPS.length}</p>
                  </div>
                  <div className="employee-registration-progress">
                    <div className="employee-registration-progress-bar" aria-hidden="true">
                      <span style={{ width: `${Math.round(((activeStep + 1) / REGISTRATION_STEPS.length) * 100)}%` }} />
                    </div>
                    <span className="muted-text">
                      {Math.round(((activeStep + 1) / REGISTRATION_STEPS.length) * 100)}% complete
                    </span>
                  </div>
                </div>

                <div className="employee-registration-step-list" role="tablist" aria-label="Registration steps">
                  {REGISTRATION_STEPS.map((step, index) => {
                    const description =
                      step.id === 'personal'
                        ? 'Basic identity details'
                        : step.id === 'profile'
                          ? 'Professional information'
                          : step.id === 'contact'
                            ? 'Address and contact details'
                            : step.id === 'application'
                              ? 'Job and application details'
                              : step.id === 'attachments'
                                ? 'Upload required documents'
                                : 'Review and submit'

                    return (
                      <button
                        key={step.id}
                        type="button"
                        className={`employee-registration-step${index === activeStep ? ' is-active' : ''}`}
                        aria-selected={index === activeStep}
                        onClick={() => setActiveStep(index)}
                      >
                        {invalidStepErrors[index] ? (
                          <span
                            className="employee-registration-step-badge"
                            aria-label="Step has invalid fields"
                            title="This step has an invalid field"
                          />
                        ) : null}
                        <span className="employee-registration-step-index" aria-hidden="true">{index + 1}</span>
                        <span className="employee-registration-step-copy">
                          <strong>{step.label}</strong>
                          <span className="muted-text">{description}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="employee-registration-help">
                  <strong>Need help</strong>
                  <p className="muted-text">If you need further assistance, please contact the Organization Admin.</p>
                  <div className="employee-registration-help-tooltip" role="tooltip" aria-label="OCR tips">
                    <p className="employee-modal-eyebrow">Tips for best results</p>
                    <ul className="employee-registration-help-tooltip-list">
                      <li>Use a clear, well-lit image</li>
                      <li>Ensure all corners are visible</li>
                      <li>Avoid shadows and glare</li>
                      <li>Supported: JPG, PNG, PDF</li>
                    </ul>
                  </div>
                </div>
              </aside>

              <div className="employee-registration-main">
                <div className="employee-registration-top">
                  {activeStep === 0 ? (
                    <div className="employee-scan-launch-card">
                      <div className="employee-scan-launch-copy">
                        <p className="employee-modal-eyebrow">Quickly fill your details</p>
                        <h3>Scan passport or ID</h3>
                        <p className="muted-text">
                          Upload or scan a clear photo of the passport or ID to auto-fill the form fields.
                        </p>
                        {ocrImportFileName ? (
                          <p className="employee-scan-launch-meta">
                            Last selected: {ocrImportFileName}
                            {ocrImportSource ? ` (${
                              ocrImportSource === 'camera'
                                ? 'From camera'
                                : ocrImportSource === 'scanner'
                                  ? 'From scanner'
                                  : 'Upload a document'
                            })` : ''}
                          </p>
                        ) : null}
                      </div>
                      <div className="employee-scan-launch-actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleAnalyzeScan()
                          }}
                          disabled={ocrBusy || !ocrImportFileName}
                        >
                          {ocrBusy ? 'Analyzing...' : 'Analyze'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleAutoFillFromScan()
                          }}
                          disabled={ocrBusy || !ocrImportFileName || !hasAnalyzedScan}
                        >
                          Auto fill
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={(event) => {
                            event.stopPropagation()
                            clearScannedDocument()
                          }}
                          disabled={ocrBusy || !ocrImportFileName}
                        >
                          Reset
                        </button>
                        <button type="button" className="btn-secondary employee-scan-launch-action" onClick={openScanImportModal}>
                          Scan passport or ID
                        </button>
                      </div>
                    </div>
                  ) : activeStep > 0 && activeStep < 4 ? (
                    <div className="employee-scan-step-assist">
                      <div>
                        <strong>Auto fill from the scanned document</strong>
                        <span>{ocrImportFileName ? ocrImportFileName : 'No scanned document selected yet'}</span>
                      </div>
                      <div className="employee-scan-step-actions">
                        <button type="button" className="btn-secondary" onClick={handleAutoFillFromScan} disabled={ocrBusy || !ocrImportFileName || !hasAnalyzedScan}>
                          Auto fill
                        </button>
                      </div>
                    </div>
                  ) : activeStep === 4 ? (
                    <div className="employee-scan-step-assist">
                      <div>
                        <strong>Attach documents</strong>
                        <span>{scanAttachmentSourceFileName ? scanAttachmentSourceFileName : 'No scanned document selected yet'}</span>
                      </div>
                      <div className="employee-scan-step-actions">
                        <button type="button" className="btn-secondary" onClick={() => openScanAttachmentModal('scan')} disabled={!ocrImportFile}>
                          Attach from scan
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => openScanAttachmentModal('upload')} disabled={!attachmentStageFile}>
                          Attach from upload
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => openUploadDocumentModal('attachment')}>
                          Upload generic document
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="employee-registration-flow" aria-label="Document steps">
                    <div className="employee-registration-flow-step">
                      <span className="employee-registration-flow-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-6Z" />
                          <path d="M14 2v6h6" />
                        </svg>
                      </span>
                      <div>
                        <strong>Upload document</strong>
                        <span className="muted-text">Upload a clear photo of your passport or ID</span>
                      </div>
                    </div>
                    <div className="employee-registration-flow-arrow" aria-hidden="true">→</div>
                    <div className="employee-registration-flow-step">
                      <span className="employee-registration-flow-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4 4h16v16H4V4Z" />
                          <path d="M7 8h10" />
                          <path d="M7 12h7" />
                          <path d="M7 16h5" />
                        </svg>
                      </span>
                      <div>
                        <strong>Extract information</strong>
                        <span className="muted-text">We’ll extract and verify the details</span>
                      </div>
                    </div>
                    <div className="employee-registration-flow-arrow" aria-hidden="true">→</div>
                    <div className="employee-registration-flow-step">
                      <span className="employee-registration-flow-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 7 10 17l-5-5" />
                        </svg>
                      </span>
                      <div>
                        <strong>Review &amp; confirm</strong>
                        <span className="muted-text">Review the extracted information before saving</span>
                      </div>
                    </div>
                  </div>

                  <div className="employee-registration-tips">
                    <p className="employee-modal-eyebrow">Tips for best results</p>
                    <ul className="employee-registration-tips-list">
                      <li>Use a clear, well-lit image</li>
                      <li>Ensure all corners are visible</li>
                      <li>Avoid shadows and glare</li>
                      <li>Supported: JPG, PNG, PDF</li>
                    </ul>
                  </div>
                </div>

                {modalNotice ? <p className="alert employee-modal-notice">{modalNotice}</p> : null}
                {invalidStepErrors[activeStep] ? (
                  <p className="error-message employee-modal-error">{invalidStepErrors[activeStep]}</p>
                ) : null}

                <form ref={employeeModalFormRef} className="employee-modal-form" onSubmit={(event) => event.preventDefault()}>
              {activeStep === 0 ? (
                <div className="employee-step-grid">
                  <label>First name *<input name="first_name" value={form.first_name} onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))} required /></label>
                  <label>Middle name *<input name="middle_name" value={form.middle_name} onChange={(event) => setForm((prev) => ({ ...prev, middle_name: event.target.value }))} required /></label>
                  <label>Last name *<input name="last_name" value={form.last_name} onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))} required /></label>
                  <label>Date of birth *<input name="date_of_birth" type="date" value={form.date_of_birth} onChange={(event) => setForm((prev) => ({ ...prev, date_of_birth: event.target.value }))} required /></label>
                  <label>Age<input value={age} readOnly disabled /></label>
                  <label>
                    Gender *
                    <select name="gender" value={form.gender} onChange={(event) => setForm((prev) => ({ ...prev, gender: event.target.value }))} required>
                      <option value="">Select gender</option>
                      {GENDER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label>ID Number<input name="id_number" value={form.id_number} onChange={(event) => setForm((prev) => ({ ...prev, id_number: event.target.value }))} /></label>
                  <label>Passport Number *<input name="passport_number" value={form.passport_number} onChange={(event) => setForm((prev) => ({ ...prev, passport_number: event.target.value }))} required /></label>
                  <label>Labour ID<input name="labour_id" value={form.labour_id} onChange={(event) => setForm((prev) => ({ ...prev, labour_id: event.target.value }))} /></label>
                  <label>Mobile Number *<input name="mobile_number" value={form.mobile_number} onChange={(event) => setForm((prev) => ({ ...prev, mobile_number: event.target.value }))} inputMode="tel" placeholder="+251900000001" required /></label>
                </div>
              ) : null}
              {activeStep === 3 ? (
                <div className="employee-step-grid">
                  <div className="employee-span-two">
                    <span className="employee-group-label">Destination countries *</span>
                    <div className="checkbox-grid">
                      {formOptions.destination_countries.length === 0 ? <span className="muted-text">Create active agent accounts with countries first.</span> : formOptions.destination_countries.map((country) => (
                        <label
                          key={country}
                          className={`checkbox-pill${form.application_countries.includes(country) ? ' is-checked' : ''}`}
                        >
                          <input
                            name="application_countries"
                            type="checkbox"
                            checked={form.application_countries.includes(country)}
                            onChange={() => handleCheckboxList('application_countries', country)}
                          />
                          <span>{country}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <label>
                    Profession *
                    <select name="profession" value={form.profession} onChange={(event) => setForm((prev) => ({ ...prev, profession: event.target.value, skills: prev.skills.filter((item) => (PROFESSION_SKILLS[event.target.value] || []).includes(item)) }))} required>
                      <option value="">Select profession</option>
                      {PROFESSION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label>
                    Application Type *
                    <select name="employment_type" value={form.employment_type} onChange={(event) => setForm((prev) => ({ ...prev, employment_type: event.target.value }))} required>
                      <option value="">Select type</option>
                      {EMPLOYMENT_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label>
                    Salary
                    <select name="application_salary" value={form.application_salary} onChange={(event) => setForm((prev) => ({ ...prev, application_salary: event.target.value }))} required>
                      <option value="">Select salary</option>
                      {salaryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label>Professional title<input value={form.professional_title} onChange={(event) => setForm((prev) => ({ ...prev, professional_title: event.target.value }))} /></label>
                  <div className="employee-span-two">
                    <span className="employee-group-label">Skills</span>
                    <div className="checkbox-grid">
                      {availableSkillOptions.length === 0 ? <span className="muted-text">Choose a profession to load matching skills.</span> : availableSkillOptions.map((skill) => (
                        <label key={skill} className={`checkbox-pill${form.skills.includes(skill) ? ' is-checked' : ''}`}>
                          <input name="skills" type="checkbox" checked={form.skills.includes(skill)} onChange={() => handleCheckboxList('skills', skill)} />
                          <span>{skill}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="employee-span-two">
                    <span className="employee-group-label">Experiences</span>
                    <div className="experience-list">
                      {form.experiences.map((item, index) => (
                        <div key={`${index}-${item.country || 'exp'}`} className="experience-row">
                          <select name={`experience_country_${index}`} value={item.country} onChange={(event) => handleExperienceChange(index, 'country', event.target.value)}>
                            <option value="">Select country</option>
                            {EXPERIENCE_COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
                          </select>
                          <input name={`experience_years_${index}`} type="number" min="0" value={item.years} onChange={(event) => handleExperienceChange(index, 'years', event.target.value)} placeholder="Years" />
                          {form.experiences.length > 1 ? <button type="button" className="btn-secondary" onClick={() => setForm((prev) => ({ ...prev, experiences: prev.experiences.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button> : null}
                        </div>
                      ))}
                      <button type="button" className="btn-secondary" onClick={() => setForm((prev) => ({ ...prev, experiences: [...prev.experiences, { ...emptyExperience }] }))}>Add experience</button>
                    </div>
                  </div>
                  <div className="employee-span-two">
                    <span className="employee-group-label">Languages</span>
                    <div className="checkbox-grid">
                      {LANGUAGE_OPTIONS.map((language) => (
                        <label key={language} className={`checkbox-pill${form.languages.includes(language) ? ' is-checked' : ''}`}>
                          <input name="languages" type="checkbox" checked={form.languages.includes(language)} onChange={() => handleCheckboxList('languages', language)} />
                          <span>{language}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              {activeStep === 1 ? (
                <div className="employee-step-grid">
                  <label>
                    Religion
                    <select name="religion" value={form.religion} onChange={(event) => setForm((prev) => ({ ...prev, religion: event.target.value }))} required>
                      <option value="">Select religion</option>
                      {RELIGION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label>
                    Marital status
                    <select name="marital_status" value={form.marital_status} onChange={(event) => setForm((prev) => ({ ...prev, marital_status: event.target.value }))} required>
                      <option value="">Select marital status</option>
                      {MARITAL_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label>Children<input name="children_count" type="number" min="0" value={form.children_count} onChange={(event) => setForm((prev) => ({ ...prev, children_count: event.target.value }))} /></label>
                  <label>
                    Residence country
                    <select name="residence_country" value={form.residence_country} onChange={(event) => setForm((prev) => ({ ...prev, residence_country: event.target.value }))} required>
                      <option value="">Select country</option>
                      {RESIDENCE_COUNTRY_OPTIONS.map((country) => <option key={country} value={country}>{country}</option>)}
                    </select>
                  </label>
                  <label>Nationality<input name="nationality" value={form.nationality} onChange={(event) => setForm((prev) => ({ ...prev, nationality: event.target.value }))} /></label>
                  <label>Birth place<input name="birth_place" value={form.birth_place} onChange={(event) => setForm((prev) => ({ ...prev, birth_place: event.target.value }))} /></label>
                  <label>Address<input value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} /></label>
                  <label>
                    Weight
                    <div className="input-suffix">
                      <input name="weight_kg" type="number" min="0" value={form.weight_kg} onChange={(event) => setForm((prev) => ({ ...prev, weight_kg: event.target.value }))} />
                      <span>Kg</span>
                    </div>
                  </label>
                  <label>
                    Height
                    <div className="input-suffix">
                      <input name="height_cm" type="number" min="0" value={form.height_cm} onChange={(event) => setForm((prev) => ({ ...prev, height_cm: event.target.value }))} />
                      <span>Cm</span>
                    </div>
                  </label>
                  <label className="employee-span-two">Summary<textarea value={form.summary} onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))} rows={3} /></label>
                  <label className="employee-span-two">Education<textarea value={form.education} onChange={(event) => setForm((prev) => ({ ...prev, education: event.target.value }))} rows={3} /></label>
                  <label className="employee-span-two">Experience notes<textarea value={form.experience} onChange={(event) => setForm((prev) => ({ ...prev, experience: event.target.value }))} rows={3} /></label>
                </div>
              ) : null}
              {activeStep === 2 ? (
                <div className="employee-step-grid">
                  <label>Contact person name<input name="contact_person_name" value={form.contact_person_name} onChange={(event) => setForm((prev) => ({ ...prev, contact_person_name: event.target.value }))} required /></label>
                  <label>Contact person ID.No<input name="contact_person_id_number" value={form.contact_person_id_number} onChange={(event) => setForm((prev) => ({ ...prev, contact_person_id_number: event.target.value }))} /></label>
                  <label>Contact person mobile<input name="contact_person_mobile" value={form.contact_person_mobile} onChange={(event) => setForm((prev) => ({ ...prev, contact_person_mobile: event.target.value }))} inputMode="tel" placeholder="+251900000002" required /></label>
                  <label>Email<input name="email" type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="name@example.com" /></label>
                  <label>Secondary phone<input name="phone" value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} inputMode="tel" placeholder="+251900000003" /></label>
                  <p className="muted-text employee-step-note">New registrations start as pending approval. Use the employee card actions to approve, reject, or suspend them.</p>
                  <label className="employee-span-two">References<textarea value={form.references} onChange={(event) => setForm((prev) => ({ ...prev, references: event.target.value }))} rows={3} /></label>
                  <label className="employee-span-two">Notes<textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} rows={3} /></label>
                </div>
              ) : null}
              {activeStep === 4 ? (
                <div className="employee-step-grid">
                  <p className="muted-text employee-step-note">Only Portrait photo 3x4 size, Full photo, and Passport are mandatory here. The other dates can stay empty unless you attach their file.</p>
                  {(() => {
                    const requiredKeys = new Set(['portrait_photo', 'full_photo', 'passport_document'])
                    const requiredAttachments = ATTACHMENT_FIELDS.filter((attachment) => requiredKeys.has(attachment.key))
                    const optionalAttachments = ATTACHMENT_FIELDS.filter((attachment) => !requiredKeys.has(attachment.key))

                    const renderAttachmentSlot = (attachment) => {
                      const inputId = `employee-attachment-${attachment.key}`
                      const isRequiredAttachment = requiredKeys.has(attachment.key)
                      const hasAttachment = Boolean(
                        attachmentFiles[attachment.key] || existingAttachmentDocs[attachment.key]?.file_url
                      )
                      const fileLabel = attachmentFiles[attachment.key]?.name
                        || attachmentDisplayName(existingAttachmentDocs[attachment.key], attachmentLabels)
                        || 'Filename here'
                      const attachedFile = attachmentFiles[attachment.key]
                      const existingUrl = existingAttachmentDocs[attachment.key]?.file_url || ''
                      const isImageAttachment = Boolean(
                        attachedFile?.type?.startsWith('image/')
                        || (!attachedFile && typeof existingUrl === 'string' && existingUrl.match(/\.(png|jpe?g|webp|gif)(\?|#|$)/i))
                      )
                      const isPdfAttachment = Boolean(
                        attachedFile?.type === 'application/pdf'
                        || (!attachedFile && typeof existingUrl === 'string' && existingUrl.match(/\.pdf(\?|#|$)/i))
                      )
                      const previewUrl = attachedFile
                        ? (attachmentPreviewUrls[attachment.key] || '')
                        : (existingUrl || '')

                      return (
                        <div key={attachment.key} className={`attachment-box attachment-box--slot${hasAttachment ? ' is-filled' : ''}`}>
                          <div className={`attachment-slot-icon${isImageAttachment && previewUrl ? ' has-thumb' : ''}`} aria-hidden="true">
                            {isImageAttachment && previewUrl ? (
                              <img className="attachment-slot-thumb" src={previewUrl} alt="" />
                            ) : null}
                            {hasAttachment ? (
                              <button
                                type="button"
                                className="attachment-slot-remove"
                                aria-label={`Remove ${attachment.label}`}
                                onClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  handleAttachmentPick(attachment.key, null)
                                  setExistingAttachmentDocs((prev) => ({ ...prev, [attachment.key]: null }))
                                }}
                              >
                                −
                              </button>
                            ) : null}
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M4 7h4l2-2h4l2 2h4v12H4V7Z" />
                              <path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
                            </svg>
                            {isImageAttachment && previewUrl ? (
                              <span
                                className="attachment-slot-preview-anchor"
                                onMouseEnter={(event) => {
                                  cancelFloatingAttachmentPreviewClose()
                                  openFloatingAttachmentPreview(event.currentTarget, previewUrl, fileLabel)
                                }}
                                onMouseLeave={scheduleFloatingAttachmentPreviewClose}
                                onFocus={(event) => {
                                  cancelFloatingAttachmentPreviewClose()
                                  openFloatingAttachmentPreview(event.currentTarget, previewUrl, fileLabel)
                                }}
                                onBlur={scheduleFloatingAttachmentPreviewClose}
                                tabIndex={0}
                                aria-label={`Preview ${attachment.label}`}
                              />
                            ) : null}
                          </div>
                          {hasAttachment ? (
                            <span
                              className="attachment-box-badge attachment-box-badge--slot attachment-slot-badge"
                              aria-label="File attached"
                              title="File attached"
                            />
                          ) : null}

                          <div className="attachment-slot-copy">
                            <div className="attachment-slot-title">
                              <div className="attachment-slot-title-row">
                                <strong>{attachment.label}</strong>
                              </div>
                              {attachment.key === 'portrait_photo' ? <span className="muted-text">3x4 size</span> : null}
                            </div>
                            <span className="attachment-slot-filename muted-text">{fileLabel}</span>
                            {attachment.key.startsWith('att_option_') ? (
                              <input
                                type="text"
                                value={attachmentLabels[attachment.key] || ''}
                                onChange={(event) => setAttachmentLabels((prev) => ({ ...prev, [attachment.key]: event.target.value }))}
                                placeholder="Attachment name"
                              />
                            ) : null}
                            {attachment.expiryField ? (
                              <input
                                name={attachment.expiryField}
                                type="date"
                                value={form[attachment.expiryField]}
                                onChange={(event) => setForm((prev) => ({ ...prev, [attachment.expiryField]: event.target.value }))}
                              />
                            ) : null}
                            {!isRequiredAttachment ? (
                              <div className="attachment-slot-actions attachment-slot-actions--inline">
                                <div
                                  className={`attachment-slot-dropzone${dragOverAttachmentKey === attachment.key ? ' is-dragover' : ''}`}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      document.getElementById(inputId)?.click()
                                    }
                                  }}
                                  onClick={() => document.getElementById(inputId)?.click()}
                                  onDragEnter={(event) => {
                                    event.preventDefault()
                                    setDragOverAttachmentKey(attachment.key)
                                  }}
                                  onDragOver={(event) => {
                                    event.preventDefault()
                                    event.dataTransfer.dropEffect = 'copy'
                                    setDragOverAttachmentKey(attachment.key)
                                  }}
                                  onDragLeave={(event) => {
                                    event.preventDefault()
                                    setDragOverAttachmentKey('')
                                  }}
                                  onDrop={(event) => {
                                    event.preventDefault()
                                    setDragOverAttachmentKey('')
                                    const file = event.dataTransfer?.files?.[0]
                                    if (!file) return
                                    handleAttachmentPick(attachment.key, file)
                                  }}
                                  aria-label={`Drag and drop or click to choose a file for ${attachment.label}`}
                                >
                                  <span className="muted-text">Drag &amp; drop file here</span>
                                </div>

                                <label htmlFor={inputId} className="attachment-file-trigger btn-secondary">
                                  Choose file
                                </label>
                              </div>
                            ) : null}
                          </div>

                          {isRequiredAttachment ? (
                            <div className="attachment-slot-actions">
                              <div
                                className={`attachment-slot-dropzone${dragOverAttachmentKey === attachment.key ? ' is-dragover' : ''}`}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    document.getElementById(inputId)?.click()
                                  }
                                }}
                                onClick={() => document.getElementById(inputId)?.click()}
                                onDragEnter={(event) => {
                                  event.preventDefault()
                                  setDragOverAttachmentKey(attachment.key)
                                }}
                                onDragOver={(event) => {
                                  event.preventDefault()
                                  event.dataTransfer.dropEffect = 'copy'
                                  setDragOverAttachmentKey(attachment.key)
                                }}
                                onDragLeave={(event) => {
                                  event.preventDefault()
                                  setDragOverAttachmentKey('')
                                }}
                                onDrop={(event) => {
                                  event.preventDefault()
                                  setDragOverAttachmentKey('')
                                  const file = event.dataTransfer?.files?.[0]
                                  if (!file) return
                                  handleAttachmentPick(attachment.key, file)
                                }}
                                aria-label={`Drag and drop or click to choose a file for ${attachment.label}`}
                              >
                                <span className="muted-text">Drag &amp; drop file here</span>
                              </div>

                              <label htmlFor={inputId} className="attachment-file-trigger btn-secondary">
                                Choose file
                              </label>
                            </div>
                          ) : null}
                          {existingAttachmentDocs[attachment.key]?.file_url && !attachmentFiles[attachment.key] ? (
                            <p className="muted-text employee-step-note">
                              Existing file retained.
                              {' '}
                              <a href={existingAttachmentDocs[attachment.key].file_url} target="_blank" rel="noreferrer">Open current file</a>
                            </p>
                          ) : null}
                          <input
                            id={inputId}
                            name={attachment.key}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                            className="visually-hidden-file"
                            onChange={(event) => handleAttachmentPick(attachment.key, event.target.files?.[0] || null)}
                          />
                        </div>
                      )
                    }

                    const requiredCount = requiredAttachments.length
                    const requiredFilled = requiredAttachments.filter((attachment) => (
                      Boolean(attachmentFiles[attachment.key] || existingAttachmentDocs[attachment.key]?.file_url)
                    )).length

                    const optionalCount = optionalAttachments.length
                    const optionalFilled = optionalAttachments.filter((attachment) => (
                      Boolean(attachmentFiles[attachment.key] || existingAttachmentDocs[attachment.key]?.file_url)
                    )).length

                    return (
                      <div className={`employee-span-two attachment-sections${attemptedRegistrationSteps[4] ? ' is-validate' : ''}`}>
                        <div className="attachment-section attachment-section--required">
                          <div className="attachment-section-header">
                            <div className="attachment-section-title">
                              <strong>Required documents</strong>
                              <span className="badge badge-muted">{requiredCount} mandatory</span>
                            </div>
                            <div className="attachment-section-progress">
                              <span className="muted-text">{requiredFilled} of {requiredCount} uploaded</span>
                              <div className="employee-registration-progress-bar" aria-hidden="true">
                                <span style={{ width: `${requiredCount ? Math.round((requiredFilled / requiredCount) * 100) : 0}%` }} />
                              </div>
                            </div>
                          </div>
                          <div className="attachment-grid">
                            {requiredAttachments.map(renderAttachmentSlot)}
                          </div>
                        </div>

                        <div className="attachment-section attachment-section--optional">
                          <div className="attachment-section-header attachment-section-header--right">
                            <div className="attachment-section-title attachment-section-title--right">
                              <strong>Other documents ({optionalFilled}/{optionalCount})</strong>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setOtherDocumentsModalOpen(true)}
                              >
                                Manage
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ) : null}
              {otherDocumentsModalOpen ? (
                <div className="app-confirm-backdrop" role="presentation" onClick={() => setOtherDocumentsModalOpen(false)}>
                  <div
                    className="employee-review-modal employee-other-documents-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Other documents"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="employee-other-documents-header">
                      <div className="employee-review-header">
                        <h2>Other documents</h2>
                        <button
                          type="button"
                          className="btn-ghost employee-other-documents-close"
                          onClick={() => setOtherDocumentsModalOpen(false)}
                        >
                          Close
                        </button>
                      </div>
                      <p className="muted-text app-confirm-message">
                        Optional attachments. Add expiry dates or names when needed, then choose a file.
                      </p>
                      {(() => {
                        const requiredKeys = new Set(['portrait_photo', 'full_photo', 'passport_document'])
                        const optionalAttachments = ATTACHMENT_FIELDS.filter((attachment) => !requiredKeys.has(attachment.key))
                        const optionalCount = optionalAttachments.length
                        const optionalFilled = optionalAttachments.filter((attachment) => (
                          Boolean(attachmentFiles[attachment.key] || existingAttachmentDocs[attachment.key]?.file_url)
                        )).length
                        const percent = optionalCount ? Math.round((optionalFilled / optionalCount) * 100) : 0
                        return (
                          <div className="attachment-section-progress employee-other-documents-progress" aria-label="Optional attachments progress">
                            <span className="muted-text">{optionalFilled} of {optionalCount} uploaded</span>
                            <div className="employee-registration-progress-bar" aria-hidden="true">
                              <span style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                    <div className="employee-other-documents-body">
                      <div className="attachment-section attachment-section--optional">
                        <div className="attachment-grid employee-other-documents-grid" role="list">
                      {(() => {
                        const requiredKeys = new Set(['portrait_photo', 'full_photo', 'passport_document'])
                        return ATTACHMENT_FIELDS.filter((attachment) => !requiredKeys.has(attachment.key)).map((attachment) => {
                          const inputId = `employee-attachment-${attachment.key}`
                          const hasAttachment = Boolean(
                            attachmentFiles[attachment.key] || existingAttachmentDocs[attachment.key]?.file_url
                          )
                          const attachedFile = attachmentFiles[attachment.key]
                          const existingUrl = existingAttachmentDocs[attachment.key]?.file_url || ''
                          const isImageAttachment = Boolean(
                            attachedFile?.type?.startsWith('image/')
                            || (!attachedFile && typeof existingUrl === 'string' && existingUrl.match(/\.(png|jpe?g|webp|gif)(\?|#|$)/i))
                          )
                          const previewUrl = attachedFile
                            ? (attachmentPreviewUrls[attachment.key] || '')
                            : (existingUrl || '')
                          const fileLabel = attachmentFiles[attachment.key]?.name
                            || attachmentDisplayName(existingAttachmentDocs[attachment.key], attachmentLabels)
                            || 'No file selected'
                          return (
                            <div key={attachment.key} className="employee-other-documents-item" role="listitem">
                              <div className={`employee-other-documents-item-surface${hasAttachment ? ' is-filled' : ''}`}>
                                {hasAttachment ? (
                                  <span className="attachment-box-badge attachment-box-badge--slot employee-other-documents-attachment-badge" aria-label="File attached" title="File attached"></span>
                                ) : null}
                                <div className="employee-other-documents-item-left" aria-hidden="true">
                                  <div className="attachment-slot-icon">
                                    {isImageAttachment && previewUrl ? (
                                      <img className="attachment-slot-thumb" src={previewUrl} alt="" />
                                    ) : null}
                                    {hasAttachment ? (
                                      <button
                                        type="button"
                                        className="attachment-slot-remove"
                                        aria-label={`Remove ${attachment.label}`}
                                        onClick={(event) => {
                                          event.preventDefault()
                                          event.stopPropagation()
                                          handleAttachmentPick(attachment.key, null)
                                          setExistingAttachmentDocs((prev) => ({ ...prev, [attachment.key]: null }))
                                        }}
                                      >
                                        −
                                      </button>
                                    ) : null}
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
                                      <path d="M6 6h12v12H6V6Z" />
                                      <path d="M8.5 10h7" />
                                      <path d="M8.5 13h7" />
                                      <path d="M8.5 16h5" />
                                    </svg>
                                    {isImageAttachment && previewUrl ? (
                                      <span
                                        className="attachment-slot-preview-anchor"
                                        onMouseEnter={(event) => {
                                          cancelFloatingAttachmentPreviewClose()
                                          openFloatingAttachmentPreview(event.currentTarget, previewUrl, fileLabel)
                                        }}
                                        onMouseLeave={scheduleFloatingAttachmentPreviewClose}
                                        onFocus={(event) => {
                                          cancelFloatingAttachmentPreviewClose()
                                          openFloatingAttachmentPreview(event.currentTarget, previewUrl, fileLabel)
                                        }}
                                        onBlur={scheduleFloatingAttachmentPreviewClose}
                                        tabIndex={0}
                                        aria-label={`Preview ${attachment.label}`}
                                      />
                                    ) : null}
                                  </div>
                                </div>
                                <div className="employee-other-documents-item-right">
                                  <div className="employee-other-documents-item-right-part employee-other-documents-item-right-part--green">
                                    <div className="attachment-slot-copy">
                                      <div className="attachment-slot-title">
                                        <div className="attachment-slot-title-row">
                                          <strong>{attachment.label}</strong>
                                        </div>
                                        <div className="attachment-slot-filename">
                                          {fileLabel}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                    <div className="employee-other-documents-item-right-part employee-other-documents-item-right-part--pink">
                                      <div className="employee-other-documents-item-right-part-pink-left">
                                        <div
                                          className={`attachment-slot-dropzone${dragOverAttachmentKey === attachment.key ? ' is-dragover' : ''}`}
                                          role="button"
                                          tabIndex={0}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                              event.preventDefault()
                                              document.getElementById(inputId)?.click()
                                            }
                                          }}
                                          onClick={() => document.getElementById(inputId)?.click()}
                                          onDragEnter={(event) => {
                                            event.preventDefault()
                                            setDragOverAttachmentKey(attachment.key)
                                          }}
                                          onDragOver={(event) => {
                                            event.preventDefault()
                                            event.dataTransfer.dropEffect = 'copy'
                                            setDragOverAttachmentKey(attachment.key)
                                          }}
                                          onDragLeave={(event) => {
                                            event.preventDefault()
                                            setDragOverAttachmentKey('')
                                          }}
                                          onDrop={(event) => {
                                            event.preventDefault()
                                            setDragOverAttachmentKey('')
                                            const file = event.dataTransfer?.files?.[0]
                                            if (!file) return
                                            handleAttachmentPick(attachment.key, file)
                                          }}
                                          aria-label={`Drag and drop or click to choose a file for ${attachment.label}`}
                                        >
                                          <span className="muted-text">Drag &amp; drop file here</span>
                                        </div>
                                      </div>
                                      <div className="employee-other-documents-item-right-part-pink-right">
                                        <label htmlFor={inputId} className="attachment-file-trigger btn-secondary">
                                          Choose file
                                        </label>
                                      </div>
                                    </div>
                                    <div className="employee-other-documents-item-right-part employee-other-documents-item-right-part--blue">
                                      {attachment.expiryField ? (
                                        <input
                                          name={attachment.expiryField}
                                          type="date"
                                          value={form[attachment.expiryField]}
                                          onChange={(event) => setForm((prev) => ({ ...prev, [attachment.expiryField]: event.target.value }))}
                                        />
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                                <input
                                  id={inputId}
                                  name={attachment.key}
                                  type="file"
                                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                className="visually-hidden-file"
                                onChange={(event) => handleAttachmentPick(attachment.key, event.target.files?.[0] || null)}
                              />
                            </div>
                          )
                        })
                      })()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {floatingAttachmentPreview && typeof document !== 'undefined'
                ? createPortal(
                  <div
                    className="attachment-slot-preview-popover is-floating"
                    style={{
                      left: `${floatingAttachmentPreview.left}px`,
                      top: `${floatingAttachmentPreview.top}px`,
                      width: `${floatingAttachmentPreview.width}px`
                    }}
                    onMouseEnter={cancelFloatingAttachmentPreviewClose}
                    onMouseLeave={scheduleFloatingAttachmentPreviewClose}
                    role="presentation"
                  >
                    <img src={floatingAttachmentPreview.url} alt={floatingAttachmentPreview.label} />
                  </div>,
                  document.body
                )
                : null}
              {activeStep === 5 ? (
                <div className="employee-step-grid">
                  <div className="employee-span-two employee-summary-grid">
                    <div className="employee-summary-card">
                      <h3>Identity</h3>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Name</span>
                        <span className="employee-summary-value">{[form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ') || '--'}</span>
                      </div>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Date of birth</span>
                        <span className="employee-summary-value">{form.date_of_birth || '--'}</span>
                      </div>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Gender</span>
                        <span className="employee-summary-value">{form.gender || '--'}</span>
                      </div>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Passport</span>
                        <span className="employee-summary-value">{form.passport_number || '--'}</span>
                      </div>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Mobile</span>
                        <span className="employee-summary-value">{form.mobile_number || '--'}</span>
                      </div>
                    </div>
                    <div className="employee-summary-card">
                      <h3>Application</h3>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Countries</span>
                        <span className="employee-summary-value">{form.application_countries.join(', ') || '--'}</span>
                      </div>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Profession</span>
                        <span className="employee-summary-value">{form.profession || '--'}</span>
                      </div>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Type</span>
                        <span className="employee-summary-value">{form.employment_type || '--'}</span>
                      </div>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Salary</span>
                        <span className="employee-summary-value">{form.application_salary || '--'}</span>
                      </div>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Skills</span>
                        <span className="employee-summary-value">{form.skills.join(', ') || '--'}</span>
                      </div>
                    </div>
                    <div className="employee-summary-card">
                      <h3>Profile</h3>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Religion</span>
                        <span className="employee-summary-value">{form.religion || '--'}</span>
                      </div>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Marital status</span>
                        <span className="employee-summary-value">{form.marital_status || '--'}</span>
                      </div>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Residence</span>
                        <span className="employee-summary-value">{form.residence_country || '--'}</span>
                      </div>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Nationality</span>
                        <span className="employee-summary-value">{form.nationality || '--'}</span>
                      </div>
                      <div className="employee-summary-row employee-summary-row--wrap">
                        <span className="employee-summary-label">Experience</span>
                        <span className="employee-summary-value">
                          {form.experiences
                            .filter((item) => item.country || item.years !== '')
                            .map((item) => `${item.country || '--'} (${item.years || '--'} yrs)`)
                            .join(', ') || '--'}
                        </span>
                      </div>
                    </div>
                    <div className="employee-summary-card">
                      <h3>Contact</h3>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Contact person</span>
                        <span className="employee-summary-value">{form.contact_person_name || '--'}</span>
                      </div>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Contact mobile</span>
                        <span className="employee-summary-value">{form.contact_person_mobile || '--'}</span>
                      </div>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Email</span>
                        <span className="employee-summary-value">{form.email || '--'}</span>
                      </div>
                      <div className="employee-summary-row">
                        <span className="employee-summary-label">Secondary phone</span>
                        <span className="employee-summary-value">{form.phone || '--'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="employee-span-two">
                    <h3>Attachment preview</h3>
                    <div className="employee-attachment-preview-grid">
                      {ATTACHMENT_FIELDS.filter((attachment) => attachmentFiles[attachment.key]).length === 0 ? (
                        <div className="employee-attachment-preview-card">
                          <div className="employee-attachment-preview-file">No new files selected in this session.</div>
                        </div>
                      ) : ATTACHMENT_FIELDS.filter((attachment) => attachmentFiles[attachment.key]).map((attachment) => (
                        <div key={attachment.key} className="employee-attachment-preview-card">
                          <strong>{attachmentLabels[attachment.key] || attachment.label}</strong>
                          {attachmentFiles[attachment.key]?.type?.startsWith('image/') ? (
                            <img
                              src={attachmentPreviewUrls[attachment.key] || ''}
                              alt={attachment.label}
                              className="employee-attachment-preview-image"
                            />
                          ) : (
                            <div className="employee-attachment-preview-file">{attachmentFiles[attachment.key]?.name || 'Attached file'}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="employee-modal-actions">
                <div className="employee-modal-actions-right">
                  <button type="button" className="btn-secondary" onClick={handleSaveTemplate} disabled={saving}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M4 7a2 2 0 0 1 2-2h11l3 3v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
                      <path d="M8 5v6h8V5" />
                      <path d="M8 22v-7h8v7" />
                    </svg>
                    Save Draft
                  </button>
                  {hasSavedTemplate ? (
                    <button type="button" className="btn-secondary" onClick={handleClearTemplate} disabled={saving}>
                      Clear template
                    </button>
                  ) : null}
                  <button type="button" className="btn-secondary" onClick={handleResetRegistrationToTemplate} disabled={saving}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M6 7h12" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 7 10 5h4l1 2" />
                      <path d="M7 7l1 14h8l1-14" />
                    </svg>
                    Clear
                  </button>
                  {activeStep < REGISTRATION_STEPS.length - 1 ? (
                    <button type="button" onClick={goToNextStep} disabled={saving}>Next</button>
                  ) : (
                    <button type="button" onClick={submitRegistration} disabled={saving || readOnly}>{saving ? 'Saving...' : editingEmployeeId ? 'Update employee' : 'Register employee'}</button>
                  )}
                </div>
              </div>
            </form>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="users-table-wrap">
          <h2>
            {currentView === 'employed'
              ? 'Employed'
              : currentView === 'returned'
              ? 'Returned list'
              : currentView === 'under-process'
              ? 'Under process Employees'
              : currentView === 'selected'
                ? 'Selected Employees'
                : 'Employee records'}
          </h2>
          {!loading ? (
            currentView === 'returned' ? (
              <div className="returned-list-surface">
                <div className="returned-list-intro">
                  <p className="muted-text message-block--mb-0">
                    {`${returnedEmployeesHelpText()} Showing ${visibleEmployees.length} of ${total} employees.`}
                  </p>
                  <button type="button" className="btn-secondary" onClick={openReturnRequestModal} disabled={readOnly}>
                    +
                  </button>
                </div>
                <div className="returned-request-surface">
                  <h3>Requested returns</h3>
                    {requestedReturnsLoading ? (
                      <p className="muted-text">Loading requested returns...</p>
                    ) : requestedReturns.length === 0 ? (
                      <p className="muted-text">No pending return requests right now.</p>
                    ) : (
                      <div className="returned-request-list">
                        {requestedReturns.map((employee) => {
                          const canApproveHere = canManageOrganizationProcesses
                          const canCancelHere = isAgentSideUser && employee.selection_state?.selected_by_current_agent
                          return (
                            <div key={`requested-return-${employee.id}`} className="returned-request-item">
                              <button
                                type="button"
                                className="returned-request-item-main"
                                onClick={() => {
                                  setOpenedEmployeeMode('request')
                                  setOpenedEmployeeId(employee.id)
                                }}
                              >
                                <span>
                                  <strong>{employee.full_name}</strong>
                                  <span className="return-request-employee-meta">
                                    {employee.profession || employee.professional_title || '--'}
                                  </span>
                                  <span className="return-request-employee-meta">
                                    Requested by {employee.return_request?.requested_by_username || '--'} on {formatDateTime(employee.return_request?.requested_at)}
                                  </span>
                                </span>
                                <span className="return-request-employee-state" data-tone={statusTone(employee.return_request?.status)}>
                                  {prettyStatus(employee.return_request?.status)}
                                </span>
                              </button>
                              <div className="returned-request-actions">
                                {canApproveHere ? (
                                  <>
                                    <button
                                      type="button"
                                      className="btn-warning"
                                      onClick={() => handleApproveEmploymentReturn(employee)}
                                      disabled={readOnly || actionBusyId === employee.id}
                                    >
                                      {actionBusyId === employee.id ? 'Saving...' : 'Acknowledge return'}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-danger"
                                      onClick={() => handleRefuseEmployeeReturnRequest(employee)}
                                      disabled={readOnly || actionBusyId === employee.id}
                                    >
                                      {actionBusyId === employee.id ? 'Saving...' : 'Refuse request'}
                                    </button>
                                  </>
                                ) : null}
                                {canCancelHere ? (
                                  <button
                                    type="button"
                                    className="btn-muted-action"
                                    onClick={() => handleCancelEmployeeReturnRequest(employee)}
                                    disabled={readOnly || actionBusyId === employee.id}
                                  >
                                    {actionBusyId === employee.id ? 'Saving...' : 'Cancel request'}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                </div>
              </div>
            ) : (
              <p className="muted-text message-block--mb-12">
                {currentView === 'employed'
                  ? `${employedEmployeesHelpText()} Showing ${visibleEmployees.length} of ${total} employees.`
                  : currentView === 'under-process'
                  ? `${underProcessEmployeesHelpText(user)} Showing ${visibleEmployees.length} of ${total} employees.`
                  : currentView === 'selected'
                  ? `${selectedEmployeesHelpText(user)} Showing ${visibleEmployees.length} of ${total} employees.`
                  : `Showing ${visibleEmployees.length} of ${total} employees.`}
              </p>
            )
          ) : null}
          {loading ? (
            <p className="muted-text">Loading employees...</p>
          ) : visibleEmployees.length === 0 ? (
            <p className="muted-text">
              {currentView === 'employed'
                ? 'No employed employees found yet.'
                : currentView === 'returned'
                ? 'No returned employees found yet.'
                : currentView === 'under-process'
                ? 'No employees are under process for this agent yet.'
                : currentView === 'selected'
                  ? 'No selected employees found for this view yet.'
                  : 'No employees found.'}
            </p>
          ) : (
            <>
              {primaryVisibleEmployees.length > 0 ? (
            <div className="employee-cards">
              {primaryVisibleEmployees.map((employee) => {
                const profilePhoto = employeeProfilePhoto(employee)
                const isOpened = openedEmployeeId === employee.id
                const selectionState = employee.selection_state || {}
                const selection = selectionState.selection
                const isSelectedByCurrentAgent = Boolean(selectionState.selected_by_current_agent)
                const workflowState = employeeWorkflowState(employee)
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

                return (
                  <article
                    key={employee.id}
                    className={`employee-card${isOpened ? ' is-open' : ''}`}
                    onClick={() => {
                      setOpenedEmployeeMode('full')
                      setOpenedEmployeeId((prev) => prev === employee.id ? null : employee.id)
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setOpenedEmployeeMode('full')
                        setOpenedEmployeeId((prev) => prev === employee.id ? null : employee.id)
                      }
                    }}
                  >
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
                          <p className="muted-text">Registered by {employee.registered_by_username || '--'}</p>
                        </div>
                      </div>
                      <div className="employee-card-header-meta">
                        {employee.return_request?.status === 'pending' ? <span className="badge badge-warning">Return requested</span> : null}
                        <span className={`badge employee-card-status-badge ${employeeStatusBadgeClass(employee)} ${employeeStatusBadgeVariantClass(employee)}`.trim()}>{employeeStatusLabel(employee)}</span>
                      </div>
                    </div>
                    <p className="muted-text">{employee.application_countries?.join(', ') || 'No destination country'} | {employee.phone || employee.mobile_number || 'No phone'}</p>
                    {selection ? (
                      <p className="muted-text">
                        {selection.status === 'under_process' ? 'Process owned by ' : 'Selected in market by '}
                        {selection.agent_name || '--'}
                        {selection.selected_by_username ? ` via ${selection.selected_by_username}` : ''}
                      </p>
                    ) : null}
                    {employee.return_request?.status === 'approved' && employee.return_request?.remark ? (
                      <p className="muted-text">Return remark: {employee.return_request.remark}</p>
                    ) : null}
                    <p className="muted-text">Progress {employee.progress_status?.overall_completion ?? 0}% | Travel {prettyStatus(employee.travel_status, 'pending')} | Return {prettyStatus(employee.return_status)}</p>
                    {employee.urgency_alerts?.length ? (
                      <div className="employee-alert-list">
                        {employee.urgency_alerts.map((alert) => (
                          <span key={`${employee.id}-${alert.field}`} className="badge badge-warning">
                            {alert.label} {alert.days_remaining < 0 ? 'expired' : `${alert.days_remaining}d`}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {(isEmployedEmployee || isReturnedEmployee) ? (
                      <div className="employee-employed-summary">
                        <div className="employee-employed-block">
                          <strong>Commission</strong>
                          <span className={`badge ${employee?.settled_commission ? 'badge-muted commission-settled-badge' : 'badge-warning'}`.trim()}>
                            {employedCommissionLabel(employee)}
                          </span>
                          <p className="muted-text">Collection from the agent side to the organization is a future settlement concept.</p>
                        </div>
                      </div>
                    ) : null}
                    <div className="employee-card-preview-strip">
                      {CARD_PREVIEW_DOCUMENTS.map((preview) => {
                        const document = findEmployeeDocument(employee, preview.types)
                        const hasImage = document?.file_url && isImageDocument(document)

                        return (
                          <div key={`${employee.id}-${preview.key}`} className="employee-doc-preview">
                            <div className="employee-doc-preview-tile">
                              {hasImage ? (
                                <img src={document.file_url} alt={`${employee.full_name} ${preview.label}`} />
                              ) : (
                                <span>{preview.label}</span>
                              )}
                            </div>
                            <strong>{preview.label}</strong>
                            {document?.file_url ? (
                              <div className="employee-doc-preview-popover">
                                {hasImage ? (
                                  <img src={document.file_url} alt={`${employee.full_name} ${preview.label} preview`} />
                                ) : (
                                  <span>{fileLabel(document, attachmentLabels)}</span>
                                )}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                    {(!isEmployedEmployee && !isTravelledEmployee) && !isReturnedEmployee ? (
                    <div className="employee-card-actions">
                      {!isUnderProcess && isAvailableEmployee ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={(event) => { event.stopPropagation(); handleToggleSelectedEmployee(employee) }}
                          disabled={
                            readOnly ||
                            !isAgentSideUser ||
                            actionBusyId === employee.id
                          }
                        >
                          {actionBusyId === employee.id
                            ? 'Saving...'
                            : isSelectedByCurrentAgent
                              ? 'Unselect employee'
                              : 'Select employee'}
                        </button>
                      ) : null}
                      {isMainAgentAccount && !isUnderProcess ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={(event) => { event.stopPropagation(); handleStartProcess(employee) }}
                          disabled={
                            readOnly ||
                            actionBusyId === employee.id ||
                            !isSelectedByCurrentAgent ||
                            employee.status !== 'approved' ||
                            isUnderProcess
                          }
                        >
                          {actionBusyId === employee.id
                            ? 'Saving...'
                            : 'Proceed to process'}
                        </button>
                      ) : null}
                      {canManageOrganizationProcesses && !isUnderProcess ? (
                        <>
                          <select
                            value={assignedAgentId}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              event.stopPropagation()
                              setPageError('')
                              setProcessAgentAssignments((prev) => ({
                                ...prev,
                                [employee.id]: event.target.value
                              }))
                            }}
                            disabled={readOnly || actionBusyId === employee.id}
                          >
                            <option value="">{formOptions.agent_options.length <= 1 ? 'Agent auto-selected' : 'Select agent'}</option>
                            {formOptions.agent_options.map((agent) => (
                              <option key={agent.id} value={String(agent.id)}>
                                {agent.name || agent.username}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={(event) => { event.stopPropagation(); handleStartProcess(employee) }}
                            disabled={readOnly || actionBusyId === employee.id || employee.status !== 'approved' || !assignedAgentId}
                          >
                            {actionBusyId === employee.id
                              ? 'Saving...'
                            : 'Initiate process'}
                          </button>
                        </>
                      ) : null}
                      {canManageOrganizationProcesses && isUnderProcess ? (
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={(event) => { event.stopPropagation(); handleDeclineProcess(employee) }}
                          disabled={readOnly || actionBusyId === employee.id}
                        >
                          {actionBusyId === employee.id ? 'Saving...' : 'Decline process'}
                        </button>
                      ) : null}
                      {canOverrideProgress && isUnderProcess && ((employee.progress_status?.overall_completion ?? 0) < 100 || !employee.did_travel) ? (
                        <button
                          type="button"
                          className="btn-info"
                          onClick={(event) => { event.stopPropagation(); handleMarkProgressComplete(employee) }}
                          disabled={readOnly || actionBusyId === employee.id}
                        >
                          {actionBusyId === employee.id
                            ? 'Saving...'
                            : (employee.progress_status?.overall_completion ?? 0) >= 100
                              ? 'Confirm travelled'
                              : 'Mark progress 100%'}
                        </button>
                      ) : null}
                      {workflowState === 'pending' ? (
                        <>
                          <button type="button" className="btn-success" onClick={(event) => { event.stopPropagation(); handleAvailabilityAction(employee, 'approved', 'Approved') }} disabled={actionBusyId === employee.id || readOnly || isAgentSideUser}>
                            {actionBusyId === employee.id ? 'Saving...' : 'Approve'}
                          </button>
                          <button type="button" className="btn-danger" onClick={(event) => { event.stopPropagation(); handleAvailabilityAction(employee, 'rejected', 'Rejected') }} disabled={actionBusyId === employee.id || readOnly || isAgentSideUser}>Reject</button>
                          <button type="button" className="btn-warning" onClick={(event) => { event.stopPropagation(); handleAvailabilityAction(employee, 'suspended', 'Suspended') }} disabled={actionBusyId === employee.id || readOnly || isAgentSideUser}>Suspend</button>
                        </>
                      ) : null}
                      {workflowState === 'rejected' || workflowState === 'suspended' ? (
                        <button type="button" className="btn-secondary" onClick={(event) => { event.stopPropagation(); handleAvailabilityAction(employee, 'pending', 'Moved to pending') }} disabled={actionBusyId === employee.id || readOnly || isAgentSideUser}>
                          {actionBusyId === employee.id ? 'Saving...' : 'Move to pending'}
                        </button>
                      ) : null}
                      {canEditEmployeeRecords ? (
                        <button type="button" className="btn-secondary" onClick={(event) => { event.stopPropagation(); handleEdit(employee.id) }} disabled={busyEmployeeId === employee.id || readOnly}>
                        {busyEmployeeId === employee.id ? 'Loading...' : 'Edit'}
                        </button>
                      ) : null}
                      <button type="button" className="btn-danger" onClick={(event) => { event.stopPropagation(); handleDelete(employee) }} disabled={readOnly || isAgentSideUser || isUnderProcess}>Delete</button>
                    </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
              ) : null}
            </>
          )}
          {!loading && employees.length > 0 ? (
            <div className="activity-log-pagination">
              <button type="button" className="btn-secondary" disabled={!hasPrev} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Previous</button>
              <span className="muted-text">Page {page}</span>
              <button type="button" className="btn-secondary" disabled={!hasNext} onClick={() => setPage((prev) => prev + 1)}>Next</button>
            </div>
          ) : null}
        </div>
      )}
      {returnRequestModalOpen ? (
        <div className="employee-review-backdrop" role="presentation" onClick={closeReturnRequestModal}>
          <div className="employee-review-modal" role="dialog" aria-modal="true" aria-label="Create return request" onClick={(event) => event.stopPropagation()}>
            <div className="employee-review-header">
              <div>
                <p className="employee-modal-eyebrow">Returned list</p>
                <h2>Create return request</h2>
                <p className="muted-text">Initiate a return from the employed employees and attach at least one evidence file.</p>
              </div>
              <button type="button" className="btn-secondary" onClick={closeReturnRequestModal}>Close</button>
            </div>
            {returnRequestError ? <p className="error-message employee-modal-error">{returnRequestError}</p> : null}
            <div className="employee-summary-grid">
              <div className="employee-summary-card">
                <h3>Choose employee</h3>
                <label>
                  Search employed employees 
                  <input
                    value={returnRequestSearch}
                    onChange={(event) => setReturnRequestSearch(event.target.value)}
                    placeholder="Search employed employee"
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
                    <span className="muted-text">No eligible employed employees found.</span>
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
      ) : null}
      {scanImportModalOpen ? (
        <div className="app-confirm-backdrop" role="presentation" onClick={closeScanImportModal}>
          <div
            className="employee-review-modal employee-scan-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-scan-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="employee-review-header">
              <h2 id="employee-scan-title">Scan from document</h2>
            </div>
            <p className="app-confirm-message">
              Choose how you want to bring the document in, then use Auto fill to let the backend extract matching employee fields.
            </p>
            <div className="notification-reminder-options employee-scan-option-grid">
              <button
                type="button"
                className={`notification-reminder-option employee-scan-option-card${ocrImportSource === 'camera' ? ' is-selected' : ''}`}
                onClick={() => triggerScanImport('camera')}
              >
                <span className="employee-scan-option-icon" aria-hidden="true">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 7h4l2-2h4l2 2h4v12H4V7Z" />
                    <path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
                  </svg>
                </span>
                <span className="employee-scan-option-copy">
                  <strong>From camera</strong>
                  <span>Capture a document photo from this device and stage it for OCR.</span>
                </span>
              </button>
              <button
                type="button"
                className={`notification-reminder-option employee-scan-option-card${ocrImportSource === 'scanner' ? ' is-selected' : ''}`}
                onClick={() => triggerScanImport('scanner')}
              >
                <span className="employee-scan-option-icon" aria-hidden="true">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 9V4h12v5" />
                    <path d="M6 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-2" />
                    <path d="M7 14h10v6H7v-6Z" />
                  </svg>
                </span>
                <span className="employee-scan-option-copy">
                  <strong>Scanner</strong>
                  <span>Choose a scanned PDF or image from a scanner workflow on this device.</span>
                </span>
              </button>
              <button
                type="button"
                className={`notification-reminder-option employee-scan-option-card${ocrImportSource === 'upload' ? ' is-selected' : ''}`}
                onClick={() => triggerScanImport('upload')}
              >
                <span className="employee-scan-option-icon" aria-hidden="true">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 16V4" />
                    <path d="M8 8l4-4 4 4" />
                    <path d="M4 20h16" />
                  </svg>
                </span>
                <span className="employee-scan-option-copy">
                  <strong>Upload a document</strong>
                  <span>Select an existing PDF or image so OCR can later read it and prefill the registration form.</span>
                </span>
              </button>
            </div>
            <div className="app-confirm-actions">
              <button type="button" className="btn-secondary" onClick={openOcrSetupModal}>OCR setup</button>
              <button type="button" className="btn-secondary" onClick={closeScanImportModal}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
      {cameraCaptureModalOpen ? (
        <div className="app-confirm-backdrop" role="presentation" onClick={closeCameraCapture}>
          <div
            className="employee-review-modal employee-scan-modal employee-camera-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-camera-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="employee-review-header">
              <h2 id="employee-camera-title">Capture from camera</h2>
            </div>
            <p className="app-confirm-message">
              Position the document inside the preview, then capture a photo for OCR staging.
            </p>
            <div className="employee-camera-preview">
              {cameraStream ? (
                <video ref={scanCameraVideoRef} autoPlay playsInline muted />
              ) : (
                <div className="employee-camera-placeholder">
                  {cameraError || 'Starting camera...'}
                </div>
              )}
              <canvas ref={scanCameraCanvasRef} aria-hidden="true" />
            </div>
            {cameraError ? <p className="error-message employee-modal-error">{cameraError}</p> : null}
            <div className="app-confirm-actions">
              <button type="button" className="btn-secondary" onClick={backToScanOptionsFromCamera}>Back</button>
              <button type="button" className="btn-secondary" onClick={closeCameraCapture}>Cancel</button>
              <button type="button" onClick={captureCameraDocument} disabled={!cameraStream}>Capture photo</button>
            </div>
          </div>
        </div>
      ) : null}
      {uploadDocumentModalOpen ? (
        <div className="app-confirm-backdrop" role="presentation" onClick={closeUploadDocumentModal}>
          <div
            className="employee-review-modal employee-scan-modal employee-upload-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-upload-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="employee-review-header">
              <h2 id="employee-upload-title">
                {uploadDocumentPurpose === 'attachment' ? 'Upload a generic document' : 'Upload a document'}
              </h2>
            </div>
            <p className="app-confirm-message">
              {uploadDocumentPurpose === 'attachment'
                ? 'Select or drop a PDF or image document, then continue to adjust and attach the visible area to employee attachment slots.'
                : 'Select or drop a PDF or image document, then continue to stage it for OCR.'}
            </p>
            <div
              className={`employee-upload-dropzone${uploadDragActive ? ' is-dragging' : ''}${uploadDraftFile ? ' has-file' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => scanUploadInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  scanUploadInputRef.current?.click()
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault()
                setUploadDragActive(true)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setUploadDragActive(true)
              }}
              onDragLeave={(event) => {
                event.preventDefault()
                setUploadDragActive(false)
              }}
              onDrop={handleUploadDrop}
            >
              <strong>{uploadDraftFile ? uploadDraftFile.name : 'Choose or drop a document'}</strong>
              <span>{uploadDraftFile ? `${Math.max(1, Math.round(uploadDraftFile.size / 1024))} KB selected` : 'PDF, JPG, JPEG, or PNG'}</span>
            </div>
            <input
              ref={scanUploadInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="visually-hidden-file"
              onChange={(event) => handleUploadDraftPick(event.target.files?.[0] || null)}
            />
            {uploadError ? <p className="error-message employee-modal-error">{uploadError}</p> : null}
            <div className="app-confirm-actions">
              {uploadDocumentPurpose === 'attachment' ? (
                <button type="button" className="btn-secondary" onClick={closeUploadDocumentModal}>Cancel</button>
              ) : (
                <>
                  <button type="button" className="btn-secondary" onClick={backToScanOptionsFromUpload}>Back</button>
                  <button type="button" className="btn-secondary" onClick={closeUploadDocumentModal}>Cancel</button>
                </>
              )}
              <button type="button" onClick={submitUploadDocument} disabled={!uploadDraftFile}>
                {uploadDocumentPurpose === 'attachment' ? 'Use for attachments' : 'Use document'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {scannerModalOpen ? (
        <div className="app-confirm-backdrop" role="presentation" onClick={closeScannerModal}>
          <div
            className="employee-review-modal employee-scan-modal employee-scanner-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-scanner-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="employee-review-header">
              <h2 id="employee-scanner-title">Scanner</h2>
            </div>
            <p className="app-confirm-message">
              The system connects through Asprise Scanner, which uses the local Asprise scan app and the TWAIN/WIA scanner driver before staging the scan for OCR.
            </p>
            <div className={`employee-scanner-status employee-scanner-status--${scannerStatus}`}>
              <strong>
                {scannerStatus === 'checking'
                  ? 'Checking Asprise Scanner...'
                  : scannerStatus === 'scanning'
                    ? 'Scanning document...'
                    : scannerStatus === 'ready'
                      ? 'Asprise scanner connection is ready'
                      : scannerStatus === 'no-devices'
                        ? 'Service found, no scanner detected'
                        : 'Asprise scanner app is not ready'}
              </strong>
              {scannerError ? <span>{scannerError}</span> : null}
            </div>
            {scannerStatus === 'service-missing' ? (
              <div className="employee-scanner-service-actions">
                <a className="btn-secondary" href={ASPRISE_SCANNER_LINKS.download} target="_blank" rel="noreferrer">Install scan app</a>
                <button type="button" onClick={checkScannerService}>I started the app - check again</button>
              </div>
            ) : null}
            {scannerStatus === 'ready' ? (
              <label className="employee-scanner-device-picker">
                Scanner device
                <select value={selectedScannerIndex} onChange={(event) => setSelectedScannerIndex(Number(event.target.value))}>
                  {scannerDevices.map((device, index) => (
                    <option key={`${device.displayName || device.name || 'scanner'}-${index}`} value={index}>
                      {device.displayName || device.name || `Scanner ${index + 1}`}
                    </option>
                  ))}
                </select>
            </label>
            ) : null}
            <div className="app-confirm-actions">
              <button type="button" className="btn-secondary" onClick={backToScanOptionsFromScanner}>Back</button>
              <button type="button" className="btn-secondary" onClick={closeScannerModal}>Cancel</button>
              {scannerStatus === 'no-devices' ? (
                <button type="button" onClick={checkScannerService}>Check again</button>
              ) : null}
              {scannerStatus === 'ready' ? (
                <button type="button" onClick={scanFromSelectedScanner}>Scan document</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {scanAttachmentModalOpen ? (
        <div className="app-confirm-backdrop" role="presentation" onClick={closeScanAttachmentModal}>
          <div
            className="employee-review-modal employee-scan-modal employee-scan-attach-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-scan-attach-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="employee-review-header">
              <h2 id="employee-scan-attach-title">Attach from document</h2>
            </div>
            <p className="app-confirm-message">
              Adjust the document and choose which attachment records should receive this image.
            </p>
            <div className="employee-scan-attach-workspace">
              <div className="employee-scan-attach-preview">
                {scanAttachmentSourcePreviewUrl && scanAttachmentSourceFile?.type?.startsWith('image/') ? (
                  <div
                    ref={scanAttachmentFrameRef}
                    className={`employee-scan-attach-image-frame${scanAttachmentZoom > 1 ? ' is-zoomed' : ''}${scanAttachmentDragging ? ' is-dragging' : ''}`}
                    onMouseDown={handleScanAttachmentPointerDown}
                  >
                    <img
                      src={scanAttachmentSourcePreviewUrl}
                      alt="Scanned document preview"
                      draggable="false"
                      style={{
                        transform: `translate(${scanAttachmentOffset.x}px, ${scanAttachmentOffset.y}px) rotate(${scanAttachmentRotation}deg) scale(${(scanAttachmentFlipX ? -1 : 1) * scanAttachmentZoom}, ${(scanAttachmentFlipY ? -1 : 1) * scanAttachmentZoom})`
                      }}
                    />
                  </div>
                ) : scanAttachmentSourcePreviewUrl ? (
                  <embed src={scanAttachmentSourcePreviewUrl} title="Scanned document preview" />
                ) : (
                  <div className="employee-camera-placeholder">No scanned preview is available.</div>
                )}
              </div>
              <div className="employee-scan-attach-controls">
                <div className="employee-scan-adjust-panel">
                  <strong>Adjust</strong>
                  <div className="employee-scan-adjust-actions">
                    <button type="button" className="btn-secondary" onClick={() => setScanAttachmentRotation((prev) => (prev + 270) % 360)}>Rotate left</button>
                    <button type="button" className="btn-secondary" onClick={() => setScanAttachmentRotation((prev) => (prev + 90) % 360)}>Rotate right</button>
                    <button type="button" className="btn-secondary" onClick={() => setScanAttachmentFlipX((prev) => !prev)}>Flip horizontal</button>
                    <button type="button" className="btn-secondary" onClick={() => setScanAttachmentFlipY((prev) => !prev)}>Flip vertical</button>
                    <button type="button" className="btn-secondary" onClick={() => setScanAttachmentZoom((prev) => Math.min(5, Number((prev + 0.25).toFixed(2))))}>Zoom in</button>
                    <button type="button" className="btn-secondary" onClick={() => setScanAttachmentZoom((prev) => {
                      const next = Math.max(1, Number((prev - 0.25).toFixed(2)))
                      if (next === 1) setScanAttachmentOffset({ x: 0, y: 0 })
                      return next
                    })}>Zoom out</button>
                    <button type="button" className="btn-secondary" onClick={resetScanAttachmentView}>Reset view</button>
                  </div>
                  {scanAttachmentSourceFile?.type?.startsWith('image/') ? (
                    <p className="muted-text employee-step-note">Use the mouse wheel to zoom from the cursor, then drag the image to frame the part you want. Attach selected saves what is currently visible.</p>
                  ) : (
                    <p className="muted-text employee-step-note">PDF scans can be attached directly. Crop, rotate, and flip are available for image scans.</p>
                  )}
                </div>
                <div className="employee-scan-attachment-list">
                  <strong>Attachment list</strong>
                  <div className="employee-scan-attachment-options">
                    {ATTACHMENT_FIELDS.map((attachment) => (
                      <label key={attachment.key} className="checkbox-pill">
                        <input
                          type="checkbox"
                          checked={scanAttachmentKeys.includes(attachment.key)}
                          onChange={() => handleScanAttachmentKeyToggle(attachment.key)}
                        />
                        <span>{attachmentLabels[attachment.key] || attachment.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {scanAttachmentError ? <p className="error-message employee-modal-error">{scanAttachmentError}</p> : null}
            <div className="app-confirm-actions">
              <button type="button" className="btn-secondary" onClick={closeScanAttachmentModal}>Cancel</button>
              <button type="button" onClick={attachSelectedFromScan} disabled={scanAttachmentKeys.length === 0}>Attach selected</button>
            </div>
          </div>
        </div>
      ) : null}
      {ocrSetupModalOpen ? (
        <div className="app-confirm-backdrop" role="presentation" onClick={closeOcrSetupModal}>
          <div
            className="employee-review-modal employee-scan-modal employee-ocr-setup-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-ocr-setup-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="employee-review-header">
              <h2 id="employee-ocr-setup-title">OCR setup</h2>
            </div>
            <p className="app-confirm-message">
              Make sure the configured OCR service is running and reachable from this portal backend, then check again so employee document autofill can run.
            </p>
            <div className={`employee-scanner-status employee-scanner-status--${ocrStatus.ready ? 'ready' : 'service-missing'}`}>
              <strong>{ocrStatus.ready ? 'OCR service is ready' : 'OCR service is not ready'}</strong>
              <span>{ocrStatusLoading ? 'Checking OCR service...' : normalizeOcrStatusMessage(ocrStatus.message)}</span>
            </div>
            {!ocrStatus.ready ? (
              <div className="employee-scanner-service-actions">
                <button type="button" onClick={checkOcrStatus} disabled={ocrStatusLoading}>
                  {ocrStatusLoading ? 'Checking...' : 'I started it - check again'}
                </button>
              </div>
            ) : null}
            <div className="app-confirm-actions">
              <button type="button" className="btn-secondary" onClick={closeOcrSetupModal}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
      {openedEmployee ? (
        <div className="employee-review-backdrop" role="presentation" onClick={() => setOpenedEmployeeId(null)}>
          <div className="employee-review-modal" role="dialog" aria-modal="true" aria-labelledby="employee-review-title" onClick={(event) => event.stopPropagation()}>
            <div className="employee-review-header">
              <div className="employee-card-identity">
                <div
                  className={`employee-card-avatar employee-review-avatar${openedEmployeeProfileDocument?.file_url && isImageDocument(openedEmployeeProfileDocument) ? ' is-clickable' : ''}`}
                  role={openedEmployeeProfileDocument?.file_url && isImageDocument(openedEmployeeProfileDocument) ? 'button' : undefined}
                  tabIndex={openedEmployeeProfileDocument?.file_url && isImageDocument(openedEmployeeProfileDocument) ? 0 : undefined}
                  onClick={
                    openedEmployeeProfileDocument?.file_url && isImageDocument(openedEmployeeProfileDocument)
                      ? () =>
                          openDocumentPreview({
                            url: openedEmployeeProfileDocument.file_url,
                            label: `${openedEmployee.full_name} portrait`,
                            isImage: true,
                            isPdf: false
                          })
                      : undefined
                  }
                  onKeyDown={
                    openedEmployeeProfileDocument?.file_url && isImageDocument(openedEmployeeProfileDocument)
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openDocumentPreview({
                              url: openedEmployeeProfileDocument.file_url,
                              label: `${openedEmployee.full_name} portrait`,
                              isImage: true,
                              isPdf: false
                            })
                          }
                        }
                      : undefined
                  }
                >
                  {openedEmployeeProfileDocument?.file_url && isImageDocument(openedEmployeeProfileDocument) ? (
                    <img src={openedEmployeeProfileDocument.file_url} alt={`${openedEmployee.full_name} profile`} />
                  ) : (
                    <span>{openedEmployee.full_name?.charAt(0) || '?'}</span>
                  )}
                </div>
                <div>
                  <p className="employee-modal-eyebrow">Employee review</p>
                  <h2 id="employee-review-title">{openedEmployee.full_name}</h2>
                  <p className="muted-text">{openedEmployee.profession || openedEmployee.professional_title || '--'} | {employeeStatusLabel(openedEmployee)}</p>
                </div>
              </div>
              <div className="inline-actions">
                {openedEmployeeMode === 'request' ? (
                  <button type="button" className="btn-secondary" onClick={() => setOpenedEmployeeMode('full')}>Open employee details</button>
                ) : null}
                <button type="button" className="btn-secondary" onClick={() => setOpenedEmployeeId(null)}>Close</button>
              </div>
            </div>
            <div className="employee-review-grid">
              {openedEmployeeMode === 'request' ? (
                <>
                  <div className="employee-summary-card">
                    <h3>Commission</h3>
                    <p><strong>Status:</strong> {employedCommissionLabel(openedEmployee)}</p>
                    <p className="muted-text">Collection from the agent side to the organization is a future settlement concept.</p>
                  </div>
                  <div className="employee-summary-card">
                    <h3>Last return request</h3>
                    <p><strong>Status:</strong> {openedEmployeeReturnRequest ? prettyStatus(openedEmployeeReturnRequest.status) : 'None'}</p>
                    <p><strong>Remark:</strong> {openedEmployeeReturnRequest?.remark || 'None'}</p>
                    <p><strong>Requested by:</strong> {openedEmployeeReturnRequest?.requested_by_username || '--'}</p>
                    <p><strong>Requested at:</strong> {formatDateTime(openedEmployeeReturnRequest?.requested_at)}</p>
                    <p><strong>Responded by:</strong> {openedEmployeeReturnRequest?.approved_by_username || '--'}</p>
                    <p><strong>Responded at:</strong> {formatDateTime(openedEmployeeReturnRequest?.approved_at)}</p>
                    <div className="employee-modal-document-strip employee-modal-document-strip--spaced">
                      {[openedEmployeeReturnRequest?.evidence_file_1_url, openedEmployeeReturnRequest?.evidence_file_2_url, openedEmployeeReturnRequest?.evidence_file_3_url]
                        .filter(Boolean)
                        .map((url, index) => (
                          <button
                            type="button"
                            key={`return-request-evidence-${index}`}
                            className="employee-modal-document-card"
                            title={`Evidence ${index + 1}`}
                            onClick={() =>
                              openDocumentPreview({
                                url,
                                label: `Evidence ${index + 1}`,
                                isImage: !isPdfDocumentUrl(url),
                                isPdf: isPdfDocumentUrl(url)
                              })
                            }
                          >
                            <div className="employee-modal-document-tile">
                              {isPdfDocumentUrl(url) ? <span>PDF</span> : <img src={url} alt={`Evidence ${index + 1}`} />}
                            </div>
                          </button>
                        ))}
                      {![openedEmployeeReturnRequest?.evidence_file_1_url, openedEmployeeReturnRequest?.evidence_file_2_url, openedEmployeeReturnRequest?.evidence_file_3_url].some(Boolean) ? (
                        <span className="muted-text">No evidence uploaded.</span>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="employee-summary-card">
                    <h3>Overview</h3>
                    <p><strong>Age:</strong> {openedEmployee.age || '--'}</p>
                    <p><strong>Availability:</strong> {employeeAvailability(openedEmployee)}</p>
                    <p><strong>Phone:</strong> {openedEmployee.phone || openedEmployee.mobile_number || '--'}</p>
                    <p><strong>Email:</strong> {openedEmployee.email || '--'}</p>
                    <p><strong>Registered by:</strong> {openedEmployee.registered_by_username || '--'}</p>
                    {openedEmployee.selection_state?.selection ? (
                      <p>
                        <strong>{openedEmployee.selection_state.selection.status === 'under_process' ? 'Process owner:' : 'Selected in market by:'}</strong>{' '}
                        {openedEmployee.selection_state.selection.agent_name || '--'}
                      </p>
                    ) : null}
                  </div>
                  <div className="employee-summary-card">
                    <h3>Application</h3>
                    <p><strong>Destination countries:</strong> {openedEmployee.application_countries?.join(', ') || '--'}</p>
                    <div className="employee-progress-panel">
                      <div className="employee-progress-donut" aria-label={`Progress ${openedEmployeeProgress.overallProgress}%`}>
                        <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
                          <circle cx="60" cy="60" r={openedEmployeeProgress.radius} className="employee-progress-track" />
                          <circle
                            cx="60"
                            cy="60"
                            r={openedEmployeeProgress.radius}
                            className="employee-progress-value"
                            stroke={openedEmployeeProgress.tone}
                            strokeDasharray={openedEmployeeProgress.circumference}
                            strokeDashoffset={openedEmployeeProgress.dashOffset}
                          />
                        </svg>
                        <div className="employee-progress-donut-label">
                          <strong>{openedEmployeeProgress.overallProgress}%</strong>
                          <span>Overall</span>
                        </div>
                      </div>
                      <div className="employee-progress-metrics">
                        <p><strong>Fields:</strong> {openedEmployee.progress_status?.field_completion ?? 0}%</p>
                        <p><strong>Documents:</strong> {openedEmployee.progress_status?.document_completion ?? 0}%</p>
                        <p><strong>Status:</strong> {employeeStatusLabel(openedEmployee)}</p>
                      </div>
                    </div>
                    <p><strong>Travel:</strong> {prettyStatus(openedEmployee.travel_status, 'pending')}</p>
                    <p><strong>Return:</strong> {prettyStatus(openedEmployee.return_status)}</p>
                  </div>
                  <div className="employee-summary-card">
                    <h3>Commission</h3>
                    <p><strong>Status:</strong> {employedCommissionLabel(openedEmployee)}</p>
                    <p className="muted-text">Collection from the agent side to the organization is a future settlement concept.</p>
                  </div>
                  <div className="employee-summary-card employee-review-documents">
                    <h3>Documents</h3>
                    <div className="employee-modal-document-strip">
                      {(openedEmployee.documents || []).length === 0 ? (
                        <span className="muted-text">No documents uploaded.</span>
                      ) : (
                        openedEmployee.documents.map((document) => (
                          <button
                            type="button"
                            key={document.id}
                            className="employee-modal-document-card"
                            title={fileLabel(document, attachmentLabels)}
                            onClick={() =>
                              openDocumentPreview({
                                url: document.file_url,
                                label: fileLabel(document, attachmentLabels),
                                isImage: isImageDocument(document),
                                isPdf: isPdfDocumentUrl(document.file_url)
                              })
                            }
                          >
                            <div className="employee-modal-document-tile">
                              {isImageDocument(document) ? (
                                <img src={document.file_url} alt={fileLabel(document, attachmentLabels)} />
                              ) : (
                                <span>{fileLabel(document, attachmentLabels).slice(0, 2).toUpperCase()}</span>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="employee-summary-card">
                    <h3>Last return request</h3>
                    {openedEmployeeReturnRequest ? (
                      <>
                        <p><strong>Status:</strong> {prettyStatus(openedEmployeeReturnRequest.status)}</p>
                        <p><strong>Remark:</strong> {openedEmployeeReturnRequest.remark || '--'}</p>
                        <p><strong>Requested by:</strong> {openedEmployeeReturnRequest.requested_by_username || '--'}</p>
                        <p><strong>Requested at:</strong> {formatDateTime(openedEmployeeReturnRequest.requested_at)}</p>
                        <p><strong>Responded by:</strong> {openedEmployeeReturnRequest.approved_by_username || '--'}</p>
                        <p><strong>Responded at:</strong> {formatDateTime(openedEmployeeReturnRequest.approved_at)}</p>
                        {openedEmployee.returned_recorded_by_username ? (
                          <p><strong>Returned recorded by:</strong> {openedEmployee.returned_recorded_by_username}</p>
                        ) : null}
                        <div className="employee-modal-document-strip employee-modal-document-strip--spaced">
                          {[openedEmployeeReturnRequest.evidence_file_1_url, openedEmployeeReturnRequest.evidence_file_2_url, openedEmployeeReturnRequest.evidence_file_3_url]
                            .filter(Boolean)
                            .map((url, index) => (
                              <button
                                type="button"
                                key={`last-return-request-evidence-${index}`}
                                className="employee-modal-document-card"
                                title={`Evidence ${index + 1}`}
                                onClick={() =>
                                  openDocumentPreview({
                                    url,
                                    label: `Evidence ${index + 1}`,
                                    isImage: !isPdfDocumentUrl(url),
                                    isPdf: isPdfDocumentUrl(url)
                                  })
                                }
                              >
                                <div className="employee-modal-document-tile">
                                  {isPdfDocumentUrl(url) ? <span>PDF</span> : <img src={url} alt={`Evidence ${index + 1}`} />}
                                </div>
                              </button>
                            ))}
                        </div>
                      </>
                    ) : (
                      <p>None</p>
                    )}
                  </div>
                </>
              )}
              {canReinstateOpenedEmployeeEmployment ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleReinstateEmployeeEmployment(openedEmployee)}
                  disabled={actionBusyId === openedEmployee.id || readOnly}
                >
                  {actionBusyId === openedEmployee.id ? 'Saving...' : 'Reverse to employed'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {previewDocument ? (
        <div className="document-preview-backdrop" role="presentation" onClick={closeDocumentPreview}>
          <div
            className="document-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={previewDocument.label || 'Document preview'}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="document-preview-toolbar">
              <div>
                <h3 className="document-preview-title">{previewDocument.label}</h3>
                <p className="muted-text document-preview-subtitle">
                  Previewing attached document
                </p>
              </div>
              <div className="document-preview-actions">
                <button
                  type="button"
                  className="btn-secondary document-preview-download"
                  onClick={handlePreviewDownload}
                >
                  Download
                </button>
                <button type="button" className="btn-secondary" onClick={handlePreviewPrint}>
                  Print
                </button>
                {previewDocument.isImage ? (
                  <>
                    <button type="button" className="btn-secondary" onClick={handlePreviewZoomOut} disabled={previewZoom <= 1}>
                      Zoom out
                    </button>
                    <button type="button" className="btn-secondary" onClick={handlePreviewZoomIn} disabled={previewZoom >= 4}>
                      Zoom in
                    </button>
                    <button type="button" className="btn-secondary" onClick={handlePreviewReset} disabled={previewZoom === 1 && previewOffset.x === 0 && previewOffset.y === 0}>
                      Reset
                    </button>
                  </>
                ) : null}
                <button type="button" className="btn-secondary" onClick={closeDocumentPreview}>
                  Close
                </button>
              </div>
            </div>
            <div
              className={`document-preview-canvas${previewZoom > 1 ? ' is-zoomed' : ''}${previewDragging ? ' is-dragging' : ''}`}
              onWheel={handlePreviewWheel}
              onMouseDown={handlePreviewPointerDown}
            >
              {previewDocument.isImage ? (
                <img
                  src={previewDocument.url}
                  alt={previewDocument.label}
                  draggable={false}
                  style={{ transform: `translate(${previewOffset.x}px, ${previewOffset.y}px) scale(${previewZoom})` }}
                />
              ) : previewDocument.isPdf ? (
                <iframe
                  src={previewDocument.url}
                  title={previewDocument.label}
                  className="document-preview-frame"
                />
              ) : (
                <div className="employee-attachment-preview-file">
                  Preview unavailable for this file type.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
