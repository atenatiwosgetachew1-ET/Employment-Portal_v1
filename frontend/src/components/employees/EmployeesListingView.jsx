import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useUiFeedback } from '../../context/UiFeedbackContext'
import * as employeesService from '../../services/employeesService'
import { normalizeSearchValue } from '../../utils/filtering'

import {
  employeeCardMasonryDebugEnabled,
  employeeCardMasonryDebugLog,
  employeeCardMasonryAttachScrollLogger,
  EMPLOYEE_VIEW_TABS,
  EMPLOYEE_TAG_FILTER_OPTIONS,
  EMPLOYEE_CARDS_BATCH_SIZE,
  fileLabel,
  attachmentFileAllowed,
  isEmployeeReturned,
  isEmployeeEmployed,
  isEmployeeUnderProcess,
  isEmployeeSelected,
  patchEmployeeCollection,
  employedEmployeesHelpText,
  returnedEmployeesHelpText,
  isAgentSideWorkspace,
  selectedEmployeesHelpText,
  underProcessEmployeesHelpText,
  errorMessage,
  readStoredSettlements,
  filterCandidateList,
  resolvedProcessAgentId,
  readTravelConfirmationDeclinedIds,
  readTravelConfirmationConfirmedIds,
  writeTravelConfirmationDeclinedIds,
  writeTravelConfirmationConfirmedIds,
  fetchAllEmployeePages,
  employeeBelongsToCurrentAgent,
  employeeAvailability,
  isEmployeeInEmployedStage,
  formatDateForPrompt,
  employeeWorkflowState
} from '../../utils/employeeHelpers'
import { ATTACHMENT_FIELDS } from '../../constants/employeeOptions'

