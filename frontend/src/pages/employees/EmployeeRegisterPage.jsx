import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useUiFeedback } from '../../context/UiFeedbackContext'
import { Modal } from '../../components/common'
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
} from '../../constants/employeeOptions'
import {
  ASPRISE_SCANNER_LINKS,
  checkAspriseScannerService,
  resetAspriseScannerService,
  scanWithAspriseScanner
} from '../../services/aspriseScannerService'
import * as employeesService from '../../services/employeesService'
import {
  MINIMUM_EMPLOYEE_AGE,
  PHONE_ALLOWED_CHARS,
  DOCUMENT_NUMBER_PATTERN,
  OPTIONAL_DATE_FIELDS,
  MANDATORY_ATTACHMENT_KEYS,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ALLOWED_ATTACHMENT_EXTENSIONS,
  REGISTRATION_TEMPLATE_STORAGE_KEY,
  REGISTRATION_DRAFT_DB_NAME,
  REGISTRATION_DRAFT_DB_VERSION,
  REGISTRATION_DRAFT_STORE,
  REGISTRATION_DRAFT_KEY,
  TEMPLATE_FORM_FIELDS,
  EMPLOYEE_OCR_FIELD_LABELS,
  OCR_UNREACHABLE_MESSAGE,
  normalizeOcrStatusMessage,
  emptyExperience,
  REGISTRATION_STEPS,
  buildOcrCacheKey,
  emptyForm,
  computeAge,
  loadImageFromUrl,
  normalizeEmployeeForm,
  applyRegistrationTemplate,
  buildRegistrationTemplate,
  normalizeDraftForm,
  attachmentFileAllowed,
  attachmentDisplayName,
  isAgentSideWorkspace,
  isValidPhoneNumber,
  isValidDocumentNumber,
  isValidEmailAddress,
  getValidationStep,
  validateEmployeeForm,
  validateStepFields,
  buildEmployeePayload,
  errorMessage,
  readRegistrationDraft,
  writeRegistrationDraft,
  isImageDocument,
  isPdfDocumentUrl
} from '../../utils/employeeHelpers'
import EmployeeDocumentPreview from '../../components/employees/EmployeeDocumentPreview'

import EmployeeCameraModal from '../../components/employees/EmployeeCameraModal'
import EmployeeScanImportModal from '../../components/employees/EmployeeScanImportModal'

const MEDICAL_ATTACHMENT_KEYS = ['medical_result', 'certificate_of_competency', 'insurance']
const LEGAL_ATTACHMENT_KEYS = ['visa', 'contract', 'clearance', 'employee_id', 'contact_person_id']
const TRAVEL_ATTACHMENT_KEYS = ['departure_ticket', 'return_ticket', 'att_option_1', 'att_option_2', 'att_option_3']

const REQUIRED_ATTACHMENT_FIELDS = ATTACHMENT_FIELDS.filter((att) => MANDATORY_ATTACHMENT_KEYS.includes(att.key))
const MEDICAL_ATTACHMENT_FIELDS = ATTACHMENT_FIELDS.filter((att) => MEDICAL_ATTACHMENT_KEYS.includes(att.key))
const LEGAL_ATTACHMENT_FIELDS = ATTACHMENT_FIELDS.filter((att) => LEGAL_ATTACHMENT_KEYS.includes(att.key))
const TRAVEL_ATTACHMENT_FIELDS = ATTACHMENT_FIELDS.filter((att) => TRAVEL_ATTACHMENT_KEYS.includes(att.key))
const OPTIONAL_ATTACHMENT_FIELDS = ATTACHMENT_FIELDS.filter((att) => !MANDATORY_ATTACHMENT_KEYS.includes(att.key))

function getAttachmentIcon(key) {
  switch (key) {
    case 'portrait_photo':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    case 'full_photo':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      )
    case 'passport_document':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <circle cx="12" cy="10" r="3" />
          <line x1="8" y1="17" x2="16" y2="17" />
        </svg>
      )
    case 'medical_result':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      )
    case 'certificate_of_competency':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="6" />
          <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
        </svg>
      )
    case 'insurance':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      )
    case 'visa':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <line x1="6" y1="15" x2="10" y2="15" />
        </svg>
      )
    case 'contract':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      )
    case 'clearance':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      )
    case 'employee_id':
    case 'contact_person_id':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <line x1="15" y1="8" x2="17" y2="8" />
          <line x1="15" y1="12" x2="17" y2="12" />
          <line x1="7" y1="16" x2="17" y2="16" />
        </svg>
      )
    case 'departure_ticket':
    case 'return_ticket':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12h20" />
          <path d="M13 5l7 7-7 7" />
        </svg>
      )
    default:
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      )
  }
}

function getAttachmentCardHint(key, hasAttachment, fileLabel) {
  if (hasAttachment) return fileLabel
  switch (key) {
    case 'portrait_photo':
      return '3x4 size (JPG/PNG)'
    case 'full_photo':
      return 'Full body standing photo'
    case 'passport_document':
      return 'Clear passport bio page'
    case 'medical_result':
      return 'Certified medical examination'
    case 'certificate_of_competency':
      return 'Skills certification / license'
    case 'insurance':
      return 'Coverage policy document'
    case 'visa':
      return 'Work or entry visa document'
    case 'contract':
      return 'Signed employment contract'
    case 'clearance':
      return 'Police / security clearance'
    case 'employee_id':
      return 'National / foreign ID document'
    case 'contact_person_id':
      return 'Emergency contact ID document'
    case 'departure_ticket':
      return 'Flight departure ticket / itinerary'
    case 'return_ticket':
      return 'Return flight ticket / reservation'
    default:
      return 'PDF, JPG, or PNG (Max 10MB)'
  }
}

function getAttachmentDateFieldLabel(expiryField) {
  if (expiryField.includes('departure')) return 'Departure date'
  if (expiryField.includes('return')) return 'Return date'
  return 'Expires on'
}

