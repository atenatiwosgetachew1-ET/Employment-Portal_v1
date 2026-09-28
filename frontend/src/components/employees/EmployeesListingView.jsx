import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useUiFeedback } from '../../context/UiFeedbackContext'
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
import { normalizeSearchValue } from '../../utils/filtering'

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
  TRAVEL_CONFIRMATION_DECLINED_STORAGE_KEY,
  TRAVEL_CONFIRMATION_CONFIRMED_STORAGE_KEY,
  COMMISSION_SETTLEMENT_STORAGE_KEY,
  COMMISSION_STORAGE_DB_NAME,
  COMMISSION_STORAGE_DB_VERSION,
  COMMISSION_STORAGE_SETTLEMENT_STORE,
  COMMISSION_STORAGE_PRIMARY_KEY,
  TEMPLATE_FORM_FIELDS,
  EMPLOYEE_OCR_FIELD_LABELS,
  OCR_UNREACHABLE_MESSAGE,
  EMPLOYEE_CARD_MASONRY_DEBUG_FLAG,
  EMPLOYEE_CARD_MASONRY_DEBUG_STORAGE_KEY,
  employeeCardMasonryDebugEnabled,
  employeeCardMasonryDebugLog,
  employeeCardMasonryAttachScrollLogger,
  normalizeOcrStatusMessage,
  readCssCustomProperty,
  emptyExperience,
  REGISTRATION_STEPS,
  EMPLOYEE_VIEW_TABS,
  EMPLOYEE_TAG_FILTER_OPTIONS,
  GRID_CARD_PREVIEW_DOCUMENTS,
  EMPLOYEE_CARDS_BATCH_SIZE,
  LIST_CARD_PREVIEW_DOCUMENTS,
  buildOcrCacheKey,
  emptyForm,
  computeAge,
  loadImageFromUrl,
  normalizeEmployeeForm,
  buildRegistrationTemplate,
  applyRegistrationTemplate,
  normalizeDraftForm,
  openRegistrationDraftDb,
  fileLabel,
  findEmployeeDocument,
  isImageDocument,
  isPdfDocumentUrl,
  buildDownloadName,
  attachmentFileAllowed,
  attachmentDisplayName,
  employeeProfilePhoto,
  isEmployeeReturned,
  normalizedTravelStatus,
  isEmployeeTravelled,
  isEmployeeEmployed,
  isEmployeeUnderProcess,
  isEmployeeReadyForEmploymentStage,
  isEmployeeTravelConfirmationPending,
  isEmployeeSelected,
  readTravelConfirmationDeclinedIds,
  writeTravelConfirmationDeclinedIds,
  readTravelConfirmationConfirmedIds,
  writeTravelConfirmationConfirmedIds,
  patchEmployeeCollection,
  isEmployeeInEmployedStage,
  isEmployeeEmployedInView,
  employeeWorkflowState,
  prettyStatus,
  employeeAvailability,
  employeeStatusLabel,
  employeeStatusBadgeClass,
  employeeStatusBadgeVariantClass,
  employeeMatchesTagFilter,
  statusTone,
  employedEmployeesHelpText,
  returnedEmployeesHelpText,
  normalizeAgentMatchValue,
  employeeBelongsToCurrentAgent,
  formatDateTime,
  formatShortDate,
  formatShortTime,
  resolveLatestDate,
  employedCommissionLabel,
  openCommissionStorageDb,
  progressTone,
  buildProgressDonut,
  formatDateForPrompt,
  isAgentSideWorkspace,
  selectedEmployeesHelpText,
  underProcessEmployeesHelpText,
  resolvedProcessAgentId,
  isValidPhoneNumber,
  isValidDocumentNumber,
  isValidEmailAddress,
  getValidationStep,
  getValidationTarget,
  validateEmployeeForm,
  validateStepFields,
  buildEmployeePayload,
  errorMessage,
  readRegistrationDraft,
  writeRegistrationDraft,
  fetchPreviewBlob,
  fetchAllEmployeePages,
  readStoredSettlements,
  printDocumentSilently,
  filterCandidateList
} from '../../utils/employeeHelpers'