import EmployeeCard from './EmployeeCard'
import EmployeeFilters from './EmployeeFilters'
import { useDocumentPreview } from '../../context/PortalOverlayContext'
import EmployeeReturnModal from './EmployeeReturnModal'
import EmployeeReviewModal from './EmployeeReviewModal'
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
  const [actionBusyId, setActionBusyId] = useState(null)
  const [formOptions, setFormOptions] = useState({ destination_countries: [], salary_options_by_country: {}, agent_options: [] })
  const [processAgentAssignments, setProcessAgentAssignments] = useState({})
  const [openedEmployeeId, setOpenedEmployeeId] = useState(null)
  const [openedEmployeeMode, setOpenedEmployeeMode] = useState('full')
  const [expandedEmployeeCardId, setExpandedEmployeeCardId] = useState(null)
  const [expandedEmployeeCardReadyId, setExpandedEmployeeCardReadyId] = useState(null)
  const employeeCardsGridRef = useRef(null)
  const employeeCardItemRefs = useRef(new Map())
  const employeeCardResizeObserverRef = useRef(null)

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
  const { openDocumentPreview, closeDocumentPreview, previewDocument } = useDocumentPreview()
  const [travelConfirmationDeclinedIds, setTravelConfirmationDeclinedIds] = useState(() => readTravelConfirmationDeclinedIds())
  const [travelConfirmationConfirmedIds, setTravelConfirmationConfirmedIds] = useState(() => readTravelConfirmationConfirmedIds())
  const [settledCommissionIds, setSettledCommissionIds] = useState([])
  const [hiddenEmployeeIds, setHiddenEmployeeIds] = useState(() => new Set())
  const hiddenEmployeeIdsRef = useRef(new Set())

  const hideEmployeeId = useCallback((employeeId) => {
    if (!employeeId) return
    const idStr = String(employeeId)
    const idNum = Number(employeeId)
    setHiddenEmployeeIds((prev) => {
      const next = new Set(prev)
      next.add(idStr)
      if (!Number.isNaN(idNum)) next.add(idNum)
      hiddenEmployeeIdsRef.current = next
      return next
    })
    setEmployeesData((prev) => {
      if (!prev) return prev
      const nextResults = (prev.results || []).filter(
        (emp) => String(emp.id) !== idStr && emp.id !== idNum
      )
      return {
        ...prev,
        count: Math.max(0, (typeof prev.count === 'number' ? prev.count : prev.results.length) - ((prev.results || []).length - nextResults.length)),
        results: nextResults
      }
    })
    setRequestedReturns((prev) =>
      prev.filter((emp) => String(emp.id) !== idStr && emp.id !== idNum)
    )
  }, [])
  const attachmentLabels = useMemo(() => {
    return ATTACHMENT_FIELDS.reduce((acc, field) => {
      acc[field.key] = field.label
      return acc
    }, {})
  }, [])
  const [floatingAttachmentPreview, setFloatingAttachmentPreview] = useState(null)
  const floatingAttachmentPreviewCloseTimer = useRef(null)
  const floatingAttachmentPreviewPopoverRef = useRef(null)
  const [openEmployeeCardMenuId, setOpenEmployeeCardMenuId] = useState(null)

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
  const hasLoadedOnceRef = useRef(false)

  const canManageEmployees = Boolean(user?.feature_flags?.employees_enabled)
  const readOnly = Boolean(user?.is_read_only || user?.is_suspended)
  const isAgentSideUser = isAgentSideWorkspace(user)
  const canEditEmployeeRecords = !isAgentSideUser
  const isMainAgentAccount = user?.role === 'customer'
  const canManageOrganizationProcesses = user?.role === 'superadmin' || user?.role === 'admin'
  const canOverrideProgress = canManageOrganizationProcesses
  const selectedScope = isAgentSideUser ? 'mine' : 'organization'

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

  useEffect(() => {
    setHiddenEmployeeIds(new Set())
    hiddenEmployeeIdsRef.current = new Set()
  }, [currentView])

  const setView = useCallback((nextView, { replace = false } = {}) => {
    const next = new URLSearchParams(searchParams)
    const current = (searchParams.get('view') || '').trim()
    if (current === nextView) return
    next.set('view', nextView)
    setSearchParams(next, { replace })
  }, [searchParams, setSearchParams])
  const isTravelConfirmationDeclined = useCallback(
    (employee) => travelConfirmationDeclinedIds.includes(employee?.id),
    [travelConfirmationDeclinedIds]
  )

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
    const shouldShowLoading = !hasLoadedOnceRef.current && !employeesData
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
          .filter((employee) => isVisibleForCurrentAgent(employee) && (isEmployeeReturned(employee) || employee.return_request?.status === 'pending'))
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
      if (data && Array.isArray(data.results)) {
        const filteredResults = data.results.filter(
          (emp) => !hiddenEmployeeIdsRef.current.has(String(emp.id)) && !hiddenEmployeeIdsRef.current.has(Number(emp.id))
        )
        const countDiff = data.results.length - filteredResults.length
        setEmployeesData({
          ...data,
          count: Math.max(0, (typeof data.count === 'number' ? data.count : data.results.length) - countDiff),
          results: filteredResults
        })
      } else {
        setEmployeesData(data)
      }
    } catch (err) {
      setPageError(err.message || 'Failed to load employees')
      setEmployeesData(null)
    } finally {
      hasLoadedOnceRef.current = true
      if (shouldShowLoading) setLoading(false)
    }
  }, [currentView, filters.q, isAgentSideUser, loadFormOptions, page, selectedScope, travelConfirmationDeclinedIds, travelConfirmationConfirmedIds])

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
        fetchAllEmployeePages({
          q: search,
          employedScope: scope
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
      setRequestedReturns(
        (data.results || [])
          .filter((employee) => employee.return_request?.status === 'pending')
          .filter((employee) => !hiddenEmployeeIdsRef.current.has(String(employee.id)) && !hiddenEmployeeIdsRef.current.has(Number(employee.id)))
      )
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

  const patchEmployeeCollections = useCallback((employeeId, updater) => {
    setEmployeesData((prev) => {
      if (!prev) return prev
      const nextResults = prev.results
        .map((employee) => (String(employee.id) === String(employeeId) || Number(employee.id) === Number(employeeId) ? updater(employee) : employee))
        .filter(Boolean)
      const countDiff = prev.results.length - nextResults.length
      return {
        ...prev,
        count: Math.max(0, (typeof prev.count === 'number' ? prev.count : prev.results.length) - countDiff),
        results: nextResults
      }
    })

    setRequestedReturns((prev) =>
      prev
        .map((employee) => (String(employee.id) === String(employeeId) || Number(employee.id) === Number(employeeId) ? updater(employee) : employee))
        .filter(Boolean)
    )
  }, [])



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
      if (openedEmployeeId === employee.id) setOpenedEmployeeId(null)
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

  const openReturnRequestModal = useCallback(async () => {
    setReturnRequestModalOpen(true)
    setReturnRequestError('')
    setReturnRequestSearch('')
    setSelectedReturnEmployeeId('')
    setReturnRequestRemark('')
    setReturnRequestEvidenceFiles([null, null, null])
    await loadReturnRequestEmployees('')
  }, [loadReturnRequestEmployees])

  useEffect(() => {
    const handlePortalOpenReturn = () => {
      openReturnRequestModal()
    }
    window.addEventListener('portal:open-return-request', handlePortalOpenReturn)
    return () => {
      window.removeEventListener('portal:open-return-request', handlePortalOpenReturn)
    }
  }, [openReturnRequestModal])

  const closeReturnRequestModal = useCallback(() => {
    setReturnRequestModalOpen(false)
    setReturnRequestError('')
    setReturnRequestSearch('')
    setSelectedReturnEmployeeId('')
    setReturnRequestRemark('')
    setReturnRequestEvidenceFiles([null, null, null])
  }, [])

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
      showToast('Return request submitted successfully.', { tone: 'success' })
      localStorage.setItem('portal:cross_tab_sync', String(Date.now()))
      window.dispatchEvent(new Event('notifications:updated'))
      window.dispatchEvent(new Event('portal:refresh-candidates'))
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
    if (currentView === 'employed') {
      hideEmployeeId(employee.id)
    }
    setPageError('')
    setNotice('')
    try {
      await employeesService.approveEmployeeReturnRequest(employee.id)
      hideEmployeeId(employee.id)
      patchEmployeeCollections(employee.id, (current) => {
        if (currentView === 'employed') return null
        return {
          ...current,
          returned_from_employment: true,
          return_status: 'returned',
          return_request: current.return_request
            ? { ...current.return_request, status: 'approved' }
            : { status: 'approved' }
        }
      })
      setRequestedReturns((prev) => prev.filter((item) => String(item.id) !== String(employee.id) && item.id !== Number(employee.id)))
      if (currentView === 'employed' && openedEmployeeId === employee.id) {
        setOpenedEmployeeId(null)
      }
      localStorage.removeItem(`notification_remind_return_${employee.id}`)
      localStorage.setItem('portal:cross_tab_sync', String(Date.now()))
      window.dispatchEvent(new Event('notifications:updated'))
      window.dispatchEvent(new Event('portal:refresh-candidates'))
      setNotice('Return request approved and employee moved to Returned list.')
      showToast('Return request approved.', { tone: 'success' })
      await loadEmployees(currentView)
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
    if (currentView === 'returned') {
      hideEmployeeId(employee.id)
    }
    setPageError('')
    setNotice('')
    try {
      await employeesService.refuseEmployeeReturnRequest(employee.id)
      hideEmployeeId(employee.id)
      patchEmployeeCollections(employee.id, (current) => {
        if (currentView === 'returned') return null
        return {
          ...current,
          return_request: current.return_request
            ? { ...current.return_request, status: 'refused' }
            : null
        }
      })
      setRequestedReturns((prev) => prev.filter((item) => String(item.id) !== String(employee.id) && item.id !== Number(employee.id)))
      if (currentView === 'returned' && openedEmployeeId === employee.id) {
        setOpenedEmployeeId(null)
      }
      localStorage.removeItem(`notification_remind_return_${employee.id}`)
      localStorage.setItem('portal:cross_tab_sync', String(Date.now()))
      window.dispatchEvent(new Event('notifications:updated'))
      window.dispatchEvent(new Event('portal:refresh-candidates'))
      setNotice('Return request refused.')
      showToast('Return request refused.', { tone: 'info' })
      await loadEmployees(currentView)
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
    if (currentView === 'returned') {
      hideEmployeeId(employee.id)
    }
    setPageError('')
    setNotice('')
    try {
      await employeesService.cancelEmployeeReturnRequest(employee.id)
      hideEmployeeId(employee.id)
      patchEmployeeCollections(employee.id, (current) => {
        if (currentView === 'returned') return null
        return {
          ...current,
          return_request: null
        }
      })
      setRequestedReturns((prev) => prev.filter((item) => String(item.id) !== String(employee.id) && item.id !== Number(employee.id)))
      if (currentView === 'returned' && openedEmployeeId === employee.id) {
        setOpenedEmployeeId(null)
      }
      localStorage.removeItem(`notification_remind_return_${employee.id}`)
      localStorage.setItem('portal:cross_tab_sync', String(Date.now()))
      window.dispatchEvent(new Event('notifications:updated'))
      window.dispatchEvent(new Event('portal:refresh-candidates'))
      setNotice('Return request cancelled.')
      showToast('Return request cancelled.', { tone: 'info' })
      await loadEmployees(currentView)
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
    if (currentView === 'returned') {
      hideEmployeeId(employee.id)
    }
    setPageError('')
    setNotice('')
    try {
      await employeesService.updateEmployee(employee.id, {
        returned_from_employment: false
      })
      hideEmployeeId(employee.id)
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
      if (currentView === 'returned' && openedEmployeeId === employee.id) {
        setOpenedEmployeeId(null)
      }
      localStorage.removeItem(`notification_remind_return_${employee.id}`)
      localStorage.setItem('portal:cross_tab_sync', String(Date.now()))
      window.dispatchEvent(new Event('notifications:updated'))
      window.dispatchEvent(new Event('portal:refresh-candidates'))
      showToast('Employee moved back to Employed.', { tone: 'success' })
      await loadEmployees(currentView)
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
      showToast(`Employee ${actionLabel.toLowerCase()} successfully.`, { tone: 'success' })
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
        showToast('Candidate removed from Selected.', { tone: 'info' })
        patchEmployeeCollections(employee.id, (emp) => ({
          ...emp,
          selection_state: {
            ...emp.selection_state,
            selected_by_current_agent: false,
            can_unselect: false,
            selection: null
          }
        }))
        if (currentView === 'selected') {
          patchEmployeeCollections(employee.id, () => null)
        }
      } else {
        const res = await employeesService.selectEmployee(employee.id)
        showToast('Candidate added to Selected.', { tone: 'success' })
        patchEmployeeCollections(employee.id, (emp) => ({
          ...emp,
          selection_state: {
            ...emp.selection_state,
            selected_by_current_agent: true,
            can_unselect: true,
            selection: res?.selection || emp.selection_state?.selection || {}
          }
        }))
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
      showToast(nextProcessNotice, { tone: 'success' })
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
      showToast('Employee removed from Under process Employees and returned to Selected Employees.', { tone: 'info' })
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
        showToast(
          didTravel
            ? 'Employee travel confirmed and moved into Employed.'
            : 'Employee returned to Under process until travel is confirmed.',
          { tone: didTravel ? 'success' : 'info' }
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
      showToast(
        didTravel
          ? 'Employee progress marked as 100% and travel confirmed.'
          : 'Employee progress marked as 100%. Travel remains pending.',
        { tone: 'success' }
      )
      await loadEmployees(currentView, nextDeclinedIds, nextConfirmedIds)
    } catch (err) {
      setPageError(err.message || 'Could not mark employee progress complete')
    } finally {
      setActionBusyId(null)
    }
  }

  const employees = useMemo(() => employeesData?.results ?? [], [employeesData])
  const total = useMemo(() => employeesData?.count ?? employees.length, [employeesData, employees.length])
  const hasNext = useMemo(() => Boolean(employeesData?.next), [employeesData])
  const hasPrev = useMemo(() => Boolean(employeesData?.previous), [employeesData])
  const canProgressivelyRenderEmployeeCards = currentView === 'list'

  const visibleEmployees = useMemo(() => {
    const list = employees
      .filter((emp) => !hiddenEmployeeIds.has(String(emp.id)) && !hiddenEmployeeIds.has(Number(emp.id)))
      .map((employee) => ({
        ...employee,
        settled_commission: employee?.settled_commission || settledCommissionIds.includes(String(employee.id))
      }))
    return filterCandidateList(list, filters)
  }, [employees, filters, hiddenEmployeeIds, settledCommissionIds])

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
        showToast(`${unmarkedIds.length} candidate(s) marked as Selected.`, { tone: 'success' })
        setSelectedEmployeeCardIds(new Set())
        await loadEmployees(currentView)
      } catch (err) {
        setPageError(err.message || 'Could not mark selected employees')
      } finally {
        setActionBusyId(null)
      }
    })()
  }, [confirm, currentView, hasWheelSelectTargets, loadEmployees, selectedEmployeeCardIds, showToast, visibleEmployeesById])

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
        showToast(`${targetIds.length} candidate(s) removed from Selected.`, { tone: 'info' })
        setSelectedEmployeeCardIds(new Set())
        await loadEmployees(currentView === 'selected' ? 'selected' : currentView)
      } catch (err) {
        setPageError(err.message || 'Could not unselect employees')
      } finally {
        setActionBusyId(null)
      }
    })()
  }, [confirm, currentView, hasWheelUnselectTargets, loadEmployees, selectedEmployeeCardIds, showToast, visibleEmployeesById])

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
        showToast(`Process started for ${selectedEmployees.length} candidate(s).`, { tone: 'success' })
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
    showToast,
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

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleEmployeeModalKeyDown = (event) => {
      const activeElement = document.activeElement
      const isTypingTarget = activeElement?.matches?.('input, textarea, select, [contenteditable="true"]')
      if (isTypingTarget) return

      if (event.key === 'Escape') {
        event.preventDefault()
        setOpenedEmployeeId(null)
        return
      }

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
    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleEmployeeModalKeyDown, true)
    }
  }, [navigateOpenedEmployee, openedEmployee, previewDocument])

  const toggleEmployeeCardExpanded = useCallback((employeeId) => {
    employeeCardMasonryDebugLog('toggle expand', { employeeId })
    setExpandedEmployeeCardReadyId(null)
    setOpenEmployeeCardMenuId(null)
    setExpandedEmployeeCardId((prev) => (prev === employeeId ? null : employeeId))
  }, [])

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

    // Pass 1: Batch all height measurements (single layout calculation, prevents layout thrashing)
    const heights = orderedNodes.map((node) => (node ? node.getBoundingClientRect().height : 0))

    // Pass 2: Batch all style mutations only when values change
    for (let index = 0; index < orderedNodes.length; index += 1) {
      const node = orderedNodes[index]
      if (!node) continue

      const columnIndex = index % columns
      const columnStart = columnIndex + 1

      const height = heights[index]
      const span = Math.max(1, Math.ceil((height + rowGap) / (rowHeight + rowGap)))
      const rowStart = nextRowStartByColumn[columnIndex]

      const nextColStart = String(columnStart)
      const nextColEnd = 'span 1'
      const nextRowStart = String(rowStart)
      const nextRowEnd = `span ${span}`

      if (node.style.gridColumnStart !== nextColStart) node.style.gridColumnStart = nextColStart
      if (node.style.gridColumnEnd !== nextColEnd) node.style.gridColumnEnd = nextColEnd
      if (node.style.gridRowStart !== nextRowStart) node.style.gridRowStart = nextRowStart
      if (node.style.gridRowEnd !== nextRowEnd) node.style.gridRowEnd = nextRowEnd

      nextRowStartByColumn[columnIndex] = rowStart + span
    }

    employeeCardMasonryDebugLog('reflow end')
  }, [employeeCardsLayout, expandedEmployeeCardId])

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
    if (employeeCardsLayout !== 'grid') return
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
  }, [employeeCardsLayout, primaryVisibleEmployees.length, reflowEmployeeCardsMasonry])

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    if (employeeCardsLayout !== 'grid') return
    reflowEmployeeCardsMasonry()
  }, [employeeCardsLayout, expandedEmployeeCardId, reflowEmployeeCardsMasonry])

  useEffect(() => {
    const handleTopLayerEscape = (event) => {
      if (event.key !== 'Escape') return

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
    openedEmployee,
    returnRequestModalOpen
  ])

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
            <p className="muted-text message-block--mb-12">
              {filters.q ? `Filtering by "${filters.q}" — ` : ''}
              {currentView === 'returned'
                ? `${returnedEmployeesHelpText()} Showing ${visibleEmployees.length} of ${total} candidates.`
                : currentView === 'employed'
                ? `${employedEmployeesHelpText()} Showing ${visibleEmployees.length} of ${total} candidates.`
                : currentView === 'under-process'
                ? `${underProcessEmployeesHelpText(user)} Showing ${visibleEmployees.length} of ${total} candidates.`
                : currentView === 'selected'
                ? `${selectedEmployeesHelpText(user)} Showing ${visibleEmployees.length} of ${total} candidates.`
                : `Showing ${visibleEmployees.length} of ${total} candidates.`}
            </p>
          ) : null}
          {loading && !employeesData ? (
            <p className="muted-text">Loading candidates...</p>
          ) : visibleEmployees.length === 0 ? (
            <div className="candidate-list-empty-feedback notifications-page-empty">
              <div className="notifications-empty-icon candidate-empty-icon">
                {filters.q || filters.isActive || filters.profession || filters.gender || filters.religion || filters.destinationCountry || filters.experience || filters.docStatus || filters.tag ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                ) : currentView === 'employed' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                ) : currentView === 'returned' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                ) : currentView === 'under-process' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                ) : currentView === 'selected' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                )}
              </div>
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
              {primaryVisibleEmployees.map((employee) => {
                const isHidden = hiddenEmployeeIds.has(String(employee.id)) || hiddenEmployeeIds.has(Number(employee.id))
                if (isHidden) return null
                return (
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
                )
              })}
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
        setReturnRequestError={setReturnRequestError}
        returnRequestSearch={returnRequestSearch}
        setReturnRequestSearch={setReturnRequestSearch}
        loadReturnRequestEmployees={loadReturnRequestEmployees}
        returnRequestLoading={returnRequestLoading}
        returnRequestEmployees={returnRequestEmployees}
        selectedReturnEmployeeId={selectedReturnEmployeeId}
        setSelectedReturnEmployeeId={setSelectedReturnEmployeeId}
        returnRequestRemark={returnRequestRemark}
        setReturnRequestRemark={setReturnRequestRemark}
        returnRequestEvidenceFiles={returnRequestEvidenceFiles}
        handleReturnRequestEvidencePick={handleReturnRequestEvidencePick}
        handleSubmitReturnRequest={handleSubmitReturnRequest}
        readOnly={readOnly}
      />
      {openedEmployee ? (
        <EmployeeReviewModal
          isOpen={Boolean(openedEmployee)}
          onClose={() => setOpenedEmployeeId(null)}
          employee={openedEmployee}
          onNavigate={navigateOpenedEmployee}
          hasPrevious={Boolean(previousOpenedEmployee)}
          hasNext={Boolean(nextOpenedEmployee)}
          previousEmployee={previousOpenedEmployee}
          nextEmployee={nextOpenedEmployee}
          onStartProcess={handleStartProcess}
          onToggleSelected={handleToggleSelectedEmployee}
          onDeclineProcess={handleDeclineProcess}
          onMarkProgressComplete={handleMarkProgressComplete}
          onAvailabilityAction={handleAvailabilityAction}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onApproveReturn={handleApproveEmploymentReturn}
          onRefuseReturn={handleRefuseEmployeeReturnRequest}
          onCancelReturnRequest={handleCancelEmployeeReturnRequest}
          onReinstateEmployment={handleReinstateEmployeeEmployment}
          agentOptions={formOptions.agent_options}
          attachmentLabels={attachmentLabels}
          currentView={currentView}
          readOnly={readOnly}
        />
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
