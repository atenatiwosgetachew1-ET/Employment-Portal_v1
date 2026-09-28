export const MINIMUM_EMPLOYEE_AGE = 18
import * as employeesService from '../services/employeesService'
import { normalizeSearchValue } from './filtering'
import { isAgentSideWorkspace } from './profileStore'
export const PHONE_ALLOWED_CHARS = /^[+\d\s()-]+$/
export const DOCUMENT_NUMBER_PATTERN = /^[A-Za-z0-9\s/-]+$/
export const OPTIONAL_DATE_FIELDS = [
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
export const MANDATORY_ATTACHMENT_KEYS = ['portrait_photo', 'full_photo', 'passport_document']
export const ALLOWED_ATTACHMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
export const ALLOWED_ATTACHMENT_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png']
export const CANDIDATE_REGISTRATION_TEMPLATE_STORAGE_KEY = 'employment-portal.candidate-registration-template'
export const LEGACY_REGISTRATION_TEMPLATE_STORAGE_KEY = 'employment-portal.employee-registration-template'
export const REGISTRATION_TEMPLATE_STORAGE_KEY = CANDIDATE_REGISTRATION_TEMPLATE_STORAGE_KEY
export const REGISTRATION_DRAFT_DB_NAME = 'employment-portal-drafts'
export const REGISTRATION_DRAFT_DB_VERSION = 1
export const REGISTRATION_DRAFT_STORE = 'drafts'
export const CANDIDATE_REGISTRATION_DRAFT_KEY = 'candidate-registration'
export const LEGACY_REGISTRATION_DRAFT_KEY = 'employee-registration'
export const REGISTRATION_DRAFT_KEY = CANDIDATE_REGISTRATION_DRAFT_KEY
export const TRAVEL_CONFIRMATION_DECLINED_STORAGE_KEY = 'employment-portal.travel-confirmation-declined'
export const TRAVEL_CONFIRMATION_CONFIRMED_STORAGE_KEY = 'employment-portal.travel-confirmation-confirmed'
export const COMMISSION_SETTLEMENT_STORAGE_KEY = 'employment-portal.commission-settlements'
export const COMMISSION_STORAGE_DB_NAME = 'employment-portal-storage'
export const COMMISSION_STORAGE_DB_VERSION = 1
export const COMMISSION_STORAGE_SETTLEMENT_STORE = 'commission-settlements'
export const COMMISSION_STORAGE_PRIMARY_KEY = 'primary'
export const TEMPLATE_FORM_FIELDS = [
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
export const EMPLOYEE_OCR_FIELD_LABELS = {
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
export const OCR_UNREACHABLE_MESSAGE = 'OCR service is not reachable. Please try again later.'
export const EMPLOYEE_CARD_MASONRY_DEBUG_FLAG = '__employeeCardMasonryDebug__'
export const EMPLOYEE_CARD_MASONRY_DEBUG_STORAGE_KEY = 'employment-portal.employee-card-masonry-debug'

export function employeeCardMasonryDebugEnabled() {
  if (typeof window === 'undefined') return false
  if (window[EMPLOYEE_CARD_MASONRY_DEBUG_FLAG]) return true
  try {
    return window.localStorage?.getItem(EMPLOYEE_CARD_MASONRY_DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function employeeCardMasonryDebugLog(...args) {
  if (!employeeCardMasonryDebugEnabled()) return
  // eslint-disable-next-line no-console
  console.log('[employees:masonry]', ...args)
}

export function employeeCardMasonryAttachScrollLogger(container) {
  if (!employeeCardMasonryDebugEnabled()) return () => {}
  if (!container) return () => {}
  let last = container.scrollTop
  const handler = () => {
    const next = container.scrollTop
    if (Math.abs(next - last) > 40) {
      employeeCardMasonryDebugLog('scroll', { from: last, to: next })
    }
    last = next
  }
  container.addEventListener('scroll', handler, { passive: true })
  return () => container.removeEventListener('scroll', handler)
}

export function normalizeOcrStatusMessage(message) {
  if (!message) return OCR_UNREACHABLE_MESSAGE
  const normalized = String(message).trim()
  if (!normalized) return OCR_UNREACHABLE_MESSAGE
  if (normalized.toLowerCase().includes('ocr service is not reachable')) {
    return OCR_UNREACHABLE_MESSAGE
  }
  return normalized
}

export function readCssCustomProperty(name) {
  if (typeof window === 'undefined') return ''
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value
}
export const emptyExperience = { country: '', years: '' }
export const REGISTRATION_STEPS = [
  { id: 'personal', label: 'Personal', description: 'Identity & basic credentials' },
  { id: 'profile', label: 'Profile', description: 'Demographics & physical details' },
  { id: 'contact', label: 'Contact', description: 'Emergency contact & references' },
  { id: 'application', label: 'Application', description: 'Destination, skills & job role' },
  { id: 'attachments', label: 'Documents', description: 'Mandatory & supporting files' },
  { id: 'summary', label: 'Review', description: 'Verify details & submit' }
]

export function getValidationStep(errorMessage) {
  const target = getValidationTarget(errorMessage)
  return target && target.selector ? target.step : null
}

export function getValidationTarget(errorMessage) {
  const message = (errorMessage || '').toLowerCase()

  if (!message) return null

  if (
    message.includes('first name') ||
    message.includes('middle name') ||
    message.includes('last name') ||
    message.includes('date of birth') ||
    message.includes('years old') ||
    (message.includes('at least') && message.includes('year')) ||
    message.includes('gender') ||
    message.includes('passport number') ||
    message.includes('mobile number') ||
    message.includes('labour id') ||
    message.includes('id number')
  ) {
    if (message.includes('first name')) return { step: 0, selector: '[name="first_name"]' }
    if (message.includes('middle name')) return { step: 0, selector: '[name="middle_name"]' }
    if (message.includes('last name')) return { step: 0, selector: '[name="last_name"]' }
    if (message.includes('date of birth') || message.includes('years old') || message.includes('at least')) return { step: 0, selector: '[name="date_of_birth"]' }
    if (message.includes('gender')) return { step: 0, selector: '[name="gender"]' }
    if (message.includes('passport number')) return { step: 0, selector: '[name="passport_number"]' }
    if (message.includes('mobile number')) return { step: 0, selector: '[name="mobile_number"]' }
    if (message.includes('labour id')) return { step: 0, selector: '[name="labour_id"]' }
    if (message.includes('id number')) return { step: 0, selector: '[name="id_number"]' }
    return { step: 0, selector: '[name="first_name"]' }
  }

  if (
    message.includes('religion') ||
    message.includes('marital status') ||
    message.includes('residence country') ||
    message.includes('nationality') ||
    message.includes('birth place') ||
    message.includes('weight') ||
    message.includes('height') ||
    message.includes('children count')
  ) {
    if (message.includes('religion')) return { step: 1, selector: '[name="religion"]' }
    if (message.includes('marital status')) return { step: 1, selector: '[name="marital_status"]' }
    if (message.includes('residence country')) return { step: 1, selector: '[name="residence_country"]' }
    if (message.includes('nationality')) return { step: 1, selector: '[name="nationality"]' }
    if (message.includes('birth place')) return { step: 1, selector: '[name="birth_place"]' }
    if (message.includes('weight')) return { step: 1, selector: '[name="weight_kg"]' }
    if (message.includes('height')) return { step: 1, selector: '[name="height_cm"]' }
    if (message.includes('children count')) return { step: 1, selector: '[name="children_count"]' }
    return { step: 1, selector: '[name="religion"]' }
  }

  if (
    message.includes('contact person') ||
    message.includes('phone') ||
    message.includes('email')
  ) {
    if (message.includes('contact person name')) return { step: 2, selector: '[name="contact_person_name"]' }
    if (message.includes('contact person mobile')) return { step: 2, selector: '[name="contact_person_mobile"]' }
    if (message.includes('contact person id')) return { step: 2, selector: '[name="contact_person_id_number"]' }
    if (message.includes('phone')) return { step: 2, selector: '[name="phone"]' }
    if (message.includes('email')) return { step: 2, selector: '[name="email"]' }
    return { step: 2, selector: '[name="contact_person_name"]' }
  }

  if (
    message.includes('destination country') ||
    message.includes('application_countries') ||
    message.includes('profession') ||
    message.includes('type is required') ||
    message.includes('employment type') ||
    message.includes('salary') ||
    message.includes('skill') ||
    message.includes('language') ||
    message.includes('experience') ||
    message.includes('years')
  ) {
    if (message.includes('destination country') || message.includes('application_countries')) return { step: 3, selector: '[name="application_countries"]' }
    if (message.includes('profession')) return { step: 3, selector: '[name="profession"]' }
    if (message.includes('type is required') || message.includes('employment type')) return { step: 3, selector: '[name="employment_type"]' }
    if (message.includes('salary')) return { step: 3, selector: '[name="application_salary"]' }
    if (message.includes('skill')) return { step: 3, selector: '[name="skills"]' }
    if (message.includes('language')) return { step: 3, selector: '[name="languages"]' }
    if (message.includes('experience') || message.includes('years')) return { step: 3, selector: '[name^="experience_country_"]' }
    return { step: 3, selector: '[name="application_countries"]' }
  }

  if (
    message.includes('portrait photo') ||
    message.includes('full photo') ||
    message.includes('passport is required') ||
    message.includes('passport document') ||
    message.includes('passport_document') ||
    message.includes('departure date') ||
    message.includes('departure_date') ||
    message.includes('return ticket') ||
    message.includes('medical') ||
    message.includes('contract') ||
    message.includes('visa') ||
    message.includes('competency') ||
    message.includes('clearance') ||
    message.includes('insurance') ||
    message.includes('attachment')
  ) {
    if (message.includes('portrait photo')) return { step: 4, selector: '[name="portrait_photo"]' }
    if (message.includes('full photo')) return { step: 4, selector: '[name="full_photo"]' }
    if (message.includes('passport is required') || message.includes('passport document') || message.includes('passport_document')) return { step: 4, selector: '[name="passport_document"]' }
    return { step: 4, selector: '[name="portrait_photo"]' }
  }

  return null
}
export const EMPLOYEE_VIEW_TABS = [
  { id: 'register', label: 'Register candidate' },
  { id: 'list', label: 'All candidates' },
  { id: 'selected', label: 'Selected Candidates' },
  { id: 'under-process', label: 'Under process Candidates' },
  { id: 'employed', label: 'Employed' },
  { id: 'returned', label: 'Returned list' }
]
export const EMPLOYEE_TAG_FILTER_OPTIONS = [
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
export const GRID_CARD_PREVIEW_DOCUMENTS = [
  { key: 'portrait', label: 'Portrait', types: ['portrait_photo'] },
  { key: 'full', label: 'Full photo', types: ['full_photo'] },
  { key: 'passport', label: 'Passport', types: ['passport_photo', 'passport_document'] }
]

export const EMPLOYEE_CARDS_BATCH_SIZE = 10

export const LIST_CARD_PREVIEW_DOCUMENTS = [
  { key: 'full', label: 'Full photo', types: ['full_photo'] },
  { key: 'passport', label: 'Passport', types: ['passport_photo', 'passport_document'] },
  { key: 'medical', label: 'Medical', types: ['medical'] },
  { key: 'clearance', label: 'Clearance', types: ['clearance'] },
  { key: 'competency', label: 'Competency', types: ['competency_certificate'] },
  { key: 'certificate', label: 'Certificate', types: ['certificate'] }
]

export function buildOcrCacheKey(file) {
  if (!file) return ''
  return [
    file.name || 'scan',
    file.size || 0,
    file.lastModified || 0,
    file.type || ''
  ].join('::')
}

export const emptyForm = {
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

export function computeAge(value) {
  if (!value) return ''
  const birth = new Date(value)
  if (Number.isNaN(birth.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1
  return age >= 0 ? age : ''
}

export function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load the scanned image for attachment.'))
    image.src = url
  })
}

export function normalizeEmployeeForm(employee) {
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

export function buildRegistrationTemplate(form) {
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

export function applyRegistrationTemplate(template) {
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

export function normalizeDraftForm(value) {
  if (!value || typeof value !== 'object') return { ...emptyForm, experiences: [emptyExperience] }
  const next = { ...emptyForm, ...value }
  next.application_countries = Array.isArray(next.application_countries) ? next.application_countries : []
  next.skills = Array.isArray(next.skills) ? next.skills : []
  next.languages = Array.isArray(next.languages) ? next.languages : []
  next.experiences = Array.isArray(next.experiences) && next.experiences.length > 0 ? next.experiences : [emptyExperience]
  return next
}

export function openRegistrationDraftDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Draft storage is unavailable in this browser.'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REGISTRATION_DRAFT_DB_NAME, REGISTRATION_DRAFT_DB_VERSION)
    request.onerror = () => reject(new Error('Could not open draft storage.'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(REGISTRATION_DRAFT_STORE)) {
        db.createObjectStore(REGISTRATION_DRAFT_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

export async function readRegistrationDraft() {
  const db = await openRegistrationDraftDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(REGISTRATION_DRAFT_STORE, 'readonly')
      const store = tx.objectStore(REGISTRATION_DRAFT_STORE)
      const request = store.get(CANDIDATE_REGISTRATION_DRAFT_KEY)
      request.onerror = () => reject(new Error('Could not read draft.'))
      request.onsuccess = () => {
        if (request.result) return resolve(request.result)
        const legacyReq = store.get(LEGACY_REGISTRATION_DRAFT_KEY)
        legacyReq.onerror = () => resolve(null)
        legacyReq.onsuccess = () => resolve(legacyReq.result || null)
      }
    })
  } finally {
    db.close()
  }
}

export async function writeRegistrationDraft(value) {
  const db = await openRegistrationDraftDb()
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(REGISTRATION_DRAFT_STORE, 'readwrite')
      const store = tx.objectStore(REGISTRATION_DRAFT_STORE)
      const request = store.put(value, REGISTRATION_DRAFT_KEY)
      request.onerror = () => reject(new Error('Could not save draft.'))
      request.onsuccess = () => resolve()
    })
  } finally {
    db.close()
  }
}


export function fileLabel(document, attachmentLabels) {
  if (document.label) return document.label
  return attachmentLabels[document.document_type] || document.document_type
}

export function findEmployeeDocument(employee, documentTypes) {
  return (employee?.documents || []).find((document) => documentTypes.includes(document.document_type)) || null
}

export function isImageDocument(document) {
  if (!document?.file_url) return false
  const value = document.file_url.toLowerCase()
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].some((extension) => value.includes(extension))
}

export function isPdfDocumentUrl(value) {
  if (!value) return false
  return String(value).toLowerCase().includes('.pdf')
}

export function buildDownloadName(label, url) {
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

export async function fetchPreviewBlob(url) {
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Could not load file for preview action.')
  }
  return response.blob()
}

export const PORTAL_PRINT_FRAME_ID = '__portal_print_frame__'

export function cleanupPrintFrame() {
  if (typeof document === 'undefined') return
  const frames = document.querySelectorAll(`#${PORTAL_PRINT_FRAME_ID}, .${PORTAL_PRINT_FRAME_ID}`)
  frames.forEach((el) => {
    try {
      el.remove()
    } catch {
      // ignore
    }
  })
}

export async function printDocumentSilently(previewDoc) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (!previewDoc) return

  const url = typeof previewDoc === 'string' ? previewDoc : previewDoc.url
  if (!url) return

  const label = typeof previewDoc === 'object' ? (previewDoc.label || previewDoc.name || 'Document preview') : 'Document preview'
  const isImage = typeof previewDoc === 'object' ? Boolean(
    previewDoc.isImage ??
    (
      previewDoc.type?.startsWith('image/') ||
      previewDoc.mime?.startsWith('image/') ||
      previewDoc.file?.type?.startsWith('image/') ||
      previewDoc.isProfilePhoto ||
      (typeof url === 'string' && (
        url.startsWith('data:image/') ||
        url.startsWith('blob:') ||
        /\.(jpe?g|png|webp|gif|svg|bmp|avif)($|\?)/i.test(url)
      )) ||
      (typeof previewDoc.name === 'string' && /\.(jpe?g|png|webp|gif|svg|bmp|avif)($|\?)/i.test(previewDoc.name))
    )
  ) : /\.(jpe?g|png|webp|gif|svg|bmp|avif)($|\?)/i.test(url)

  // 1. Clean up any previous print frame so they NEVER pile up
  cleanupPrintFrame()

  // 2. Create the hidden off-screen iframe
  const iframe = document.createElement('iframe')
  iframe.id = PORTAL_PRINT_FRAME_ID
  iframe.className = PORTAL_PRINT_FRAME_ID
  iframe.style.position = 'fixed'
  iframe.style.right = '-9999px'
  iframe.style.bottom = '-9999px'
  iframe.style.width = '1px'
  iframe.style.height = '1px'
  iframe.style.border = '0'
  iframe.style.opacity = '0.01'
  iframe.style.pointerEvents = 'none'
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('tabindex', '-1')
  document.body.appendChild(iframe)

  let objectUrlToRevoke = null
  let cleanedUp = false

  const removeFrameSafely = () => {
    if (cleanedUp) return
    cleanedUp = true
    try {
      iframe.remove()
    } catch {
      // ignore
    }
    if (objectUrlToRevoke) {
      try {
        window.URL.revokeObjectURL(objectUrlToRevoke)
      } catch {
        // ignore
      }
      objectUrlToRevoke = null
    }
  }

  // Fallback cleanup timer in case afterprint does not fire
  let safetyTimer = setTimeout(removeFrameSafely, 120000)

  const triggerIframePrint = () => {
    try {
      iframe.contentWindow?.focus?.()
      iframe.contentWindow?.print?.()
    } catch (err) {
      console.warn('Silent print execution failed:', err)
      removeFrameSafely()
    }
  }

  // Hook into afterprint to cleanup as soon as the print dialog closes
  try {
    iframe.contentWindow?.addEventListener?.('afterprint', () => {
      clearTimeout(safetyTimer)
      setTimeout(removeFrameSafely, 500)
    })
  } catch {
    // ignore
  }

  let printSrc = url
  if (!url.startsWith('data:') && !url.startsWith('blob:')) {
    try {
      const blob = await fetchPreviewBlob(url)
      objectUrlToRevoke = window.URL.createObjectURL(blob)
      printSrc = objectUrlToRevoke
    } catch {
      printSrc = url
    }
  }

  if (isImage) {
    const escapedTitle = String(label)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')

    const frameDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!frameDoc) {
      removeFrameSafely()
      return
    }

    frameDoc.open()
    frameDoc.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapedTitle}</title>
    <style>
      @page {
        size: auto;
        margin: 10mm;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }
      img {
        max-width: 100%;
        max-height: 96vh;
        object-fit: contain;
        page-break-inside: avoid;
      }
    </style>
  </head>
  <body>
    <img id="print-target-img" src="${printSrc}" alt="${escapedTitle}" />
  </body>
</html>`)
    frameDoc.close()

    const img = frameDoc.getElementById('print-target-img')
    if (img) {
      if (img.complete) {
        setTimeout(triggerIframePrint, 120)
      } else {
        img.onload = () => setTimeout(triggerIframePrint, 120)
        img.onerror = () => removeFrameSafely()
      }
    } else {
      setTimeout(triggerIframePrint, 200)
    }
  } else {
    // PDF or other document
    iframe.onload = () => {
      setTimeout(triggerIframePrint, 400)
    }
    iframe.onerror = () => removeFrameSafely()
    iframe.src = printSrc
  }
}

export function attachmentFileAllowed(file) {
  if (!file) return true
  const lowerName = (file.name || '').toLowerCase()
  const hasAllowedExtension = ALLOWED_ATTACHMENT_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
  const mimeType = (file.type || '').toLowerCase()
  const hasAllowedMime = !mimeType || ALLOWED_ATTACHMENT_MIME_TYPES.includes(mimeType)
  return hasAllowedExtension && hasAllowedMime
}

export function attachmentDisplayName(document, attachmentLabels) {
  if (!document) return ''
  if (document.label) return document.label
  if (document.file) {
    const parts = String(document.file).split('/')
    return parts[parts.length - 1] || document.file
  }
  return attachmentLabels[document.document_type] || document.document_type
}

export function employeeProfilePhoto(employee) {
  return (
    findEmployeeDocument(employee, ['portrait_photo']) ||
    findEmployeeDocument(employee, ['full_photo']) ||
    findEmployeeDocument(employee, ['passport_photo', 'passport_document'])
  )
}

export function isEmployeeReturned(employee) {
  return Boolean(
    employee?.returned_from_employment ||
    employee?.return_request?.status === 'approved'
  )
}

export function normalizedTravelStatus(employee) {
  return String(employee?.travel_status || '').trim().toLowerCase().replace(/\s+/g, '_')
}

export function isEmployeeTravelled(employee) {
  const travelStatus = normalizedTravelStatus(employee)
  return Boolean(
    !isEmployeeReturned(employee) &&
    !employee?.did_travel &&
    ['traveled', 'travelled'].includes(travelStatus)
  )
}

export function isEmployeeEmployed(employee) {
  return Boolean(
    !isEmployeeReturned(employee) &&
    !isEmployeeTravelled(employee) &&
    employee?.did_travel
  )
}

export function isEmployeeUnderProcess(employee) {
  return Boolean(
    !isEmployeeReturned(employee) &&
    !isEmployeeTravelled(employee) &&
    !isEmployeeEmployed(employee) &&
    employee?.selection_state?.selection?.status === 'under_process'
  )
}

export function isEmployeeReadyForEmploymentStage(employee) {
  return Boolean(
    isEmployeeUnderProcess(employee) &&
    employee?.progress_override_complete &&
    !employee?.did_travel
  )
}

export function isEmployeeTravelConfirmationPending(employee) {
  return Boolean(
    isEmployeeReadyForEmploymentStage(employee) &&
    !isEmployeeTravelled(employee)
  )
}

export function isEmployeeSelected(employee) {
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

export function readTravelConfirmationDeclinedIds() {
  if (typeof window === 'undefined') return []
  try {
    const stored = window.localStorage.getItem(TRAVEL_CONFIRMATION_DECLINED_STORAGE_KEY)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeTravelConfirmationDeclinedIds(ids) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TRAVEL_CONFIRMATION_DECLINED_STORAGE_KEY, JSON.stringify(ids))
}

export function readTravelConfirmationConfirmedIds() {
  if (typeof window === 'undefined') return []
  try {
    const stored = window.localStorage.getItem(TRAVEL_CONFIRMATION_CONFIRMED_STORAGE_KEY)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeTravelConfirmationConfirmedIds(ids) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TRAVEL_CONFIRMATION_CONFIRMED_STORAGE_KEY, JSON.stringify(ids))
}

export function patchEmployeeCollection(list, employeeId, changes) {
  return (list || []).map((employee) => (
    employee.id === employeeId
      ? {
          ...employee,
          ...changes
        }
      : employee
  ))
}

export function isEmployeeInEmployedStage(employee) {
  return isEmployeeTravelled(employee) || isEmployeeEmployed(employee)
}

export function isEmployeeEmployedInView(employee) {
  return isEmployeeEmployed(employee)
}

export function employeeWorkflowState(employee) {
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

export async function fetchAllEmployeePages(params = {}) {
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

export function prettyStatus(value, fallback = '--') {
  if (!value) return fallback
  if (value === '--') return value
  return String(value).replaceAll('_', ' ')
}

export function employeeAvailability(employee) {
  const workflowState = employeeWorkflowState(employee)
  return ['approved', 'selected'].includes(workflowState) ? 'Available' : 'Not available'
}

export function employeeStatusLabel(employee) {
  switch (employeeWorkflowState(employee)) {
    case 'approved':
      return employeeAvailability(employee) === 'Available' ? 'Available' : 'Approved'
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

export function employeeStatusBadgeClass(employee) {
  switch (employeeWorkflowState(employee)) {
    case 'approved':
      return 'badge-success'
    case 'selected':
      return 'badge-info'
    case 'under_process':
      return 'badge-under-process'
    case 'traveled':
      return 'badge-warning'
    case 'employed':
      return 'badge-employed'
    case 'returned':
      return 'badge-muted'
    case 'suspended':
    case 'rejected':
      return 'badge-danger'
    default:
      return 'badge-warning'
  }
}

export function employeeStatusBadgeVariantClass(employee) {
  if (['traveled', 'employed'].includes(employeeWorkflowState(employee))) return 'employee-card-status-badge--employed'
  return ''
}

export function employeeMatchesTagFilter(employee, tag) {
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

export function filterCandidateList(employees, filters = {}) {
  if (!Array.isArray(employees) || employees.length === 0) return []

  let list = employees

  // Search query (name, passport, mobile, profession, title)
  if (filters.q && String(filters.q).trim()) {
    const q = String(filters.q).trim().toLowerCase()
    list = list.filter((emp) => {
      const name = String(emp.full_name || '').toLowerCase()
      const prof = String(emp.profession || '').toLowerCase()
      const pass = String(emp.passport_number || '').toLowerCase()
      const phone = String(emp.phone || emp.mobile_number || '').toLowerCase()
      const title = String(emp.professional_title || '').toLowerCase()
      return name.includes(q) || prof.includes(q) || pass.includes(q) || phone.includes(q) || title.includes(q)
    })
  }

  // Availability
  if (filters.isActive === 'true') {
    list = list.filter((emp) => employeeAvailability(emp) === 'Available')
  } else if (filters.isActive === 'false') {
    list = list.filter((emp) => employeeAvailability(emp) === 'Not available')
  }

  // Tag
  if (filters.tag) {
    list = list.filter((emp) => employeeMatchesTagFilter(emp, filters.tag))
  }

  // Profession
  if (filters.profession) {
    const prof = String(filters.profession).trim().toLowerCase()
    list = list.filter((emp) =>
      String(emp.profession || '').toLowerCase().includes(prof) ||
      String(emp.professional_title || '').toLowerCase().includes(prof)
    )
  }

  // Gender
  if (filters.gender) {
    const gen = String(filters.gender).trim().toLowerCase()
    list = list.filter((emp) =>
      String(emp.gender || '').toLowerCase() === gen
    )
  }

  // Religion
  if (filters.religion) {
    const rel = String(filters.religion).trim().toLowerCase()
    list = list.filter((emp) =>
      String(emp.religion || '').toLowerCase() === rel
    )
  }

  // Destination Country
  if (filters.destinationCountry) {
    const dest = String(filters.destinationCountry).trim().toLowerCase()
    list = list.filter((emp) =>
      Array.isArray(emp.application_countries) &&
      emp.application_countries.some((c) => String(c || '').toLowerCase() === dest)
    )
  }

  // Experience level
  if (filters.experience === 'fresher') {
    list = list.filter((emp) => {
      const hasExp = (Array.isArray(emp.experiences) && emp.experiences.length > 0) ||
        (typeof emp.experience === 'string' && emp.experience.trim().length > 0)
      return !hasExp
    })
  } else if (filters.experience === 'experienced') {
    list = list.filter((emp) => {
      const hasExp = (Array.isArray(emp.experiences) && emp.experiences.length > 0) ||
        (typeof emp.experience === 'string' && emp.experience.trim().length > 0)
      return hasExp
    })
  }

  // Document & Medical Readiness
  if (filters.docStatus) {
    list = list.filter((emp) => {
      const docs = Array.isArray(emp.documents) ? emp.documents : []
      if (filters.docStatus === 'has_medical') {
        return docs.some((d) => d.document_type === 'medical_result')
      }
      if (filters.docStatus === 'has_passport') {
        return docs.some((d) => d.document_type === 'passport_document') || Boolean(emp.passport_number)
      }
      if (filters.docStatus === 'has_photo') {
        return docs.some((d) => d.document_type === 'portrait_photo' || d.document_type === 'full_photo') || Boolean(emp.portrait_photo_url || emp.profile_photo_url)
      }
      if (filters.docStatus === 'complete') {
        const hasMed = docs.some((d) => d.document_type === 'medical_result')
        const hasPass = docs.some((d) => d.document_type === 'passport_document') || Boolean(emp.passport_number)
        const hasPhoto = docs.some((d) => d.document_type === 'portrait_photo' || d.document_type === 'full_photo')
        return hasMed && hasPass && hasPhoto
      }
      return true
    })
  }

  return list
}

export function statusTone(status) {
  const normalized = String(status || '').trim().toLowerCase().replace(/\s+/g, '_')
  if (!normalized) return ''
  if (['pending', 'requested', 'pending_approval', 'traveled'].includes(normalized)) return 'pending'
  if (['approved', 'active', 'fully_signed', 'success', 'employed', 'returned'].includes(normalized)) return 'success'
  if (normalized === 'selected') return 'selected'
  if (normalized === 'settled') return 'settled'
  if (['declined', 'failed', 'expired', 'cancelled', 'rejected', 'suspended'].includes(normalized)) return 'declined'
  return ''
}

export function employedEmployeesHelpText() {
  return 'Candidates whose travel was recorded or whose employment is already active are listed here.'
}

export function returnedEmployeesHelpText() {
  return 'Candidates whose employment has already been discontinued and recorded as returned are listed here.'
}

export function normalizeAgentMatchValue(value) {
  return normalizeSearchValue(value)
}

export function employeeBelongsToCurrentAgent(employee, user) {
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

export function formatDateTime(value) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export function formatShortDate(value) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '--'
  return parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatShortTime(value) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '--'
  return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function resolveLatestDate(items, keys) {
  if (!Array.isArray(items) || items.length === 0) return ''
  const keyList = Array.isArray(keys) ? keys : []
  let latestMs = -1
  let latestValue = ''
  for (const item of items) {
    if (!item) continue
    for (const key of keyList) {
      const candidate = item[key]
      if (!candidate) continue
      const parsed = new Date(candidate)
      const ms = parsed.getTime()
      if (Number.isNaN(ms)) continue
      if (ms > latestMs) {
        latestMs = ms
        latestValue = candidate
      }
    }
  }
  return latestValue
}

export function employedCommissionLabel(employee) {
  if (employee?.settled_commission) return 'Settled commission'
  return employee?.did_travel ? 'Unsettled commission' : 'Commission pending travel'
}

export function openCommissionStorageDb() {
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

export async function readStoredSettlements() {
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

export function progressTone(progress) {
  if (progress >= 90) return 'var(--progress-tone-high)'
  if (progress >= 60) return 'var(--progress-tone-mid)'
  return 'var(--progress-tone-low)'
}

export function buildProgressDonut(progressStatus) {
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

export function formatDateForPrompt(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

export { isAgentSideWorkspace } from './profileStore'


export function selectedEmployeesHelpText(user) {
  return isAgentSideWorkspace(user)
    ? 'Candidates your agent side marked for follow-up are listed here. Selection is not exclusive; ownership starts only after your agent initiates the process.'
    : 'Candidates selected by agents are listed here as market interest only. Ownership starts only after one agent initiates the process.'
}

export function underProcessEmployeesHelpText(user) {
  return `Candidates under process for ${user?.first_name || user?.username || 'this agent'} are listed here.`
}

export function resolvedProcessAgentId(employee, processAgentAssignments, agentOptions) {
  if (processAgentAssignments[employee.id]) return String(processAgentAssignments[employee.id])
  if (employee.selection_state?.selection?.agent) return String(employee.selection_state.selection.agent)
  if (agentOptions.length === 1) return String(agentOptions[0].id)
  return ''
}

export function isValidPhoneNumber(value) {
  const raw = (value || '').trim()
  if (!raw) return true
  if (!PHONE_ALLOWED_CHARS.test(raw)) return false
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

export function isValidDocumentNumber(value) {
  const raw = (value || '').trim()
  if (!raw) return true
  return DOCUMENT_NUMBER_PATTERN.test(raw)
}

export function isValidEmailAddress(value) {
  const raw = (value || '').trim()
  if (!raw) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
}

export function validateEmployeeForm(form) {
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

export function validateStepFields(form, stepIndex, ageRestrictionError, validateAttachmentDates) {
  if (stepIndex === 0) {
    if (!form.first_name.trim()) return 'First name is required.'
    if (!form.middle_name.trim()) return 'Middle name is required.'
    if (!form.last_name.trim()) return 'Last name is required.'
    if (!form.date_of_birth) return 'Date of birth is required.'
    if (ageRestrictionError) return ageRestrictionError
    if (!form.gender) return 'Gender is required.'
    if (!form.passport_number.trim()) return 'Passport number is required.'
    if (!isValidDocumentNumber(form.passport_number)) return 'Passport number may only contain letters, numbers, spaces, slashes, and hyphens.'
    if (!form.mobile_number.trim()) return 'Mobile number is required.'
    if (!isValidPhoneNumber(form.mobile_number)) return 'Enter a valid mobile number.'
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
    if (!isValidPhoneNumber(form.contact_person_mobile)) return 'Enter a valid contact person mobile number.'
    if (!isValidPhoneNumber(form.phone)) return 'Enter a valid secondary phone number.'
    if (!isValidEmailAddress(form.email)) return 'Enter a valid email address.'
    if (!isValidDocumentNumber(form.contact_person_id_number)) return 'Contact person ID number may only contain letters, numbers, spaces, slashes, and hyphens.'
    return ''
  }

  if (stepIndex === 3) {
    if (form.application_countries.length === 0) return 'Select at least one destination country.'
    if (!form.profession) return 'Profession is required.'
    if (!form.employment_type) return 'Type is required.'
    if (form.application_salary === '') return 'Salary is required.'
    if (form.application_salary !== '' && Number(form.application_salary) < 0) return 'Salary cannot be negative.'
    if (!Array.isArray(form.skills) || form.skills.length === 0) return 'Select at least one skill.'
    if (!Array.isArray(form.languages) || form.languages.length === 0) return 'Select at least one language.'
    const selectedExperiences = Array.isArray(form.experiences)
      ? form.experiences.filter((item) => (item.country || '').trim())
      : []
    if (selectedExperiences.some((item) => String(item.years ?? '').trim() === '')) return 'Fill in years for each selected experience country.'
    return ''
  }

  if (stepIndex === 4) {
    try {
      if (typeof validateAttachmentDates === 'function') {
        validateAttachmentDates()
      }
    } catch (error) {
      return error.message || 'Please complete the required attachments.'
    }
    return ''
  }

  return ''
}

export function buildEmployeePayload(form, editingEmployeeId) {
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

export function errorMessage(error, fallback) {
  if (!error) return fallback
  if (typeof error === 'string') {
    const message = error.trim()
    if (!message) return fallback
    return message.length > 300 ? `${message.slice(0, 300)}…` : message
  }
  if (error instanceof Error) return error.message || fallback
  if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim()
  try {
    const serialized = JSON.stringify(error)
    if (!serialized || serialized === '{}') return fallback
    return serialized.length > 300 ? `${serialized.slice(0, 300)}…` : serialized
  } catch {
    return fallback
  }
}