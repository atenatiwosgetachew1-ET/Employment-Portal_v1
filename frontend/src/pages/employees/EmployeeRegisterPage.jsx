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
  LEGACY_REGISTRATION_TEMPLATE_STORAGE_KEY,
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
  isPdfDocumentUrl,
  printDocumentSilently
} from '../../utils/employeeHelpers'
import EmployeeDocumentPreview from '../../components/employees/EmployeeDocumentPreview'

import EmployeeCameraModal from '../../components/employees/EmployeeCameraModal'
import EmployeeScanImportModal from '../../components/employees/EmployeeScanImportModal'
import EmployeeBatchRegistrationModal from '../../components/employees/EmployeeBatchRegistrationModal'

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
    profile: false,
    contact: false,
    application: false,
    attachments: false
  })

  const areAllSummarySectionsOpen = useMemo(() => {
    return Object.values(openSummarySections).every(Boolean)
  }, [openSummarySections])

  const toggleAllSummarySections = useCallback(() => {
    setOpenSummarySections((prev) => {
      const willOpen = !Object.values(prev).every(Boolean)
      return {
        identity: willOpen,
        profile: willOpen,
        contact: willOpen,
        application: willOpen,
        attachments: willOpen
      }
    })
  }, [])

  const toggleSummarySection = useCallback((sectionKey) => {
    setOpenSummarySections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }))
  }, [])
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
    printDocumentSilently(previewDocument)
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

  useEffect(() => {
    if (!previewDragging) return undefined

    const handlePointerMove = (event) => {
      const { x, y, originX, originY } = previewDragStartRef.current
      setPreviewOffset({
        x: originX + (event.clientX - x),
        y: originY + (event.clientY - y)
      })
    }

    const handlePointerUp = () => {
      setPreviewDragging(false)
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)

    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [previewDragging])


  const [scanImportModalOpen, setScanImportModalOpen] = useState(() => !editId)
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [cameraCaptureModalOpen, setCameraCaptureModalOpen] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const [cameraError, setCameraError] = useState('')
  const [cameraLoading, setCameraLoading] = useState(false)
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
  const [scanAttachmentPdfFit, setScanAttachmentPdfFit] = useState('FitH')
  const [scanAttachmentPdfZoom, setScanAttachmentPdfZoom] = useState(100)

  const scanUploadInputRef = useRef(null)
  const scanCameraVideoRef = useRef(null)
  const scanCameraCanvasRef = useRef(null)
  const scanCameraStreamRef = useRef(null)
  const scanCameraRequestRef = useRef(0)
  const scanAttachmentFrameRef = useRef(null)
  const scanAttachmentImgRef = useRef(null)
  const scanAttachmentDragRef = useRef({ startX: 0, startY: 0, originX: 0, originY: 0 })
  const scanAttachmentZoomRef = useRef(1)
  const scanAttachmentOffsetRef = useRef({ x: 0, y: 0 })
  const scanAttachmentRotationRef = useRef(0)
  const scanAttachmentFlipXRef = useRef(false)
  const scanAttachmentFlipYRef = useRef(false)
  const scanAttachmentZoomCommitTimeoutRef = useRef(null)

  scanAttachmentZoomRef.current = scanAttachmentZoom
  scanAttachmentOffsetRef.current = scanAttachmentOffset
  scanAttachmentRotationRef.current = scanAttachmentRotation
  scanAttachmentFlipXRef.current = scanAttachmentFlipX
  scanAttachmentFlipYRef.current = scanAttachmentFlipY

  const canManageEmployees = Boolean(user?.feature_flags?.employees_enabled)
  const readOnly = Boolean(user?.is_read_only || user?.is_suspended)
  const isAgentSideUser = isAgentSideWorkspace(user)
  const canEditEmployeeRecords = !isAgentSideUser
  const age = computeAge(form.date_of_birth)
  const ageRestrictionError = age !== '' && age < MINIMUM_EMPLOYEE_AGE
    ? ('Candidate must be at least ' + MINIMUM_EMPLOYEE_AGE + ' years old.')
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

  // Auto-scroll to top whenever the active wizard step changes
  useEffect(() => {
    const behavior = 'smooth'
    window.scrollTo({ top: 0, left: 0, behavior })
    if (document.documentElement) document.documentElement.scrollTo({ top: 0, left: 0, behavior })
    if (document.body) document.body.scrollTo({ top: 0, left: 0, behavior })

    const scrollContainers = document.querySelectorAll(
      '.dashboard-content, .employee-modal-content, .employee-registration-page, .employee-modal-scroll'
    )
    scrollContainers.forEach((el) => {
      el.scrollTo({ top: 0, left: 0, behavior })
    })
  }, [activeStep])
 
  // Automatically present the Document Scan / Upload modal on initial page load for new candidate registration
  const hasAutoOpenedScanRef = useRef(false)
  useEffect(() => {
    if (!editId && !hasAutoOpenedScanRef.current) {
      hasAutoOpenedScanRef.current = true
      setScanImportModalOpen(true)
    }
  }, [editId])

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
        if (!isCancelled) setModalError(err.message || 'Could not load candidate for editing')
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
          const rawTemplate = window.localStorage.getItem(REGISTRATION_TEMPLATE_STORAGE_KEY) ||
            window.localStorage.getItem(LEGACY_REGISTRATION_TEMPLATE_STORAGE_KEY)
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
    if (!modalNotice) return
    const timer = window.setTimeout(() => {
      setModalNotice('')
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [modalNotice])

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
    setCameraLoading(false)
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
      const rawTemplate = window.localStorage.getItem(REGISTRATION_TEMPLATE_STORAGE_KEY) ||
        window.localStorage.getItem(LEGACY_REGISTRATION_TEMPLATE_STORAGE_KEY)
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
  const scanAttachmentPdfUrl = useMemo(() => {
    if (!scanAttachmentSourcePreviewUrl) return ''
    const baseUrl = scanAttachmentSourcePreviewUrl.split('#')[0]
    const params = ['toolbar=0', 'navpanes=0']
    if (scanAttachmentPdfFit === 'Fit') {
      params.push('view=Fit')
    } else if (scanAttachmentPdfFit === 'FitH') {
      params.push('view=FitH')
    }
    if (scanAttachmentPdfZoom !== 100) {
      params.push(`zoom=${scanAttachmentPdfZoom}`)
    }
    return `${baseUrl}#${params.join('&')}`
  }, [scanAttachmentSourcePreviewUrl, scanAttachmentPdfFit, scanAttachmentPdfZoom])

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
    const handlePortalBatchRegistration = () => {
      setBatchModalOpen(true)
    }
    window.addEventListener('portal:save-registration-template', handlePortalSaveTemplate)
    window.addEventListener('portal:open-batch-registration', handlePortalBatchRegistration)
    return () => {
      window.removeEventListener('portal:save-registration-template', handlePortalSaveTemplate)
      window.removeEventListener('portal:open-batch-registration', handlePortalBatchRegistration)
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
      openScanAttachmentModal('upload', selectedFile)
      setModalNotice('Document uploaded. Adjust it and attach the visible area to the selected attachment slots.')
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
    setCameraLoading(true)

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraLoading(false)
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
      setCameraError('')
    } catch (err) {
      if (scanCameraRequestRef.current !== requestId) return
      setCameraCaptureModalOpen(true)
      const isDenied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        /permission|denied|dismissed/i.test(err?.message || '')
      if (isDenied) {
        setCameraError('Permission denied. Please allow camera permissions in your browser to take a photo.')
      } else {
        setCameraError(err?.message || 'Could not access the camera. Check browser permissions and try again.')
      }
    } finally {
      if (scanCameraRequestRef.current === requestId) {
        setCameraLoading(false)
      }
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

  const handleAnalyzeAndAutoFill = async () => {
    if (!ocrImportFile) {
      setModalNotice('')
      setModalError('Scan, capture, or upload a document from the first step before using auto fill.')
      setActiveStep(0)
      return
    }
    setModalError('')
    setOcrBusy(true)

    const cacheKey = buildOcrCacheKey(ocrImportFile)
    const hasCachedResult = ocrCachedResult?.cacheKey === cacheKey
    let result = ocrCachedResult
    let newlyAnalyzed = false

    if (!hasCachedResult) {
      setModalNotice(`Analyzing ${ocrImportFileName || 'the scanned document'} and filling matching fields...`)
      try {
        result = await employeesService.extractEmployeeDocumentFields(ocrImportFile, 0, formOptions)
        setOcrCachedResult({ ...result, cacheKey })
        newlyAnalyzed = true
      } catch (err) {
        setOcrBusy(false)
        setModalNotice('')
        const rawMessage = err?.message || 'OCR could not read this scanned document.'
        const message = normalizeOcrStatusMessage(rawMessage)
        setModalError(message)
        if (rawMessage.includes('Backend OCR is not configured yet') || rawMessage.toLowerCase().includes('ocr service is not reachable')) {
          setOcrStatus({ ready: false, message })
          await openOcrSetupModal()
        }
        return
      }
    }

    try {
      const updatesByStep = result?.updatesByStep && typeof result.updatesByStep === 'object' ? result.updatesByStep : {}
      const mappedFieldCount = Object.values(updatesByStep).reduce((count, value) => {
        if (!value || typeof value !== 'object') return count
        return count + Object.keys(value).length
      }, 0)

      const updates = updatesByStep[String(activeStep)] && typeof updatesByStep[String(activeStep)] === 'object'
        ? updatesByStep[String(activeStep)]
        : result?.updates && typeof result.updates === 'object'
          ? result.updates
          : {}
      const updatedFields = Object.keys(updates)

      if (updatedFields.length === 0) {
        setModalNotice(
          mappedFieldCount > 0
            ? `OCR analyzed document (${mappedFieldCount} total fields detected across steps), but no matching fields found for this step.`
            : 'Analysis completed, but no matching registration fields were found in this document.'
        )
        return
      }

      setForm((prev) => ({ ...prev, ...updates }))
      const fieldLabels = updatedFields
        .map((field) => EMPLOYEE_OCR_FIELD_LABELS[field] || field.replace(/_/g, ' '))
        .slice(0, 5)
        .join(', ')

      const stepName = REGISTRATION_STEPS[activeStep]?.label?.toLowerCase() || 'current step'
      if (newlyAnalyzed) {
        setModalNotice(
          `Analysis complete! Auto filled ${updatedFields.length} ${updatedFields.length === 1 ? 'field' : 'fields'} for ${stepName}: ` +
          `${fieldLabels}${updatedFields.length > 5 ? ', ...' : ''}. (${mappedFieldCount} fields ready across steps)`
        )
      } else {
        setModalNotice(
          `Auto filled ${updatedFields.length} ${updatedFields.length === 1 ? 'field' : 'fields'} for ${stepName}: ` +
          `${fieldLabels}${updatedFields.length > 5 ? ', ...' : ''}.`
        )
      }
    } catch (err) {
      setModalNotice('')
      const rawMessage = err?.message || 'OCR could not apply extracted fields.'
      const message = normalizeOcrStatusMessage(rawMessage)
      setModalError(message)
    } finally {
      setOcrBusy(false)
    }
  }

  const handleAutoFillFromScan = handleAnalyzeAndAutoFill
  const handleAnalyzeScan = handleAnalyzeAndAutoFill

  const openScanAttachmentModal = (sourceMode = 'scan', explicitFile = null) => {
    const selectedSourceFile = explicitFile || (sourceMode === 'upload' ? attachmentStageFile : ocrImportFile)
    const missingMessage = sourceMode === 'upload'
      ? 'Upload a document before attaching it.'
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
    setScanAttachmentPdfFit('FitH')
    setScanAttachmentPdfZoom(100)
    setScanAttachmentModalOpen(true)
  }

  const closeScanAttachmentModal = () => {
    setScanAttachmentModalOpen(false)
    setScanAttachmentDragging(false)
    setScanAttachmentError('')
    setScanAttachmentPdfFit('FitH')
    setScanAttachmentPdfZoom(100)
  }

  const handleScanAttachmentKeyToggle = (key) => {
    setScanAttachmentKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    )
  }

  useEffect(() => {
    const frame = scanAttachmentFrameRef.current
    if (!frame || !scanAttachmentModalOpen || !scanAttachmentSourceFile?.type?.startsWith('image/')) return undefined

    const handleWheel = (event) => {
      event.preventDefault()
      const img = scanAttachmentImgRef.current
      if (!img) return

      const rect = frame.getBoundingClientRect()
      const cursorX = event.clientX - (rect.left + rect.width / 2)
      const cursorY = event.clientY - (rect.top + rect.height / 2)

      const curZoom = scanAttachmentZoomRef.current
      const curOffset = scanAttachmentOffsetRef.current

      const delta = -event.deltaY * (event.deltaMode === 1 ? 0.03 : event.deltaMode === 2 ? 0.6 : 0.0015)
      const factor = Math.min(1.25, Math.max(0.8, Math.exp(delta)))

      const nextZoom = Math.min(5, Math.max(1, Math.round(curZoom * factor * 1000) / 1000))
      if (nextZoom === curZoom) return

      let nextX = 0
      let nextY = 0
      if (nextZoom > 1) {
        const ratio = nextZoom / curZoom
        nextX = Math.round(cursorX - (cursorX - curOffset.x) * ratio)
        nextY = Math.round(cursorY - (cursorY - curOffset.y) * ratio)
      }

      scanAttachmentZoomRef.current = nextZoom
      scanAttachmentOffsetRef.current = { x: nextX, y: nextY }

      img.style.transition = 'none'
      img.style.transform = `translate(${nextX}px, ${nextY}px) rotate(${scanAttachmentRotationRef.current}deg) scale(${(scanAttachmentFlipXRef.current ? -1 : 1) * nextZoom}, ${(scanAttachmentFlipYRef.current ? -1 : 1) * nextZoom})`

      if (scanAttachmentZoomCommitTimeoutRef.current) clearTimeout(scanAttachmentZoomCommitTimeoutRef.current)
      scanAttachmentZoomCommitTimeoutRef.current = setTimeout(() => {
        setScanAttachmentZoom(scanAttachmentZoomRef.current)
        setScanAttachmentOffset(scanAttachmentOffsetRef.current)
        if (scanAttachmentImgRef.current) {
          scanAttachmentImgRef.current.style.transition = ''
        }
      }, 80)
    }

    frame.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      frame.removeEventListener('wheel', handleWheel)
      if (scanAttachmentZoomCommitTimeoutRef.current) clearTimeout(scanAttachmentZoomCommitTimeoutRef.current)
    }
  }, [scanAttachmentModalOpen, scanAttachmentSourceFile])

  const handleScanAttachmentPointerDown = (event) => {
    if (event.button !== 0) return
    if (!scanAttachmentSourceFile?.type?.startsWith('image/')) return
    event.preventDefault()
    scanAttachmentDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: scanAttachmentOffsetRef.current.x,
      originY: scanAttachmentOffsetRef.current.y
    }
    setScanAttachmentDragging(true)
  }

  useEffect(() => {
    if (!scanAttachmentDragging) return undefined

    const handlePointerMove = (event) => {
      const { startX, startY, originX, originY } = scanAttachmentDragRef.current
      const newX = originX + (event.clientX - startX)
      const newY = originY + (event.clientY - startY)
      scanAttachmentOffsetRef.current = { x: newX, y: newY }

      if (scanAttachmentImgRef.current) {
        scanAttachmentImgRef.current.style.transition = 'none'
        scanAttachmentImgRef.current.style.transform = `translate(${newX}px, ${newY}px) rotate(${scanAttachmentRotationRef.current}deg) scale(${(scanAttachmentFlipXRef.current ? -1 : 1) * scanAttachmentZoomRef.current}, ${(scanAttachmentFlipYRef.current ? -1 : 1) * scanAttachmentZoomRef.current})`
      }
    }

    const handlePointerUp = () => {
      setScanAttachmentDragging(false)
      setScanAttachmentOffset(scanAttachmentOffsetRef.current)
      if (scanAttachmentImgRef.current) {
        scanAttachmentImgRef.current.style.transition = ''
      }
    }

    window.addEventListener('mousemove', handlePointerMove, { passive: true })
    window.addEventListener('mouseup', handlePointerUp)

    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [scanAttachmentDragging])

  const resetScanAttachmentView = () => {
    setScanAttachmentZoom(1)
    setScanAttachmentOffset({ x: 0, y: 0 })
    scanAttachmentZoomRef.current = 1
    scanAttachmentOffsetRef.current = { x: 0, y: 0 }
    setScanAttachmentDragging(false)
    setScanAttachmentPdfFit('FitH')
    setScanAttachmentPdfZoom(100)
    if (scanAttachmentImgRef.current) {
      scanAttachmentImgRef.current.style.transform = ''
      scanAttachmentImgRef.current.style.transition = ''
    }
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
      setModalError('Only organization-side users can edit candidate records.')
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
        setNotice('Candidate updated successfully.')
        navigate('/dashboard/candidates/list')
        resetForm()
      } else {
        setNotice('Candidate registered successfully.')
        setEditingEmployeeId(null)
        setForm(createFormFromTemplate())
        setAttachmentFiles({})
        setAttachmentLabels({})
        setExistingAttachmentDocs({})
        setActiveStep(0)
        clearScannedDocument()
        navigate('/dashboard/candidates/list')
      }
      await loadFormOptions()
    } catch (err) {
      console.error('Employee registration failed:', err)
      const nextError = errorMessage(err, 'Could not save candidate')
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
                  <a
                    href="https://www.youtube.com/watch?v=fXQY4y6WPZQ"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="employee-registration-help-tutorial-link"
                    title="Watch Candidate Registration Tutorial on YouTube"
                  >
                    <svg className="youtube-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    <span>Registration Tutorial</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.7 }}>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                  <div className="employee-registration-help-tooltip" role="tooltip" aria-label="OCR tips">
                    <p className="employee-modal-eyebrow">Tips for best results</p>
                    <ul className="employee-registration-help-tooltip-list">
                      <li>Use a clear, well-lit image</li>
                      <li>Ensure all corners are visible</li>
                      <li>Avoid shadows and glare</li>
                      <li>Supported: JPG, PNG, PDF</li>
                    </ul>
                    <div className="employee-registration-tooltip-footer">
                      <a
                        href="https://www.youtube.com/watch?v=fXQY4y6WPZQ"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="employee-registration-tooltip-link"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ color: '#ff0000' }}>
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                        <span>Watch video tutorial</span>
                      </a>
                    </div>
                  </div>
                </div>
              </aside>

              <div className="employee-registration-main">
                {activeStep < 5 && (
                  <div className="employee-registration-top">
                    {activeStep === 0 ? (
                      <div className={`employee-scan-launch-card${ocrImportFileName ? ' has-selected-file' : ''}`}>
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
                          {ocrImportFileName ? (
                            <>
                              <button
                                type="button"
                                className={`btn-primary employee-scan-btn-analyze${!hasAnalyzedScan && !ocrBusy ? ' is-ready-pulse' : ''}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleAnalyzeAndAutoFill()
                                }}
                                disabled={ocrBusy}
                              >
                                {ocrBusy ? (
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="is-spinning" style={{ overflow: 'visible' }} aria-hidden="true">
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                  </svg>
                                ) : (
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }} aria-hidden="true">
                                    <path d="M12 3c0 4.5-3.5 8-8 8 4.5 0 8 3.5 8 8 0-4.5 3.5-8 8-8-4.5 0-8-3.5-8-8z" />
                                    <path d="M19 3v4" />
                                    <path d="M17 5h4" />
                                  </svg>
                                )}
                                <span>{ocrBusy ? (hasAnalyzedScan ? 'Filling...' : 'Extracting & Filling...') : (hasAnalyzedScan ? 'Auto fill' : 'Extract & Fill')}</span>
                              </button>
                              <button type="button" className="btn-secondary employee-scan-launch-action" onClick={openScanImportModal}>
                                Change file
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
                          ) : (
                            <button type="button" className="btn-secondary employee-scan-launch-action" onClick={openScanImportModal}>
                              Scan / Upload
                            </button>
                          )}
                        </div>
                      </div>
                    ) : activeStep > 0 && activeStep < 4 ? (
                      <div className="employee-scan-step-assist">
                        <div>
                          <strong>Auto fill from the scanned document</strong>
                          <span>{ocrImportFileName ? ocrImportFileName : 'No scanned document selected yet'}</span>
                        </div>
                        <div className="employee-scan-step-actions">
                          <button
                            type="button"
                            className={hasAnalyzedScan ? 'btn-primary employee-scan-btn-analyze' : 'btn-secondary'}
                            onClick={handleAutoFillFromScan}
                            disabled={ocrBusy || !ocrImportFileName}
                          >
                            {ocrBusy ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="is-spinning" style={{ overflow: 'visible' }} aria-hidden="true">
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }} aria-hidden="true">
                                <path d="M12 3c0 4.5-3.5 8-8 8 4.5 0 8 3.5 8 8 0-4.5 3.5-8 8-8-4.5 0-8-3.5-8-8z" />
                                <path d="M19 3v4" />
                                <path d="M17 5h4" />
                              </svg>
                            )}
                            <span>{ocrBusy ? 'Filling...' : 'Auto fill'}</span>
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
                            Attach from Scan / Upload
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => openScanAttachmentModal('upload')} disabled={!attachmentStageFile}>
                            Attach from Document
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
                    <div className={`registration-card-collapsible${isDirectChannelsOpen ? ' is-open' : ''}`}>
                      <div className="registration-card-collapsible-inner">
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

                            <div className={`registration-expander-collapsible${isReferencesOpen ? ' is-open' : ''}`}>
                              <div className="registration-card-collapsible-inner">
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
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
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
                    <div className={`registration-card-collapsible${isOverseasExperienceOpen ? ' is-open' : ''}`}>
                      <div className="registration-card-collapsible-inner">
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
                      </div>
                    </div>
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
                                    const isPdfAttachment = Boolean(
                                      attachedFile?.type === 'application/pdf' ||
                                      (!attachedFile && typeof existingUrl === 'string' && existingUrl.match(/\.pdf(\?|#|$)/i))
                                    )
                                    openDocumentPreview({
                                      url: previewUrl,
                                      name: fileLabel,
                                      label: isCustomOption ? (attachmentLabels[attachment.key] || attachment.label) : attachment.label,
                                      subtitle: fileLabel,
                                      type: attachedFile?.type || (isPdfAttachment ? 'application/pdf' : isImageAttachment ? 'image/jpeg' : ''),
                                      isImage: isImageAttachment,
                                      isPdf: isPdfAttachment
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
                          <div className={`registration-card-collapsible${isOptionalDocsOpen ? ' is-open' : ''}`}>
                            <div className="registration-card-collapsible-inner">
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
                            <div className={`registration-expander-collapsible${isMedicalOpen ? ' is-open' : ''}`}>
                              <div className="registration-card-collapsible-inner">
                                <div className="doc-optional-grid">
                                  {MEDICAL_ATTACHMENT_FIELDS.map((attachment) => renderDocUploadCard(attachment, false))}
                                </div>
                              </div>
                            </div>
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
                              <span>{isLegalOpen ? 'Hide Legal & Employment' : 'Legal & Employment (Visa, Contract, Clearance, Candidate ID, Contact person ID)'}</span>
                              {hasLegalData && !isLegalOpen && (
                                <span className="registration-expander-badge">
                                  {legalFilled > 0 ? `Filled (${legalFilled}/${LEGAL_ATTACHMENT_FIELDS.length})` : 'Filled'}
                                </span>
                              )}
                            </button>
                            <div className={`registration-expander-collapsible${isLegalOpen ? ' is-open' : ''}`}>
                              <div className="registration-card-collapsible-inner">
                                <div className="doc-optional-grid">
                                  {LEGAL_ATTACHMENT_FIELDS.map((attachment) => renderDocUploadCard(attachment, false))}
                                </div>
                              </div>
                            </div>
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
                            <div className={`registration-expander-collapsible${isTravelOpen ? ' is-open' : ''}`}>
                              <div className="registration-card-collapsible-inner">
                                <div className="doc-optional-grid">
                                  {TRAVEL_ATTACHMENT_FIELDS.map((attachment) => renderDocUploadCard(attachment, false))}
                                </div>
                              </div>
                            </div>
                          </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )
                  })()}
                </div>
              ) : null}
              {activeStep === 5 ? (
                <div className="registration-step-container">
                  {(() => {
                    const step0Error = validateStep(0)
                    const step1Error = validateStep(1)
                    const step2Error = validateStep(2)
                    const step3Error = validateStep(3)

                    const attachedDocs = ATTACHMENT_FIELDS.filter(
                      (att) => attachmentFiles[att.key] || existingAttachmentDocs[att.key]?.file_url
                    )
                    const missingRequiredDocs = REQUIRED_ATTACHMENT_FIELDS.filter(
                      (att) => !(attachmentFiles[att.key] || existingAttachmentDocs[att.key]?.file_url)
                    )
                    const step4Error = missingRequiredDocs.length > 0
                      ? `${missingRequiredDocs.length} mandatory document${missingRequiredDocs.length === 1 ? '' : 's'} missing`
                      : validateStep(4) || ''

                    const isStep0Complete = !step0Error
                    const isStep1Complete = !step1Error
                    const isStep2Complete = !step2Error
                    const isStep3Complete = !step3Error
                    const isStep4Complete = !step4Error

                    const completedCount = [isStep0Complete, isStep1Complete, isStep2Complete, isStep3Complete, isStep4Complete].filter(Boolean).length
                    const hasAnyIncompleteStep = completedCount < 5

                    const candidateFullName = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ') || 'Unnamed Candidate'
                    const candidateInitials = [form.first_name?.[0], form.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'EP'
                    const avatarUrl = attachmentFiles.portrait_photo
                      ? attachmentPreviewUrls.portrait_photo
                      : existingAttachmentDocs.portrait_photo?.file_url
                      ? existingAttachmentDocs.portrait_photo.file_url
                      : attachmentFiles.full_photo
                      ? attachmentPreviewUrls.full_photo
                      : existingAttachmentDocs.full_photo?.file_url
                      ? existingAttachmentDocs.full_photo.file_url
                      : null

                    return (
                      <>
                        {/* Hero Overview Card */}
                        <div className="registration-card employee-review-hero-card">
                          <div className="employee-review-hero-body">
                            <div className="employee-review-hero-avatar-wrap">
                              {avatarUrl ? (
                                <img src={avatarUrl} alt={candidateFullName} className="employee-review-hero-avatar-img" />
                              ) : (
                                <span className="employee-review-hero-avatar-placeholder" aria-hidden="true">{candidateInitials}</span>
                              )}
                            </div>
                            <div className="employee-review-hero-info">
                              <div className="employee-review-hero-title-row">
                                <h2 className="employee-review-hero-name">{candidateFullName}</h2>
                                <span className={`employee-review-hero-badge ${hasAnyIncompleteStep ? 'is-warning' : 'is-complete'}`}>
                                  {hasAnyIncompleteStep ? (
                                    <>
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                      </svg>
                                      <span>{5 - completedCount} Incomplete Step{5 - completedCount === 1 ? '' : 's'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      <span>{editingEmployeeId ? 'Ready to Update' : 'Ready to Register'}</span>
                                    </>
                                  )}
                                </span>
                              </div>
                              <div className="employee-review-hero-meta-chips">
                                <span className="employee-review-meta-chip">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect width="20" height="14" x="2" y="5" rx="2" />
                                    <line x1="2" x2="22" y1="10" y2="10" />
                                  </svg>
                                  <span>Passport: {form.passport_number || 'Not provided'}</span>
                                </span>
                                <span className="employee-review-meta-chip">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                  </svg>
                                  <span>{form.mobile_number || 'No phone'}</span>
                                </span>
                                <span className="employee-review-meta-chip">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
                                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                                  </svg>
                                  <span>{form.profession || 'Profession unassigned'}</span>
                                </span>
                                {form.application_countries?.length > 0 && (
                                  <span className="employee-review-meta-chip">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <circle cx="12" cy="12" r="10" />
                                      <line x1="2" x2="22" y1="12" y2="12" />
                                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                    </svg>
                                    <span>{form.application_countries.join(', ')}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="employee-review-hero-actions">
                              <button
                                type="button"
                                className="registration-card-toggle-btn"
                                onClick={toggleAllSummarySections}
                                aria-label={areAllSummarySectionsOpen ? 'Collapse all review sections' : 'Expand all review sections'}
                              >
                                <svg
                                  className={`registration-expander-chevron${areAllSummarySectionsOpen ? ' is-open' : ''}`}
                                  width="13"
                                  height="13"
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
                                <span>{areAllSummarySectionsOpen ? 'Collapse All' : 'Expand All'}</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 1. Legal Identity & Credentials (Step 0) */}
                        <div className={`registration-card${!isStep0Complete ? ' is-incomplete' : ' is-complete'}${!openSummarySections.identity ? ' is-collapsed' : ''}`}>
                          <div className="registration-card-header">
                            <div className="registration-card-header-left">
                              <div className="registration-card-icon-tile" aria-hidden="true">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                  <circle cx="12" cy="7" r="4" />
                                </svg>
                              </div>
                              <div>
                                <h3 className="registration-card-title">1. Legal Identity & Credentials</h3>
                                <p className="registration-card-subtitle">Official candidate name, age, passport details, and primary contact phone</p>
                              </div>
                            </div>
                            <div className="registration-card-header-right">
                              <span className={`registration-card-status-pill ${isStep0Complete ? 'is-complete' : 'is-incomplete'}`} title={step0Error || 'Complete'}>
                                {isStep0Complete ? (
                                  <>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Complete</span>
                                  </>
                                ) : (
                                  <>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                                      <line x1="12" y1="9" x2="12" y2="13" />
                                      <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    <span>Incomplete</span>
                                  </>
                                )}
                              </span>
                              <button
                                type="button"
                                className="registration-card-edit-btn"
                                onClick={() => setActiveStep(0)}
                                aria-label="Edit Legal Identity & Credentials"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                className="registration-card-toggle-btn"
                                onClick={() => toggleSummarySection('identity')}
                                aria-label={openSummarySections.identity ? 'Collapse Identity section' : 'Expand Identity section'}
                                aria-expanded={Boolean(openSummarySections.identity)}
                              >
                                <svg
                                  className={`registration-expander-chevron${openSummarySections.identity ? ' is-open' : ''}`}
                                  width="13"
                                  height="13"
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
                                <span>{openSummarySections.identity ? 'Collapse' : 'Expand'}</span>
                              </button>
                            </div>
                          </div>

                          <div className={`registration-card-collapsible${openSummarySections.identity ? ' is-open' : ''}`}>
                            <div className="registration-card-collapsible-inner">
                              <div className="registration-card-content">
                                <div className="employee-review-grid">
                                  <div className="employee-review-field employee-review-field--two-span">
                                    <span className="employee-review-field-label">Full Name</span>
                                    <span className="employee-review-field-value">
                                      {[form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ') || <span className="is-empty">Not specified</span>}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Date of Birth</span>
                                    <span className="employee-review-field-value">
                                      {form.date_of_birth ? (
                                        `${form.date_of_birth}${age !== '' ? ` (${age} yrs)` : ''}`
                                      ) : (
                                        <span className="is-empty">Not specified</span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Gender</span>
                                    <span className={`employee-review-field-value${!form.gender ? ' is-empty' : ''}`}>
                                      {form.gender || 'Not specified'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Passport Number</span>
                                    <span className={`employee-review-field-value${!form.passport_number ? ' is-empty' : ''}`}>
                                      {form.passport_number || 'Not provided'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Primary Mobile</span>
                                    <span className={`employee-review-field-value${!form.mobile_number ? ' is-empty' : ''}`}>
                                      {form.mobile_number || 'Not provided'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">National ID</span>
                                    <span className={`employee-review-field-value${!form.national_id ? ' is-empty' : ''}`}>
                                      {form.national_id || 'Not provided'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Labour ID</span>
                                    <span className={`employee-review-field-value${!form.labour_id ? ' is-empty' : ''}`}>
                                      {form.labour_id || 'Not provided'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 2. Profile & Demographics (Step 1) */}
                        <div className={`registration-card${!isStep1Complete ? ' is-incomplete' : ' is-complete'}${!openSummarySections.profile ? ' is-collapsed' : ''}`}>
                          <div className="registration-card-header">
                            <div className="registration-card-header-left">
                              <div className="registration-card-icon-tile" aria-hidden="true">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="2" x2="22" y1="12" y2="12" />
                                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                </svg>
                              </div>
                              <div>
                                <h3 className="registration-card-title">2. Profile & Demographics</h3>
                                <p className="registration-card-subtitle">Personal background, physical metrics, health conditions, and education</p>
                              </div>
                            </div>
                            <div className="registration-card-header-right">
                              <span className={`registration-card-status-pill ${isStep1Complete ? 'is-complete' : 'is-incomplete'}`} title={step1Error || 'Complete'}>
                                {isStep1Complete ? (
                                  <>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Complete</span>
                                  </>
                                ) : (
                                  <>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                                      <line x1="12" y1="9" x2="12" y2="13" />
                                      <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    <span>Incomplete</span>
                                  </>
                                )}
                              </span>
                              <button
                                type="button"
                                className="registration-card-edit-btn"
                                onClick={() => setActiveStep(1)}
                                aria-label="Edit Profile & Demographics"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                className="registration-card-toggle-btn"
                                onClick={() => toggleSummarySection('profile')}
                                aria-label={openSummarySections.profile ? 'Collapse Profile section' : 'Expand Profile section'}
                                aria-expanded={Boolean(openSummarySections.profile)}
                              >
                                <svg
                                  className={`registration-expander-chevron${openSummarySections.profile ? ' is-open' : ''}`}
                                  width="13"
                                  height="13"
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
                                <span>{openSummarySections.profile ? 'Collapse' : 'Expand'}</span>
                              </button>
                            </div>
                          </div>

                          <div className={`registration-card-collapsible${openSummarySections.profile ? ' is-open' : ''}`}>
                            <div className="registration-card-collapsible-inner">
                              <div className="registration-card-content">
                                <div className="employee-review-grid">
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Nationality</span>
                                    <span className={`employee-review-field-value${!form.nationality ? ' is-empty' : ''}`}>
                                      {form.nationality || 'Not specified'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Residence Country</span>
                                    <span className={`employee-review-field-value${!form.residence_country ? ' is-empty' : ''}`}>
                                      {form.residence_country || 'Not specified'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Religion</span>
                                    <span className={`employee-review-field-value${!form.religion ? ' is-empty' : ''}`}>
                                      {form.religion || 'Not specified'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Marital Status</span>
                                    <span className={`employee-review-field-value${!form.marital_status ? ' is-empty' : ''}`}>
                                      {form.marital_status || 'Not specified'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Children Count</span>
                                    <span className={`employee-review-field-value${form.children_count === '' || form.children_count === null ? ' is-empty' : ''}`}>
                                      {form.children_count !== '' && form.children_count !== null ? form.children_count : 'None specified'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Height</span>
                                    <span className={`employee-review-field-value${!form.height ? ' is-empty' : ''}`}>
                                      {form.height ? `${form.height} cm` : 'Not specified'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Weight</span>
                                    <span className={`employee-review-field-value${!form.weight ? ' is-empty' : ''}`}>
                                      {form.weight ? `${form.weight} kg` : 'Not specified'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Medical Condition</span>
                                    <span className={`employee-review-field-value${!form.medical_condition ? ' is-empty' : ''}`}>
                                      {form.medical_condition || 'None reported'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field employee-review-field--two-span">
                                    <span className="employee-review-field-label">Education</span>
                                    <span className={`employee-review-field-value${!form.education ? ' is-empty' : ''}`}>
                                      {form.education || 'Not specified'}
                                    </span>
                                  </div>
                                  {form.summary ? (
                                    <div className="employee-review-field employee-review-field--full">
                                      <span className="employee-review-field-label">Candidate Summary / Bio</span>
                                      <span className="employee-review-field-value">{form.summary}</span>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 3. Emergency Contact & Channels (Step 2) */}
                        <div className={`registration-card${!isStep2Complete ? ' is-incomplete' : ' is-complete'}${!openSummarySections.contact ? ' is-collapsed' : ''}`}>
                          <div className="registration-card-header">
                            <div className="registration-card-header-left">
                              <div className="registration-card-icon-tile" aria-hidden="true">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                </svg>
                              </div>
                              <div>
                                <h3 className="registration-card-title">3. Emergency Contact & Channels</h3>
                                <p className="registration-card-subtitle">Next of kin, emergency contacts, direct email, and reference records</p>
                              </div>
                            </div>
                            <div className="registration-card-header-right">
                              <span className={`registration-card-status-pill ${isStep2Complete ? 'is-complete' : 'is-incomplete'}`} title={step2Error || 'Complete'}>
                                {isStep2Complete ? (
                                  <>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Complete</span>
                                  </>
                                ) : (
                                  <>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                                      <line x1="12" y1="9" x2="12" y2="13" />
                                      <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    <span>Incomplete</span>
                                  </>
                                )}
                              </span>
                              <button
                                type="button"
                                className="registration-card-edit-btn"
                                onClick={() => setActiveStep(2)}
                                aria-label="Edit Emergency Contact & Channels"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                className="registration-card-toggle-btn"
                                onClick={() => toggleSummarySection('contact')}
                                aria-label={openSummarySections.contact ? 'Collapse Contact section' : 'Expand Contact section'}
                                aria-expanded={Boolean(openSummarySections.contact)}
                              >
                                <svg
                                  className={`registration-expander-chevron${openSummarySections.contact ? ' is-open' : ''}`}
                                  width="13"
                                  height="13"
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
                                <span>{openSummarySections.contact ? 'Collapse' : 'Expand'}</span>
                              </button>
                            </div>
                          </div>

                          <div className={`registration-card-collapsible${openSummarySections.contact ? ' is-open' : ''}`}>
                            <div className="registration-card-collapsible-inner">
                              <div className="registration-card-content">
                                <div className="employee-review-grid">
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Contact Person Name</span>
                                    <span className={`employee-review-field-value${!form.contact_person_name ? ' is-empty' : ''}`}>
                                      {form.contact_person_name || 'Not provided'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Relationship</span>
                                    <span className={`employee-review-field-value${!form.contact_person_relationship ? ' is-empty' : ''}`}>
                                      {form.contact_person_relationship || 'Not specified'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Contact Person Mobile</span>
                                    <span className={`employee-review-field-value${!form.contact_person_mobile ? ' is-empty' : ''}`}>
                                      {form.contact_person_mobile || 'Not provided'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Contact Person ID</span>
                                    <span className={`employee-review-field-value${!form.contact_person_id ? ' is-empty' : ''}`}>
                                      {form.contact_person_id || 'Not provided'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Direct Email</span>
                                    <span className={`employee-review-field-value${!form.email ? ' is-empty' : ''}`}>
                                      {form.email || 'Not provided'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Secondary Phone</span>
                                    <span className={`employee-review-field-value${!form.phone ? ' is-empty' : ''}`}>
                                      {form.phone || 'Not provided'}
                                    </span>
                                  </div>
                                  {form.reference ? (
                                    <div className="employee-review-field employee-review-field--full">
                                      <span className="employee-review-field-label">Direct Channels & References</span>
                                      <span className="employee-review-field-value">{form.reference}</span>
                                    </div>
                                  ) : null}
                                  {form.notes ? (
                                    <div className="employee-review-field employee-review-field--full">
                                      <span className="employee-review-field-label">Internal Remarks & Notes</span>
                                      <span className="employee-review-field-value">{form.notes}</span>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 4. Application & Work Experience (Step 3) */}
                        <div className={`registration-card${!isStep3Complete ? ' is-incomplete' : ' is-complete'}${!openSummarySections.application ? ' is-collapsed' : ''}`}>
                          <div className="registration-card-header">
                            <div className="registration-card-header-left">
                              <div className="registration-card-icon-tile" aria-hidden="true">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
                                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                                </svg>
                              </div>
                              <div>
                                <h3 className="registration-card-title">4. Application & Work Experience</h3>
                                <p className="registration-card-subtitle">Destination countries, role, salary, skills, languages, and overseas records</p>
                              </div>
                            </div>
                            <div className="registration-card-header-right">
                              <span className={`registration-card-status-pill ${isStep3Complete ? 'is-complete' : 'is-incomplete'}`} title={step3Error || 'Complete'}>
                                {isStep3Complete ? (
                                  <>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Complete</span>
                                  </>
                                ) : (
                                  <>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                                      <line x1="12" y1="9" x2="12" y2="13" />
                                      <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    <span>Incomplete</span>
                                  </>
                                )}
                              </span>
                              <button
                                type="button"
                                className="registration-card-edit-btn"
                                onClick={() => setActiveStep(3)}
                                aria-label="Edit Application & Work Experience"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                className="registration-card-toggle-btn"
                                onClick={() => toggleSummarySection('application')}
                                aria-label={openSummarySections.application ? 'Collapse Application section' : 'Expand Application section'}
                                aria-expanded={Boolean(openSummarySections.application)}
                              >
                                <svg
                                  className={`registration-expander-chevron${openSummarySections.application ? ' is-open' : ''}`}
                                  width="13"
                                  height="13"
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
                                <span>{openSummarySections.application ? 'Collapse' : 'Expand'}</span>
                              </button>
                            </div>
                          </div>

                          <div className={`registration-card-collapsible${openSummarySections.application ? ' is-open' : ''}`}>
                            <div className="registration-card-collapsible-inner">
                              <div className="registration-card-content">
                                <div className="employee-review-grid">
                                  <div className="employee-review-field employee-review-field--two-span">
                                    <span className="employee-review-field-label">Target Destination Countries</span>
                                    {form.application_countries?.length > 0 ? (
                                      <div className="employee-review-tags">
                                        {form.application_countries.map((country) => (
                                          <span key={country} className="employee-review-tag employee-review-tag--lang">{country}</span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="employee-review-field-value is-empty">None selected</span>
                                    )}
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Profession / Role</span>
                                    <span className={`employee-review-field-value${!form.profession ? ' is-empty' : ''}`}>
                                      {form.profession || 'Not selected'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Professional Title</span>
                                    <span className={`employee-review-field-value${!form.professional_title ? ' is-empty' : ''}`}>
                                      {form.professional_title || 'Not specified'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Employment Type</span>
                                    <span className={`employee-review-field-value${!form.employment_type ? ' is-empty' : ''}`}>
                                      {form.employment_type || 'Not specified'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field">
                                    <span className="employee-review-field-label">Expected Salary</span>
                                    <span className={`employee-review-field-value${!form.application_salary ? ' is-empty' : ''}`}>
                                      {form.application_salary || 'Not specified'}
                                    </span>
                                  </div>
                                  <div className="employee-review-field employee-review-field--two-span">
                                    <span className="employee-review-field-label">Spoken Languages</span>
                                    {form.languages?.length > 0 ? (
                                      <div className="employee-review-tags">
                                        {form.languages.map((lang) => (
                                          <span key={lang} className="employee-review-tag employee-review-tag--lang">{lang}</span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="employee-review-field-value is-empty">None recorded</span>
                                    )}
                                  </div>
                                  <div className="employee-review-field employee-review-field--two-span">
                                    <span className="employee-review-field-label">Candidate Skills</span>
                                    {form.skills?.length > 0 ? (
                                      <div className="employee-review-tags">
                                        {form.skills.map((skill) => (
                                          <span key={skill} className="employee-review-tag">{skill}</span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="employee-review-field-value is-empty">None recorded</span>
                                    )}
                                  </div>
                                  <div className="employee-review-field employee-review-field--full">
                                    <span className="employee-review-field-label">Overseas Work Experience</span>
                                    {(() => {
                                      const validExp = form.experiences?.filter((item) => item.country || item.years !== '') || []
                                      if (validExp.length === 0) {
                                        return <span className="employee-review-field-value is-empty">No prior international employment recorded</span>
                                      }
                                      return (
                                        <div className="employee-review-exp-list">
                                          {validExp.map((exp, idx) => (
                                            <div key={`exp-${idx}`} className="employee-review-exp-badge">
                                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="2" x2="22" y1="12" y2="12" />
                                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                              </svg>
                                              <span className="employee-review-exp-country">{exp.country || 'Destination unspecified'}</span>
                                              <span className="employee-review-exp-divider">•</span>
                                              <span className="employee-review-exp-years">{exp.years ? `${exp.years} yr${Number(exp.years) === 1 ? '' : 's'}` : 'Duration not specified'}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 5. Attached Documents & Verification (Step 4) */}
                        <div className={`registration-card${!isStep4Complete ? ' is-incomplete' : ' is-complete'}${!openSummarySections.attachments ? ' is-collapsed' : ''}`}>
                          <div className="registration-card-header">
                            <div className="registration-card-header-left">
                              <div className="registration-card-icon-tile" aria-hidden="true">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                  <line x1="16" y1="13" x2="8" y2="13" />
                                  <line x1="16" y1="17" x2="8" y2="17" />
                                  <polyline points="10 9 9 9 8 9" />
                                </svg>
                              </div>
                              <div>
                                <h3 className="registration-card-title">5. Attached Documents & Verification</h3>
                                <p className="registration-card-subtitle">Identification, passport photos, medical reports, certificates, and contracts</p>
                              </div>
                            </div>
                            <div className="registration-card-header-right">
                              <span className={`registration-card-status-pill ${isStep4Complete ? 'is-complete' : 'is-incomplete'}`} title={step4Error || 'Complete'}>
                                {isStep4Complete ? (
                                  <>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Complete</span>
                                  </>
                                ) : (
                                  <>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                                      <line x1="12" y1="9" x2="12" y2="13" />
                                      <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    <span>Incomplete</span>
                                  </>
                                )}
                              </span>
                              <button
                                type="button"
                                className="registration-card-edit-btn"
                                onClick={() => setActiveStep(4)}
                                aria-label="Edit Attached Documents"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                className="registration-card-toggle-btn"
                                onClick={() => toggleSummarySection('attachments')}
                                aria-label={openSummarySections.attachments ? 'Collapse Documents section' : 'Expand Documents section'}
                                aria-expanded={Boolean(openSummarySections.attachments)}
                              >
                                <svg
                                  className={`registration-expander-chevron${openSummarySections.attachments ? ' is-open' : ''}`}
                                  width="13"
                                  height="13"
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
                                <span>{openSummarySections.attachments ? 'Collapse' : 'Expand'}</span>
                              </button>
                            </div>
                          </div>

                          <div className={`registration-card-collapsible${openSummarySections.attachments ? ' is-open' : ''}`}>
                            <div className="registration-card-collapsible-inner">
                              <div className="registration-card-content">
                                <div className="employee-review-doc-summary-bar">
                                <span className="employee-review-doc-count">
                                  {attachedDocs.length} of {ATTACHMENT_FIELDS.length} documents attached
                                </span>
                                {missingRequiredDocs.length === 0 ? (
                                  <span className="employee-review-badge employee-review-badge--success">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    All required documents present
                                  </span>
                                ) : (
                                  <span className="employee-review-badge employee-review-badge--warning">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <circle cx="12" cy="12" r="10" />
                                      <line x1="12" y1="8" x2="12" y2="12" />
                                      <line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                    {missingRequiredDocs.length} required document{missingRequiredDocs.length === 1 ? '' : 's'} missing
                                  </span>
                                )}
                              </div>

                              {attachedDocs.length === 0 && missingRequiredDocs.length === 0 ? (
                                <div className="employee-review-empty-docs">
                                  <h4>No documents attached yet</h4>
                                  <p>Important identification, medical reports, or contracts have not been uploaded.</p>
                                  <button type="button" className="btn-secondary" onClick={() => setActiveStep(4)}>
                                    Go to Step 4 to attach documents
                                  </button>
                                </div>
                              ) : (
                                <div className="employee-review-doc-grid">
                                  {attachedDocs.map((attachment) => {
                                    const file = attachmentFiles[attachment.key]
                                    const existingDoc = existingAttachmentDocs[attachment.key]
                                    const url = file ? attachmentPreviewUrls[attachment.key] : existingDoc?.file_url
                                    const title = attachmentLabels[attachment.key] || attachment.label
                                    const fileName = file?.name || attachmentDisplayName(existingDoc, attachmentLabels) || 'Document file'
                                    const isImage = Boolean(
                                      file?.type?.startsWith('image/') ||
                                      (!file && typeof url === 'string' && url.match(/\.(png|jpe?g|webp|gif)(\?|#|$)/i))
                                    )
                                    const isPdf = typeof url === 'string' && isPdfDocumentUrl(url)
                                    const isRequired = MANDATORY_ATTACHMENT_KEYS.includes(attachment.key)
                                    const expiryVal = attachment.expiryField ? form[attachment.expiryField] : null

                                    return (
                                      <div key={attachment.key} className="employee-review-doc-card is-attached">
                                        <div className="employee-review-doc-card-header">
                                          <div className="employee-review-doc-thumb-wrap">
                                            {url && isImage ? (
                                              <img src={url} alt={title} className="employee-review-doc-thumb-img" />
                                            ) : (
                                              <div className={`employee-review-doc-thumb-placeholder${isPdf ? ' is-pdf' : ''}`}>
                                                {getAttachmentIcon(attachment.key)}
                                                <span className="employee-review-doc-type-badge">{isPdf ? 'PDF' : isImage ? 'IMG' : 'DOC'}</span>
                                              </div>
                                            )}
                                          </div>
                                          <div className="employee-review-doc-title-block">
                                            <h4 className="employee-review-doc-title" title={title}>{title}</h4>
                                            <div className="employee-review-doc-tag-row">
                                              {isRequired ? <span className="employee-review-doc-req-pill">Required</span> : <span className="employee-review-doc-opt-pill">Optional</span>}
                                              {expiryVal ? (
                                                <span className="employee-review-doc-date-pill">
                                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                                    <line x1="16" y1="2" x2="16" y2="6" />
                                                    <line x1="8" y1="2" x2="8" y2="6" />
                                                    <line x1="3" y1="10" x2="21" y2="10" />
                                                  </svg>
                                                  <span>{expiryVal}</span>
                                                </span>
                                              ) : null}
                                            </div>
                                          </div>
                                          <div className="employee-review-doc-status-wrap">
                                            <span className="employee-review-doc-status is-attached">
                                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <polyline points="20 6 9 17 4 12" />
                                              </svg>
                                              Attached
                                            </span>
                                          </div>
                                        </div>

                                        <div className="employee-review-doc-card-footer">
                                          <p className="employee-review-doc-filename" title={fileName}>{fileName}</p>
                                          {url ? (
                                            <button
                                              type="button"
                                              className="employee-review-doc-action-btn"
                                              onClick={() =>
                                                openDocumentPreview({
                                                  url,
                                                  name: fileName,
                                                  label: title,
                                                  type: file?.type || '',
                                                  isImage,
                                                  isPdf
                                                })
                                              }
                                              title={`Preview ${title}`}
                                            >
                                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                <circle cx="12" cy="12" r="3" />
                                              </svg>
                                              <span>Preview</span>
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                    )
                                  })}

                                  {missingRequiredDocs.map((attachment) => {
                                    const title = attachmentLabels[attachment.key] || attachment.label

                                    return (
                                      <div key={attachment.key} className="employee-review-doc-card is-missing">
                                        <div className="employee-review-doc-card-header">
                                          <div className="employee-review-doc-thumb-wrap">
                                            <div className="employee-review-doc-thumb-placeholder is-missing">
                                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="12" y1="8" x2="12" y2="12" />
                                                <line x1="12" y1="16" x2="12.01" y2="16" />
                                              </svg>
                                              <span className="employee-review-doc-type-badge">REQ</span>
                                            </div>
                                          </div>
                                          <div className="employee-review-doc-title-block">
                                            <h4 className="employee-review-doc-title" title={title}>{title}</h4>
                                            <div className="employee-review-doc-tag-row">
                                              <span className="employee-review-doc-req-pill is-missing">Required</span>
                                            </div>
                                          </div>
                                          <div className="employee-review-doc-status-wrap">
                                            <span className="employee-review-doc-status is-missing">
                                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="12" y1="8" x2="12" y2="12" />
                                                <line x1="12" y1="16" x2="12.01" y2="16" />
                                              </svg>
                                              Missing
                                            </span>
                                          </div>
                                        </div>

                                        <div className="employee-review-doc-card-footer">
                                          <p className="employee-review-doc-filename is-missing">Mandatory document not uploaded</p>
                                          <button
                                            type="button"
                                            className="employee-review-doc-action-btn is-upload"
                                            onClick={() => setActiveStep(4)}
                                            title={`Upload ${title}`}
                                          >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                              <polyline points="17 8 12 3 7 8" />
                                              <line x1="12" y1="3" x2="12" y2="15" />
                                            </svg>
                                            <span>Upload</span>
                                          </button>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      </>
                    )
                  })()}
                </div>
              ) : null}
              <div className="employee-modal-actions">
                <div className="employee-modal-actions-left">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => navigate('/dashboard/candidates/list')}
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
                      {saving ? 'Saving...' : editingEmployeeId ? 'Update Candidate' : 'Complete Registration'}
                    </button>
                  )}
                </div>
              </div>
            </form>
              </div>
            </div>
          </div>
        </div>
      <EmployeeBatchRegistrationModal
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        onBatchSuccess={() => {
          setBatchModalOpen(false)
          navigate('/dashboard/candidates/list')
        }}
      />

      <EmployeeScanImportModal
        isOpen={scanImportModalOpen}
        closeScanImportModal={closeScanImportModal}
        ocrImportSource={ocrImportSource}
        triggerScanImport={triggerScanImport}
        openOcrSetupModal={openOcrSetupModal}
      />

      <EmployeeCameraModal
        isOpen={cameraCaptureModalOpen}
        closeCameraCapture={closeCameraCapture}
        cameraStream={cameraStream}
        scanCameraVideoRef={scanCameraVideoRef}
        scanCameraCanvasRef={scanCameraCanvasRef}
        cameraError={cameraError}
        cameraLoading={cameraLoading}
        retryCameraCapture={openCameraCapture}
        backToScanOptionsFromCamera={backToScanOptionsFromCamera}
        captureCameraDocument={captureCameraDocument}
      />
      <Modal
        isOpen={uploadDocumentModalOpen}
        onClose={closeUploadDocumentModal}
        title={uploadDocumentPurpose === 'attachment' ? 'Upload Generic Document' : 'Upload Candidate Document'}
        subtitle={
          uploadDocumentPurpose === 'attachment'
            ? 'Select or drop a PDF or image document, then adjust and attach the visible area to employee attachment slots.'
            : 'Select or drop a PDF or image document, then continue to stage it for automated OCR field extraction.'
        }
        maxWidth="560px"
        className="employee-scan-modal employee-upload-modal"
        backdropClassName="employee-scan-backdrop"
        footer={
          <>
            {uploadDocumentPurpose === 'attachment' ? (
              <button type="button" className="btn-secondary" onClick={closeUploadDocumentModal}>Cancel</button>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={backToScanOptionsFromUpload}>Back</button>
                <button type="button" className="btn-secondary" onClick={closeUploadDocumentModal}>Cancel</button>
              </>
            )}
            <button type="button" className="btn-primary" onClick={submitUploadDocument} disabled={!uploadDraftFile}>
              {uploadDocumentPurpose === 'attachment' ? 'Use for attachments' : 'Use document'}
            </button>
          </>
        }
      >
        {uploadDraftFile ? (
          <div className="employee-upload-selected-card">
            <div className="employee-upload-file-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div className="employee-upload-file-info">
              <div className="employee-upload-file-header">
                <span className="employee-upload-filename" title={uploadDraftFile.name}>{uploadDraftFile.name}</span>
                <span className="employee-upload-ready-badge">Selected</span>
              </div>
              <span className="employee-upload-filesize">
                {Math.max(1, Math.round(uploadDraftFile.size / 1024))} KB • {uploadDraftFile.type || 'Document file'}
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary employee-upload-change-btn"
              onClick={() => scanUploadInputRef.current?.click()}
              title="Select a different document"
            >
              Change
            </button>
          </div>
        ) : (
          <div
            className={`employee-upload-dropzone${uploadDragActive ? ' is-dragging' : ''}`}
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
            <div className="employee-upload-dropzone-icon" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="employee-upload-dropzone-text">
              <strong>Choose or drop a candidate document</strong>
              <span>PDF, JPG, JPEG, or PNG supported (up to 10MB)</span>
            </div>
            <button
              type="button"
              className="btn-secondary employee-upload-browse-btn"
              onClick={(e) => {
                e.stopPropagation()
                scanUploadInputRef.current?.click()
              }}
            >
              Browse Files
            </button>
          </div>
        )}
        <input
          ref={scanUploadInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="visually-hidden-file"
          onChange={(event) => handleUploadDraftPick(event.target.files?.[0] || null)}
        />
        {uploadError ? <p className="error-message employee-modal-error">{uploadError}</p> : null}
      </Modal>
      <Modal
        isOpen={scannerModalOpen}
        onClose={closeScannerModal}
        title="Physical Scanner Connection"
        subtitle="The system connects through Asprise Scanner, which uses the local scan app and TWAIN/WIA driver before staging for OCR."
        maxWidth="560px"
        className="employee-scan-modal employee-scanner-modal"
        backdropClassName="employee-scan-backdrop"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={backToScanOptionsFromScanner}>Back</button>
            <button type="button" className="btn-secondary" onClick={closeScannerModal}>Cancel</button>
            {scannerStatus === 'no-devices' ? (
              <button type="button" className="btn-primary" onClick={checkScannerService}>Check again</button>
            ) : null}
            {scannerStatus === 'ready' ? (
              <button type="button" className="btn-primary" onClick={scanFromSelectedScanner}>Scan document</button>
            ) : null}
          </>
        }
      >
        <div className={`employee-scanner-status employee-scanner-status--${scannerStatus}`}>
          <div className="employee-scanner-status-icon" aria-hidden="true">
            {scannerStatus === 'ready' ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : scannerStatus === 'checking' || scannerStatus === 'scanning' ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="is-spinning">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>
          <div className="employee-scanner-status-body">
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
            {scannerError ? <span>{scannerError}</span> : (
              <span>
                {scannerStatus === 'ready'
                  ? 'Hardware bridge connected. Select your device below and trigger scan.'
                  : scannerStatus === 'service-missing'
                  ? 'Local scanning companion service is required to communicate with TWAIN/WIA hardware.'
                  : 'Searching for connected hardware scanners...'}
              </span>
            )}
          </div>
        </div>
        {scannerStatus === 'service-missing' ? (
          <div className="employee-scanner-service-actions">
            <a className="btn-secondary" href={ASPRISE_SCANNER_LINKS.download} target="_blank" rel="noreferrer">Install scan app</a>
            <button type="button" className="btn-primary" onClick={checkScannerService}>I started the app - check again</button>
          </div>
        ) : null}
        {scannerStatus === 'ready' ? (
          <label className="employee-scanner-device-picker">
            <span>Scanner device</span>
            <select value={selectedScannerIndex} onChange={(event) => setSelectedScannerIndex(Number(event.target.value))}>
              {scannerDevices.map((device, index) => (
                <option key={`${device.displayName || device.name || 'scanner'}-${index}`} value={index}>
                  {device.displayName || device.name || `Scanner ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </Modal>
      <Modal
        isOpen={scanAttachmentModalOpen}
        onClose={closeScanAttachmentModal}
        title="Attach from Document"
        subtitle="Select candidate slots to assign this document. For images, adjust the crop frame."
        maxWidth="1040px"
        className="employee-scan-modal employee-scan-attach-modal"
        backdropClassName="employee-scan-backdrop"
        footer={
          <div className="employee-scan-modal-footer">
            <div className="employee-scan-footer-summary">
              {scanAttachmentKeys.length > 0 ? (
                <span>
                  Targeting <strong>{scanAttachmentKeys.length}</strong> {scanAttachmentKeys.length === 1 ? 'slot' : 'slots'}
                </span>
              ) : (
                <span className="text-warning">Select at least one slot</span>
              )}
            </div>
            <div className="employee-scan-footer-buttons">
              <button type="button" className="btn-secondary" onClick={closeScanAttachmentModal}>Cancel</button>
              <button
                type="button"
                className="btn-primary"
                onClick={attachSelectedFromScan}
                disabled={scanAttachmentKeys.length === 0}
              >
                {scanAttachmentKeys.length > 0
                  ? `Attach to ${scanAttachmentKeys.length} ${scanAttachmentKeys.length === 1 ? 'Slot' : 'Slots'}`
                  : 'Attach selected'}
              </button>
            </div>
          </div>
        }
      >
        <div className="employee-scan-attach-workspace">
          <div className="employee-scan-attach-preview">
            <div className="employee-scan-preview-tag">
              <span>{scanAttachmentSourceFile?.type?.startsWith('image/') ? 'Image Framing' : 'Original Document (PDF)'}</span>
            </div>

            {scanAttachmentSourcePreviewUrl && scanAttachmentSourceFile?.type?.startsWith('image/') ? (
              <>
                <div
                  ref={scanAttachmentFrameRef}
                  className={`employee-scan-attach-image-frame${scanAttachmentZoom > 1 ? ' is-zoomed' : ''}${scanAttachmentDragging ? ' is-dragging' : ''}`}
                  onMouseDown={handleScanAttachmentPointerDown}
                >
                  <div className="employee-scan-frame-guide" aria-hidden="true" />
                  <img
                    ref={scanAttachmentImgRef}
                    src={scanAttachmentSourcePreviewUrl}
                    alt="Scanned document preview"
                    draggable="false"
                    style={{
                      transform: `translate(${scanAttachmentOffset.x}px, ${scanAttachmentOffset.y}px) rotate(${scanAttachmentRotation}deg) scale(${(scanAttachmentFlipX ? -1 : 1) * scanAttachmentZoom}, ${(scanAttachmentFlipY ? -1 : 1) * scanAttachmentZoom})`
                    }}
                  />
                </div>
                <div className="employee-scan-attach-toolbar" aria-label="Image adjustment controls">
                  <button
                    type="button"
                    className="employee-scan-toolbar-btn"
                    onClick={() => setScanAttachmentRotation((prev) => (prev + 270) % 360)}
                    title="Rotate left 90°"
                    aria-label="Rotate left"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="employee-scan-toolbar-btn"
                    onClick={() => setScanAttachmentRotation((prev) => (prev + 90) % 360)}
                    title="Rotate right 90°"
                    aria-label="Rotate right"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                      <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                      <path d="M21 3v5h-5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`employee-scan-toolbar-btn${scanAttachmentFlipX ? ' is-active' : ''}`}
                    onClick={() => setScanAttachmentFlipX((prev) => !prev)}
                    title="Flip horizontally"
                    aria-label="Flip horizontal"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                      <polyline points="8 4 4 8 8 12" />
                      <polyline points="16 12 20 16 16 20" />
                      <line x1="4" y1="8" x2="16" y2="8" />
                      <line x1="8" y1="16" x2="20" y2="16" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`employee-scan-toolbar-btn${scanAttachmentFlipY ? ' is-active' : ''}`}
                    onClick={() => setScanAttachmentFlipY((prev) => !prev)}
                    title="Flip vertically"
                    aria-label="Flip vertical"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                      <polyline points="4 8 8 4 12 8" />
                      <polyline points="12 16 16 20 20 16" />
                      <line x1="8" y1="4" x2="8" y2="16" />
                      <line x1="16" y1="8" x2="16" y2="20" />
                    </svg>
                  </button>
                  <span className="employee-scan-toolbar-divider" />
                  <button
                    type="button"
                    className="employee-scan-toolbar-btn"
                    onClick={() => setScanAttachmentZoom((prev) => {
                      const next = Math.max(1, Number((prev - 0.25).toFixed(2)))
                      if (next === 1) setScanAttachmentOffset({ x: 0, y: 0 })
                      return next
                    })}
                    disabled={scanAttachmentZoom <= 1}
                    title="Zoom out"
                    aria-label="Zoom out"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  </button>
                  <span className="employee-scan-toolbar-zoom-badge" title="Zoom level">
                    {Math.round(scanAttachmentZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    className="employee-scan-toolbar-btn"
                    onClick={() => setScanAttachmentZoom((prev) => Math.min(5, Number((prev + 0.25).toFixed(2))))}
                    disabled={scanAttachmentZoom >= 5}
                    title="Zoom in"
                    aria-label="Zoom in"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      <line x1="11" y1="8" x2="11" y2="14" />
                      <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  </button>
                  <span className="employee-scan-toolbar-divider" />
                  <button
                    type="button"
                    className="employee-scan-toolbar-btn"
                    onClick={resetScanAttachmentView}
                    title="Reset view (100% zoom, 0 offset)"
                    aria-label="Reset view"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </button>
                </div>
              </>
            ) : scanAttachmentSourcePreviewUrl ? (
              <>
                <iframe
                  key={scanAttachmentPdfUrl}
                  src={scanAttachmentPdfUrl}
                  title="Scanned document preview"
                  className="employee-scan-attach-pdf-frame"
                  scrolling="no"
                />
                <div className="employee-scan-attach-toolbar" aria-label="PDF adjustment controls">
                  <button
                    type="button"
                    className={`employee-scan-toolbar-btn${scanAttachmentPdfFit === 'FitH' && scanAttachmentPdfZoom === 100 ? ' is-active' : ''}`}
                    onClick={() => {
                      setScanAttachmentPdfFit('FitH')
                      setScanAttachmentPdfZoom(100)
                    }}
                    title="Fit to width"
                    aria-label="Fit to width"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <polyline points="6 8 2 12 6 16" />
                      <polyline points="18 8 22 12 18 16" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`employee-scan-toolbar-btn${scanAttachmentPdfFit === 'Fit' && scanAttachmentPdfZoom === 100 ? ' is-active' : ''}`}
                    onClick={() => {
                      setScanAttachmentPdfFit('Fit')
                      setScanAttachmentPdfZoom(100)
                    }}
                    title="Fit entire page in view"
                    aria-label="Fit entire page in view"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                    </svg>
                  </button>
                  <span className="employee-scan-toolbar-divider" />
                  <button
                    type="button"
                    className="employee-scan-toolbar-btn"
                    onClick={() => {
                      setScanAttachmentPdfZoom((prev) => Math.max(50, prev - 25))
                      setScanAttachmentPdfFit('')
                    }}
                    disabled={scanAttachmentPdfZoom <= 50}
                    title="Zoom out"
                    aria-label="Zoom out"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  </button>
                  <span className="employee-scan-toolbar-zoom-badge" title="Zoom level">
                    {scanAttachmentPdfZoom !== 100 ? `${scanAttachmentPdfZoom}%` : scanAttachmentPdfFit === 'Fit' ? 'Fit Page' : 'Fit Width'}
                  </span>
                  <button
                    type="button"
                    className="employee-scan-toolbar-btn"
                    onClick={() => {
                      setScanAttachmentPdfZoom((prev) => Math.min(300, prev + 25))
                      setScanAttachmentPdfFit('')
                    }}
                    disabled={scanAttachmentPdfZoom >= 300}
                    title="Zoom in"
                    aria-label="Zoom in"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      <line x1="11" y1="8" x2="11" y2="14" />
                      <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  </button>
                  <span className="employee-scan-toolbar-divider" />
                  <button
                    type="button"
                    className="employee-scan-toolbar-btn"
                    onClick={() => {
                      setScanAttachmentPdfFit('FitH')
                      setScanAttachmentPdfZoom(100)
                    }}
                    title="Reset view (Fit to width, 100%)"
                    aria-label="Reset view"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              <div className="employee-camera-placeholder">No scanned preview is available.</div>
            )}
          </div>

          <div className="employee-scan-attach-controls">
            <div className="employee-scan-slots-panel">
              <div className="employee-scan-slots-header">
                <div>
                  <strong>Target Attachment Slots</strong>
                  <span className="employee-scan-slots-subtitle">
                    Select candidate slots to receive this file
                  </span>
                </div>
                <div className="employee-scan-slots-quick-actions">
                  <button
                    type="button"
                    className="employee-scan-quick-btn"
                    onClick={() => {
                      const missing = MANDATORY_ATTACHMENT_KEYS.filter((k) => !attachmentFiles[k] && !existingAttachmentDocs[k])
                      setScanAttachmentKeys(missing.length > 0 ? missing : [...MANDATORY_ATTACHMENT_KEYS])
                    }}
                    title="Select mandatory slots"
                  >
                    Mandatory
                  </button>
                  <button
                    type="button"
                    className="employee-scan-quick-btn"
                    onClick={() => setScanAttachmentKeys(ATTACHMENT_FIELDS.map((a) => a.key))}
                    title="Select all slots"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="employee-scan-quick-btn"
                    onClick={() => setScanAttachmentKeys([])}
                    title="Clear selection"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="employee-scan-slot-list">
                {ATTACHMENT_FIELDS.map((attachment) => {
                  const isSelected = scanAttachmentKeys.includes(attachment.key)
                  const isMandatory = MANDATORY_ATTACHMENT_KEYS.includes(attachment.key)
                  const isFilled = Boolean(attachmentFiles[attachment.key] || existingAttachmentDocs[attachment.key]?.file_url)

                  return (
                    <div
                      key={attachment.key}
                      className={`employee-scan-slot-item${isSelected ? ' is-selected' : ''}`}
                      onClick={() => handleScanAttachmentKeyToggle(attachment.key)}
                      role="checkbox"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault()
                          handleScanAttachmentKeyToggle(attachment.key)
                        }
                      }}
                    >
                      <div className="employee-scan-slot-checkbox" aria-hidden="true">
                        {isSelected ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : null}
                      </div>
                      <div className="employee-scan-slot-content">
                        <span className="employee-scan-slot-title">
                          {attachmentLabels[attachment.key] || attachment.label}
                        </span>
                        {isMandatory && <span className="employee-scan-slot-tag-req">Required</span>}
                      </div>
                      {isFilled && (
                        <span className="employee-scan-slot-filled-indicator" title="Already has an attached document">
                          Has file
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {scanAttachmentSourceFile?.type?.startsWith('image/') ? (
                <div className="employee-scan-hint-banner">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ overflow: 'visible' }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>Crop tip: The exact framed area shown on the left will be saved into the selected slots.</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {scanAttachmentError ? <p className="error-message employee-modal-error">{scanAttachmentError}</p> : null}
      </Modal>
      <Modal
        isOpen={ocrSetupModalOpen}
        onClose={closeOcrSetupModal}
        title="OCR Service Status & Setup"
        subtitle="Make sure the OCR service provider is reachable. Then  check again so document autofill can run."
        maxWidth="520px"
        className="employee-scan-modal employee-ocr-setup-modal"
        backdropClassName="employee-scan-backdrop"
        footer={
          <div className="employee-scan-modal-footer">
            <button type="button" className="btn-secondary" onClick={closeOcrSetupModal}>Close</button>
            <button type="button" className="btn-primary" onClick={checkOcrStatus} disabled={ocrStatusLoading}>
              {ocrStatusLoading ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        }
      >
        <div className={`employee-scanner-status employee-scanner-status--${ocrStatus.ready ? 'ready' : 'service-missing'}`}>
          <div className="employee-scanner-status-icon" aria-hidden="true">
            {ocrStatus.ready ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : ocrStatusLoading ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="is-spinning">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>
          <div className="employee-scanner-status-body">
            <strong>{ocrStatus.ready ? 'OCR service is online and ready' : 'OCR service is not ready'}</strong>
            <span>{ocrStatusLoading ? 'Checking OCR service reachability...' : normalizeOcrStatusMessage(ocrStatus.message)}</span>
          </div>
        </div>
        <div className="employee-ocr-support-hint">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          <span>
            If you are struggling with the connection, you can send an email to{' '}
            <a
              href="https://mail.google.com/mail/?view=cm&fs=1&to=qedamaitechnologies@gmail.com&su=OCR%20Service%20Connection%20Support"
              target="_blank"
              rel="noopener noreferrer"
              title="Compose email to qedamaitechnologies@gmail.com"
            >
              Qedamai Technologies
            </a>
            .
          </span>
        </div>
      </Modal>
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