function getFutureDate(monthsToAdd) {
  const now = new Date()
  const targetYear = now.getFullYear() + Math.floor((now.getMonth() + monthsToAdd) / 12)
  const targetMonth = (now.getMonth() + monthsToAdd) % 12
  const maxDays = new Date(targetYear, targetMonth + 1, 0).getDate()
  const targetDay = Math.min(now.getDate(), maxDays)
  const yyyy = targetYear
  const mm = String(targetMonth + 1).padStart(2, '0')
  const dd = String(targetDay).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDateFriendly(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const [y, m, d] = parts.map(Number)
  if (!y || !m || !d) return dateStr
  const dateObj = new Date(y, m - 1, d)
  if (isNaN(dateObj.getTime())) return dateStr
  return dateObj.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export default function EmployeeRegisterPage() {
  const { user } = useAuth()
  const { showToast } = useUiFeedback()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const editId = searchParams.get('edit')
  const [editingEmployeeId, setEditingEmployeeId] = useState(editId || null)
  const [saving, setSaving] = useState(false)
  const [pageError] = useState('')
  const [modalError, setModalError] = useState('')
  const [modalNotice, setModalNotice] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [formOptions, setFormOptions] = useState({ destination_countries: [], salary_options_by_country: {}, agent_options: [] })
  const [attachmentFiles, setAttachmentFiles] = useState({})
  const [attachmentLabels, setAttachmentLabels] = useState({})
  const [existingAttachmentDocs, setExistingAttachmentDocs] = useState({})
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState({})
  const [savedTemplate, setSavedTemplate] = useState(null)
  const [savedDraftMeta, setSavedDraftMeta] = useState(null)
  const [dateModalAttachment, setDateModalAttachment] = useState(null)
  const [tempDateValue, setTempDateValue] = useState('')

  const openDateModal = useCallback((attachment) => {
    if (!attachment?.expiryField) return
    setDateModalAttachment(attachment)
    setTempDateValue(form[attachment.expiryField] || '')
  }, [form])

  const closeDateModal = useCallback(() => {
    setDateModalAttachment(null)
    setTempDateValue('')
  }, [])

  const handleSaveDateModal = useCallback(() => {
    if (!dateModalAttachment?.expiryField) return
    setForm((prev) => ({
      ...prev,
      [dateModalAttachment.expiryField]: tempDateValue
    }))
    closeDateModal()
  }, [dateModalAttachment, tempDateValue, closeDateModal])

  const handleClearDateModal = useCallback(() => {
    if (!dateModalAttachment?.expiryField) return
    setForm((prev) => ({
      ...prev,
      [dateModalAttachment.expiryField]: ''
    }))
    closeDateModal()
  }, [dateModalAttachment, closeDateModal])

  const [titleModalAttachment, setTitleModalAttachment] = useState(null)
  const [tempTitleValue, setTempTitleValue] = useState('')

  const openTitleModal = useCallback((attachment) => {
    setTitleModalAttachment(attachment)
    setTempTitleValue(attachmentLabels[attachment?.key] || '')
  }, [attachmentLabels])

  const closeTitleModal = useCallback(() => {
    setTitleModalAttachment(null)
    setTempTitleValue('')
  }, [])

  const handleSaveTitleModal = useCallback(() => {
    if (!titleModalAttachment?.key) return
    setAttachmentLabels((prev) => ({
      ...prev,
      [titleModalAttachment.key]: tempTitleValue.trim()
    }))
    closeTitleModal()
  }, [titleModalAttachment, tempTitleValue, closeTitleModal])

  const handleClearTitleModal = useCallback(() => {
    if (!titleModalAttachment?.key) return
    setAttachmentLabels((prev) => ({
      ...prev,
      [titleModalAttachment.key]: ''
    }))
    closeTitleModal()
  }, [titleModalAttachment, closeTitleModal])

  const [activeStep, setActiveStep] = useState(0)
  const [openSummarySections, setOpenSummarySections] = useState({
    identity: false,
    application: false,
    profile: false,
    contact: false,
    notes: false,
    attachments: false
  })
  const [dragOverAttachmentKey, setDragOverAttachmentKey] = useState('')
  const [invalidStepErrors, setInvalidStepErrors] = useState({})
  const [attemptedRegistrationSteps, setAttemptedRegistrationSteps] = useState({})
  const [pendingValidationHighlight, setPendingValidationHighlight] = useState(null)
  const [expandedSections, setExpandedSections] = useState({})

  const isSectionExpanded = useCallback((sectionKey, hasData) => {
    if (expandedSections[sectionKey] !== undefined) {
      return expandedSections[sectionKey]
    }
    return Boolean(hasData)
  }, [expandedSections])

  const toggleSection = useCallback((sectionKey, hasData) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionKey]: !(prev[sectionKey] !== undefined ? prev[sectionKey] : Boolean(hasData))
    }))
  }, [])

  const hasCredentialsData = Boolean(form.id_number || form.labour_id)
  const hasDemographicsData = Boolean(form.address || form.birth_place || form.nationality || (form.children_count && Number(form.children_count) > 0))
  const hasPhysicalData = Boolean(form.summary || form.education || form.experience)
  const hasEmergencyData = Boolean(form.contact_person_id_number)
  const hasReferencesData = Boolean(form.references || form.notes)
  const hasJobRoleData = Boolean(form.professional_title)

  const hasMedicalData = Boolean(
    attachmentFiles.medical_result || existingAttachmentDocs.medical_result?.file_url || form.medical_expires_on ||
    attachmentFiles.certificate_of_competency || existingAttachmentDocs.certificate_of_competency?.file_url || form.competency_certificate_expires_on ||
    attachmentFiles.insurance || existingAttachmentDocs.insurance?.file_url || form.insurance_expires_on
  )
  const hasLegalData = Boolean(
    attachmentFiles.visa || existingAttachmentDocs.visa?.file_url || form.visa_expires_on ||
    attachmentFiles.contract || existingAttachmentDocs.contract?.file_url || form.contract_expires_on ||
    attachmentFiles.clearance || existingAttachmentDocs.clearance?.file_url || form.clearance_expires_on ||
    attachmentFiles.employee_id || existingAttachmentDocs.employee_id?.file_url || form.employee_id_expires_on ||
    attachmentFiles.contact_person_id || existingAttachmentDocs.contact_person_id?.file_url || form.contact_person_id_expires_on
  )
  const hasTravelData = Boolean(
    attachmentFiles.departure_ticket || existingAttachmentDocs.departure_ticket?.file_url || form.departure_date ||
    attachmentFiles.return_ticket || existingAttachmentDocs.return_ticket?.file_url || form.return_ticket_date ||
    attachmentFiles.att_option_1 || existingAttachmentDocs.att_option_1?.file_url || attachmentLabels.att_option_1 ||
    attachmentFiles.att_option_2 || existingAttachmentDocs.att_option_2?.file_url || attachmentLabels.att_option_2 ||
    attachmentFiles.att_option_3 || existingAttachmentDocs.att_option_3?.file_url || attachmentLabels.att_option_3
  )

  const isCredentialsOpen = isSectionExpanded('credentials', hasCredentialsData)
  const isDemographicsOpen = isSectionExpanded('demographics', hasDemographicsData)
  const isPhysicalOpen = isSectionExpanded('physical', hasPhysicalData)
  const isEmergencyOpen = isSectionExpanded('emergency', hasEmergencyData)
  const isReferencesOpen = isSectionExpanded('references', hasReferencesData)
  const hasDirectChannelsData = Boolean(form.email || form.phone || form.references || form.notes)
  const isDirectChannelsOpen = isSectionExpanded('directChannels', hasDirectChannelsData)
  const isJobRoleOpen = isSectionExpanded('jobRole', hasJobRoleData)
  const hasOverseasExperienceData = Boolean(
    Array.isArray(form.experiences) &&
    form.experiences.some((item) => Boolean((item.country || '').trim() || String(item.years ?? '').trim()))
  )
  const isOverseasExperienceOpen = isSectionExpanded('overseasExperience', hasOverseasExperienceData)
  const isMedicalOpen = isSectionExpanded('medicalDocs', hasMedicalData)
  const isLegalOpen = isSectionExpanded('legalDocs', hasLegalData)
  const isTravelOpen = isSectionExpanded('travelDocs', hasTravelData)
  const hasOptionalDocsData = Boolean(hasMedicalData || hasLegalData || hasTravelData)
  const isOptionalDocsOpen = isSectionExpanded('optionalDocs', hasOptionalDocsData)
  const prevFormRef = useRef(form)
  const registrationRef = useRef(null)
  const employeeModalFormRef = useRef(null)

  const [floatingAttachmentPreview, setFloatingAttachmentPreview] = useState(null)
  const floatingAttachmentPreviewCloseTimer = useRef(null)
  const floatingAttachmentPreviewPopoverRef = useRef(null)

  const [previewDocument, setPreviewDocument] = useState(null)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 })
  const [previewDragging, setPreviewDragging] = useState(false)
  const previewDragStartRef = useRef({ x: 0, y: 0, originX: 0, originY: 0 })

  const openDocumentPreview = useCallback((payload) => {
    setPreviewDocument(payload)
    setPreviewZoom(1)
    setPreviewOffset({ x: 0, y: 0 })
    setPreviewDragging(false)
  }, [])

  const closeDocumentPreview = useCallback(() => {
    setPreviewDocument(null)
  }, [])

  const handlePreviewDownload = useCallback(() => {
    if (!previewDocument?.url) return
    const anchor = document.createElement('a')
    anchor.href = previewDocument.url
    anchor.download = previewDocument.label || 'document'
    anchor.target = '_blank'
    anchor.rel = 'noreferrer'
    anchor.click()
  }, [previewDocument])

  const handlePreviewPrint = useCallback(() => {
    if (!previewDocument?.url) return
    const win = window.open(previewDocument.url, '_blank')
    win?.focus()
    win?.print?.()
  }, [previewDocument])

  const handlePreviewZoomIn = useCallback(() => {
    setPreviewZoom((prev) => Math.min(4, Math.round((prev + 0.25) * 100) / 100))
  }, [])

  const handlePreviewZoomOut = useCallback(() => {
    setPreviewZoom((prev) => Math.max(1, Math.round((prev - 0.25) * 100) / 100))
  }, [])

  const handlePreviewReset = useCallback(() => {
    setPreviewZoom(1)
    setPreviewOffset({ x: 0, y: 0 })
  }, [])

  const handlePreviewWheel = useCallback((event) => {
    event.preventDefault()
    const zoomFactor = event.deltaY < 0 ? 0.2 : -0.2
    setPreviewZoom((prev) => Math.min(4, Math.max(1, Math.round((prev + zoomFactor) * 100) / 100)))
  }, [])

  const handlePreviewPointerDown = useCallback((event) => {
    if (previewZoom <= 1) return
    previewDragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      originX: previewOffset.x,
      originY: previewOffset.y
    }
    setPreviewDragging(true)
  }, [previewOffset, previewZoom])


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
  const [scanAttachmentError, setScanAttachmentError] = useState('')

  const scanUploadInputRef = useRef(null)
  const scanCameraVideoRef = useRef(null)
  const scanCameraCanvasRef = useRef(null)
  const scanCameraStreamRef = useRef(null)
  const scanCameraRequestRef = useRef(0)
  const scanAttachmentFrameRef = useRef(null)
  const scanAttachmentDragRef = useRef({ startX: 0, startY: 0, originX: 0, originY: 0 })

  const canManageEmployees = Boolean(user?.feature_flags?.employees_enabled)
  const readOnly = Boolean(user?.is_read_only || user?.is_suspended)
  const isAgentSideUser = isAgentSideWorkspace(user)
  const canEditEmployeeRecords = !isAgentSideUser
  const age = computeAge(form.date_of_birth)
  const ageRestrictionError = age !== '' && age < MINIMUM_EMPLOYEE_AGE
    ? ('Employee must be at least ' + MINIMUM_EMPLOYEE_AGE + ' years old.')
    : ''

  const completedSteps = useMemo(() => {
    return REGISTRATION_STEPS.map((_, index) => {
      if (index === 0) {
        return (
          Boolean(form.first_name.trim()) &&
          Boolean(form.middle_name.trim()) &&
          Boolean(form.last_name.trim()) &&
          Boolean(form.date_of_birth) &&
          !ageRestrictionError &&
          Boolean(form.gender) &&
          Boolean(form.passport_number.trim()) &&
          isValidDocumentNumber(form.passport_number) &&
          Boolean(form.mobile_number.trim()) &&
          isValidPhoneNumber(form.mobile_number)
        )
      }
      if (index === 1) {
        return Boolean(form.religion && form.marital_status && form.residence_country)
      }
      if (index === 2) {
        return Boolean(
          (form.contact_person_name || '').trim() &&
          (form.contact_person_mobile || '').trim() &&
          isValidPhoneNumber(form.contact_person_mobile)
        )
      }
      if (index === 3) {
        const hasDest = Array.isArray(form.application_countries) && form.application_countries.length > 0
        const hasSkills = Array.isArray(form.skills) && form.skills.length > 0
        const hasLanguages = Array.isArray(form.languages) && form.languages.length > 0
        const hasSalary = form.application_salary !== '' && Number(form.application_salary) >= 0
        return Boolean(hasDest && form.profession && form.employment_type && hasSalary && hasSkills && hasLanguages)
      }
      if (index === 4) {
        const hasPortrait = Boolean(attachmentFiles.portrait_photo || existingAttachmentDocs.portrait_photo?.file_url)
        const hasFull = Boolean(attachmentFiles.full_photo || existingAttachmentDocs.full_photo?.file_url)
        const hasPassport = Boolean(attachmentFiles.passport_document || existingAttachmentDocs.passport_document?.file_url)
        return hasPortrait && hasFull && hasPassport
      }
      return false
    })
  }, [form, ageRestrictionError, attachmentFiles, existingAttachmentDocs])

  const loadFormOptions = useCallback(async () => {
    try {
      setFormOptions(await employeesService.fetchEmployeeFormOptions())
    } catch {
      setFormOptions({ destination_countries: [], salary_options_by_country: {}, agent_options: [] })
    }
  }, [])

  useEffect(() => {
    loadFormOptions()
  }, [loadFormOptions])

  // Load employee for editing if editId is present
  useEffect(() => {
    if (!editId) return
    let isCancelled = false
    employeesService.fetchEmployee(editId)
      .then((employee) => {
        if (isCancelled || !employee) return
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
      })
      .catch((err) => {
        if (!isCancelled) setModalError(err.message || 'Could not load employee for editing')
      })
    return () => {
      isCancelled = true
    }
  }, [editId])

  // Listen for portal refresh event triggered from header Refresh button
  useEffect(() => {
    const handlePortalRefresh = async () => {
      try {
        await loadFormOptions()
        if (editId) {
          const employee = await employeesService.fetchEmployee(editId)
          if (employee) {
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
          }
        }
        try {
          const rawTemplate = window.localStorage.getItem(REGISTRATION_TEMPLATE_STORAGE_KEY)
          if (rawTemplate) {
            setSavedTemplate(applyRegistrationTemplate(JSON.parse(rawTemplate)))
          }
        } catch {
          // ignore
        }
        try {
          const draft = await readRegistrationDraft()
          setSavedDraftMeta(draft ? { savedAt: draft.savedAt || null } : null)
        } catch {
          // ignore
        }
        showToast('Registration form refreshed', { tone: 'neutral' })
      } catch (err) {
        showToast(err.message || 'Failed to refresh data', { tone: 'danger' })
      }
    }

    window.addEventListener('portal:refresh-employee-registration', handlePortalRefresh)
    return () => {
      window.removeEventListener('portal:refresh-employee-registration', handlePortalRefresh)
    }
  }, [editId, loadFormOptions, showToast])

  useEffect(() => {
    if (notice) showToast(notice, { tone: 'success' })
  }, [notice, showToast])

  useEffect(() => {
    if (modalNotice) showToast(modalNotice, { tone: 'success' })
  }, [modalNotice, showToast])

  useEffect(() => {
    if (modalError) showToast(modalError, { tone: 'danger', title: 'Action failed' })
  }, [modalError, showToast])

  useEffect(() => {
    if (pageError) showToast(pageError, { tone: 'danger', title: 'Action failed' })
  }, [pageError, showToast])

  useEffect(() => {
    if (!scanCameraVideoRef.current) return
    scanCameraVideoRef.current.srcObject = cameraStream
  }, [cameraStream])

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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const draft = await readRegistrationDraft()
        if (cancelled) return
        setSavedDraftMeta(draft ? { savedAt: draft.savedAt || null } : null)
      } catch {
        if (!cancelled) setSavedDraftMeta(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const openFloatingAttachmentPreview = useCallback((anchorEl, url, label) => {
    if (!anchorEl || !url) return
    const rect = anchorEl.getBoundingClientRect()
    const POPUP_WIDTH = 220
    const POPUP_HEIGHT = 220
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
    }, 10)
  }, [cancelFloatingAttachmentPreviewClose])

  const availableSkillOptions = useMemo(() => PROFESSION_SKILLS[form.profession] || [], [form.profession])
  const salaryOptions = useMemo(() => {
    const values = new Set()
    form.application_countries.forEach((country) => {
      ;(formOptions.salary_options_by_country[country] || []).forEach((salary) => values.add(salary))
    })
    return Array.from(values)
  }, [form.application_countries, formOptions.salary_options_by_country])

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


  const handleSaveDraft = async () => {
    setNotice('')
    setModalError('')
    setModalNotice('')
    try {
      const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        editingEmployeeId: editingEmployeeId || null,
        form,
        attachmentLabels,
        existingAttachmentDocs,
        attachmentFiles: Object.fromEntries(
          Object.entries(attachmentFiles || {})
            .filter(([, file]) => file instanceof File)
            .map(([key, file]) => [
              key,
              {
                name: file.name || key,
                type: file.type || '',
                lastModified: file.lastModified || Date.now(),
                blob: file
              }
            ])
        )
      }
      await writeRegistrationDraft(payload)
      setSavedDraftMeta({ savedAt: payload.savedAt })
      setModalNotice('Draft saved. You can restore it later.')
    } catch (err) {
      setModalError(err?.message || 'Could not save draft.')
    }
  }

  const handleRestoreDraft = async () => {
    setNotice('')
    setModalError('')
    setModalNotice('')
    try {
      const draft = await readRegistrationDraft()
      if (!draft) {
        setSavedDraftMeta(null)
        setModalError('No draft found.')
        return
      }
      setEditingEmployeeId(draft.editingEmployeeId || null)
      setForm(normalizeDraftForm(draft.form))
      setAttachmentLabels(draft.attachmentLabels && typeof draft.attachmentLabels === 'object' ? draft.attachmentLabels : {})
      setExistingAttachmentDocs(draft.existingAttachmentDocs && typeof draft.existingAttachmentDocs === 'object' ? draft.existingAttachmentDocs : {})
      const nextFiles = {}
      const fileEntries = draft.attachmentFiles && typeof draft.attachmentFiles === 'object' ? Object.entries(draft.attachmentFiles) : []
      fileEntries.forEach(([key, stored]) => {
        if (!stored?.blob) return
        nextFiles[key] = new File([stored.blob], stored.name || key, {
          type: stored.type || '',
          lastModified: stored.lastModified || Date.now()
        })
      })
      setAttachmentFiles(nextFiles)
      setActiveStep(0)
      setModalNotice('Draft restored from local storage.')
      showToast('Draft restored successfully.', 'success')
    } catch (err) {
      setModalError(err?.message || 'Could not restore draft.')
    }
  }

  const handleSaveTemplate = useCallback(() => {
    try {
      const template = buildRegistrationTemplate(form)
      window.localStorage.setItem(REGISTRATION_TEMPLATE_STORAGE_KEY, JSON.stringify(template))
      setSavedTemplate(applyRegistrationTemplate(template))
      showToast('Default registration template saved.', 'success')
      setModalNotice('Current form values saved as your default registration template.')
    } catch (err) {
      showToast('Could not save registration template.', 'error')
    }
  }, [form, showToast])

  useEffect(() => {
    const handlePortalSaveTemplate = () => {
      handleSaveTemplate()
    }
    window.addEventListener('portal:save-registration-template', handlePortalSaveTemplate)
    return () => {
      window.removeEventListener('portal:save-registration-template', handlePortalSaveTemplate)
    }
  }, [handleSaveTemplate])

  const handleApplyTemplate = () => {
    if (!savedTemplate) return
    setForm(applyRegistrationTemplate(savedTemplate))
    showToast('Applied default template fields.', 'success')
    setModalNotice('Template defaults applied to form.')
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
      const hasFile = Boolean(attachmentFiles[attachment.key] || (editingEmployeeId && existingAttachmentDocs[attachment.key]))
      if (hasFile && !form[attachment.expiryField]) {
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
    const isEditing = Boolean(editingEmployeeId)
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
    try {
      validateAttachmentDates()
    } catch (attachmentErr) {
      const msg = attachmentErr.message || 'Please complete the required attachments.'
      setModalError(msg)
      setActiveStep(4)
      const nextAttempted = {
        ...attemptedRegistrationSteps,
        4: true
      }
      setAttemptedRegistrationSteps(nextAttempted)
      setInvalidStepErrors((prev) => ({ ...prev, 4: msg }))
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
      if (isEditing) {
        setNotice('Employee updated successfully.')
        navigate('/dashboard/employees/list')
        resetForm()
      } else {
        setNotice('Employee registered successfully.')
        setEditingEmployeeId(null)
        setForm(createFormFromTemplate())
        setAttachmentFiles({})
        setAttachmentLabels({})
        setExistingAttachmentDocs({})
        setActiveStep(0)
        clearScannedDocument()
        navigate('/dashboard/employees/list')
      }
      await loadFormOptions()
    } catch (err) {
      console.error('Employee registration failed:', err)
      const nextError = errorMessage(err, 'Could not save employee')
      setModalError(nextError)
      const targetStep = getValidationStep(nextError)
      if (targetStep !== null) setActiveStep(targetStep)
      const nextAttempted = {
        ...attemptedRegistrationSteps,
        [targetStep ?? activeStep]: true,
        ...(targetStep !== null ? { [targetStep]: true } : {})
      }
      setAttemptedRegistrationSteps(nextAttempted)
      setInvalidStepErrors((_prev) => ({
        ...computeInvalidStepErrors(nextAttempted),
        [targetStep ?? activeStep]: nextError
      }))
      setPendingValidationHighlight({ message: nextError, stepIndex: targetStep ?? activeStep })
    } finally {
      setSaving(false)
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
      'passport_expires_on',
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
      if (normalized.includes('passport number') && normalized.includes('already exists')) return 'passport_number'
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

    if (stepIndex === 4) {
      for (const attachment of ATTACHMENT_FIELDS) {
        if (attachment.expiryField && normalized.includes(attachment.label.toLowerCase())) {
          return attachment.expiryField
        }
      }
      if (normalized.includes('passport date is required')) return 'passport_expires_on'
      if (normalized.includes('passport expires on')) return 'passport_expires_on'
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
    if (
      fieldName === 'passport_expires_on' &&
      typeof target.setCustomValidity === 'function'
    ) {
      target.setCustomValidity(message || 'Passport date is required.')
    }
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
  }, [activeStep, getValidationFieldForStep, invalidStepErrors])

  useEffect(() => {
    const prevForm = prevFormRef.current
    prevFormRef.current = form
    const stepError = invalidStepErrors[activeStep]
    if (!stepError) return
    const stepField = getValidationFieldForStep(stepError, activeStep)
    if (!stepField) return
    if (prevForm?.[stepField] === form?.[stepField]) return
    setInvalidStepErrors((prev) => {
      if (!prev[activeStep]) return prev
      const next = { ...prev }
      delete next[activeStep]
      return next
    })
    setModalError((prev) => (prev === stepError ? '' : prev))
  }, [activeStep, form, getValidationFieldForStep, invalidStepErrors])

  useEffect(() => {
    if (activeStep !== 4 || !attemptedRegistrationSteps[4]) return
    const currentError = invalidStepErrors[4]
    if (!currentError) return
    const nextError = validateStep(4)
    if (!nextError) {
      setInvalidStepErrors((prev) => {
        if (!prev[4]) return prev
        const next = { ...prev }
        delete next[4]
        return next
      })
      setModalError((prev) => (prev === currentError ? '' : prev))
    }
  }, [activeStep, attemptedRegistrationSteps, attachmentFiles, form])

  useEffect(() => {
    if (!pendingValidationHighlight) return
    const { message, stepIndex } = pendingValidationHighlight
    // Wait for the step's fields to be rendered before focusing/marking.
    requestAnimationFrame(() => {
      highlightEmployeeModalValidationTarget(message, stepIndex)
      setPendingValidationHighlight(null)
    })
  }, [highlightEmployeeModalValidationTarget, pendingValidationHighlight])

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

  if (!canManageEmployees) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="employee-register-page-wrapper">
        <div className="users-table-wrap employee-registration-surface">
          <div ref={registrationRef} className="employee-modal employee-modal--flat" aria-labelledby="employee-modal-title">
            <div className="employee-registration-layout">
              <aside className="employee-registration-sidebar">
                <div className="employee-registration-sidebar-header">
                  <div className="employee-registration-sidebar-title-row">
                    <div className="registration-sidebar-icon-tile" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                      </svg>
                    </div>
                    <div>
                      <h2 id="employee-modal-title">Registration Steps</h2>
                      <p className="muted-text">Step {activeStep + 1} of {REGISTRATION_STEPS.length}</p>
                    </div>
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
                    const isStepComplete = Boolean(completedSteps[index])
                    const isStepCompleted = isStepComplete || (index < activeStep && !invalidStepErrors[index])
                    const isActive = index === activeStep

                    return (
                      <button
                        key={step.id}
                        type="button"
                        className={`employee-registration-step${isActive ? ' is-active' : ''}${isStepComplete ? ' is-step-complete' : isStepCompleted ? ' is-completed' : ''}`}
                        aria-selected={isActive}
                        onClick={() => setActiveStep(index)}
                      >
                        {invalidStepErrors[index] ? (
                          <span
                            className="employee-registration-step-badge"
                            aria-label="Step has invalid fields"
                            title="This step has an invalid field"
                          />
                        ) : null}
                        <span className="employee-registration-step-index" aria-hidden="true">
                          {isStepComplete ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span className="employee-registration-step-copy">
                          <strong>{step.label}</strong>
                          <span className="muted-text">{step.description}</span>
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
                {activeStep < 5 && (
                  <div className="employee-registration-top">
                    {activeStep === 0 ? (
                      <div className="employee-scan-launch-card">
                        <div className="employee-scan-launch-icon-tile" aria-hidden="true">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                            <rect width="10" height="8" x="7" y="8" rx="1" />
                          </svg>
                        </div>
                        <div className="employee-scan-launch-copy">
                          <div className="employee-scan-launch-header-row">
                            <h3 className="employee-scan-launch-title">Scan Passport or National ID</h3>
                            <span className="employee-scan-badge">OCR Smart Assist</span>
                          </div>
                          <p className="muted-text">
                            Upload or scan candidate passport / national ID to auto-fill form fields.
                          </p>
                          {ocrImportFileName ? (
                            <div className="employee-scan-file-pill">
                              <span className="employee-scan-file-name">{ocrImportFileName}</span>
                              <span className="employee-scan-file-src">
                                {ocrImportSource === 'camera'
                                  ? '• Camera'
                                  : ocrImportSource === 'scanner'
                                    ? '• Scanner'
                                    : '• File Upload'}
                              </span>
                            </div>
                          ) : null}
                        </div>
                        <div className="employee-scan-launch-actions">
                          <button type="button" className="btn-secondary employee-scan-launch-action" onClick={openScanImportModal}>
                            {ocrImportFileName ? 'Change file' : 'Scan / Upload'}
                          </button>
                          {ocrImportFileName ? (
                            <>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleAnalyzeScan()
                                }}
                                disabled={ocrBusy}
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
                                disabled={ocrBusy || !hasAnalyzedScan}
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
                                disabled={ocrBusy}
                              >
                                Reset
                              </button>
                            </>
                          ) : null}
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
                  </div>
                )}

                {modalNotice ? <p className="alert employee-modal-notice">{modalNotice}</p> : null}
                {invalidStepErrors[activeStep] ? (
                  <div className="employee-action-step-error employee-action-step-error--top" role="alert">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{invalidStepErrors[activeStep]}</span>
                  </div>
                ) : null}

                <form ref={employeeModalFormRef} className="employee-modal-form" onSubmit={(event) => event.preventDefault()}>
              {activeStep === 0 ? (
                <div className="registration-step-container">
                  <div className="registration-card">
                    <div className="registration-card-header">
                      <div className="registration-card-header-left">
                        <div className="registration-card-icon-tile" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="registration-card-title">Legal Identity</h3>
                          <p className="registration-card-subtitle">Official candidate name, date of birth, and biological gender</p>
                        </div>
                      </div>
                    </div>
                    <div className="employee-step-grid">
                      <label>First name *<input name="first_name" value={form.first_name} onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))} placeholder="e.g. Abebe" required /></label>
                      <label>Middle name *<input name="middle_name" value={form.middle_name} onChange={(event) => setForm((prev) => ({ ...prev, middle_name: event.target.value }))} placeholder="e.g. Kebede" required /></label>
                      <label>Last name *<input name="last_name" value={form.last_name} onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))} placeholder="e.g. Tadesse" required /></label>
                      <label>Date of birth *<input name="date_of_birth" type="date" value={form.date_of_birth} onChange={(event) => setForm((prev) => ({ ...prev, date_of_birth: event.target.value }))} required /></label>
                      <label>Age<input value={age !== '' ? `${age} years` : ''} placeholder="Calculated from DOB" readOnly disabled /></label>
                      <label>
                        Gender *
                        <select name="gender" value={form.gender} onChange={(event) => setForm((prev) => ({ ...prev, gender: event.target.value }))} required>
                          <option value="">Select gender</option>
                          {GENDER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="registration-card">
                    <div className="registration-card-header">
                      <div className="registration-card-header-left">
                        <div className="registration-card-icon-tile" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="20" height="14" x="2" y="5" rx="2" />
                            <line x1="2" x2="22" y1="10" y2="10" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="registration-card-title">Credentials & Primary Phone</h3>
                          <p className="registration-card-subtitle">Passport number, identification documents, and direct mobile number</p>
                        </div>
                      </div>
                    </div>
                    <div className="employee-step-grid">
                      <label>Passport Number *<input name="passport_number" value={form.passport_number} onChange={(event) => setForm((prev) => ({ ...prev, passport_number: event.target.value }))} placeholder="e.g. EP1234567" required /></label>
                      <label>Mobile Number *<input name="mobile_number" value={form.mobile_number} onChange={(event) => setForm((prev) => ({ ...prev, mobile_number: event.target.value }))} inputMode="tel" placeholder="+251900000001" required /></label>
                    </div>

                    <div className="registration-expander-wrap">
                      <button
                        type="button"
                        className="registration-expander-toggle"
                        onClick={() => toggleSection('credentials', hasCredentialsData)}
                      >
                        <svg
                          className={`registration-expander-chevron${isCredentialsOpen ? ' is-open' : ''}`}
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <span>{isCredentialsOpen ? 'Hide additional identification' : 'Additional identification (National ID, Labour ID)'}</span>
                        {hasCredentialsData && !isCredentialsOpen && <span className="registration-expander-badge">Filled</span>}
                      </button>

                      {isCredentialsOpen && (
                        <div className="employee-step-grid registration-expanded-grid">
                          <label>National ID Number <span className="optional-tag">Optional</span><input name="id_number" value={form.id_number} onChange={(event) => setForm((prev) => ({ ...prev, id_number: event.target.value }))} placeholder="Optional national ID" /></label>
                          <label>Labour ID <span className="optional-tag">Optional</span><input name="labour_id" value={form.labour_id} onChange={(event) => setForm((prev) => ({ ...prev, labour_id: event.target.value }))} placeholder="Optional labour ID" /></label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeStep === 1 ? (
                <div className="registration-step-container">
                  <div className="registration-card">
                    <div className="registration-card-header">
                      <div className="registration-card-header-left">
                        <div className="registration-card-icon-tile" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                            <path d="M2 12h20" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="registration-card-title">Demographics & Origin</h3>
                          <p className="registration-card-subtitle">Religious affiliation, civil status, nationality, and birth information</p>
                        </div>
                      </div>
                    </div>
                    <div className="employee-step-grid">
                      <label>
                        Religion *
                        <select name="religion" value={form.religion} onChange={(event) => setForm((prev) => ({ ...prev, religion: event.target.value }))} required>
                          <option value="">Select religion</option>
                          {RELIGION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </label>
                      <label>
                        Marital status *
                        <select name="marital_status" value={form.marital_status} onChange={(event) => setForm((prev) => ({ ...prev, marital_status: event.target.value }))} required>
                          <option value="">Select marital status</option>
                          {MARITAL_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </label>
                      <label>
                        Residence country *
                        <select name="residence_country" value={form.residence_country} onChange={(event) => setForm((prev) => ({ ...prev, residence_country: event.target.value }))} required>
                          <option value="">Select country</option>
                          {RESIDENCE_COUNTRY_OPTIONS.map((country) => <option key={country} value={country}>{country}</option>)}
                        </select>
                      </label>
                    </div>

                    <div className="registration-expander-wrap">
                      <button
                        type="button"
                        className="registration-expander-toggle"
                        onClick={() => toggleSection('demographics', hasDemographicsData)}
                      >
                        <svg
                          className={`registration-expander-chevron${isDemographicsOpen ? ' is-open' : ''}`}
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <span>{isDemographicsOpen ? 'Hide origin & address details' : 'Additional origin & address details (Address, Nationality, Birth place, Children)'}</span>
                        {hasDemographicsData && !isDemographicsOpen && <span className="registration-expander-badge">Filled</span>}
                      </button>

                      {isDemographicsOpen && (
                        <div className="employee-step-grid registration-expanded-grid">
                          <label>Children <span className="optional-tag">Optional</span><input name="children_count" type="number" min="0" value={form.children_count} onChange={(event) => setForm((prev) => ({ ...prev, children_count: event.target.value }))} placeholder="0" /></label>
                          <label>Nationality <span className="optional-tag">Optional</span><input name="nationality" value={form.nationality} onChange={(event) => setForm((prev) => ({ ...prev, nationality: event.target.value }))} placeholder="e.g. Ethiopian" /></label>
                          <label>Birth place <span className="optional-tag">Optional</span><input name="birth_place" value={form.birth_place} onChange={(event) => setForm((prev) => ({ ...prev, birth_place: event.target.value }))} placeholder="City or region" /></label>
                          <label className="employee-span-two">Address <span className="optional-tag">Optional</span><input value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} placeholder="Current residential address" /></label>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="registration-card">
                    <div className="registration-card-header">
                      <div className="registration-card-header-left">
                        <div className="registration-card-icon-tile" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                            <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="registration-card-title">Physical Metrics & Background</h3>
                          <p className="registration-card-subtitle">Physical measurements and optional educational background</p>
                        </div>
                      </div>
                    </div>
                    <div className="employee-step-grid">
                      <label>
                        Weight
                        <div className="input-suffix">
                          <input name="weight_kg" type="number" min="0" value={form.weight_kg} onChange={(event) => setForm((prev) => ({ ...prev, weight_kg: event.target.value }))} placeholder="55" />
                          <span>Kg</span>
                        </div>
                      </label>
                      <label>
                        Height
                        <div className="input-suffix">
                          <input name="height_cm" type="number" min="0" value={form.height_cm} onChange={(event) => setForm((prev) => ({ ...prev, height_cm: event.target.value }))} placeholder="165" />
                          <span>Cm</span>
                        </div>
                      </label>
                    </div>

                    <div className="registration-expander-wrap">
                      <button
                        type="button"
                        className="registration-expander-toggle"
                        onClick={() => toggleSection('physical', hasPhysicalData)}
                      >
                        <svg
                          className={`registration-expander-chevron${isPhysicalOpen ? ' is-open' : ''}`}
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <span>{isPhysicalOpen ? 'Hide background details' : 'Additional background (Summary / Bio, Education, Experience)'}</span>
                        {hasPhysicalData && !isPhysicalOpen && <span className="registration-expander-badge">Filled</span>}
                      </button>

                      {isPhysicalOpen && (
                        <div className="employee-step-grid registration-expanded-grid">
                          <label className="employee-span-two">
                            Summary / Bio <span className="optional-tag">Optional</span>
                            <textarea
                              name="summary"
                              value={form.summary}
                              onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
                              rows={3}
                              placeholder="Brief summary of candidate background..."
                            />
                          </label>
                          <label className="employee-span-two">
                            Education <span className="optional-tag">Optional</span>
                            <textarea
                              name="education"
                              value={form.education}
                              onChange={(event) => setForm((prev) => ({ ...prev, education: event.target.value }))}
                              rows={3}
                              placeholder="Educational attainments and qualifications..."
                            />
                          </label>
                          <label className="employee-span-two">
                            Experience notes <span className="optional-tag">Optional</span>
                            <textarea
                              name="experience"
                              value={form.experience}
                              onChange={(event) => setForm((prev) => ({ ...prev, experience: event.target.value }))}
                              rows={3}
                              placeholder="Additional notes regarding past experience..."
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeStep === 2 ? (
                <div className="registration-step-container">
                  <div className="registration-card">
                    <div className="registration-card-header">
                      <div className="registration-card-header-left">
                        <div className="registration-card-icon-tile" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="registration-card-title">Emergency Contact / Next of Kin</h3>
                          <p className="registration-card-subtitle">Designated primary contact person in case of emergencies</p>
                        </div>
                      </div>
                    </div>
                    <div className="employee-step-grid">
                      <label>Contact person name *<input name="contact_person_name" value={form.contact_person_name} onChange={(event) => setForm((prev) => ({ ...prev, contact_person_name: event.target.value }))} placeholder="Full legal name" required /></label>
                      <label>Contact person mobile *<input name="contact_person_mobile" value={form.contact_person_mobile} onChange={(event) => setForm((prev) => ({ ...prev, contact_person_mobile: event.target.value }))} inputMode="tel" placeholder="+251900000002" required /></label>
                    </div>

                    <div className="registration-expander-wrap">
                      <button
                        type="button"
                        className="registration-expander-toggle"
                        onClick={() => toggleSection('emergency', hasEmergencyData)}
                      >
                        <svg
                          className={`registration-expander-chevron${isEmergencyOpen ? ' is-open' : ''}`}
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <span>{isEmergencyOpen ? 'Hide contact document' : 'Additional contact document (ID / Passport)'}</span>
                        {hasEmergencyData && !isEmergencyOpen && <span className="registration-expander-badge">Filled</span>}
                      </button>

                      {isEmergencyOpen && (
                        <div className="employee-step-grid registration-expanded-grid">
                          <label className="employee-span-two">
                            Contact person ID number <span className="optional-tag">Optional</span>
                            <input
                              name="contact_person_id_number"
                              value={form.contact_person_id_number}
                              onChange={(event) => setForm((prev) => ({ ...prev, contact_person_id_number: event.target.value }))}
                              placeholder="National ID or passport of contact person"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={`registration-card${!isDirectChannelsOpen ? ' is-collapsed' : ''}`}>
                    <div className="registration-card-header">
                      <div className="registration-card-header-left">
                        <div className="registration-card-icon-tile" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="20" height="16" x="2" y="4" rx="2" />
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                          </svg>
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 className="registration-card-title">Direct Channels & References</h3>
                            <span className="doc-pill-optional">Optional</span>
                          </div>
                          <p className="registration-card-subtitle">Secondary phone, direct email, and reference records</p>
                        </div>
                      </div>
                      <div className="registration-card-header-right">
                        {hasDirectChannelsData && !isDirectChannelsOpen && (
                          <span className="registration-expander-badge">Filled</span>
                        )}
                        <button
                          type="button"
                          className="registration-card-toggle-btn"
                          onClick={() => toggleSection('directChannels', hasDirectChannelsData)}
                          aria-expanded={isDirectChannelsOpen}
                        >
                          <svg
                            className={`registration-expander-chevron${isDirectChannelsOpen ? ' is-open' : ''}`}
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          <span>{isDirectChannelsOpen ? 'Collapse' : 'Expand'}</span>
                        </button>
                      </div>
                    </div>
                    {isDirectChannelsOpen && (
                      <div className="registration-card-content">
                        <div className="employee-step-grid">
                          <label>Direct email <span className="optional-tag">Optional</span><input name="email" type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="name@example.com" /></label>
                          <label>Secondary phone <span className="optional-tag">Optional</span><input name="phone" value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} inputMode="tel" placeholder="+251900000003" /></label>
                        </div>

                        <div className="registration-expander-wrap">
                          <button
                            type="button"
                            className="registration-expander-toggle"
                            onClick={() => toggleSection('references', hasReferencesData)}
                          >
                            <svg
                              className={`registration-expander-chevron${isReferencesOpen ? ' is-open' : ''}`}
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                            <span>{isReferencesOpen ? 'Hide additional records' : 'Additional records (References, Internal notes)'}</span>
                            {hasReferencesData && !isReferencesOpen && <span className="registration-expander-badge">Filled</span>}
                          </button>

                          {isReferencesOpen && (
                            <div className="employee-step-grid registration-expanded-grid">
                              <label className="employee-span-two">
                                References <span className="optional-tag">Optional</span>
                                <textarea
                                  id="reg-field-references"
                                  name="references"
                                  value={form.references}
                                  onChange={(event) => setForm((prev) => ({ ...prev, references: event.target.value }))}
                                  rows={3}
                                  placeholder="Name, relationship, and contact numbers of references..."
                                />
                              </label>
                              <label className="employee-span-two">
                                Internal registration notes <span className="optional-tag">Optional</span>
                                <textarea
                                  id="reg-field-notes"
                                  name="notes"
                                  value={form.notes}
                                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                                  rows={3}
                                  placeholder="Internal administrative notes..."
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {activeStep === 3 ? (
                <div className="registration-step-container">
                  <div className="registration-card">
                    <div className="registration-card-header">
                      <div className="registration-card-header-left">
                        <div className="registration-card-icon-tile" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
                            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="registration-card-title">Job Role & Destination</h3>
                          <p className="registration-card-subtitle">Destination countries, target profession, employment type, and expected salary</p>
                        </div>
                      </div>
                    </div>
                    <div className="employee-step-grid">
                      <div className="employee-span-two">
                        <span className="employee-group-label">Destination countries *</span>
                        <div className="checkbox-grid">
                          {formOptions.destination_countries.length === 0 ? (
                            <span className="muted-text">Create active agent accounts with countries first.</span>
                          ) : (
                            formOptions.destination_countries.map((country) => (
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
                            ))
                          )}
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
                      <label className="employee-span-two">
                        Expected Salary *
                        <select name="application_salary" value={form.application_salary} onChange={(event) => setForm((prev) => ({ ...prev, application_salary: event.target.value }))} required>
                          <option value="">Select salary</option>
                          {salaryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </label>
                    </div>

                    <div className="registration-expander-wrap">
                      <button
                        type="button"
                        className="registration-expander-toggle"
                        onClick={() => toggleSection('jobRole', hasJobRoleData)}
                      >
                        <svg
                          className={`registration-expander-chevron${isJobRoleOpen ? ' is-open' : ''}`}
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <span>{isJobRoleOpen ? 'Hide specific job title' : 'Additional role details (Professional title)'}</span>
                        {hasJobRoleData && !isJobRoleOpen && <span className="registration-expander-badge">Filled</span>}
                      </button>

                      {isJobRoleOpen && (
                        <div className="employee-step-grid registration-expanded-grid">
                          <label className="employee-span-two">
                            Professional title <span className="optional-tag">Optional</span>
                            <input
                              name="professional_title"
                              value={form.professional_title}
                              onChange={(event) => setForm((prev) => ({ ...prev, professional_title: event.target.value }))}
                              placeholder="e.g. Senior Caregiver"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="registration-card">
                    <div className="registration-card-header">
                      <div className="registration-card-header-left">
                        <div className="registration-card-icon-tile" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="registration-card-title">Skills & Languages</h3>
                          <p className="registration-card-subtitle">Specific candidate competencies and spoken languages</p>
                        </div>
                      </div>
                    </div>
                    <div className="employee-step-grid">
                      <div className="employee-span-two">
                        <span className="employee-group-label">Skills *</span>
                        <div className="checkbox-grid">
                          {availableSkillOptions.length === 0 ? (
                            <span className="muted-text">Choose a profession above to load matching skills.</span>
                          ) : (
                            availableSkillOptions.map((skill) => (
                              <label key={skill} className={`checkbox-pill${form.skills.includes(skill) ? ' is-checked' : ''}`}>
                                <input name="skills" type="checkbox" checked={form.skills.includes(skill)} onChange={() => handleCheckboxList('skills', skill)} />
                                <span>{skill}</span>
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="employee-span-two">
                        <span className="employee-group-label">Languages *</span>
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
                  </div>

                  <div className={`registration-card${!isOverseasExperienceOpen ? ' is-collapsed' : ''}`}>
                    <div className="registration-card-header">
                      <div className="registration-card-header-left">
                        <div className="registration-card-icon-tile" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 className="registration-card-title">Overseas Work Experience</h3>
                            <span className="doc-pill-optional">Optional</span>
                          </div>
                          <p className="registration-card-subtitle">Prior international employment records and durations</p>
                        </div>
                      </div>
                      <div className="registration-card-header-right">
                        {hasOverseasExperienceData && !isOverseasExperienceOpen && (
                          <span className="registration-expander-badge">Filled</span>
                        )}
                        <button
                          type="button"
                          className="registration-card-toggle-btn"
                          onClick={() => toggleSection('overseasExperience', hasOverseasExperienceData)}
                          aria-expanded={isOverseasExperienceOpen}
                        >
                          <svg
                            className={`registration-expander-chevron${isOverseasExperienceOpen ? ' is-open' : ''}`}
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          <span>{isOverseasExperienceOpen ? 'Collapse' : 'Expand'}</span>
                        </button>
                      </div>
                    </div>
                    {isOverseasExperienceOpen && (
                      <div className="registration-card-content">
                        <div className="experience-list">
                          {form.experiences.map((item, index) => (
                            <div key={`${index}-${item.country || 'exp'}`} className="experience-row">
                              <select name={`experience_country_${index}`} value={item.country} onChange={(event) => handleExperienceChange(index, 'country', event.target.value)}>
                                <option value="">Select destination country</option>
                                {EXPERIENCE_COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
                              </select>
                              <input name={`experience_years_${index}`} type="number" min="0" value={item.years} onChange={(event) => handleExperienceChange(index, 'years', event.target.value)} placeholder="Years of exp" />
                              {form.experiences.length > 1 ? (
                                <button type="button" className="btn-secondary" onClick={() => setForm((prev) => ({ ...prev, experiences: prev.experiences.filter((_, itemIndex) => itemIndex !== index) }))}>
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          ))}
                          <div>
                            <button type="button" className="btn-secondary" onClick={() => setForm((prev) => ({ ...prev, experiences: [...prev.experiences, { ...emptyExperience }] }))}>
                              + Add another experience
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
              {activeStep === 4 ? (
                <div className="doc-step-wrapper">
                  {(() => {
                    const renderDocUploadCard = (attachment, isRequired) => {
                      const inputId = `employee-attachment-${attachment.key}`
                      const attachedFile = attachmentFiles[attachment.key]
                      const existingDoc = existingAttachmentDocs[attachment.key]
                      const hasAttachment = Boolean(attachedFile || existingDoc?.file_url)
                      const isDragOver = dragOverAttachmentKey === attachment.key

                      const fileLabel = attachedFile?.name
                        || attachmentDisplayName(existingDoc, attachmentLabels)
                        || 'No file attached'

                      const existingUrl = existingDoc?.file_url || ''
                      const isImageAttachment = Boolean(
                        attachedFile?.type?.startsWith('image/') ||
                        (!attachedFile && typeof existingUrl === 'string' && existingUrl.match(/\.(png|jpe?g|webp|gif)(\?|#|$)/i))
                      )
                      const previewUrl = attachedFile
                        ? (attachmentPreviewUrls[attachment.key] || '')
                        : (existingUrl || '')

                      const isMissingRequiredFile = isRequired && !hasAttachment
                      const isMissingRequiredDate = hasAttachment && Boolean(attachment.expiryField) && !form[attachment.expiryField]
                      const isInvalid = Boolean(attemptedRegistrationSteps[4] && (isMissingRequiredFile || isMissingRequiredDate))
                      const isCustomOption = attachment.key.startsWith('att_option_')

                      return (
                        <div
                          key={attachment.key}
                          className={`doc-upload-card${hasAttachment ? ' is-filled' : ''}${isDragOver ? ' is-dragover' : ''}${isInvalid ? ' is-invalid' : ''}`}
                          aria-invalid={isInvalid ? 'true' : undefined}
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
                          onClick={() => {
                            if (!hasAttachment) {
                              document.getElementById(inputId)?.click()
                            }
                          }}
                          role={!hasAttachment ? 'button' : undefined}
                          tabIndex={!hasAttachment ? 0 : undefined}
                          onKeyDown={(event) => {
                            if (!hasAttachment && (event.key === 'Enter' || event.key === ' ')) {
                              event.preventDefault()
                              document.getElementById(inputId)?.click()
                            }
                          }}
                          aria-label={`${attachment.label}${hasAttachment ? ' (attached)' : ''}`}
                        >
                          <div className="doc-card-header">
                            <div
                              className={`doc-card-icon-tile${isImageAttachment && previewUrl ? ' has-thumb' : ''}`}
                              onMouseEnter={(event) => {
                                if (isImageAttachment && previewUrl) {
                                  cancelFloatingAttachmentPreviewClose()
                                  openFloatingAttachmentPreview(event.currentTarget, previewUrl, fileLabel)
                                }
                              }}
                              onMouseLeave={scheduleFloatingAttachmentPreviewClose}
                              onFocus={(event) => {
                                if (isImageAttachment && previewUrl) {
                                  cancelFloatingAttachmentPreviewClose()
                                  openFloatingAttachmentPreview(event.currentTarget, previewUrl, fileLabel)
                                }
                              }}
                              onBlur={scheduleFloatingAttachmentPreviewClose}
                            >
                              {isImageAttachment && previewUrl ? (
                                <img className="doc-card-thumb" src={previewUrl} alt="" aria-hidden="true" />
                              ) : (
                                <span className="doc-card-icon-svg" aria-hidden="true">
                                  {getAttachmentIcon(attachment.key)}
                                </span>
                              )}
                            </div>

                            <div className="doc-card-heading">
                              <div className="doc-card-title-row">
                                <span className="doc-card-title" title={attachment.label}>
                                  {isCustomOption ? (attachmentLabels[attachment.key] || attachment.label) : attachment.label}
                                </span>
                                {hasAttachment ? (
                                  <span className="doc-pill-filled">✓ Attached</span>
                                ) : isRequired ? (
                                  <span className="doc-pill-required">Required</span>
                                ) : (
                                  <span className="doc-pill-optional">Optional</span>
                                )}
                              </div>
                              <span className="doc-card-hint" title={fileLabel}>
                                {getAttachmentCardHint(attachment.key, hasAttachment, fileLabel)}
                              </span>
                            </div>
                          </div>

                          {!hasAttachment ? (
                            <div className="doc-card-actions doc-card-actions--empty">
                              <div
                                className="doc-card-drop-area"
                                role="button"
                                tabIndex={0}
                                onClick={() => document.getElementById(inputId)?.click()}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    document.getElementById(inputId)?.click()
                                  }
                                }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <polyline points="17 8 12 3 7 8" />
                                  <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                                <span>Choose or drop file</span>
                              </div>

                              {attachment.expiryField ? (
                                <button
                                  type="button"
                                  className={`doc-card-btn doc-card-btn--date${form[attachment.expiryField] ? ' is-set' : ''}`}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    openDateModal(attachment)
                                  }}
                                  title={form[attachment.expiryField] ? `Expiry: ${form[attachment.expiryField]} (click to edit)` : 'Set expire date'}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                  </svg>
                                  <span>
                                    {form[attachment.expiryField] || (attachment.expiryField.includes('ticket') || attachment.expiryField.includes('departure') || attachment.expiryField.includes('return') ? 'Travel date' : 'Expire date')}
                                  </span>
                                </button>
                              ) : null}

                              {isCustomOption ? (
                                <button
                                  type="button"
                                  className={`doc-card-btn doc-card-btn--title${attachmentLabels[attachment.key] ? ' is-set' : ''}`}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    openTitleModal(attachment)
                                  }}
                                  title={attachmentLabels[attachment.key] ? `Title: ${attachmentLabels[attachment.key]} (click to edit)` : 'Set document title'}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                  </svg>
                                  <span>
                                    {attachmentLabels[attachment.key] || 'Set title'}
                                  </span>
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <div className="doc-card-actions" onClick={(event) => event.stopPropagation()}>
                              {previewUrl ? (
                                <button
                                  type="button"
                                  className="doc-card-btn doc-card-btn--preview"
                                  onClick={() => {
                                    openDocumentPreview({
                                      url: previewUrl,
                                      name: fileLabel,
                                      type: attachedFile?.type || ''
                                    })
                                  }}
                                  title="Preview document"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                  <span>Preview</span>
                                </button>
                              ) : null}

                              {attachment.expiryField ? (
                                <button
                                  type="button"
                                  className={`doc-card-btn doc-card-btn--date${form[attachment.expiryField] ? ' is-set' : ''}${isMissingRequiredDate ? ' is-required' : ''}`}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    openDateModal(attachment)
                                  }}
                                  title={form[attachment.expiryField] ? `Expiry: ${form[attachment.expiryField]} (click to edit)` : 'Set expire date'}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                  </svg>
                                  <span>
                                    {form[attachment.expiryField] || (attachment.expiryField.includes('ticket') || attachment.expiryField.includes('departure') || attachment.expiryField.includes('return') ? 'Travel date' : 'Expire date')}
                                  </span>
                                </button>
                              ) : null}

                              {isCustomOption ? (
                                <button
                                  type="button"
                                  className={`doc-card-btn doc-card-btn--title${attachmentLabels[attachment.key] ? ' is-set' : ''}`}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    openTitleModal(attachment)
                                  }}
                                  title={attachmentLabels[attachment.key] ? `Title: ${attachmentLabels[attachment.key]} (click to edit)` : 'Set document title'}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                  </svg>
                                  <span>
                                    {attachmentLabels[attachment.key] || 'Set title'}
                                  </span>
                                </button>
                              ) : null}

                              <button
                                type="button"
                                className="doc-card-btn doc-card-btn--remove"
                                onClick={() => {
                                  handleAttachmentPick(attachment.key, null)
                                  setExistingAttachmentDocs((prev) => ({ ...prev, [attachment.key]: null }))
                                }}
                                title="Remove attachment"
                                aria-label={`Remove ${attachment.label}`}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                                Remove
                              </button>
                            </div>
                          )}

                          <input
                            id={inputId}
                            name={attachment.key}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                            className="visually-hidden-file"
                            onChange={(event) => {
                              handleAttachmentPick(attachment.key, event.target.files?.[0] || null)
                            }}
                          />
                        </div>
                      )
                    }

                    const requiredFilled = REQUIRED_ATTACHMENT_FIELDS.filter((att) => Boolean(attachmentFiles[att.key] || existingAttachmentDocs[att.key]?.file_url)).length
                    const optionalFilled = OPTIONAL_ATTACHMENT_FIELDS.filter((att) => Boolean(attachmentFiles[att.key] || existingAttachmentDocs[att.key]?.file_url)).length
                    const medicalFilled = MEDICAL_ATTACHMENT_FIELDS.filter((att) => Boolean(attachmentFiles[att.key] || existingAttachmentDocs[att.key]?.file_url)).length
                    const legalFilled = LEGAL_ATTACHMENT_FIELDS.filter((att) => Boolean(attachmentFiles[att.key] || existingAttachmentDocs[att.key]?.file_url)).length
                    const travelFilled = TRAVEL_ATTACHMENT_FIELDS.filter((att) => Boolean(attachmentFiles[att.key] || existingAttachmentDocs[att.key]?.file_url)).length

                    return (
                      <>
                        {/* Mandatory documents Bento Grid */}
                        <div className="doc-section-card">
                          <div className="doc-section-header">
                            <div className="doc-section-header-left">
                              <h3 className="doc-section-title">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                  <line x1="16" y1="13" x2="8" y2="13" />
                                  <line x1="16" y1="17" x2="8" y2="17" />
                                  <polyline points="10 9 9 9 8 9" />
                                </svg>
                                <span>Required Documents</span>
                              </h3>
                              <span className="doc-pill-required">3 mandatory</span>
                            </div>
                            <div className="doc-section-progress">
                              <span className="muted-text">
                                {requiredFilled} of {REQUIRED_ATTACHMENT_FIELDS.length} uploaded
                              </span>
                              <div className="doc-progress-track" aria-hidden="true">
                                <div
                                  className="doc-progress-fill"
                                  style={{
                                    width: `${Math.round(
                                      (requiredFilled / REQUIRED_ATTACHMENT_FIELDS.length) * 100
                                    )}%`
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                          <p className="muted-text employee-step-note" style={{ margin: '0 0 14px 0' }}>
                            Portrait photo (3x4 size), Full photo, and Passport are mandatory to complete registration. Click card or drag and drop to upload.
                          </p>
                          <div className="doc-bento-grid">
                            {REQUIRED_ATTACHMENT_FIELDS.map((attachment) => renderDocUploadCard(attachment, true))}
                          </div>
                        </div>

                        {/* Optional Categorized Accordions */}
                        <div className={`doc-section-card doc-section-card--optional${!isOptionalDocsOpen ? ' is-collapsed' : ''}`}>
                          <div className="doc-section-header">
                            <div className="doc-section-header-left">
                              <h3 className="doc-section-title">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                </svg>
                                <span>Optional Documents</span>
                              </h3>
                              <span className="doc-pill-optional">13 documents</span>
                            </div>
                            <div className="doc-section-header-right">
                              <div className="doc-section-progress">
                                <span className="muted-text">
                                  {optionalFilled} of {OPTIONAL_ATTACHMENT_FIELDS.length} uploaded
                                </span>
                                <div className="doc-progress-track" aria-hidden="true">
                                  <div
                                    className="doc-progress-fill"
                                    style={{
                                      width: `${Math.round(
                                        (optionalFilled / OPTIONAL_ATTACHMENT_FIELDS.length) * 100
                                      )}%`
                                    }}
                                  />
                                </div>
                              </div>
                              <button
                                type="button"
                                className="doc-section-toggle-btn"
                                onClick={() => toggleSection('optionalDocs', hasOptionalDocsData)}
                                aria-expanded={isOptionalDocsOpen}
                              >
                                <svg
                                  className={`registration-expander-chevron${isOptionalDocsOpen ? ' is-open' : ''}`}
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                                <span>{isOptionalDocsOpen ? 'Collapse' : 'Expand'}</span>
                              </button>
                            </div>
                          </div>
                          <p className="muted-text employee-step-note doc-section-subtitle">
                            Attach available medical records, contracts, visas, tickets, or custom files. Expiry dates can stay empty unless the file is attached.
                          </p>
                          {isOptionalDocsOpen && (
                            <div className="doc-section-content">

                          {/* Category 1: Medical & Competency */}
                          <div className="registration-expander-wrap">
                            <button
                              type="button"
                              className="registration-expander-toggle"
                              onClick={() => toggleSection('medicalDocs', hasMedicalData)}
                            >
                              <svg
                                className={`registration-expander-chevron${isMedicalOpen ? ' is-open' : ''}`}
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                              <span>{isMedicalOpen ? 'Hide Medical & Competency' : 'Medical & Competency (Medical result, Certificate of competency, Insurance)'}</span>
                              {hasMedicalData && !isMedicalOpen && (
                                <span className="registration-expander-badge">
                                  {medicalFilled > 0 ? `Filled (${medicalFilled}/${MEDICAL_ATTACHMENT_FIELDS.length})` : 'Filled'}
                                </span>
                              )}
                            </button>
                            {isMedicalOpen && (
                              <div className="doc-optional-grid">
                                {MEDICAL_ATTACHMENT_FIELDS.map((attachment) => renderDocUploadCard(attachment, false))}
                              </div>
                            )}
                          </div>

                          {/* Category 2: Legal & Employment */}
                          <div className="registration-expander-wrap">
                            <button
                              type="button"
                              className="registration-expander-toggle"
                              onClick={() => toggleSection('legalDocs', hasLegalData)}
                            >
                              <svg
                                className={`registration-expander-chevron${isLegalOpen ? ' is-open' : ''}`}
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                              <span>{isLegalOpen ? 'Hide Legal & Employment' : 'Legal & Employment (Visa, Contract, Clearance, Employee ID, Contact person ID)'}</span>
                              {hasLegalData && !isLegalOpen && (
                                <span className="registration-expander-badge">
                                  {legalFilled > 0 ? `Filled (${legalFilled}/${LEGAL_ATTACHMENT_FIELDS.length})` : 'Filled'}
                                </span>
                              )}
                            </button>
                            {isLegalOpen && (
                              <div className="doc-optional-grid">
                                {LEGAL_ATTACHMENT_FIELDS.map((attachment) => renderDocUploadCard(attachment, false))}
                              </div>
                            )}
                          </div>

                          {/* Category 3: Travel Tickets & Additional Records */}
                          <div className="registration-expander-wrap">
                            <button
                              type="button"
                              className="registration-expander-toggle"
                              onClick={() => toggleSection('travelDocs', hasTravelData)}
                            >
                              <svg
                                className={`registration-expander-chevron${isTravelOpen ? ' is-open' : ''}`}
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                              <span>{isTravelOpen ? 'Hide Travel Tickets & Additional Records' : 'Travel Tickets & Additional Records (Departure & Return tickets, Other documents)'}</span>
                              {hasTravelData && !isTravelOpen && (
                                <span className="registration-expander-badge">
                                  {travelFilled > 0 ? `Filled (${travelFilled}/${TRAVEL_ATTACHMENT_FIELDS.length})` : 'Filled'}
                                </span>
                              )}
                            </button>
                            {isTravelOpen && (
                              <div className="doc-optional-grid">
                                {TRAVEL_ATTACHMENT_FIELDS.map((attachment) => renderDocUploadCard(attachment, false))}
                              </div>
                            )}
                          </div>
                            </div>
                          )}
                        </div>
                      </>
                    )
                  })()}
                </div>
              ) : null}
              {activeStep === 5 ? (
                <div className="employee-step-grid">
                  <div className="employee-span-two">
                    <div className="employee-summary-intro">
                      <h3>Review</h3>
                      <p className="muted-text">Confirm details before submitting. Expand a section to review or edit.</p>
                    </div>

                    <div className="employee-summary-accordion">
                      {(() => {
                        const sections = [
                          {
                            id: 'identity',
                            title: 'Identity',
                            onEdit: () => setActiveStep(0),
                            rows: [
                              {
                                label: 'Name',
                                value: [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ') || '--'
                              },
                              { label: 'Date of birth', value: form.date_of_birth || '--' },
                              { label: 'Gender', value: form.gender || '--' },
                              { label: 'Passport', value: form.passport_number || '--' },
                              { label: 'Mobile', value: form.mobile_number || '--' }
                            ]
                          },
                          {
                            id: 'application',
                            title: 'Application',
                            onEdit: () => setActiveStep(3),
                            rows: [
                              { label: 'Countries', value: form.application_countries.join(', ') || '--' },
                              { label: 'Profession', value: form.profession || '--' },
                              { label: 'Type', value: form.employment_type || '--' },
                              { label: 'Salary', value: form.application_salary || '--' },
                              { label: 'Skills', value: form.skills.join(', ') || '--' }
                            ]
                          },
                          {
                            id: 'profile',
                            title: 'Profile',
                            onEdit: () => setActiveStep(1),
                            rows: [
                              { label: 'Religion', value: form.religion || '--' },
                              { label: 'Marital status', value: form.marital_status || '--' },
                              { label: 'Residence', value: form.residence_country || '--' },
                              { label: 'Nationality', value: form.nationality || '--' },
                              {
                                label: 'Experience',
                                value:
                                  form.experiences
                                    .filter((item) => item.country || item.years !== '')
                                    .map((item) => `${item.country || '--'} (${item.years || '--'} yrs)`)
                                    .join(', ') || '--'
                              }
                            ]
                          },
                          {
                            id: 'contact',
                            title: 'Contact',
                            onEdit: () => setActiveStep(2),
                            rows: [
                              { label: 'Contact person', value: form.contact_person_name || '--' },
                              { label: 'Contact mobile', value: form.contact_person_mobile || '--' },
                              { label: 'Email', value: form.email || '--' },
                              { label: 'Secondary phone', value: form.phone || '--' }
                            ]
                          }
                        ]

                        const toggleSection = (sectionId) => {
                          setOpenSummarySections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }))
                        }

                        const attachmentItems = ATTACHMENT_FIELDS.filter(
                          (attachment) => attachmentFiles[attachment.key] || existingAttachmentDocs[attachment.key]?.file_url
                        )

                        return (
                          <>
                            {sections.map((section) => (
                              <section key={section.id} className="commission-group employee-summary-group">
                                <div className="commission-group-header employee-summary-group-header">
                                  <div>
                                    <h3>{section.title}</h3>
                                    <p className="muted-text">{section.rows.length} field{section.rows.length === 1 ? '' : 's'}</p>
                                  </div>
                                  <div className="employee-summary-group-actions">
                                    <button type="button" className="btn-ghost employee-summary-edit" onClick={section.onEdit}>
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="commission-group-toggle-button"
                                      onClick={() => toggleSection(section.id)}
                                      aria-label={openSummarySections[section.id] ? `Collapse ${section.title}` : `Expand ${section.title}`}
                                      aria-expanded={Boolean(openSummarySections[section.id])}
                                    >
                                      <span className={`commission-group-toggle-icon${openSummarySections[section.id] ? ' is-open' : ''}`}>▸</span>
                                    </button>
                                  </div>
                                </div>

                                {openSummarySections[section.id] ? (
                                  <div className="employee-summary-group-body">
                                    {section.rows.map((row) => (
                                      <div key={`${section.id}-${row.label}`} className="employee-summary-row">
                                        <span className="employee-summary-label">{row.label}</span>
                                        <span className="employee-summary-value">{row.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </section>
                            ))}

                            <section className="commission-group employee-summary-group">
                              <div className="commission-group-header employee-summary-group-header">
                                <div>
                                  <h3>Notes</h3>
                                  <p className="muted-text">4 fields</p>
                                </div>
                                <div className="employee-summary-group-actions">
                                  <button type="button" className="btn-ghost employee-summary-edit" onClick={() => setActiveStep(1)}>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="commission-group-toggle-button"
                                    onClick={() => toggleSection('notes')}
                                    aria-label={openSummarySections.notes ? 'Collapse Notes' : 'Expand Notes'}
                                    aria-expanded={Boolean(openSummarySections.notes)}
                                  >
                                    <span className={`commission-group-toggle-icon${openSummarySections.notes ? ' is-open' : ''}`}>▸</span>
                                  </button>
                                </div>
                              </div>

                              {openSummarySections.notes ? (
                                <div className="employee-summary-group-body employee-summary-group-body--notes">
                                  {[
                                    { label: 'Professional title', value: form.professional_title || '--' },
                                    { label: 'Summary', value: form.summary || '--' },
                                    { label: 'Education', value: form.education || '--' },
                                    { label: 'Notes', value: form.notes || '--' }
                                  ].map((row) => (
                                    <div key={`notes-${row.label}`} className="employee-summary-row employee-summary-row--wrap">
                                      <span className="employee-summary-label">{row.label}</span>
                                      <span className="employee-summary-value employee-summary-long">{row.value}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </section>

                            <section className="commission-group employee-summary-group">
                              <div className="commission-group-header employee-summary-group-header">
                                <div>
                                  <h3>Attachments</h3>
                                  <p className="muted-text">{attachmentItems.length} file{attachmentItems.length === 1 ? '' : 's'}</p>
                                </div>
                                <div className="employee-summary-group-actions">
                                  <button type="button" className="btn-ghost employee-summary-edit" onClick={() => setActiveStep(4)}>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="commission-group-toggle-button"
                                    onClick={() => toggleSection('attachments')}
                                    aria-label={openSummarySections.attachments ? 'Collapse Attachments' : 'Expand Attachments'}
                                    aria-expanded={Boolean(openSummarySections.attachments)}
                                  >
                                    <span className={`commission-group-toggle-icon${openSummarySections.attachments ? ' is-open' : ''}`}>▸</span>
                                  </button>
                                </div>
                              </div>

                              {openSummarySections.attachments ? (
                                <div className="employee-summary-group-body employee-summary-group-body--attachments">
                                  <div className="employee-attachment-preview-grid employee-attachment-preview-grid--summary">
                                    {attachmentItems.length === 0 ? (
                                      <div className="employee-attachment-preview-card">
                                        <div className="employee-attachment-preview-file">No attachments added yet.</div>
                                      </div>
                                    ) : (
                                      attachmentItems.map((attachment) => {
                                        const file = attachmentFiles[attachment.key]
                                        const existingDocument = existingAttachmentDocs[attachment.key]
                                        const url = file ? attachmentPreviewUrls[attachment.key] : existingDocument?.file_url
                                        const label = attachmentLabels[attachment.key] || attachment.label
                                        const isImage = file ? file.type?.startsWith('image/') : isImageDocument(existingDocument)

                                        return (
                                          <button
                                            key={attachment.key}
                                            type="button"
                                            className="employee-attachment-preview-card employee-attachment-preview-card--button"
                                            onClick={() =>
                                              url
                                                ? openDocumentPreview({
                                                    url,
                                                    label,
                                                    isImage,
                                                    isPdf: isPdfDocumentUrl(url)
                                                  })
                                                : undefined
                                            }
                                            disabled={!url}
                                          >
                                            <strong>{label}</strong>
                                            {url && isImage ? (
                                              <img src={url} alt={label} className="employee-attachment-preview-image" />
                                            ) : (
                                              <div className="employee-attachment-preview-file">{file?.name || (url ? (isPdfDocumentUrl(url) ? 'PDF' : 'Attached file') : 'Missing')}</div>
                                            )}
                                          </button>
                                        )
                                      })
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </section>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </div>
                ) : null}
              <div className="employee-modal-actions">
                <div className="employee-modal-actions-left">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => navigate('/dashboard/employees/list')}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleResetRegistrationToTemplate}
                    disabled={saving}
                    title="Reset to blank or template defaults"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    Clear
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleSaveDraft}
                    disabled={saving}
                    title="Save current progress locally"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Save Draft
                  </button>
                  {savedDraftMeta ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleRestoreDraft}
                      disabled={saving}
                    >
                      Restore Draft
                    </button>
                  ) : null}
                </div>

                <div className="employee-modal-actions-right">
                  {activeStep > 0 ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={goToPreviousStep}
                      disabled={saving}
                    >
                      Back
                    </button>
                  ) : null}
                  {activeStep < REGISTRATION_STEPS.length - 1 ? (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={goToNextStep}
                      disabled={saving}
                    >
                      Continue to {REGISTRATION_STEPS[activeStep + 1]?.label || 'Next'} →
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={submitRegistration}
                      disabled={saving || readOnly}
                    >
                      {saving ? 'Saving...' : editingEmployeeId ? 'Update Employee' : 'Complete Registration'}
                    </button>
                  )}
                </div>
              </div>
            </form>
              </div>
            </div>
          </div>
        </div>
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
                      <label key={attachment.key} className={`checkbox-pill${scanAttachmentKeys.includes(attachment.key) ? ' is-checked' : ''}`}>
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
      {floatingAttachmentPreview && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="attachment-slot-preview-popover is-floating"
            style={{
              left: `${floatingAttachmentPreview.left}px`,
              top: `${floatingAttachmentPreview.top}px`,
              width: `${floatingAttachmentPreview.width}px`
            }}
            ref={floatingAttachmentPreviewPopoverRef}
            onPointerEnter={cancelFloatingAttachmentPreviewClose}
            onPointerLeave={scheduleFloatingAttachmentPreviewClose}
            role="presentation"
          >
            <img src={floatingAttachmentPreview.url} alt={floatingAttachmentPreview.label} />
          </div>,
          document.body
        )
        : null}

      <EmployeeDocumentPreview
        previewDocument={previewDocument}
        closeDocumentPreview={closeDocumentPreview}
        handlePreviewDownload={handlePreviewDownload}
        handlePreviewPrint={handlePreviewPrint}
        previewZoom={previewZoom}
        handlePreviewZoomOut={handlePreviewZoomOut}
        handlePreviewZoomIn={handlePreviewZoomIn}
        handlePreviewReset={handlePreviewReset}
        previewOffset={previewOffset}
        previewDragging={previewDragging}
        handlePreviewWheel={handlePreviewWheel}
        handlePreviewPointerDown={handlePreviewPointerDown}
      />

      {/* Document Expiration / Scheduled Date Modal */}
      <Modal
        isOpen={Boolean(dateModalAttachment)}
        onClose={closeDateModal}
        title={
          dateModalAttachment?.expiryField?.includes('departure')
            ? 'Set Departure Date'
            : dateModalAttachment?.expiryField?.includes('return')
            ? 'Set Return Date'
            : 'Set Expiration Date'
        }
        subtitle={`Specify the validity or scheduled date for ${dateModalAttachment?.label || 'this document'}.`}
        maxWidth="460px"
        className="doc-date-modal-dialog"
        backdropClassName="doc-date-backdrop"
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={closeDateModal}
            >
              Cancel
            </button>
            {form[dateModalAttachment?.expiryField] ? (
              <button
                type="button"
                className="doc-date-btn-clear"
                onClick={handleClearDateModal}
                title="Remove date from document"
              >
                Clear date
              </button>
            ) : null}
            <button
              type="button"
              className="btn-primary"
              onClick={handleSaveDateModal}
            >
              Save date
            </button>
          </>
        }
      >
        {dateModalAttachment && (() => {
          const isTicket = Boolean(
            dateModalAttachment.expiryField?.includes('departure') ||
            dateModalAttachment.expiryField?.includes('return')
          )
          const attachedFile = attachmentFiles[dateModalAttachment.key]
          const existingDoc = existingAttachmentDocs[dateModalAttachment.key]
          const hasAttachment = Boolean(attachedFile || existingDoc?.file_url)
          const fileLabel = attachedFile?.name || attachmentDisplayName(existingDoc, attachmentLabels) || 'No file attached yet'

          return (
            <div className="doc-date-modal-content">
              <div className="doc-date-modal-target">
                <div className="doc-date-modal-target-icon" aria-hidden="true">
                  {getAttachmentIcon(dateModalAttachment.key)}
                </div>
                <div className="doc-date-modal-target-info">
                  <div className="doc-date-modal-target-name">{dateModalAttachment.label}</div>
                  <div className="doc-date-modal-target-hint">
                    {hasAttachment ? `Attached: ${fileLabel}` : 'Not attached yet'}
                  </div>
                </div>
                {form[dateModalAttachment.expiryField] ? (
                  <span className="doc-date-modal-current-badge">
                    Current: {form[dateModalAttachment.expiryField]}
                  </span>
                ) : null}
              </div>

              <div className="doc-date-presets-section">
                <div className="doc-date-presets-label">
                  {isTicket ? 'Quick schedule options' : 'Quick validity presets'}
                </div>
                <div className="doc-date-presets-grid">
                  {isTicket ? (
                    <>
                      <button
                        type="button"
                        className={`doc-date-preset-chip${tempDateValue === getFutureDate(1) ? ' is-active' : ''}`}
                        onClick={() => setTempDateValue(getFutureDate(1))}
                      >
                        +1 Month
                      </button>
                      <button
                        type="button"
                        className={`doc-date-preset-chip${tempDateValue === getFutureDate(3) ? ' is-active' : ''}`}
                        onClick={() => setTempDateValue(getFutureDate(3))}
                      >
                        +3 Months
                      </button>
                      <button
                        type="button"
                        className={`doc-date-preset-chip${tempDateValue === getFutureDate(6) ? ' is-active' : ''}`}
                        onClick={() => setTempDateValue(getFutureDate(6))}
                      >
                        +6 Months
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`doc-date-preset-chip${tempDateValue === getFutureDate(6) ? ' is-active' : ''}`}
                        onClick={() => setTempDateValue(getFutureDate(6))}
                      >
                        +6 Months
                      </button>
                      <button
                        type="button"
                        className={`doc-date-preset-chip${tempDateValue === getFutureDate(12) ? ' is-active' : ''}`}
                        onClick={() => setTempDateValue(getFutureDate(12))}
                      >
                        +1 Year
                      </button>
                      <button
                        type="button"
                        className={`doc-date-preset-chip${tempDateValue === getFutureDate(24) ? ' is-active' : ''}`}
                        onClick={() => setTempDateValue(getFutureDate(24))}
                      >
                        +2 Years
                      </button>
                      <button
                        type="button"
                        className={`doc-date-preset-chip${tempDateValue === getFutureDate(60) ? ' is-active' : ''}`}
                        onClick={() => setTempDateValue(getFutureDate(60))}
                      >
                        +5 Years
                      </button>
                      <button
                        type="button"
                        className={`doc-date-preset-chip${tempDateValue === getFutureDate(120) ? ' is-active' : ''}`}
                        onClick={() => setTempDateValue(getFutureDate(120))}
                      >
                        +10 Years
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="doc-date-input-group">
                <label htmlFor="doc-modal-date-input" className="doc-date-input-label">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>{getAttachmentDateFieldLabel(dateModalAttachment.expiryField)}</span>
                </label>
                <input
                  id="doc-modal-date-input"
                  type="date"
                  className="doc-date-modal-input"
                  value={tempDateValue}
                  onChange={(e) => setTempDateValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSaveDateModal()
                    }
                  }}
                  autoFocus
                />
                {tempDateValue ? (
                  <div className="doc-date-preview-text">
                    Selected: <strong>{formatDateFriendly(tempDateValue)}</strong>
                  </div>
                ) : (
                  <div className="doc-date-preview-text is-empty">
                    No date selected
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>

      <Modal
        isOpen={Boolean(titleModalAttachment)}
        onClose={closeTitleModal}
        title="Set Document Title"
        subtitle={`Specify a custom name for ${titleModalAttachment?.label || 'this document'}.`}
        maxWidth="460px"
        className="doc-date-modal-dialog"
        backdropClassName="doc-date-backdrop"
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={closeTitleModal}
            >
              Cancel
            </button>
            {attachmentLabels[titleModalAttachment?.key] ? (
              <button
                type="button"
                className="doc-date-btn-clear"
                onClick={handleClearTitleModal}
                title="Reset to default title"
              >
                Clear title
              </button>
            ) : null}
            <button
              type="button"
              className="btn-primary"
              onClick={handleSaveTitleModal}
            >
              Save title
            </button>
          </>
        }
      >
        {titleModalAttachment && (() => {
          const attachedFile = attachmentFiles[titleModalAttachment.key]
          const existingDoc = existingAttachmentDocs[titleModalAttachment.key]
          const hasAttachment = Boolean(attachedFile || existingDoc?.file_url)
          const fileLabel = attachedFile?.name || attachmentDisplayName(existingDoc, attachmentLabels) || 'No file attached yet'
          const currentLabel = attachmentLabels[titleModalAttachment.key] || ''

          const TITLE_PRESETS = [
            'Police Clearance',
            'Birth Certificate',
            'Driving License',
            'Educational Degree',
            'Training Certificate',
            'Experience Certificate',
            'Recommendation Letter',
            'Bank Statement'
          ]

          return (
            <div className="doc-date-modal-content">
              <div className="doc-date-modal-target">
                <div className="doc-date-modal-target-icon" aria-hidden="true">
                  {getAttachmentIcon(titleModalAttachment.key)}
                </div>
                <div className="doc-date-modal-target-info">
                  <div className="doc-date-modal-target-name">{currentLabel || titleModalAttachment.label}</div>
                  <div className="doc-date-modal-target-hint">
                    {hasAttachment ? `Attached: ${fileLabel}` : 'Not attached yet'}
                  </div>
                </div>
                {currentLabel ? (
                  <span className="doc-date-modal-current-badge">
                    Current: {currentLabel}
                  </span>
                ) : null}
              </div>

              <div className="doc-date-presets-section">
                <div className="doc-date-presets-label">
                  Quick suggestion presets
                </div>
                <div className="doc-date-presets-grid">
                  {TITLE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`doc-date-preset-chip${tempTitleValue === preset ? ' is-active' : ''}`}
                      onClick={() => setTempTitleValue(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="doc-date-input-group">
                <label htmlFor="doc-modal-title-input" className="doc-date-input-label">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  <span>Document Title / Type</span>
                </label>
                <input
                  id="doc-modal-title-input"
                  type="text"
                  className="doc-date-modal-input"
                  value={tempTitleValue}
                  onChange={(e) => setTempTitleValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSaveTitleModal()
                    }
                  }}
                  placeholder="e.g. Police Clearance, Birth Certificate..."
                  autoFocus
                />
                {tempTitleValue.trim() ? (
                  <div className="doc-date-preview-text">
                    Display title: <strong>{tempTitleValue.trim()}</strong>
                  </div>
                ) : (
                  <div className="doc-date-preview-text is-empty">
                    Default title: <em>{titleModalAttachment.label}</em>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