import EmployeeCard from './EmployeeCard'
import EmployeeCameraModal from './EmployeeCameraModal'
import EmployeeFilters from './EmployeeFilters'
import EmployeeDocumentPreview from './EmployeeDocumentPreview'
import EmployeeReturnModal from './EmployeeReturnModal'
import EmployeeScanImportModal from './EmployeeScanImportModal'
export default function EmployeesListingView({ stage = "list" }) {
  const navigate = useNavigate();
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
  const [filters, setFilters] = useState({
    q: '',
    isActive: '',
    profession: '',
    gender: '',
    religion: '',
    experience: '',
    destinationCountry: '',
    docStatus: '',
    tag: ''
  })
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
  const [savedDraftMeta, setSavedDraftMeta] = useState(null)
  const [processAgentAssignments, setProcessAgentAssignments] = useState({})
  const [openedEmployeeId, setOpenedEmployeeId] = useState(null)
  const [openedEmployeeMode, setOpenedEmployeeMode] = useState('full')
  const [reviewDocumentsTab, setReviewDocumentsTab] = useState('all')
  const [expandedEmployeeCardId, setExpandedEmployeeCardId] = useState(null)
  const [expandedEmployeeCardReadyId, setExpandedEmployeeCardReadyId] = useState(null)
  const employeeCardsGridRef = useRef(null)
  const employeeCardItemRefs = useRef(new Map())
  const employeeCardResizeObserverRef = useRef(null)
  const reviewDocsScrollerRef = useRef(null)
  const [reviewDocsCanScrollLeft, setReviewDocsCanScrollLeft] = useState(false)
  const [reviewDocsCanScrollRight, setReviewDocsCanScrollRight] = useState(false)
  const reviewDocsScrollRafRef = useRef(0)
  const reviewDocsScrollStateRef = useRef({ left: false, right: false })
  const [selectedEmployeeCardIds, setSelectedEmployeeCardIds] = useState(() => new Set())
  const [selectDeniedEmployeeCardIds, setSelectDeniedEmployeeCardIds] = useState(() => new Set())
  const selectDeniedTimersRef = useRef(new Map())
  const [employeeCardsLayout, setEmployeeCardsLayout] = useState('list')
  const [employeeCardsSort, setEmployeeCardsSort] = useState('newest')
  const [employeeCardsRenderCount, setEmployeeCardsRenderCount] = useState(EMPLOYEE_CARDS_BATCH_SIZE)
  const employeeCardsSentinelRef = useRef(null)
  const [showScrollToTop, setShowScrollToTop] = useState(false)
  const hasSelectedEmployeeCards = selectedEmployeeCardIds.size > 0

  const flashEmployeeCardSelectDenied = useCallback((employeeId) => {
    setSelectDeniedEmployeeCardIds((prev) => {
      const next = new Set(prev)
      next.add(employeeId)
      return next
    })

    const timers = selectDeniedTimersRef.current
    const existingTimer = timers.get(employeeId)
    if (existingTimer) window.clearTimeout(existingTimer)

    timers.set(
      employeeId,
      window.setTimeout(() => {
        timers.delete(employeeId)
        setSelectDeniedEmployeeCardIds((prev) => {
          if (!prev.has(employeeId)) return prev
          const next = new Set(prev)
          next.delete(employeeId)
          return next
        })
      }, 450)
    )
  }, [])

  useEffect(() => {
    return () => {
      const timers = selectDeniedTimersRef.current
      timers.forEach((timerId) => window.clearTimeout(timerId))
      timers.clear()
    }
  }, [])

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
  const [openSummarySections, setOpenSummarySections] = useState({
    identity: false,
    application: false,
    profile: false,
    contact: false,
    notes: false,
    attachments: false
  })
  const [dragOverAttachmentKey, setDragOverAttachmentKey] = useState('')
  const [otherDocumentsModalOpen, setOtherDocumentsModalOpen] = useState(false)
  const [floatingAttachmentPreview, setFloatingAttachmentPreview] = useState(null)
  const floatingAttachmentPreviewCloseTimer = useRef(null)
  const floatingAttachmentPreviewPopoverRef = useRef(null)
  const employeeModalFormRef = useRef(null)
  const [openEmployeeCardMenuId, setOpenEmployeeCardMenuId] = useState(null)
  const [invalidStepErrors, setInvalidStepErrors] = useState({})
  const [attemptedRegistrationSteps, setAttemptedRegistrationSteps] = useState({})
  const [pendingValidationHighlight, setPendingValidationHighlight] = useState(null)
  const prevFormRef = useRef(form)
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

  const buildWheelSectorPath = useCallback((startDeg, endDeg, innerRadius = 50, outerRadius = 64) => {
    const cx = 64
    const cy = 64
    const normalizedEnd = endDeg <= startDeg ? endDeg + 360 : endDeg
    const delta = Math.abs(normalizedEnd - startDeg)
    const toPoint = (deg, radius) => {
      const rad = (deg * Math.PI) / 180
      return {
        x: cx + radius * Math.cos(rad),
        y: cy + radius * Math.sin(rad)
      }
    }

    const startOuter = toPoint(startDeg, outerRadius)
    const endOuter = toPoint(normalizedEnd, outerRadius)

    const sweep = 1
    const largeArc = delta > 180 ? 1 : 0

    if (!innerRadius || innerRadius <= 0) {
      return [
        `M ${startOuter.x} ${startOuter.y}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArc} ${sweep} ${endOuter.x} ${endOuter.y}`,
        `L ${cx} ${cy}`,
        'Z'
      ].join(' ')
    }

    const startInner = toPoint(startDeg, innerRadius)
    const endInner = toPoint(normalizedEnd, innerRadius)

    return [
      `M ${startOuter.x} ${startOuter.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} ${sweep} ${endOuter.x} ${endOuter.y}`,
      `L ${endInner.x} ${endInner.y}`,
      // reverse direction on inner arc
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
      'Z'
    ].join(' ')
  }, [])
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
    if (stage && allowedEmployeeViewIds.includes(stage)) return stage
    const raw = (searchParams.get('view') || '').trim()
    if (raw && allowedEmployeeViewIds.includes(raw)) return raw
    if (allowedEmployeeViewIds.includes('list')) return 'list'
    return allowedEmployeeViewIds[0] || stage || 'list'
  }, [allowedEmployeeViewIds, searchParams, stage])

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

  const loadFormOptions = useCallback(async () => {
    try {
      setFormOptions(await employeesService.fetchEmployeeFormOptions())
    } catch {
      setFormOptions({ destination_countries: [], salary_options_by_country: {}, agent_options: [] })
    }
  }, [])

  const loadEmployees = useCallback(async (
    viewOverride,
    declinedIdsOverride = travelConfirmationDeclinedIds,
    confirmedIdsOverride = travelConfirmationConfirmedIds
  ) => {
    const invokedFromEvent = viewOverride && typeof viewOverride !== 'string'
    if (invokedFromEvent) {
      window.location.reload()
      return
    }
    const resolvedView = typeof viewOverride === 'string' ? viewOverride : currentView
    if (resolvedView === 'register') {
      setPageError('')
      setLoading(true)
      try {
        await loadFormOptions()
      } finally {
        setLoading(false)
      }
      return
    }
    const shouldShowLoading = invokedFromEvent || !hasLoadedOnceRef.current
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

      if (resolvedView === 'under-process') {
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

      if (resolvedView === 'list') {
        const baseEmployees = await fetchAllEmployeePages({
          q: filters.q
        })
        let visibleListEmployees = baseEmployees.map(applyTravelOverrides)

        if (isAgentSideUser) {
          visibleListEmployees = visibleListEmployees.filter((employee) =>
            employeeAvailability(employee) === 'Available'
          )
        }

        visibleListEmployees = filterCandidateList(visibleListEmployees, filters)

        setEmployeesData({
          count: visibleListEmployees.length,
          results: visibleListEmployees,
          next: null,
          previous: null
        })
        return
      }

      if (resolvedView === 'employed') {
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

      if (resolvedView === 'selected' && isAgentSideUser) {
        const baseEmployees = await fetchAllEmployeePages({
          q: filters.q,
          selectedScope
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

      if (resolvedView === 'returned' && isAgentSideUser) {
        const baseEmployees = await fetchAllEmployeePages({
          q: filters.q,
          returnedScope: 'mine'
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
        selectedScope: resolvedView === 'selected' ? selectedScope : '',
        processScope: resolvedView === 'under-process' ? (isAgentSideUser ? 'mine' : 'organization') : '',
        employedScope: resolvedView === 'employed' ? (isAgentSideUser ? 'mine' : 'organization') : '',
        returnedScope: resolvedView === 'returned' ? (isAgentSideUser ? 'mine' : 'organization') : ''
      })
      setEmployeesData(data)
      hasLoadedOnceRef.current = true
    } catch (err) {
      setPageError(err.message || 'Failed to load employees')
      setEmployeesData(null)
    } finally {
      if (shouldShowLoading) setLoading(false)
    }
  }, [currentView, filters, isAgentSideUser, loadFormOptions, page, selectedScope, travelConfirmationDeclinedIds, travelConfirmationConfirmedIds])

  useEffect(() => {
    if (!canManageEmployees) {
      setLoading(false)
      return
    }

    if (currentView === 'register') {
      setLoading(true)
      Promise.resolve(loadFormOptions()).finally(() => setLoading(false))
      return
    }

    loadFormOptions()
  }, [canManageEmployees, currentView, loadFormOptions])

  useEffect(() => {
    if (!canManageEmployees) return
    if (currentView === 'register') return
    loadEmployees(currentView)
  }, [canManageEmployees, currentView, loadEmployees])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('portal:candidates-loading', { detail: { loading } }))
  }, [loading])

  useEffect(() => {
    const handlePortalRefresh = () => {
      loadEmployees(currentView)
    }
    window.addEventListener('portal:refresh-candidates', handlePortalRefresh)
    return () => {
      window.removeEventListener('portal:refresh-candidates', handlePortalRefresh)
    }
  }, [currentView, loadEmployees])

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
    navigate('/dashboard/candidates/register')
  }

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
      navigate('/dashboard/candidates/register?edit=' + employee.id)
      setModalNotice('Draft restored.')
    } catch (err) {
      setModalError(err?.message || 'Could not restore draft.')
    }
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
    setSaving(true)
    setModalError('')
    setNotice('')
    setModalNotice('')
    try {
      const payload = buildEmployeePayload(form, editingEmployeeId)
      const employee = editingEmployeeId ? await employeesService.updateEmployee(editingEmployeeId, payload) : await employeesService.createEmployee(payload)
      await uploadPendingAttachments(employee.id)
      const viewAfterSave = isEditing ? 'list' : currentView
      if (isEditing) {
        setNotice('Employee updated successfully.')
        setPage(1)
        setView('list')
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
        setPage(1)
        setView('register')
      }
      await Promise.all([loadEmployees(viewAfterSave), loadFormOptions()])
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
      setInvalidStepErrors((prev) => ({
        ...computeInvalidStepErrors(nextAttempted),
        [targetStep ?? activeStep]: nextError
      }))
      setPendingValidationHighlight({ message: nextError, stepIndex: targetStep ?? activeStep })
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (employeeId) => {
    if (!canEditEmployeeRecords) {
      setPageError('Only organization-side users can edit employee records.')
      return
    }
    closeDocumentPreview()
    setOpenedEmployeeId(null)
    navigate(`/dashboard/candidates/register?edit=${employeeId}`)
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
        if (!employee.selection_state?.can_unselect) {
          setPageError('Only the account that selected this employee or the agent owner can unselect it.')
          return
        }
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
    if (currentView !== 'register') return
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
  }, [activeStep, currentView, form, getValidationFieldForStep, invalidStepErrors])

  useEffect(() => {
    if (!pendingValidationHighlight) return
    if (currentView !== 'register') return
    const { message, stepIndex } = pendingValidationHighlight
    // Wait for the step's fields to be rendered before focusing/marking.
    requestAnimationFrame(() => {
      highlightEmployeeModalValidationTarget(message, stepIndex)
      setPendingValidationHighlight(null)
    })
  }, [currentView, highlightEmployeeModalValidationTarget, pendingValidationHighlight])

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

  const employees = useMemo(() => employeesData?.results ?? [], [employeesData])
  const total = useMemo(() => employeesData?.count ?? employees.length, [employeesData, employees.length])
  const hasNext = useMemo(() => Boolean(employeesData?.next), [employeesData])
  const hasPrev = useMemo(() => Boolean(employeesData?.previous), [employeesData])
  const canProgressivelyRenderEmployeeCards = currentView === 'list'

  const visibleEmployees = useMemo(() => {
    const list = employees.map((employee) => ({
      ...employee,
      settled_commission: employee?.settled_commission || settledCommissionIds.includes(String(employee.id))
    }))
    return filterCandidateList(list, filters)
  }, [employees, filters, settledCommissionIds])

  const visibleEmployeesById = useMemo(() => {
    const map = new Map()
    visibleEmployees.forEach((employee) => {
      map.set(Number(employee.id), employee)
    })
    return map
  }, [visibleEmployees])

  const selectionGroupForEmployee = useCallback((employee) => {
    const state = employeeWorkflowState(employee)
    if (state === 'approved') return 'available'
    if (state === 'selected') return 'selected'
    return state || ''
  }, [])

  const currentSelectedCardsGroup = useMemo(() => {
    for (const id of selectedEmployeeCardIds) {
      const employee = visibleEmployeesById.get(Number(id))
      if (!employee) continue
      const group = selectionGroupForEmployee(employee)
      if (group) return group
    }
    return ''
  }, [selectedEmployeeCardIds, selectionGroupForEmployee, visibleEmployeesById])

  const hasWheelSelectTargets = useMemo(
    () => isAgentSideUser && selectedEmployeeCardIds.size > 0 && currentSelectedCardsGroup === 'available',
    [currentSelectedCardsGroup, isAgentSideUser, selectedEmployeeCardIds.size]
  )

  const hasWheelUnselectTargets = useMemo(
    () =>
      selectedEmployeeCardIds.size > 0 &&
      currentSelectedCardsGroup === 'selected' &&
      Array.from(selectedEmployeeCardIds).some((id) => {
        const employee = visibleEmployeesById.get(Number(id))
        return Boolean(employee?.selection_state?.can_unselect)
      }),
    [currentSelectedCardsGroup, selectedEmployeeCardIds, visibleEmployeesById]
  )

  const hasWheelStartProcessTargets = useMemo(
    () =>
      selectedEmployeeCardIds.size > 0 &&
      (
        (canManageOrganizationProcesses && ['available', 'selected'].includes(currentSelectedCardsGroup)) ||
        (isMainAgentAccount && currentSelectedCardsGroup === 'selected')
      ) &&
      Array.from(selectedEmployeeCardIds).some((id) => {
        const employee = visibleEmployeesById.get(Number(id))
        return Boolean(
          employee?.status === 'approved' &&
            (canManageOrganizationProcesses || employee?.selection_state?.selected_by_current_agent)
        )
      }),
    [
      canManageOrganizationProcesses,
      currentSelectedCardsGroup,
      isMainAgentAccount,
      selectedEmployeeCardIds,
      visibleEmployeesById
    ]
  )

  const rightDivisionRole = useMemo(() => {
    if (hasWheelStartProcessTargets) return 'start-process'
    if (hasWheelSelectTargets) return 'select'
    return ''
  }, [hasWheelSelectTargets, hasWheelStartProcessTargets])

  const handleScrollWheelSelectEmployees = useCallback((event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    if (!hasWheelSelectTargets) return

    ;(async () => {
      const selectedIds = Array.from(selectedEmployeeCardIds)
      const unmarkedIds = selectedIds.filter((id) => {
        const employee = visibleEmployeesById.get(Number(id))
        return !employee?.selection_state?.selected_by_current_agent
      })

      const confirmed = await confirm({
        title: 'Select employees',
        message:
          unmarkedIds.length === 0
            ? 'All selected cards are already marked as selected.'
            : `Mark ${unmarkedIds.length} employee(s) as Selected?`,
        confirmLabel: unmarkedIds.length === 0 ? 'OK' : 'Mark selected',
        cancelLabel: unmarkedIds.length === 0 ? undefined : 'Cancel',
        tone: 'warning'
      })
      if (!confirmed || unmarkedIds.length === 0) return

      setActionBusyId('bulk-select')
      setPageError('')
      setNotice('')

      try {
        await Promise.all(unmarkedIds.map((id) => employeesService.selectEmployee(id)))
        setNotice(`${unmarkedIds.length} employee(s) marked as Selected.`)
        setSelectedEmployeeCardIds(new Set())
        await loadEmployees(currentView)
      } catch (err) {
        setPageError(err.message || 'Could not mark selected employees')
      } finally {
        setActionBusyId(null)
      }
    })()
  }, [confirm, currentView, hasWheelSelectTargets, loadEmployees, selectedEmployeeCardIds, visibleEmployeesById])

  const handleScrollWheelUnselectEmployees = useCallback((event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    if (!hasWheelUnselectTargets) return

    ;(async () => {
      const selectedIds = Array.from(selectedEmployeeCardIds)
      const targetIds = selectedIds.filter((id) => {
        const employee = visibleEmployeesById.get(Number(id))
        return Boolean(employee?.selection_state?.can_unselect)
      })

      const confirmed = await confirm({
        title: 'Unselect employees',
        message:
          targetIds.length === 0
            ? 'None of the selected cards can be unselected by your account.'
            : `Remove ${targetIds.length} employee(s) from Selected Employees?`,
        confirmLabel: targetIds.length === 0 ? 'OK' : 'Unselect',
        cancelLabel: targetIds.length === 0 ? undefined : 'Cancel',
        tone: 'danger'
      })
      if (!confirmed || targetIds.length === 0) return

      setActionBusyId('bulk-unselect')
      setPageError('')
      setNotice('')

      try {
        await Promise.all(targetIds.map((id) => employeesService.unselectEmployee(id)))
        setNotice(`${targetIds.length} employee(s) removed from Selected Employees.`)
        setSelectedEmployeeCardIds(new Set())
        await loadEmployees(currentView === 'selected' ? 'selected' : currentView)
      } catch (err) {
        setPageError(err.message || 'Could not unselect employees')
      } finally {
        setActionBusyId(null)
      }
    })()
  }, [confirm, currentView, hasWheelUnselectTargets, loadEmployees, selectedEmployeeCardIds, visibleEmployeesById])

  const handleScrollWheelStartProcessSelectedEmployees = useCallback((event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    if (!hasWheelStartProcessTargets) return

    ;(async () => {
      const organizationName = user?.organization?.name || 'organization'
      const selectedIds = Array.from(selectedEmployeeCardIds)
      const selectedEmployees = selectedIds.map((id) => visibleEmployeesById.get(Number(id))).filter(Boolean)

      const ineligibleEmployees = selectedEmployees.filter((employee) => employee.status !== 'approved')
      if (ineligibleEmployees.length) {
        setPageError('Only approved employees can have a process initiated.')
        return
      }

      const assignedAgentIds = selectedEmployees.map((employee) => {
        const assignedAgentId = resolvedProcessAgentId(employee, processAgentAssignments, formOptions.agent_options)
        return { employeeId: employee.id, assignedAgentId }
      })

      if (canManageOrganizationProcesses && assignedAgentIds.some((row) => !row.assignedAgentId)) {
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

      setActionBusyId('bulk-start-process')
      setPageError('')
      setNotice('')

      try {
        await Promise.all(
          assignedAgentIds.map(({ employeeId, assignedAgentId }) => (
            employeesService.startEmployeeProcess(employeeId, {
              agentId: canManageOrganizationProcesses ? assignedAgentId : undefined
            })
          ))
        )
        setNotice(`Employee process started for ${selectedEmployees.length} employee(s).`)
        setSelectedEmployeeCardIds(new Set())
        await loadEmployees(currentView)
      } catch (err) {
        setPageError(err.message || 'Could not start employee process')
      } finally {
        setActionBusyId(null)
      }
    })()
  }, [
    canManageOrganizationProcesses,
    confirm,
    currentView,
    formOptions.agent_options,
    hasWheelStartProcessTargets,
    loadEmployees,
    processAgentAssignments,
    selectedEmployeeCardIds,
    user?.organization?.name,
    visibleEmployeesById
  ])

  const handleScrollWheelClearCardSelection = useCallback((event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    if (selectedEmployeeCardIds.size === 0) return

    ;(async () => {
      const confirmed = await confirm({
        title: 'Clear selected cards',
        message: `Clear ${selectedEmployeeCardIds.size} selected card(s)?`,
        confirmLabel: 'Clear',
        cancelLabel: 'Cancel',
        tone: 'danger'
      })
      if (!confirmed) return
      setSelectedEmployeeCardIds(new Set())
    })()
  }, [confirm, selectedEmployeeCardIds.size])

  const sortedPrimaryVisibleEmployees = useMemo(() => {
    const rows = [...visibleEmployees]
    const byDate = (a, b, direction = 'desc') => {
      const aTime = new Date(a?.created_at || a?.updated_at || 0).getTime() || 0
      const bTime = new Date(b?.created_at || b?.updated_at || 0).getTime() || 0
      return direction === 'asc' ? aTime - bTime : bTime - aTime
    }

    switch (employeeCardsSort) {
      case 'oldest':
        rows.sort((a, b) => byDate(a, b, 'asc'))
        break
      case 'name_asc':
        rows.sort((a, b) => String(a?.full_name || '').localeCompare(String(b?.full_name || ''), undefined, { sensitivity: 'base' }))
        break
      case 'name_desc':
        rows.sort((a, b) => String(b?.full_name || '').localeCompare(String(a?.full_name || ''), undefined, { sensitivity: 'base' }))
        break
      case 'newest':
      default:
        rows.sort((a, b) => byDate(a, b, 'desc'))
        break
    }

    return rows
  }, [employeeCardsSort, visibleEmployees])

  const primaryVisibleEmployees = useMemo(() => {
    if (!canProgressivelyRenderEmployeeCards) return sortedPrimaryVisibleEmployees
    return sortedPrimaryVisibleEmployees.slice(0, employeeCardsRenderCount)
  }, [canProgressivelyRenderEmployeeCards, employeeCardsRenderCount, sortedPrimaryVisibleEmployees])

  useEffect(() => {
    if (!canProgressivelyRenderEmployeeCards) return
    setEmployeeCardsRenderCount(EMPLOYEE_CARDS_BATCH_SIZE)
  }, [canProgressivelyRenderEmployeeCards, currentView, employeeCardsLayout, employeeCardsSort, filters.isActive, filters.q, filters.tag])

  useEffect(() => {
    if (!canProgressivelyRenderEmployeeCards) return
    if (typeof window === 'undefined') return

    const sentinel = employeeCardsSentinelRef.current
    if (!sentinel) return

    const root = document.querySelector('.dashboard-content')
    const rootNode = root instanceof Element ? root : null

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) return
        setEmployeeCardsRenderCount((prev) => Math.min(sortedPrimaryVisibleEmployees.length, prev + EMPLOYEE_CARDS_BATCH_SIZE))
      },
      { root: rootNode, rootMargin: '320px 0px 320px 0px', threshold: 0 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [canProgressivelyRenderEmployeeCards, sortedPrimaryVisibleEmployees.length])

  const scrollEmployeesToTop = useCallback(() => {
    if (typeof window === 'undefined') return
    const root = document.querySelector('.dashboard-content')
    if (root && typeof root.scrollTo === 'function') {
      root.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = document.querySelector('.dashboard-content')
    const node = root instanceof Element ? root : null
    const target = node || window

    const readScrollTop = () => {
      if (node) return node.scrollTop
      return window.scrollY || document.documentElement.scrollTop || 0
    }

    const handleScroll = () => {
      setShowScrollToTop(readScrollTop() > 420)
    }

    handleScroll()
    target.addEventListener('scroll', handleScroll, { passive: true })
    return () => target.removeEventListener('scroll', handleScroll)
  }, [])

  const modalEmployees = useMemo(() => {
    const uniqueEmployees = new Map()
    ;[...visibleEmployees, ...requestedReturns].forEach((employee) => {
      if (employee?.id) uniqueEmployees.set(employee.id, employee)
    })
    return Array.from(uniqueEmployees.values())
  }, [requestedReturns, visibleEmployees])

  const openedEmployee = useMemo(() => {
    if (!openedEmployeeId) return null
    return modalEmployees.find((employee) => employee.id === openedEmployeeId) || null
  }, [modalEmployees, openedEmployeeId])

  const openedEmployeeIndex = useMemo(
    () => modalEmployees.findIndex((employee) => employee.id === openedEmployeeId),
    [modalEmployees, openedEmployeeId]
  )
  const previousOpenedEmployee = openedEmployeeIndex > 0
    ? modalEmployees[openedEmployeeIndex - 1]
    : null
  const nextOpenedEmployee = openedEmployeeIndex >= 0 && openedEmployeeIndex < modalEmployees.length - 1
    ? modalEmployees[openedEmployeeIndex + 1]
    : null
  const navigateOpenedEmployee = useCallback((direction) => {
    const target = direction === 'next' ? nextOpenedEmployee : previousOpenedEmployee
    if (!target) return
    setOpenedEmployeeId(target.id)
  }, [nextOpenedEmployee, previousOpenedEmployee])

  useEffect(() => {
    if (!openedEmployee || previewDocument) return undefined

    const handleEmployeeModalKeyDown = (event) => {
      const activeElement = document.activeElement
      const isTypingTarget = activeElement?.matches?.('input, textarea, select, [contenteditable="true"]')
      if (isTypingTarget) return

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        navigateOpenedEmployee('previous')
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        navigateOpenedEmployee('next')
      }
    }

    document.addEventListener('keydown', handleEmployeeModalKeyDown, true)
    return () => document.removeEventListener('keydown', handleEmployeeModalKeyDown, true)
  }, [navigateOpenedEmployee, openedEmployee, previewDocument])

  const visibleTabs = useMemo(() => {
    return EMPLOYEE_VIEW_TABS.filter((tab) => {
      if (tab.id === 'selected') return isAgentSideUser
      if (tab.id === 'register') return canEditEmployeeRecords
      return true
    })
  }, [canEditEmployeeRecords, isAgentSideUser])

  const openedEmployeeProgress = useMemo(() => buildProgressDonut(openedEmployee?.progress_status), [openedEmployee])
  const openedEmployeeProfileDocument = useMemo(() => employeeProfilePhoto(openedEmployee), [openedEmployee])
  const openedEmployeeIsReturned = useMemo(() => isEmployeeReturned(openedEmployee), [openedEmployee])
  const openedEmployeeIsEmployed = useMemo(() => isEmployeeEmployedInView(openedEmployee, currentView), [currentView, openedEmployee])
  const openedEmployeeWorkflowState = useMemo(() => employeeWorkflowState(openedEmployee), [openedEmployee])
  const openedEmployeeSelectionState = useMemo(() => openedEmployee?.selection_state || {}, [openedEmployee])
  const openedEmployeeIsSelectedByCurrentAgent = useMemo(
    () => Boolean(openedEmployeeSelectionState.selected_by_current_agent),
    [openedEmployeeSelectionState]
  )
  const openedEmployeeCanUnselect = useMemo(
    () => Boolean(openedEmployeeSelectionState.can_unselect),
    [openedEmployeeSelectionState]
  )
  const openedEmployeeIsUnderProcess = openedEmployeeWorkflowState === 'under_process'
  const openedEmployeeIsTravelled = openedEmployeeWorkflowState === 'traveled'
  const openedEmployeeIsAvailable = useMemo(
    () => employeeAvailability(openedEmployee) === 'Available',
    [openedEmployee]
  )
  const openedEmployeeBadgeClass = useMemo(() => employeeStatusBadgeClass(openedEmployee), [openedEmployee])
  const openedEmployeeAssignedAgentId = useMemo(
    () => {
      if (!openedEmployee) return ''
      return resolvedProcessAgentId(
        openedEmployee,
        processAgentAssignments,
        formOptions.agent_options
      )
    },
    [formOptions.agent_options, openedEmployee, processAgentAssignments]
  )
  const openedEmployeeReturnRequest = useMemo(() => openedEmployee?.return_request || null, [openedEmployee])
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

  const updateReviewDocsScrollState = useCallback(() => {
    const node = reviewDocsScrollerRef.current
    if (!node) {
      if (reviewDocsScrollStateRef.current.left || reviewDocsScrollStateRef.current.right) {
        reviewDocsScrollStateRef.current = { left: false, right: false }
        setReviewDocsCanScrollLeft(false)
        setReviewDocsCanScrollRight(false)
      }
      return
    }

    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth)
    const left = node.scrollLeft
    const epsilon = 2
    const nextLeft = left > epsilon
    const nextRight = left < maxScrollLeft - epsilon
    const prev = reviewDocsScrollStateRef.current
    if (prev.left === nextLeft && prev.right === nextRight) return
    reviewDocsScrollStateRef.current = { left: nextLeft, right: nextRight }
    setReviewDocsCanScrollLeft(nextLeft)
    setReviewDocsCanScrollRight(nextRight)
  }, [])

  const scheduleReviewDocsScrollStateUpdate = useCallback(() => {
    if (reviewDocsScrollRafRef.current) return
    reviewDocsScrollRafRef.current = window.requestAnimationFrame(() => {
      reviewDocsScrollRafRef.current = 0
      updateReviewDocsScrollState()
    })
  }, [updateReviewDocsScrollState])

  const scrollReviewDocumentsNext = useCallback(() => {
    const node = reviewDocsScrollerRef.current
    if (!node) return
    const delta = Math.max(240, Math.floor(node.clientWidth * 0.85))
    node.scrollBy({ left: delta, behavior: 'smooth' })
    scheduleReviewDocsScrollStateUpdate()
  }, [scheduleReviewDocsScrollStateUpdate])

  const scrollReviewDocumentsPrev = useCallback(() => {
    const node = reviewDocsScrollerRef.current
    if (!node) return
    const delta = Math.max(240, Math.floor(node.clientWidth * 0.85))
    node.scrollBy({ left: -delta, behavior: 'smooth' })
    scheduleReviewDocsScrollStateUpdate()
  }, [scheduleReviewDocsScrollStateUpdate])

  const toggleEmployeeCardExpanded = useCallback((employeeId) => {
    employeeCardMasonryDebugLog('toggle expand', { employeeId, prevExpanded: expandedEmployeeCardId })
    setExpandedEmployeeCardReadyId(null)
    setOpenEmployeeCardMenuId(null)
    setExpandedEmployeeCardId((prev) => (prev === employeeId ? null : employeeId))
  }, [expandedEmployeeCardId])

  const toggleEmployeeCardSelected = useCallback((employeeId) => {
    employeeCardMasonryDebugLog('toggle select', { employeeId })
    setSelectedEmployeeCardIds((prev) => {
      const next = new Set(prev)
      if (next.has(employeeId)) next.delete(employeeId)
      else next.add(employeeId)
      return next
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!openEmployeeCardMenuId) return

    const handlePointerDown = (event) => {
      const target = event.target
      if (!(target instanceof Element)) {
        setOpenEmployeeCardMenuId(null)
        return
      }

      const menuRoot = target.closest?.('.employee-card-menu')
      const menuIdRaw = menuRoot?.getAttribute?.('data-menu-employee-id') || ''
      const menuId = Number.parseInt(menuIdRaw, 10)
      if (menuId && menuId === openEmployeeCardMenuId) return
      setOpenEmployeeCardMenuId(null)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpenEmployeeCardMenuId(null)
    }

    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [openEmployeeCardMenuId])

  const reflowEmployeeCardsMasonry = useCallback(() => {
    const grid = employeeCardsGridRef.current
    if (!grid) return
    if (employeeCardsLayout !== 'grid') return
    const computed = window.getComputedStyle(grid)
    const rowHeight = Number.parseFloat(computed.gridAutoRows) || 10
    const rowGap = Number.parseFloat(computed.rowGap || computed.gap) || 0
    const columns = (() => {
      const raw = String(computed.gridTemplateColumns || '').trim()
      if (!raw) return 1
      let depth = 0
      let tracks = 0
      let hasToken = false
      for (let i = 0; i < raw.length; i += 1) {
        const ch = raw[i]
        if (ch === '(') depth += 1
        if (ch === ')') depth = Math.max(0, depth - 1)
        if (depth === 0 && /\s/.test(ch)) {
          if (hasToken) {
            tracks += 1
            hasToken = false
          }
          continue
        }
        if (!/\s/.test(ch)) hasToken = true
      }
      if (hasToken) tracks += 1
      return Math.max(1, tracks)
    })()

    employeeCardMasonryDebugLog('reflow start', {
      expandedEmployeeCardId,
      rowHeight,
      rowGap,
      columns,
      cards: employeeCardItemRefs.current.size,
      scrollTop:
        (grid?.closest?.('.dashboard-content') || document.scrollingElement)?.scrollTop ?? null
    })

    const orderedNodes = Array.from(grid.querySelectorAll('.employee-card'))
    const nextRowStartByColumn = Array.from({ length: columns }, () => 1)

    for (let index = 0; index < orderedNodes.length; index += 1) {
      const node = orderedNodes[index]
      if (!node) continue

      const columnIndex = index % columns
      const columnStart = columnIndex + 1

      const height = node.getBoundingClientRect().height
      const span = Math.max(1, Math.ceil((height + rowGap) / (rowHeight + rowGap)))
      const rowStart = nextRowStartByColumn[columnIndex]

      node.style.gridColumnStart = String(columnStart)
      node.style.gridColumnEnd = 'span 1'
      node.style.gridRowStart = String(rowStart)
      node.style.gridRowEnd = `span ${span}`

      nextRowStartByColumn[columnIndex] = rowStart + span
    }

    employeeCardMasonryDebugLog('reflow end')
  }, [employeeCardsLayout])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (employeeCardsLayout !== 'list') return
    const grid = employeeCardsGridRef.current
    if (!grid) return
    const nodes = Array.from(grid.querySelectorAll('.employee-card'))
    for (const node of nodes) {
      node.style.gridRowStart = ''
      node.style.gridRowEnd = ''
      node.style.gridColumnStart = ''
      node.style.gridColumnEnd = ''
    }
  }, [employeeCardsLayout, primaryVisibleEmployees.length])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (employeeCardsLayout !== 'grid') return
    window.requestAnimationFrame(() => reflowEmployeeCardsMasonry())
  }, [employeeCardsLayout, reflowEmployeeCardsMasonry])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!expandedEmployeeCardId) return

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReducedMotion) {
      setExpandedEmployeeCardReadyId(expandedEmployeeCardId)
      window.requestAnimationFrame(() => reflowEmployeeCardsMasonry())
      return
    }

    const timeoutId = window.setTimeout(() => {
      setExpandedEmployeeCardReadyId(expandedEmployeeCardId)
      window.requestAnimationFrame(() => reflowEmployeeCardsMasonry())
    }, 240)

    return () => window.clearTimeout(timeoutId)
  }, [expandedEmployeeCardId, reflowEmployeeCardsMasonry])

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    let rafId = 0
    const schedule = () => {
      if (rafId) return
      rafId = window.requestAnimationFrame(() => {
        rafId = 0
        reflowEmployeeCardsMasonry()
      })
    }

    const ResizeObserverCtor = window.ResizeObserver
    const resizeObserver = typeof ResizeObserverCtor === 'function' ? new ResizeObserverCtor(schedule) : null
    employeeCardResizeObserverRef.current = resizeObserver
    if (resizeObserver) {
      if (employeeCardsGridRef.current) resizeObserver.observe(employeeCardsGridRef.current)
      for (const node of employeeCardItemRefs.current.values()) {
        if (node) resizeObserver.observe(node)
      }
    }

    const mutationObserver = employeeCardsGridRef.current
      ? new MutationObserver(() => schedule())
      : null
    if (mutationObserver && employeeCardsGridRef.current) {
      mutationObserver.observe(employeeCardsGridRef.current, { childList: true, subtree: true })
    }

    window.addEventListener('resize', schedule)
    schedule()

    const timeoutId = window.setTimeout(schedule, 400)
    const fontsReady = window.document?.fonts?.ready
    if (fontsReady && typeof fontsReady.then === 'function') {
      fontsReady.then(() => schedule()).catch(() => {})
    }

    const scrollContainer =
      employeeCardsGridRef.current?.closest?.('.dashboard-content') || document.scrollingElement
    const detachScrollLogger = employeeCardMasonryAttachScrollLogger(scrollContainer)

    return () => {
      window.removeEventListener('resize', schedule)
      if (resizeObserver) resizeObserver.disconnect()
      if (employeeCardResizeObserverRef.current === resizeObserver) {
        employeeCardResizeObserverRef.current = null
      }
      if (mutationObserver) mutationObserver.disconnect()
      detachScrollLogger()
      if (rafId) window.cancelAnimationFrame(rafId)
      window.clearTimeout(timeoutId)
    }
  }, [primaryVisibleEmployees.length, reflowEmployeeCardsMasonry])

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    reflowEmployeeCardsMasonry()
  }, [expandedEmployeeCardId])

  useEffect(() => {
    setReviewDocumentsTab('all')
    setOpenedEmployeeMode('full')
  }, [openedEmployeeId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    scheduleReviewDocsScrollStateUpdate()
    return () => {
      if (reviewDocsScrollRafRef.current) {
        window.cancelAnimationFrame(reviewDocsScrollRafRef.current)
        reviewDocsScrollRafRef.current = 0
      }
    }
  }, [openedEmployeeId, reviewDocumentsTab, scheduleReviewDocsScrollStateUpdate])

  const reviewDocumentCategory = useCallback((document) => {
    const rawLabel = document?.label || fileLabel(document, attachmentLabels)
    const label = String(rawLabel || '').toLowerCase()
    const type = String(document?.document_type || '').toLowerCase()

    const haystack = `${type} ${label}`

    if (haystack.includes('return') || haystack.includes('evidence')) return 'returns'
    if (haystack.includes('passport')) return 'passport'
    if (haystack.includes('contract')) return 'contract'
    if (haystack.includes('medical') || haystack.includes('vaccin') || haystack.includes('lab')) return 'medical'
    if (haystack.includes('photo') || haystack.includes('portrait') || haystack.includes('full_photo') || haystack.includes('full photo')) return 'photos'
    return 'other'
  }, [attachmentLabels])

  const openedEmployeeDocuments = useMemo(() => openedEmployee?.documents || [], [openedEmployee])

  const returnAttachmentDocuments = useMemo(() => {
    return openedEmployeeDocuments
      .filter((document) => String(document?.document_type || '') === 'return_ticket')
      .map((document) => ({
        ...document,
        id: document.id ?? `return-attachment-${document.file_url || ''}`,
        label: fileLabel({ ...document, label: 'Return ticket' }, attachmentLabels),
        is_return_attachment: true
      }))
  }, [attachmentLabels, openedEmployeeDocuments])

  const returnEvidenceDocuments = useMemo(() => {
    const urls = [
      openedEmployeeReturnRequest?.evidence_file_1_url,
      openedEmployeeReturnRequest?.evidence_file_2_url,
      openedEmployeeReturnRequest?.evidence_file_3_url
    ].filter(Boolean)

    return urls.map((url, index) => ({
      id: `return-evidence-${index + 1}`,
      file_url: url,
      document_type: 'returns',
      label: `Return evidence ${index + 1}`,
      is_return_evidence: true
    }))
  }, [openedEmployeeReturnRequest])

  const reviewDocumentsFiltered = useMemo(() => {
    if (reviewDocumentsTab === 'returns') return returnAttachmentDocuments.concat(returnEvidenceDocuments)
    if (reviewDocumentsTab === 'all') return openedEmployeeDocuments.concat(returnEvidenceDocuments)
    return openedEmployeeDocuments.filter((document) => reviewDocumentCategory(document) === reviewDocumentsTab)
  }, [openedEmployeeDocuments, reviewDocumentCategory, reviewDocumentsTab, returnAttachmentDocuments, returnEvidenceDocuments])

  const reviewDocumentsCards = useMemo(() => {
    return reviewDocumentsFiltered.map((document) => {
      const label = document?.label || fileLabel(document, attachmentLabels)
      const isPdf = isPdfDocumentUrl(document.file_url)
      const isImage = document?.is_return_evidence ? !isPdf : isImageDocument(document)
      const kind = isPdf ? 'PDF' : isImage ? 'Image' : 'File'
      const isReturnMaterial = Boolean(document?.is_return_evidence || document?.is_return_attachment)
      const returnIsDone = Boolean(openedEmployeeIsReturned || openedEmployeeReturnRequest?.approved_at)

      const openPayload = {
        url: document.file_url,
        label,
        isImage,
        isPdf
      }

      return (
        <span
          key={String(document.id)}
          role="button"
          tabIndex={0}
          className="employee-review-doc-card"
          onClick={() => openDocumentPreview(openPayload)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              openDocumentPreview(openPayload)
            }
          }}
        >
          <div className="employee-review-doc-thumb">
            {isReturnMaterial && returnIsDone ? (
              <span className="employee-review-doc-thumb-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                  <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : null}
            {isImage ? (
              <img
                src={document.file_url}
                alt={label}
                loading="eager"
                decoding="async"
              />
            ) : (
              <span>{kind}</span>
            )}
          </div>
          <div className="employee-review-doc-meta employee-review-step-copy">
            <span className="employee-review-step-label" title={label}>{label}</span>
            <span className="employee-review-step-date muted-text">{kind}</span>
          </div>
        </span>
      )
    })
  }, [attachmentLabels, openDocumentPreview, openedEmployeeIsReturned, openedEmployeeReturnRequest, reviewDocumentsFiltered])

  useEffect(() => {
    const node = reviewDocsScrollerRef.current
    if (!node) return
    node.scrollLeft = 0
    scheduleReviewDocsScrollStateUpdate()
  }, [openedEmployeeId, reviewDocumentsTab, scheduleReviewDocsScrollStateUpdate])

  const closeDocumentPreview = useCallback(() => {
    setPreviewDocument(null)
    setPreviewZoom(1)
    setPreviewOffset({ x: 0, y: 0 })
    setPreviewDragging(false)
  }, [])

  useEffect(() => {
    const handleTopLayerEscape = (event) => {
      if (event.key !== 'Escape') return

      if (previewDocument) {
        event.preventDefault()
        event.stopPropagation()
        closeDocumentPreview()
        return
      }

      if (ocrSetupModalOpen) {
        event.preventDefault()
        event.stopPropagation()
        closeOcrSetupModal()
        return
      }

      if (scanAttachmentModalOpen) {
        event.preventDefault()
        event.stopPropagation()
        closeScanAttachmentModal()
        return
      }

      if (scannerModalOpen) {
        event.preventDefault()
        event.stopPropagation()
        closeScannerModal()
        return
      }

      if (cameraCaptureModalOpen) {
        event.preventDefault()
        event.stopPropagation()
        closeCameraCapture()
        return
      }

      if (uploadDocumentModalOpen) {
        event.preventDefault()
        event.stopPropagation()
        closeUploadDocumentModal()
        return
      }

      if (scanImportModalOpen) {
        event.preventDefault()
        event.stopPropagation()
        closeScanImportModal()
        return
      }

      if (otherDocumentsModalOpen) {
        event.preventDefault()
        event.stopPropagation()
        setOtherDocumentsModalOpen(false)
        return
      }

      if (returnRequestModalOpen) {
        event.preventDefault()
        event.stopPropagation()
        closeReturnRequestModal()
        return
      }

      if (openedEmployee) {
        event.preventDefault()
        event.stopPropagation()
        setOpenedEmployeeId(null)
      }
    }

    document.addEventListener('keydown', handleTopLayerEscape, true)
    return () => document.removeEventListener('keydown', handleTopLayerEscape, true)
  }, [
    cameraCaptureModalOpen,
    closeCameraCapture,
    closeDocumentPreview,
    ocrSetupModalOpen,
    openedEmployee,
    otherDocumentsModalOpen,
    previewDocument,
    returnRequestModalOpen,
    scanAttachmentModalOpen,
    scanImportModalOpen,
    scannerModalOpen,
    uploadDocumentModalOpen
  ])

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
  const handlePreviewPrint = useCallback(() => {
    if (!previewDocument?.url) return
    printDocumentSilently(previewDocument)
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
    !canManageEmployees ? (
      <Navigate to="/dashboard" replace />
    ) : (
      <div className="employee-listing-view-wrapper">
        <EmployeeFilters
          currentView={currentView}
          searchInput={searchInput}
          setSearchInput={setSearchInput}
          filters={filters}
          setFilters={setFilters}
          setPage={setPage}
          EMPLOYEE_TAG_FILTER_OPTIONS={EMPLOYEE_TAG_FILTER_OPTIONS}
          employeeCardsLayout={employeeCardsLayout}
          setEmployeeCardsLayout={setEmployeeCardsLayout}
          employeeCardsSort={employeeCardsSort}
          setEmployeeCardsSort={setEmployeeCardsSort}
          loading={loading}
          onRefresh={() => loadEmployees(currentView)}
          employees={employees}
          visibleCount={visibleEmployees.length}
          totalCount={total}
        />
        {pageError ? <p className="error-message">{pageError}</p> : null}
        {notice ? <p className="muted-text message-block--mb-16">{notice}</p> : null}
        <div className="users-table-wrap">
          {!loading ? (
            currentView === 'returned' ? (
              <div className="returned-list-surface">
                <div className="returned-list-intro">
                  <p className="muted-text message-block--mb-0">
                    {`${returnedEmployeesHelpText()} Showing ${visibleEmployees.length} of ${total} candidates.`}
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
                {filters.q ? `Filtering by "${filters.q}" — ` : ''}
                {currentView === 'employed'
                  ? `${employedEmployeesHelpText()} Showing ${visibleEmployees.length} of ${total} candidates.`
                  : currentView === 'under-process'
                  ? `${underProcessEmployeesHelpText(user)} Showing ${visibleEmployees.length} of ${total} candidates.`
                  : currentView === 'selected'
                  ? `${selectedEmployeesHelpText(user)} Showing ${visibleEmployees.length} of ${total} candidates.`
                  : `Showing ${visibleEmployees.length} of ${total} candidates.`}
              </p>
            )
          ) : null}
          {loading ? (
            <p className="muted-text">Loading candidates...</p>
          ) : visibleEmployees.length === 0 ? (
            <div className="candidate-list-empty-feedback">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <h3>
                {filters.q || filters.isActive || filters.profession || filters.gender || filters.religion || filters.destinationCountry || filters.experience || filters.docStatus || filters.tag
                  ? 'No candidates matched your filter criteria'
                  : currentView === 'employed'
                  ? 'No employed candidates found yet'
                  : currentView === 'returned'
                  ? 'No returned candidates found yet'
                  : currentView === 'under-process'
                  ? 'No candidates under process yet'
                  : currentView === 'selected'
                  ? 'No selected candidates found yet'
                  : 'No candidates registered yet'}
              </h3>
              <p className="muted-text">
                {filters.q || filters.isActive || filters.profession || filters.gender || filters.religion || filters.destinationCountry || filters.experience || filters.docStatus || filters.tag
                  ? 'Try adjusting or clearing some filters to view more candidate profiles.'
                  : 'Candidates added or assigned to this stage will appear here.'}
              </p>
              {(filters.q || filters.isActive || filters.profession || filters.gender || filters.religion || filters.destinationCountry || filters.experience || filters.docStatus || filters.tag) && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setSearchInput('')
                    setPage(1)
                    setFilters({
                      q: '',
                      isActive: '',
                      profession: '',
                      gender: '',
                      religion: '',
                      experience: '',
                      destinationCountry: '',
                      docStatus: '',
                      tag: ''
                    })
                  }}
                  style={{ marginTop: '8px' }}
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <>
              {primaryVisibleEmployees.length > 0 ? (
            <div className={`employee-cards${employeeCardsLayout === 'list' ? ' is-list' : ''}`} ref={employeeCardsGridRef}>
              {primaryVisibleEmployees.map((employee) => (
                <EmployeeCard
                  key={employee.id}
                  employee={employee}
                  openedEmployeeId={openedEmployeeId}
                  expandedEmployeeCardId={expandedEmployeeCardId}
                  openEmployeeCardMenuId={openEmployeeCardMenuId}
                  employeeCardsLayout={employeeCardsLayout}
                  selectedEmployeeCardIds={selectedEmployeeCardIds}
                  selectDeniedEmployeeCardIds={selectDeniedEmployeeCardIds}
                  processAgentAssignments={processAgentAssignments}
                  formOptions={formOptions}
                  currentSelectedCardsGroup={currentSelectedCardsGroup}
                  expandedEmployeeCardReadyId={expandedEmployeeCardReadyId}
                  attachmentLabels={attachmentLabels}
                  selectionGroupForEmployee={selectionGroupForEmployee}
                  toggleEmployeeCardExpanded={toggleEmployeeCardExpanded}
                  toggleEmployeeCardSelected={toggleEmployeeCardSelected}
                  flashEmployeeCardSelectDenied={flashEmployeeCardSelectDenied}
                  setOpenEmployeeCardMenuId={setOpenEmployeeCardMenuId}
                  setOpenedEmployeeMode={setOpenedEmployeeMode}
                  setOpenedEmployeeId={setOpenedEmployeeId}
                  handleToggleSelectedEmployee={handleToggleSelectedEmployee}
                  setExpandedEmployeeCardReadyId={setExpandedEmployeeCardReadyId}
                  reflowEmployeeCardsMasonry={reflowEmployeeCardsMasonry}
                  cancelFloatingAttachmentPreviewClose={cancelFloatingAttachmentPreviewClose}
                  openFloatingAttachmentPreview={openFloatingAttachmentPreview}
                  scheduleFloatingAttachmentPreviewClose={scheduleFloatingAttachmentPreviewClose}
                  openDocumentPreview={openDocumentPreview}
                  employeeCardItemRefs={employeeCardItemRefs}
                  employeeCardResizeObserverRef={employeeCardResizeObserverRef}
                  floatingAttachmentPreviewPopoverRef={floatingAttachmentPreviewPopoverRef}
                  isAgentSideUser={isAgentSideUser}
                  readOnly={readOnly}
                  actionBusyId={actionBusyId}
                />
              ))}
            </div>
              ) : null}
            </>
          )}
          {!loading && employees.length > 0 ? (
            canProgressivelyRenderEmployeeCards ? (
              primaryVisibleEmployees.length < sortedPrimaryVisibleEmployees.length ? (
                <div className="activity-log-pagination">
                  <span ref={employeeCardsSentinelRef} className="muted-text">Loading more candidates…</span>
                </div>
              ) : (
                <div className="activity-log-pagination">
                  <span ref={employeeCardsSentinelRef} className="muted-text">End of list</span>
                </div>
              )
            ) : (
              <div className="activity-log-pagination">
                <button type="button" className="btn-secondary" disabled={!hasPrev} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Previous</button>
                <span className="muted-text">Page {page}</span>
                <button type="button" className="btn-secondary" disabled={!hasNext} onClick={() => setPage((prev) => prev + 1)}>Next</button>
              </div>
            )
          ) : null}
        </div>
      <EmployeeReturnModal
        isOpen={returnRequestModalOpen}
        closeReturnRequestModal={closeReturnRequestModal}
        returnRequestError={returnRequestError}
        returnRequestSearch={returnRequestSearch}
        setReturnRequestSearch={setReturnRequestSearch}
        loadReturnRequestEmployees={loadReturnRequestEmployees}
        returnRequestLoading={returnRequestLoading}
        returnRequestEmployees={returnRequestEmployees}
        selectedReturnEmployeeId={selectedReturnEmployeeId}
        setSelectedReturnEmployeeId={setSelectedReturnEmployeeId}
        returnRequestRemark={returnRequestRemark}
        setReturnRequestRemark={setReturnRequestRemark}
        handleReturnRequestEvidencePick={handleReturnRequestEvidencePick}
        handleSubmitReturnRequest={handleSubmitReturnRequest}
        readOnly={readOnly}
      />
      {openedEmployee ? (
        <div className="employee-review-backdrop" role="presentation" onClick={() => setOpenedEmployeeId(null)}>
          <button
            type="button"
            className="employee-review-nav-btn employee-review-nav-btn--prev"
            onClick={(event) => {
              event.stopPropagation()
              navigateOpenedEmployee('previous')
            }}
            disabled={!previousOpenedEmployee}
            aria-label="Previous candidate"
            title={previousOpenedEmployee ? `Previous: ${previousOpenedEmployee.full_name}` : 'No previous candidate'}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5 8 12l7 7" />
            </svg>
          </button>
          <div
            className="employee-review-modal"
            data-badge={openedEmployeeBadgeClass}
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-review-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="employee-review-shell">
              <header className="employee-review-profile">
                <div className="employee-review-profile-left">
                  <div
                    className={`employee-card-avatar employee-review-avatar employee-review-avatar--lg${openedEmployeeProfileDocument?.file_url && isImageDocument(openedEmployeeProfileDocument) ? ' is-clickable' : ''}`}
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
                  <div className="employee-review-profile-meta">
                    <p className="employee-modal-eyebrow">Candidate review</p>
                    <h2 id="employee-review-title" className="employee-review-title">{openedEmployee.full_name}</h2>
                    <p className="muted-text employee-review-subtitle">
                      {openedEmployee.profession || openedEmployee.professional_title || '--'}
                    </p>
                    <div className="employee-review-pills" aria-label="Candidate status">
                      <span className={`badge employee-card-status-badge ${openedEmployeeBadgeClass} ${employeeStatusBadgeVariantClass(openedEmployee)}`.trim()}>
                        {employeeStatusLabel(openedEmployee)}
                      </span>
                      <span className="employee-status-pill employee-status-pill--neutral">
                        {(openedEmployee.application_countries || [])[0] || '—'}
                      </span>
                      <span className="employee-status-pill employee-status-pill--neutral">{employeeAvailability(openedEmployee)}</span>
                      {openedEmployeeReturnRequest?.status === 'pending' ? (
                        <span className="employee-status-pill employee-status-pill--warning">Return requested</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="employee-review-actions" aria-label="Candidate actions">
                  <div className="employee-review-actions-stack">
                    <div className="employee-review-actions-secondary">
                      {canManageOrganizationProcesses &&
                      !openedEmployeeIsUnderProcess &&
                      (!openedEmployeeIsEmployed && !openedEmployeeIsTravelled) &&
                      !openedEmployeeIsReturned ? (
                        <>
                          <select
                            value={openedEmployeeAssignedAgentId}
                            onChange={(event) => {
                              setPageError('')
                              setProcessAgentAssignments((prev) => ({
                                ...prev,
                                [openedEmployee.id]: event.target.value
                              }))
                            }}
                            disabled={readOnly || actionBusyId === openedEmployee.id}
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
                            onClick={() => handleStartProcess(openedEmployee)}
                            disabled={readOnly || actionBusyId === openedEmployee.id || openedEmployee.status !== 'approved' || !openedEmployeeAssignedAgentId}
                          >
                            {actionBusyId === openedEmployee.id ? 'Saving...' : 'Initiate process'}
                          </button>
                        </>
                      ) : null}
                      {(!openedEmployeeIsEmployed && !openedEmployeeIsTravelled) &&
                      !openedEmployeeIsReturned &&
                      !openedEmployeeIsUnderProcess &&
                      openedEmployeeIsAvailable ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleToggleSelectedEmployee(openedEmployee)}
                          title={openedEmployeeIsSelectedByCurrentAgent && !openedEmployeeCanUnselect ? 'Only the selecting account or agent owner can unselect this candidate.' : undefined}
                          disabled={
                            readOnly ||
                            !isAgentSideUser ||
                            actionBusyId === openedEmployee.id ||
                            (openedEmployeeIsSelectedByCurrentAgent && !openedEmployeeCanUnselect)
                          }
                        >
                          {actionBusyId === openedEmployee.id
                            ? 'Saving...'
                            : openedEmployeeIsSelectedByCurrentAgent
                              ? 'Unselect candidate'
                              : 'Select candidate'}
                        </button>
                      ) : null}
                      {openedEmployeeReturnRequest ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setOpenedEmployeeMode((prev) => (prev === 'request' ? 'full' : 'request'))}
                        >
                          {openedEmployeeMode === 'request' ? 'Candidate details' : 'Return request'}
                        </button>
                      ) : null}

                      {(!openedEmployeeIsEmployed && !openedEmployeeIsTravelled) && !openedEmployeeIsReturned ? (
                        <>
                          {isMainAgentAccount && !openedEmployeeIsUnderProcess ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => handleStartProcess(openedEmployee)}
                              disabled={
                                readOnly ||
                                actionBusyId === openedEmployee.id ||
                                !openedEmployeeIsSelectedByCurrentAgent ||
                                openedEmployee.status !== 'approved' ||
                                openedEmployeeIsUnderProcess
                              }
                            >
                              {actionBusyId === openedEmployee.id ? 'Saving...' : 'Proceed to process'}
                            </button>
                          ) : null}

                          {canManageOrganizationProcesses && openedEmployeeIsUnderProcess ? (
                            <button
                              type="button"
                              className="btn-danger"
                              onClick={() => handleDeclineProcess(openedEmployee)}
                              disabled={readOnly || actionBusyId === openedEmployee.id}
                            >
                              {actionBusyId === openedEmployee.id ? 'Saving...' : 'Decline process'}
                            </button>
                          ) : null}

                          {canOverrideProgress && openedEmployeeIsUnderProcess && ((openedEmployee.progress_status?.overall_completion ?? 0) < 100 || !openedEmployee.did_travel) ? (
                            <button
                              type="button"
                              className="btn-info"
                              onClick={() => handleMarkProgressComplete(openedEmployee)}
                              disabled={readOnly || actionBusyId === openedEmployee.id}
                            >
                              {actionBusyId === openedEmployee.id
                                ? 'Saving...'
                                : (openedEmployee.progress_status?.overall_completion ?? 0) >= 100
                                  ? 'Confirm travelled'
                                  : 'Mark progress 100%'}
                            </button>
                          ) : null}

                          {openedEmployeeWorkflowState === 'pending' ? (
                            <>
                              <button type="button" className="btn-success" onClick={() => handleAvailabilityAction(openedEmployee, 'approved', 'Approved')} disabled={actionBusyId === openedEmployee.id || readOnly || isAgentSideUser}>
                                {actionBusyId === openedEmployee.id ? 'Saving...' : 'Approve'}
                              </button>
                              <button type="button" className="btn-danger" onClick={() => handleAvailabilityAction(openedEmployee, 'rejected', 'Rejected')} disabled={actionBusyId === openedEmployee.id || readOnly || isAgentSideUser}>Reject</button>
                              <button type="button" className="btn-warning" onClick={() => handleAvailabilityAction(openedEmployee, 'suspended', 'Suspended')} disabled={actionBusyId === openedEmployee.id || readOnly || isAgentSideUser}>Suspend</button>
                            </>
                          ) : null}

                          {openedEmployeeWorkflowState === 'rejected' || openedEmployeeWorkflowState === 'suspended' ? (
                            <button type="button" className="btn-secondary" onClick={() => handleAvailabilityAction(openedEmployee, 'pending', 'Moved to pending')} disabled={actionBusyId === openedEmployee.id || readOnly || isAgentSideUser}>
                              {actionBusyId === openedEmployee.id ? 'Saving...' : 'Move to pending'}
                            </button>
                          ) : null}

                          {canEditEmployeeRecords ? (
                            <button type="button" className="btn-secondary" onClick={() => handleEdit(openedEmployee.id)} disabled={busyEmployeeId === openedEmployee.id || readOnly}>
                              {busyEmployeeId === openedEmployee.id ? 'Loading...' : 'Edit'}
                            </button>
                          ) : null}

                          <button type="button" className="btn-danger" onClick={() => handleDelete(openedEmployee)} disabled={readOnly || isAgentSideUser || openedEmployeeIsUnderProcess}>Delete</button>
                        </>
                      ) : null}

                      {canApproveOpenedEmployeeReturn ? (
                        <button
                          type="button"
                          className="btn-success"
                          onClick={() => handleApproveEmploymentReturn(openedEmployee)}
                          disabled={actionBusyId === openedEmployee.id || readOnly}
                        >
                          {actionBusyId === openedEmployee.id ? 'Saving...' : 'Approve'}
                        </button>
                      ) : null}
                      {canRefuseOpenedEmployeeReturn ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleRefuseEmployeeReturnRequest(openedEmployee)}
                          disabled={actionBusyId === openedEmployee.id || readOnly}
                        >
                          {actionBusyId === openedEmployee.id ? 'Saving...' : 'Refuse'}
                        </button>
                      ) : null}
                      {canCancelOpenedEmployeeReturnRequest ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleCancelEmployeeReturnRequest(openedEmployee)}
                          disabled={actionBusyId === openedEmployee.id || readOnly}
                        >
                          {actionBusyId === openedEmployee.id ? 'Saving...' : 'Cancel request'}
                        </button>
                      ) : null}
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

                      <button type="button" className="btn-secondary" onClick={() => setOpenedEmployeeId(null)}>Close</button>
                    </div>
                  </div>
                </div>
              </header>

              {openedEmployeeMode === 'request' ? (
                <div className="employee-review-dashboard employee-review-dashboard--request">
                  <section className="employee-review-panel">
                    <div className="employee-review-panel-header">
                      <h3>Commission</h3>
                    </div>
                    <div className="employee-review-kv">
                      <div className="employee-review-kv-row">
                        <span>Status</span>
                        <strong>{employedCommissionLabel(openedEmployee)}</strong>
                      </div>
                      <p className="muted-text">Collection from the agent side to the organization is a future settlement concept.</p>
                    </div>
                  </section>

                  <section className="employee-review-panel">
                    <div className="employee-review-panel-header">
                      <h3>Return request</h3>
                    </div>
                    {openedEmployeeReturnRequest ? (
                      <div className="employee-review-activity">
                        <div className="employee-review-activity-header">
                          <span className={`employee-status-pill employee-status-pill--${openedEmployeeReturnRequest.status === 'pending' ? 'warning' : openedEmployeeReturnRequest.status === 'cancelled' || openedEmployeeReturnRequest.status === 'refused' ? 'danger' : 'neutral'}`}>
                            {prettyStatus(openedEmployeeReturnRequest.status)}
                          </span>
                        </div>
                        <div className="employee-review-activity-grid">
                          <div>
                            <div className="employee-review-activity-label">Requested by</div>
                            <div className="employee-review-activity-value">{openedEmployeeReturnRequest.requested_by_username || '--'}</div>
                          </div>
                          <div>
                            <div className="employee-review-activity-label">Requested at</div>
                            <div className="employee-review-activity-value">{formatDateTime(openedEmployeeReturnRequest.requested_at)}</div>
                          </div>
                          <div>
                            <div className="employee-review-activity-label">Responded by</div>
                            <div className="employee-review-activity-value">{openedEmployeeReturnRequest.approved_by_username || '--'}</div>
                          </div>
                          <div>
                            <div className="employee-review-activity-label">Responded at</div>
                            <div className="employee-review-activity-value">{formatDateTime(openedEmployeeReturnRequest.approved_at)}</div>
                          </div>
                          <div>
                            <div className="employee-review-activity-label">Remark</div>
                            <div
                              className="employee-review-activity-value employee-review-activity-value--truncate"
                              title={openedEmployeeReturnRequest.remark || ''}
                            >
                              {openedEmployeeReturnRequest.remark || '--'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="muted-text">None</p>
                    )}
                  </section>
                </div>
              ) : (
                <>
                  <div className="employee-review-dashboard">
                    <section className="employee-review-panel employee-review-panel--overview">
                      <div className="employee-review-panel-header">
                        <h3 className="employee-review-panel-title">
                          <span className="employee-review-panel-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                              <path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              <path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </span>
                          Candidate Overview
                        </h3>
                      </div>
                      <div className="employee-review-kv employee-review-kv--icon-list">
                        <div className="employee-review-kv-row">
                          <span className="employee-review-kv-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                              <path d="M7 3v3M17 3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              <path d="M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                              <path d="M8 11h3M8 15h3M13 11h3M13 15h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </span>
                          <span className="employee-review-kv-label">Age</span>
                          <span className="employee-review-kv-value">{openedEmployee.age || '—'}</span>
                        </div>
                        <div className="employee-review-kv-row">
                          <span className="employee-review-kv-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" stroke="currentColor" strokeWidth="2" />
                              <path d="m8.5 12.5 2.2 2.2 4.8-5.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <span className="employee-review-kv-label">Availability</span>
                          <span className="employee-review-kv-value">{employeeAvailability(openedEmployee)}</span>
                        </div>
                        <div className="employee-review-kv-row">
                          <span className="employee-review-kv-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                              <path d="M6.5 3h2l1.2 4.8-1.6 1.6a14 14 0 0 0 6.1 6.1l1.6-1.6L21 15.5v2A2.5 2.5 0 0 1 18.5 20 15.5 15.5 0 0 1 4 5.5 2.5 2.5 0 0 1 6.5 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <span className="employee-review-kv-label">Phone</span>
                          <span className="employee-review-kv-value">{openedEmployee.phone || openedEmployee.mobile_number || '—'}</span>
                        </div>
                        <div className="employee-review-kv-row">
                          <span className="employee-review-kv-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                              <path d="M4 6h16v12H4V6Z" stroke="currentColor" strokeWidth="2" />
                              <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <span className="employee-review-kv-label">Email</span>
                          <span className="employee-review-kv-value">{openedEmployee.email || '—'}</span>
                        </div>
                        <div className="employee-review-kv-row">
                          <span className="employee-review-kv-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" />
                              <path d="M20 20a8 8 0 0 0-16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </span>
                          <span className="employee-review-kv-label">Registered by</span>
                          <span className="employee-review-kv-value">{openedEmployee.registered_by_username || '—'}</span>
                        </div>
                        {openedEmployee.selection_state?.selection ? (
                          <div className="employee-review-kv-row">
                            <span className="employee-review-kv-icon" aria-hidden="true">
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                                <path d="M12 21s7-4.35 7-10a7 7 0 0 0-14 0c0 5.65 7 10 7 10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                                <path d="M9.5 11.5 11 13l3.5-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                            <span className="employee-review-kv-label">{openedEmployee.selection_state.selection.status === 'under_process' ? 'Process owner' : 'Selected by'}</span>
                            <span className="employee-review-kv-value">{openedEmployee.selection_state.selection.agent_name || '—'}</span>
                          </div>
                        ) : null}
                        <div className="employee-review-kv-row">
                          <span className="employee-review-kv-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" stroke="currentColor" strokeWidth="2" />
                              <path d="M2 12h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              <path d="M12 2a15 15 0 0 1 0 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              <path d="M12 2a15 15 0 0 0 0 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </span>
                          <span className="employee-review-kv-label">Destination</span>
                          <span className="employee-review-kv-value">{openedEmployee.application_countries?.join(', ') || '—'}</span>
                        </div>
                      </div>
                    </section>

                    <section className="employee-review-panel employee-review-panel--progress">
                      <div className="employee-review-panel-header">
                        <h3 className="employee-review-panel-title">
                          <span className="employee-review-panel-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                              <path d="M4 18V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              <path d="M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              <path d="M6 15l4-4 3 3 6-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M10 11h0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                              <path d="M13 14h0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                              <path d="M19 6h0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                            </svg>
                          </span>
                          Application Progress
                        </h3>
                      </div>
                      <div className="employee-review-progress">
                        <div className="employee-review-progress-left">
                          <div className="employee-progress-donut" aria-label={`Progress ${openedEmployeeProgress.overallProgress}%`}>
                            <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
                              <circle cx="60" cy="60" r={openedEmployeeProgress.radius} className="employee-progress-track" />
                              <circle
                                cx="60"
                                cy="60"
                                r={openedEmployeeProgress.radius}
                                className="employee-progress-value"
                                style={{ stroke: `var(--employee-progress-tone, ${openedEmployeeProgress.tone})` }}
                                strokeDasharray={openedEmployeeProgress.circumference}
                                strokeDashoffset={openedEmployeeProgress.dashOffset}
                              />
                            </svg>
                            <div className="employee-progress-donut-label">
                              <strong>{openedEmployeeProgress.overallProgress}%</strong>
                              <span>Overall</span>
                            </div>
                          </div>

                          <div className="employee-review-kv employee-review-kv--icon-list employee-review-kv--metrics" aria-label="Progress metrics">
                            <div className="employee-review-kv-row">
                              <span className="employee-review-kv-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                                  <path d="M4 19V5a2 2 0 0 1 2-2h8l6 6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                                  <path d="M14 3v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                                </svg>
                              </span>
                              <span className="employee-review-kv-label">Fields</span>
                              <span className="employee-review-kv-value">{openedEmployee.progress_status?.field_completion ?? 0}%</span>
                            </div>
                            <div className="employee-review-kv-row">
                              <span className="employee-review-kv-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                                  <path d="M9 3h6l1 2h4v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5h4l1-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                                  <path d="M8 11h8M8 15h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                              </span>
                              <span className="employee-review-kv-label">Documents</span>
                              <span className="employee-review-kv-value">{openedEmployee.progress_status?.document_completion ?? 0}%</span>
                            </div>
                            <div className="employee-review-kv-row">
                              <span className="employee-review-kv-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" stroke="currentColor" strokeWidth="2" />
                                  <path d="m8.5 12.5 2.2 2.2 4.8-5.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                              <span className="employee-review-kv-label">Status</span>
                              <span className="employee-review-kv-value">{employeeStatusLabel(openedEmployee)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="employee-review-progress-divider" aria-hidden="true" />

                        <ol className="employee-review-stepper employee-review-stepper--progress" aria-label="Progress steps">
                          {[
                            {
                              key: 'profile',
                              label: 'Profile Completed',
                              done: (openedEmployee.progress_status?.field_completion ?? 0) >= 100,
                              date: openedEmployee?.created_at
                            },
                            {
                              key: 'documents',
                              label: 'Documents Verified',
                              done: (openedEmployee.progress_status?.document_completion ?? 0) >= 100,
                              date: resolveLatestDate(openedEmployeeDocuments, ['verified_at', 'updated_at', 'created_at'])
                            },
                            {
                              key: 'selected',
                              label: 'Selected',
                              done: Boolean(openedEmployee.selection_state?.selection),
                              date:
                                openedEmployee.selection_state?.selection?.created_at ||
                                openedEmployee.selection_state?.selection?.selected_at ||
                                ''
                            },
                            {
                              key: 'travel',
                              label: 'Traveled',
                              done: String(openedEmployee.travel_status || 'pending') !== 'pending',
                              date: openedEmployee.departure_date || openedEmployee.travelled_at || openedEmployee.traveled_at || ''
                            },
                            {
                              key: 'arrived',
                              label: 'Arrived',
                              done: Boolean(openedEmployee.did_travel) || String(openedEmployee.travel_status || '').includes('arrived'),
                              date: openedEmployee.arrived_at || openedEmployee.arrival_date || ''
                            },
                            {
                              key: 'returned',
                              label: 'Returned',
                              done: openedEmployeeIsReturned,
                              date:
                                openedEmployee.return_request?.approved_at ||
                                openedEmployee.returned_at ||
                                openedEmployee.returned_on ||
                                ''
                            }
                          ].map((step) => (
                            <li key={step.key} className={`employee-review-step${step.done ? ' is-done' : ''}`}>
                              <span className="employee-review-step-icon" aria-hidden="true">
                                {step.done ? (
                                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
                                    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                ) : null}
                              </span>
                              <div className="employee-review-step-copy">
                                <span className="employee-review-step-label">{step.label}</span>
                                <span className="employee-review-step-date muted-text">
                                  {formatShortDate(step.date)}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </section>

                    <section className="employee-review-panel employee-review-panel--finance">
                      <div className="employee-review-panel-header">
                        <h3 className="employee-review-panel-title">
                          <span className="employee-review-panel-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                              <path d="M12 2v20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              <path d="M17 6.5c0-2-2.2-3.5-5-3.5s-5 1.5-5 3.5 2.2 3.5 5 3.5 5 1.5 5 3.5-2.2 3.5-5 3.5-5-1.5-5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          Commission / Finance
                        </h3>
                      </div>
                      <div className="employee-review-finance-cards">
                        <div className={`employee-review-finance-card${String(employedCommissionLabel(openedEmployee)).toLowerCase().includes('pending') ? ' is-pending' : ''}`}>
                          <div className="employee-review-kv employee-review-kv--metrics">
                            <div className="employee-review-kv-row">
                              <span className="employee-review-kv-label">Status</span>
                              <span className="employee-review-kv-value">{employedCommissionLabel(openedEmployee)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="employee-review-finance-card">
                          <div className="employee-review-kv employee-review-kv--metrics">
                            <div className="employee-review-kv-row">
                              <span className="employee-review-kv-label">Settlement</span>
                              <span className="employee-review-kv-value">
                                Collection from agent side to the organization is a future settlement concept.
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>

                  <section className="employee-review-panel employee-review-panel--documents">
                    <div className="employee-review-panel-header employee-review-panel-header--split employee-review-panel-header--documents">
                      <h3 className="employee-review-panel-title">
                        <span className="employee-review-panel-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                            <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                            <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          </svg>
                        </span>
                        Documents
                      </h3>
                    </div>
                    <div className="employee-review-doc-filters">
                      <div className="employee-review-tabs" role="tablist" aria-label="Document filters">
                        {[
                          { id: 'all', label: 'All' },
                          { id: 'passport', label: 'Passport' },
                          { id: 'contract', label: 'Contract' },
                          { id: 'medical', label: 'Medical' },
                          { id: 'photos', label: 'Photos' },
                          { id: 'returns', label: 'Returns' },
                          { id: 'other', label: 'Other' }
                        ].map((tab) => (
                          <span
                            key={tab.id}
                            role="tab"
                            className={`employee-review-tab${reviewDocumentsTab === tab.id ? ' is-active' : ''}`}
                            onClick={() => setReviewDocumentsTab(tab.id)}
                            aria-selected={reviewDocumentsTab === tab.id}
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                setReviewDocumentsTab(tab.id)
                              }
                            }}
                          >
                            {tab.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="employee-review-doc-scroller-wrap" aria-label="Employee documents">
                      {reviewDocumentsFiltered.length === 0 ? (
                        <p className="muted-text employee-review-empty">No documents found.</p>
                      ) : (
                        <>
                          <div className="employee-review-doc-scroller" ref={reviewDocsScrollerRef} onScroll={scheduleReviewDocsScrollStateUpdate}>
                            <div className="employee-review-doc-grid">
                              {reviewDocumentsCards}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="employee-review-doc-scroll-btn employee-review-doc-scroll-btn--left"
                            onClick={scrollReviewDocumentsPrev}
                            disabled={!reviewDocsCanScrollLeft}
                            aria-label="Scroll documents left"
                          >
                            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                              <path d="M15 18 9 12l6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="employee-review-doc-scroll-btn"
                            onClick={scrollReviewDocumentsNext}
                            disabled={!reviewDocsCanScrollRight}
                            aria-label="Scroll documents right"
                          >
                            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                              <path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </section>

                  <section className="employee-review-panel employee-review-panel--activity">
                    <div className="employee-review-panel-header">
                      <h3 className="employee-review-panel-title">
                        <span className="employee-review-panel-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" stroke="currentColor" strokeWidth="2" />
                            <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        Activity / Return requests
                      </h3>
                    </div>
                    {openedEmployeeReturnRequest ? (
                      <div className="employee-review-activity employee-review-activity--timeline">
                        <ol className="employee-review-stepper employee-review-stepper--progress employee-review-stepper--activity" aria-label="Return request activity">
                          <li className="employee-review-step is-done">
                            <span className="employee-review-step-icon" aria-hidden="true">
                              <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
                                <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                            <div className="employee-review-step-copy">
                              <span className="employee-review-step-label">{formatShortDate(openedEmployeeReturnRequest.requested_at)}</span>
                              <span className="employee-review-step-date muted-text">{formatShortTime(openedEmployeeReturnRequest.requested_at)}</span>
                            </div>
                          </li>
                        </ol>
                        <div className="employee-review-activity-body">
                          <div className="employee-review-activity-header">
                            <div className="employee-review-activity-title-row">
                              <strong className="employee-review-activity-title">Return Request</strong>
                              <span
                                className={`employee-status-pill employee-status-pill--${
                                  openedEmployeeReturnRequest.status === 'pending'
                                    ? 'warning'
                                    : openedEmployeeReturnRequest.status === 'cancelled' || openedEmployeeReturnRequest.status === 'refused'
                                      ? 'danger'
                                      : 'neutral'
                                }`}
                              >
                                {prettyStatus(openedEmployeeReturnRequest.status)}
                              </span>
                            </div>
                          </div>
                          <div className="employee-review-activity-grid">
                            <div>
                              <div className="employee-review-activity-label">Requested by</div>
                              <div className="employee-review-activity-value">{openedEmployeeReturnRequest.requested_by_username || '--'}</div>
                            </div>
                            <div>
                              <div className="employee-review-activity-label">Requested at</div>
                              <div className="employee-review-activity-value">{formatDateTime(openedEmployeeReturnRequest.requested_at)}</div>
                            </div>
                            <div>
                              <div className="employee-review-activity-label">Responded by</div>
                              <div className="employee-review-activity-value">{openedEmployeeReturnRequest.approved_by_username || '--'}</div>
                            </div>
                            <div>
                              <div className="employee-review-activity-label">Responded at</div>
                              <div className="employee-review-activity-value">{formatDateTime(openedEmployeeReturnRequest.approved_at)}</div>
                            </div>
                            {openedEmployee.returned_recorded_by_username ? (
                              <div>
                                <div className="employee-review-activity-label">Returned recorded by</div>
                                <div className="employee-review-activity-value">{openedEmployee.returned_recorded_by_username}</div>
                              </div>
                            ) : null}
                            <div>
                              <div className="employee-review-activity-label">Remark</div>
                              <div
                                className="employee-review-activity-value employee-review-activity-value--truncate"
                                title={openedEmployeeReturnRequest.remark || ''}
                              >
                                {openedEmployeeReturnRequest.remark || '--'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="muted-text employee-review-empty">No return requests found.</p>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            className="employee-review-nav-btn employee-review-nav-btn--next"
            onClick={(event) => {
              event.stopPropagation()
              navigateOpenedEmployee('next')
            }}
            disabled={!nextOpenedEmployee}
            aria-label="Next candidate"
            title={nextOpenedEmployee ? `Next: ${nextOpenedEmployee.full_name}` : 'No next candidate'}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      ) : null}
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
      {showScrollToTop || hasSelectedEmployeeCards ? (
        <div
          className="employees-scroll-wheel"
          role="presentation"
          data-has-top="0"
          data-has-right={rightDivisionRole ? '1' : '0'}
          data-has-bottom={hasSelectedEmployeeCards ? '1' : '0'}
          data-has-left={hasWheelUnselectTargets ? '1' : '0'}
          data-right-role={rightDivisionRole}
        >
          <button
            type="button"
            className="employees-scroll-wheel-center"
            aria-label="Scroll to top"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              scrollEmployeesToTop()
            }}
          >
            <svg className="employees-scroll-wheel-center-icon" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
              <path className="employees-scroll-wheel-center-icon-stem" d="M10.75 18.25V10.2c0-.55.45-1 1-1h.5c.55 0 1 .45 1 1v8.05c0 .55-.45 1-1 1h-.5c-.55 0-1-.45-1-1Z" />
              <path className="employees-scroll-wheel-center-icon-head" d="M12 4.5 5 12h14L12 4.5Z" />
            </svg>
          </button>
          <svg className="employees-scroll-wheel-hit" viewBox="0 0 128 128" aria-hidden="true">
            <path
              className="employees-scroll-wheel-hit-seg employees-scroll-wheel-hit-seg--top"
              d={buildWheelSectorPath(225, 315, 30)}
              onClick={undefined}
            />
            <path
              className="employees-scroll-wheel-hit-seg employees-scroll-wheel-hit-seg--right"
              d={buildWheelSectorPath(315, 45, 30)}
              onClick={
                rightDivisionRole === 'start-process'
                  ? handleScrollWheelStartProcessSelectedEmployees
                  : rightDivisionRole === 'select'
                    ? handleScrollWheelSelectEmployees
                    : undefined
              }
            />
            {rightDivisionRole ? (
              <g className="employees-scroll-wheel-seg-icon employees-scroll-wheel-seg-icon--right" aria-hidden="true">
                <g transform="translate(104 56)">
                  <path d="M2 4h10M2 8h10M2 12h6" />
                  <path d="M11.8 11.2 13.2 12.6 15.6 10.2" />
                </g>
              </g>
            ) : null}
            <path
              className="employees-scroll-wheel-hit-seg employees-scroll-wheel-hit-seg--bottom"
              d={buildWheelSectorPath(45, 135, 30)}
              onClick={hasSelectedEmployeeCards ? handleScrollWheelClearCardSelection : undefined}
            />
            {hasSelectedEmployeeCards ? (
              <g className="employees-scroll-wheel-seg-icon employees-scroll-wheel-seg-icon--bottom" aria-hidden="true">
                <g transform="translate(58 103)">
                  <path d="M2 4h10M2 8h10M2 12h6" />
                  <path d="M11.8 11.2 13.2 12.6 15.6 10.2" />
                </g>
              </g>
            ) : null}
            <path
              className="employees-scroll-wheel-hit-seg employees-scroll-wheel-hit-seg--left"
              d={buildWheelSectorPath(135, 225, 30)}
              onClick={hasWheelUnselectTargets ? handleScrollWheelUnselectEmployees : undefined}
            />
            {hasWheelUnselectTargets ? (
              <g className="employees-scroll-wheel-seg-icon employees-scroll-wheel-seg-icon--left" aria-hidden="true">
                <g transform="translate(8 56)">
                  <path d="M2 4h10M2 8h10M2 12h6" />
                  <path d="M11.8 11.2 13.2 12.6 15.6 10.2" />
                </g>
              </g>
            ) : null}
          </svg>
        </div>
      ) : null}
    </div>
    )
  )
}
