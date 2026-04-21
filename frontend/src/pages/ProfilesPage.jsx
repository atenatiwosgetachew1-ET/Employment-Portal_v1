import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useSearchParams } from 'react-router-dom'
import * as authService from '../services/authService'
import * as usersService from '../services/usersService'
import { useAuth } from '../context/AuthContext'
import { useUiFeedback } from '../context/UiFeedbackContext'
import {
  applyStoredProfileOverride,
  documentScopeKeyForUser,
  isAgentSideWorkspace,
  readCompanyDocuments,
  readCompanyAgreements,
  readProfileOverride,
  organizationScopeKeyForUser,
  saveCompanyAgreements,
  saveCompanyDocuments,
  saveProfileOverride
} from '../utils/profileStore'
import { normalizeSearchValue } from '../utils/filtering'

const PROFILE_TABS = [
  { id: 'profile', label: 'All Profiles' },
  { id: 'documents', label: 'My Documents' },
  { id: 'agreements', label: 'Agreements' }
]

const AGREEMENT_BOARD_FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'fully_signed', label: 'Fully signed' },
  { id: 'active', label: 'Active' },
  { id: 'expired', label: 'Expired' },
  { id: 'declined', label: 'Declined' }
]

function readCssCustomProperty(name) {
  if (typeof window === 'undefined') return ''
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value
}

function formatDateTime(value) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '--'
  return parsed.toLocaleString()
}

function isImageFile(name = '', mimeType = '') {
  return mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)
}

function isPdfFile(name = '', mimeType = '') {
  return mimeType === 'application/pdf' || /\.pdf$/i.test(name)
}

function buildDownloadName(label, fileName = '') {
  const safeLabel = (label || 'document')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'document'

  const extensionMatch = String(fileName || '').toLowerCase().match(/(\.[a-z0-9]+)$/i)
  return `${safeLabel}${extensionMatch?.[1] || ''}`
}

function buildPdfFileName(label) {
  const safeLabel = String(label || 'agreement')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agreement'
  return `${safeLabel}.pdf`
}

function pdfImageFormatForDocument(document) {
  const mime = String(document?.mimeType || '').toLowerCase()
  const fileName = String(document?.fileName || '').toLowerCase()
  if (mime.includes('png') || fileName.endsWith('.png')) return 'PNG'
  return 'JPEG'
}

async function fetchPreviewBlob(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Could not load file for preview action.')
  }
  return response.blob()
}

function buildAgentCardName(agent) {
  return [agent?.first_name, agent?.last_name].filter(Boolean).join(' ') || agent?.username || 'Unnamed agent'
}

function belongsToSameAgentWorkspace(owner, candidate) {
  const ownerAgentId = owner?.agent_context?.agent_id || null
  const candidateAgentId = candidate?.agent_context?.agent_id || null
  if (ownerAgentId && candidateAgentId) {
    return String(ownerAgentId) === String(candidateAgentId)
  }

  const ownerCandidates = [
    owner?.staff_side,
    owner?.organization?.name,
    buildAgentCardName(owner),
    owner?.username,
    owner?.email
  ]
    .map(normalizeSearchValue)
    .filter(Boolean)

  const candidateCandidates = [
    candidate?.staff_side,
    candidate?.organization?.name
  ]
    .map(normalizeSearchValue)
    .filter(Boolean)

  return candidateCandidates.some((value) => ownerCandidates.includes(value))
}

function resolveManagedAgentName(agentProfiles, profile) {
  const matchedAgent = agentProfiles.find((agent) => belongsToSameAgentWorkspace(agent, profile) && agent?.role === 'customer')
  return matchedAgent
    ? buildAgentCardName(matchedAgent)
    : profile?.staff_side || profile?.organization?.name || '--'
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

async function fetchAllUsers(params = {}) {
  let page = 1
  const results = []
  let hasNext = true

  while (hasNext) {
    const response = await usersService.fetchUsers({ page, ...params })
    results.push(...(response.results || []))
    hasNext = Boolean(response.next)
    page += 1
  }

  return results
}

function todayDateInputValue() {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}

function createAgreementFormState(todayDate, overrides = {}) {
  return {
    title: 'Digital Agreement',
    agreementType: 'standard',
    agentId: '',
    agreementDate: todayDate,
    expiryDate: '',
    details: '',
    documentIds: [],
    linkedAgreementId: '',
    renewalOfId: '',
    ...overrides
  }
}

function isAgreementFullySigned(agreement) {
  return Boolean(agreement?.organizationSignature && agreement?.agentSignature)
}

function getAgreementLifecycleStatus(agreement, agreements = []) {
  const today = todayDateInputValue()
  const fullySigned = isAgreementFullySigned(agreement)
  const linkedDiscontinuation = agreements.find((item) => {
    return (
      item?.agreementType === 'discontinuation' &&
      String(item?.linkedAgreementId || '') === String(agreement?.id || '') &&
      isAgreementFullySigned(item)
    )
  })

  if (agreement?.agreementType !== 'discontinuation' && linkedDiscontinuation) {
    return { label: 'Declined', tone: 'rejected' }
  }
  if (agreement?.expiryDate && agreement.expiryDate < today) {
    return { label: 'Expired', tone: 'expired' }
  }
  if (fullySigned) {
    return { label: 'Active', tone: 'active' }
  }
  return { label: 'Pending', tone: 'pending' }
}

function buildAgreementDocumentSelectionKey(documents = []) {
  return documents
    .map((item) => `${item.source}:${item.id}`)
    .sort()
    .join('|')
}

function buildAgreementDocumentRefs(documents = []) {
  return documents.map((item) => ({
    source: item.source,
    id: item.id
  }))
}

function buildAgreementKindLabel(agreementType) {
  return agreementType === 'discontinuation' ? 'Discontinuation' : 'Digital agreement'
}

function pickContrastingStrokeColor(backgroundColor) {
  const match = String(backgroundColor || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  const contrastDark = readCssCustomProperty('--preview-contrast-dark') || readCssCustomProperty('--color-foreground')
  const contrastLight = readCssCustomProperty('--preview-contrast-light') || readCssCustomProperty('--color-background')
  if (!match) return contrastDark
  const [, rText, gText, bText] = match
  const [r, g, b] = [Number(rText), Number(gText), Number(bText)]
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.58 ? contrastDark : contrastLight
}

export default function ProfilesPage() {
  const { user, refreshUser } = useAuth()
  const { showToast, confirm } = useUiFeedback()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const allowedTabIds = useMemo(() => new Set(PROFILE_TABS.map((tab) => tab.id)), [])
  const currentTab = requestedTab && allowedTabIds.has(requestedTab) ? requestedTab : 'profile'
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [documentsSaving, setDocumentsSaving] = useState(false)
  const [error, setError] = useState('')
  const [profileError, setProfileError] = useState('')
  const [documentError, setDocumentError] = useState('')
  const [agreementError, setAgreementError] = useState('')
  const [organizationUsers, setOrganizationUsers] = useState([])
  const [agentProfiles, setAgentProfiles] = useState([])
  const [agentSideUsers, setAgentSideUsers] = useState([])
  const [ownedAgentStaff, setOwnedAgentStaff] = useState([])
  const [profileForm, setProfileForm] = useState({
    first_name: '',
    last_name: '',
    slug: '',
    profilePhotoUrl: ''
  })
  const [documentForm, setDocumentForm] = useState({
    title: '',
    type: '',
    note: ''
  })
  const [documentFile, setDocumentFile] = useState(null)
  const [documents, setDocuments] = useState([])
  const [agreements, setAgreements] = useState([])
  const [agreementsSaving, setAgreementsSaving] = useState(false)
  const [agreementPickerOpen, setAgreementPickerOpen] = useState(false)
  const [openAgreementItems, setOpenAgreementItems] = useState({})
  const [agreementBoardFilter, setAgreementBoardFilter] = useState('pending')
  const todayDate = useMemo(() => todayDateInputValue(), [])
  const [agreementForm, setAgreementForm] = useState(() => createAgreementFormState(todayDate))
  const [signatureDrafts, setSignatureDrafts] = useState({})
  const [signerNameDrafts, setSignerNameDrafts] = useState({})
  const [previewDocument, setPreviewDocument] = useState(null)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 })
  const [previewDragging, setPreviewDragging] = useState(false)
  const [openedAgentProfile, setOpenedAgentProfile] = useState(null)
  const previewDragRef = useRef({ startX: 0, startY: 0, originX: 0, originY: 0 })
  const agreementFormRef = useRef(null)
  const signatureInputRefs = useRef({})
  const signerNameInputRefs = useRef({})
  const signatureCanvasRefs = useRef({})
  const signatureCanvasStateRef = useRef({})

  const permissions = user?.permissions || []
  const agentSide = isAgentSideWorkspace(user)
  const canManageDocuments =
    user?.role === 'customer' ||
    (!agentSide && (
      user?.role === 'superadmin' ||
      user?.role === 'admin' ||
      permissions.includes('users.manage_all') ||
      permissions.includes('users.manage_limited')
    ))
  const canViewAgents = !agentSide && canManageDocuments
  const canManageAgreements = !agentSide && canManageDocuments
  const canViewAgreements = canManageAgreements || (agentSide && user?.role === 'customer')
  const documentScopeKey = useMemo(() => documentScopeKeyForUser(user), [user])
  const organizationScopeKey = useMemo(() => organizationScopeKeyForUser(user), [user])
  const displayName = useMemo(
    () => [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'User',
    [user]
  )
  const organizationDisplayName = useMemo(
    () => user?.organization?.name || 'Organization',
    [user]
  )
  const profileImage =
    profileForm.profilePhotoUrl ||
    user?.profile_photo_url ||
    user?.avatar_url ||
    user?.profile_image_url ||
    ''

  const handleTabChange = useCallback((nextTab) => {
    const normalizedTab = allowedTabIds.has(nextTab) ? nextTab : 'profile'
    const nextParams = new URLSearchParams(searchParams)
    if (normalizedTab === 'profile') {
      nextParams.delete('tab')
    } else {
      nextParams.set('tab', normalizedTab)
    }
    setSearchParams(nextParams, { replace: true })
  }, [allowedTabIds, searchParams, setSearchParams])

  useEffect(() => {
    if (!user) return
    const override = readProfileOverride(user.id)
    setProfileForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      slug: override?.slug || user.slug || '',
      profilePhotoUrl: override?.profilePhotoUrl || user.profile_photo_url || user.avatar_url || user.profile_image_url || ''
    })
  }, [user])

  useEffect(() => {
    setDocuments(readCompanyDocuments(documentScopeKey))
  }, [documentScopeKey])

  useEffect(() => {
    setAgreements(readCompanyAgreements(organizationScopeKey))
  }, [organizationScopeKey])

  useEffect(() => {
    if (!(canViewAgents || (agentSide && user?.role === 'customer'))) {
      setOrganizationUsers([])
      setAgentProfiles([])
      setAgentSideUsers([])
      return
    }
    let cancelled = false
    setLoadingAgents(true)
    setError('')
    fetchAllUsers({})
      .then((rows) => {
        if (cancelled) return
        const nextOrganizationUsers = rows
          .filter((item) => !isAgentSideWorkspace(item))
          .map((item) => applyStoredProfileOverride(item))
        const nextAgentProfiles = rows
          .filter((item) => item.role === 'customer')
          .filter((item) => item.id !== user?.id)
          .filter((item) => isAgentSideWorkspace(item))
          .map((item) => applyStoredProfileOverride(item))
        const nextAgentSideUsers = rows
          .filter((item) => item.id !== user?.id)
          .filter((item) => item.role !== 'customer')
          .filter((item) => isAgentSideWorkspace(item))
          .map((item) => applyStoredProfileOverride(item))
        setOrganizationUsers(nextOrganizationUsers)
        setAgentProfiles(nextAgentProfiles)
        setAgentSideUsers(nextAgentSideUsers)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message || 'Could not load agent profiles')
        setOrganizationUsers([])
        setAgentProfiles([])
        setAgentSideUsers([])
      })
      .finally(() => {
        if (!cancelled) setLoadingAgents(false)
      })

    return () => {
      cancelled = true
    }
  }, [agentSide, canViewAgents, user?.id, user?.role])

  useEffect(() => {
    if (!(agentSide && user?.role === 'customer')) {
      setOwnedAgentStaff([])
      return
    }
    let cancelled = false
    setLoadingAgents(true)
    setError('')
    fetchAllUsers({})
      .then((rows) => {
        if (cancelled) return
        const nextOwnedStaff = rows
          .filter((item) => item.id !== user?.id)
          .filter((item) => item.role !== 'customer')
          .filter((item) => isAgentSideWorkspace(item))
          .filter((item) => belongsToSameAgentWorkspace(user, item))
          .map((item) => applyStoredProfileOverride(item))
        setOwnedAgentStaff(nextOwnedStaff)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message || 'Could not load agent-side staff')
        setOwnedAgentStaff([])
      })
      .finally(() => {
        if (!cancelled) setLoadingAgents(false)
      })

    return () => {
      cancelled = true
    }
  }, [agentSide, user])

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

  const handleProfileFieldChange = (field, value) => {
    setProfileForm((current) => ({ ...current, [field]: value }))
    setProfileError('')
  }

  const handleProfilePhotoPick = async (file) => {
    if (!file) return
    try {
      const dataUrl = await readFileAsDataUrl(file)
      handleProfileFieldChange('profilePhotoUrl', dataUrl)
    } catch (err) {
      setProfileError(err.message || 'Could not load profile picture')
    }
  }

  const handleProfileSave = async (event) => {
    event.preventDefault()
    setProfileSaving(true)
    setProfileError('')
    try {
      await authService.patchProfile({
        first_name: profileForm.first_name.trim(),
        last_name: profileForm.last_name.trim()
      })
      saveProfileOverride(user?.id, {
        slug: profileForm.slug.trim(),
        profilePhotoUrl: profileForm.profilePhotoUrl
      })
      await refreshUser()
      showToast('Profile updated.', { tone: 'success' })
    } catch (err) {
      setProfileError(err.message || 'Could not update profile')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleDocumentSave = async (event) => {
    event.preventDefault()
    if (!documentForm.title.trim()) {
      setDocumentError('Enter a document title.')
      return
    }
    if (!documentFile) {
      setDocumentError('Choose a file to upload.')
      return
    }

    setDocumentsSaving(true)
    setDocumentError('')
    try {
      const dataUrl = await readFileAsDataUrl(documentFile)
      const nextDocuments = [
        {
          id: `doc-${Date.now()}`,
          title: documentForm.title.trim(),
          type: documentForm.type.trim() || 'Legal document',
          note: documentForm.note.trim(),
          fileName: documentFile.name,
          mimeType: documentFile.type || '',
          dataUrl,
          uploadedAt: new Date().toISOString(),
          uploadedBy: displayName
        },
        ...documents
      ]
      saveCompanyDocuments(documentScopeKey, nextDocuments)
      setDocuments(nextDocuments)
      setDocumentForm({ title: '', type: '', note: '' })
      setDocumentFile(null)
      showToast('Company document saved.', { tone: 'success' })
    } catch (err) {
      setDocumentError(err.message || 'Could not save document')
    } finally {
      setDocumentsSaving(false)
    }
  }

  const handleDeleteDocument = async (documentId) => {
    const approved = await confirm({
      title: 'Delete company document',
      message: 'This removes the stored document from this workspace.',
      confirmLabel: 'Delete',
      tone: 'danger'
    })
    if (!approved) return
    const nextDocuments = documents.filter((item) => item.id !== documentId)
    saveCompanyDocuments(documentScopeKey, nextDocuments)
    setDocuments(nextDocuments)
    showToast('Document removed.', { tone: 'success' })
  }

  const handleAgreementFieldChange = (field, value) => {
    setAgreementForm((current) => {
      const next = { ...current, [field]: value }
      if (field === 'agreementType') {
        if (value === 'discontinuation') {
          next.title = current.title === 'Digital Agreement' ? 'Discontinual digital agreement' : current.title
          next.expiryDate = ''
        } else {
          next.title = current.title === 'Discontinual digital agreement' ? 'Digital Agreement' : current.title
          next.linkedAgreementId = ''
        }
      }
      if (field === 'agentId') {
        next.linkedAgreementId = ''
      }
      return next
    })
    setAgreementError('')
  }

  const focusAgreementField = useCallback((selector) => {
    window.setTimeout(() => {
      const element = agreementFormRef.current?.querySelector(selector)
      if (element && typeof element.focus === 'function') {
        element.focus()
        if (typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    }, 0)
  }, [])

  const handleAgreementDocumentToggle = (documentId) => {
    setAgreementForm((current) => ({
      ...current,
      documentIds: current.documentIds.includes(documentId)
        ? current.documentIds.filter((id) => id !== documentId)
        : [...current.documentIds, documentId]
    }))
    setAgreementError('')
  }

  const resolveAgreementDocumentIds = useCallback((agreement, targetAgent = null) => {
    const resolvedAgent = targetAgent || agentProfiles.find((item) => String(item.id) === String(agreement?.agentId))
    const organizationIds = new Set(
      readCompanyDocuments(organizationScopeKey).map((item) => `org:${item.id}`)
    )
    const agentIds = new Set(
      resolvedAgent
        ? readCompanyDocuments(documentScopeKeyForUser(resolvedAgent)).map((item) => `agent:${resolvedAgent.id}:${item.id}`)
        : []
    )

    const documentRefs = agreement?.documentRefs?.length
      ? agreement.documentRefs
      : (agreement?.documents || []).map((item) => ({ source: item.source, id: item.id }))

    return documentRefs
      .map((item) => {
        if (item.source === 'organization') {
          const selectionId = `org:${item.id}`
          return organizationIds.has(selectionId) ? selectionId : null
        }
        if (!resolvedAgent) return null
        const selectionId = `agent:${resolvedAgent.id}:${item.id}`
        return agentIds.has(selectionId) ? selectionId : null
      })
      .filter(Boolean)
  }, [agentProfiles, organizationScopeKey])

  const prefillAgreementForm = useCallback((nextForm) => {
    handleTabChange('agreements')
    setAgreementForm(nextForm)
    setAgreementPickerOpen(false)
    setAgreementError('')
    window.setTimeout(() => {
      agreementFormRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }, 0)
  }, [])

  const handleAgreementCreate = async (event) => {
    event.preventDefault()
    if (!agreementForm.title.trim()) {
      setAgreementError('Enter the agreement title.')
      focusAgreementField('[name="agreement_title"]')
      return
    }
    if (!agreementForm.agentId) {
      setAgreementError('Choose the an agent for this agreement.')
      focusAgreementField('[name="agreement_agent"]')
      return
    }
    if (!agreementForm.details.trim()) {
      setAgreementError('Enter the agreement details.')
      focusAgreementField('[name="agreement_details"]')
      return
    }
    if (!agreementForm.agreementDate) {
      setAgreementError('Enter the agreement date.')
      focusAgreementField('[name="agreement_date"]')
      return
    }
    if (agreementForm.agreementType !== 'discontinuation' && !agreementForm.expiryDate) {
      setAgreementError('Enter the agreement expiry date.')
      focusAgreementField('[name="agreement_expiry_date"]')
      return
    }
    if (agreementForm.agreementType !== 'discontinuation' && agreementForm.expiryDate < agreementForm.agreementDate) {
      setAgreementError('Agreement expiry date must be after the agreement date.')
      focusAgreementField('[name="agreement_expiry_date"]')
      return
    }
    if (agreementForm.documentIds.length === 0) {
      setAgreementError('Select at least one supporting document.')
      focusAgreementField('[data-agreement-document-trigger="true"]')
      return
    }
    if (agreementForm.agreementType === 'discontinuation' && !agreementForm.linkedAgreementId) {
      setAgreementError('Choose the agreement that will be discontinued.')
      focusAgreementField('[name="agreement_linked"]')
      return
    }

    const targetAgent = agentProfiles.find((item) => String(item.id) === String(agreementForm.agentId))
    if (!targetAgent) {
      setAgreementError('Selected agent could not be found.')
      focusAgreementField('[name="agreement_agent"]')
      return
    }

    setAgreementsSaving(true)
    setAgreementError('')
    try {
      const selectedDocuments = availableAgreementDocuments
        .filter((item) => agreementForm.documentIds.includes(item.selectionId))
        .map((item) => ({
          id: item.id,
          selectionId: item.selectionId,
          source: item.source,
          sourceLabel: item.sourceLabel,
          title: item.title,
          type: item.type,
          note: item.note,
          fileName: item.fileName,
          mimeType: item.mimeType,
          dataUrl: item.dataUrl
        }))

      const hasOrganizationDocument = selectedDocuments.some((item) => item.source === 'organization')
      const hasAgentDocument = selectedDocuments.some((item) => item.source === 'agent')
      if (!hasOrganizationDocument || !hasAgentDocument) {
        setAgreementError('Select at least one organization document and one selected-agent document.')
        focusAgreementField('[data-agreement-document-trigger="true"]')
        setAgreementsSaving(false)
        return
      }

      const documentSelectionKey = buildAgreementDocumentSelectionKey(selectedDocuments)
      const documentRefs = buildAgreementDocumentRefs(selectedDocuments)
      const linkedAgreement =
        agreementForm.agreementType === 'discontinuation'
          ? agreements.find((item) => String(item.id) === String(agreementForm.linkedAgreementId))
          : null

      if (agreementForm.agreementType === 'discontinuation') {
        if (!linkedAgreement || linkedAgreement.agreementType === 'discontinuation') {
          setAgreementError('Choose a valid agreement to discontinue.')
          focusAgreementField('[name="agreement_linked"]')
          setAgreementsSaving(false)
          return
        }
        const existingDiscontinuation = agreements.find((item) => {
          return (
            item.agreementType === 'discontinuation' &&
            String(item.linkedAgreementId || '') === String(linkedAgreement.id) &&
            item.id !== agreementForm.renewalOfId
          )
        })
        if (existingDiscontinuation) {
          setAgreementError('A discontinuation agreement already exists for that agreement.')
          focusAgreementField('[name="agreement_linked"]')
          setAgreementsSaving(false)
          return
        }
      } else {
        const duplicateAgreement = agreements.find((item) => {
          return (
            item.agreementType !== 'discontinuation' &&
            String(item.agentId) === String(targetAgent.id) &&
            item.documentSelectionKey === documentSelectionKey &&
            item.id !== agreementForm.renewalOfId &&
            !item.renewedById
          )
        })

        if (duplicateAgreement) {
          setAgreementError(
            agreementForm.renewalOfId
              ? 'These documents are already bound to another live agreement.'
              : 'An agreement for the same agent and exact document set already exists.'
          )
          focusAgreementField('[data-agreement-document-trigger="true"]')
          setAgreementsSaving(false)
          return
        }
      }

      const nextAgreement = {
        id: `agreement-${Date.now()}`,
        title: agreementForm.title.trim(),
        agreementType: agreementForm.agreementType,
        details: agreementForm.details.trim(),
        agreementDate: agreementForm.agreementDate,
        expiryDate: agreementForm.agreementType === 'discontinuation' ? null : agreementForm.expiryDate,
        createdAt: new Date().toISOString(),
        createdBy: displayName,
        agentId: targetAgent.id,
        agentName: buildAgentCardName(targetAgent),
        agentUsername: targetAgent.username || '',
        agentScopeKey: documentScopeKeyForUser(targetAgent),
        documentSelectionKey,
        documentRefs,
        linkedAgreementId: agreementForm.linkedAgreementId || null,
        renewalOfId: agreementForm.renewalOfId || null,
        documents: selectedDocuments,
        organizationSignature: null,
        agentSignature: null
      }

      const nextAgreements = [
        nextAgreement,
        ...agreements.map((item) => {
          if (String(item.id) === String(agreementForm.renewalOfId || '')) {
            return { ...item, renewedById: nextAgreement.id }
          }
          return item
        })
      ]
      saveCompanyAgreements(organizationScopeKey, nextAgreements)
      setAgreements(nextAgreements)
      setAgreementForm(createAgreementFormState(todayDate))
      showToast(
        agreementForm.agreementType === 'discontinuation'
          ? 'Discontinuation agreement prepared.'
          : agreementForm.renewalOfId
            ? 'Renewal agreement prepared.'
            : 'Digital agreement created.',
        { tone: 'success' }
      )
    } catch (err) {
      setAgreementError(err.message || 'Could not create agreement')
    } finally {
      setAgreementsSaving(false)
    }
  }

  const handleAgreementSign = async (agreement, side) => {
    const draftKey = `${agreement.id}:${side}`
    const hasAgreementConsent = Boolean(signatureDrafts[draftKey])
    const signerName = String(signerNameDrafts[draftKey] || '').trim()
    const canvas = signatureCanvasRefs.current[draftKey]
    const hasStroke = Boolean(signatureCanvasStateRef.current[draftKey]?.hasStroke)
    if (!hasAgreementConsent) {
      setAgreementError('Confirm "I Agree" before signing.')
      signatureInputRefs.current[draftKey]?.focus()
      return
    }
    if (!signerName) {
      setAgreementError('Enter the signer name before signing.')
      signerNameInputRefs.current[draftKey]?.focus()
      return
    }
    if (!canvas || !hasStroke) {
      setAgreementError('Draw the signature inside the signature area before signing.')
      canvas?.focus?.()
      return
    }

    const nextAgreements = agreements.map((item) => {
      if (item.id !== agreement.id) return item
      const signaturePayload = {
        value: 'I Agree',
        signerName,
        drawingDataUrl: canvas.toDataURL('image/png'),
        signedAt: new Date().toISOString(),
        signedBy: displayName
      }
      return side === 'organization'
        ? { ...item, organizationSignature: signaturePayload }
        : { ...item, agentSignature: signaturePayload }
    })

    saveCompanyAgreements(organizationScopeKey, nextAgreements)
    setAgreements(nextAgreements)
    setSignatureDrafts((current) => ({ ...current, [draftKey]: '' }))
    setSignerNameDrafts((current) => ({ ...current, [draftKey]: '' }))
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    signatureCanvasStateRef.current[draftKey] = { hasStroke: false, drawing: false, lastX: 0, lastY: 0 }
    setAgreementError('')
    showToast(`${side === 'organization' ? 'Organization' : 'Agent'} signature saved.`, { tone: 'success' })
  }

  const registerSignatureCanvas = useCallback((draftKey, node) => {
    if (!node) {
      delete signatureCanvasRefs.current[draftKey]
      return
    }
    signatureCanvasRefs.current[draftKey] = node
    if (!signatureCanvasStateRef.current[draftKey]) {
      signatureCanvasStateRef.current[draftKey] = { hasStroke: false, drawing: false, lastX: 0, lastY: 0 }
    }
    const ctx = node.getContext('2d')
    if (ctx) {
      const padBackground = getComputedStyle(node.parentElement || node).backgroundColor
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2
      ctx.strokeStyle = pickContrastingStrokeColor(padBackground)
    }
  }, [])

  const getCanvasPoint = useCallback((canvas, event) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    }
  }, [])

  const handleSignaturePointerDown = useCallback((draftKey, event) => {
    const canvas = signatureCanvasRefs.current[draftKey]
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const point = getCanvasPoint(canvas, event)
    signatureCanvasStateRef.current[draftKey] = {
      ...(signatureCanvasStateRef.current[draftKey] || {}),
      drawing: true,
      lastX: point.x,
      lastY: point.y
    }
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    if (typeof canvas.setPointerCapture === 'function') {
      try {
        canvas.setPointerCapture(event.pointerId)
      } catch {}
    }
    setAgreementError('')
  }, [getCanvasPoint])

  const handleSignaturePointerMove = useCallback((draftKey, event) => {
    const canvas = signatureCanvasRefs.current[draftKey]
    const state = signatureCanvasStateRef.current[draftKey]
    if (!canvas || !state?.drawing) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const point = getCanvasPoint(canvas, event)
    ctx.beginPath()
    ctx.moveTo(state.lastX, state.lastY)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    signatureCanvasStateRef.current[draftKey] = {
      ...state,
      lastX: point.x,
      lastY: point.y,
      hasStroke: true
    }
  }, [getCanvasPoint])

  const handleSignaturePointerUp = useCallback((draftKey, event) => {
    const canvas = signatureCanvasRefs.current[draftKey]
    const state = signatureCanvasStateRef.current[draftKey]
    if (!canvas || !state) return
    signatureCanvasStateRef.current[draftKey] = {
      ...state,
      drawing: false
    }
    if (typeof canvas.releasePointerCapture === 'function') {
      try {
        canvas.releasePointerCapture(event.pointerId)
      } catch {}
    }
  }, [])

  const handleSignatureClear = useCallback((draftKey) => {
    const canvas = signatureCanvasRefs.current[draftKey]
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    signatureCanvasStateRef.current[draftKey] = {
      ...(signatureCanvasStateRef.current[draftKey] || {}),
      drawing: false,
      hasStroke: false,
      lastX: 0,
      lastY: 0
    }
  }, [])

  const toggleAgreementItem = useCallback((agreementId) => {
    setOpenAgreementItems((current) => ({
      ...current,
      [agreementId]: !current[agreementId]
    }))
  }, [])

  const handleAgreementRenew = useCallback((agreement) => {
    prefillAgreementForm(createAgreementFormState(todayDate, {
      title: agreement.title || 'Digital Agreement',
      agreementType: 'standard',
      agentId: String(agreement.agentId || ''),
      expiryDate: '',
      details: agreement.details || '',
      documentIds: [],
      renewalOfId: agreement.id,
      linkedAgreementId: ''
    }))
    showToast('Renewal draft prepared. Select the updated supporting documents for this renewal.', { tone: 'info' })
  }, [prefillAgreementForm, showToast, todayDate])

  const handleAgreementDiscontinuationPrepare = useCallback((agreement) => {
    prefillAgreementForm(createAgreementFormState(todayDate, {
      title: 'Discontinual digital agreement',
      agreementType: 'discontinuation',
      agentId: String(agreement.agentId || ''),
      expiryDate: '',
      details: `This discontinuation agreement formally records the mutual decision to discontinue "${agreement.title}".`,
      documentIds: [],
      linkedAgreementId: agreement.id,
      renewalOfId: ''
    }))
    showToast('Discontinuation draft prepared. Add the discontinuation evidence documents before creating it.', { tone: 'info' })
  }, [prefillAgreementForm, showToast, todayDate])

  const handleAgreementCancel = useCallback(async (agreement) => {
    const approved = await confirm({
      title: 'Cancel agreement request',
      message: 'This will withdraw the pending agreement request from both sides.',
      confirmLabel: 'Cancel request',
      tone: 'danger'
    })
    if (!approved) return

    const nextAgreements = agreements.filter((item) => item.id !== agreement.id)
    saveCompanyAgreements(organizationScopeKey, nextAgreements)
    setAgreements(nextAgreements)
    setSignatureDrafts((current) => {
      const next = { ...current }
      delete next[`${agreement.id}:organization`]
      delete next[`${agreement.id}:agent`]
      return next
    })
    setSignerNameDrafts((current) => {
      const next = { ...current }
      delete next[`${agreement.id}:organization`]
      delete next[`${agreement.id}:agent`]
      return next
    })
    setAgreementError('')
    showToast('Agreement request cancelled.', { tone: 'success' })
  }, [agreements, confirm, organizationScopeKey, showToast])

  const openSignedAgreements = openAgreementItems
  const toggleSignedAgreement = toggleAgreementItem

  const handleAgreementPdfDownload = useCallback((agreement) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const left = 48
    const right = pageWidth - 48
    let cursorY = 56

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(agreement.title || 'Digital Agreement', left, cursorY)

    cursorY += 18
    doc.setDrawColor(210, 210, 210)
    doc.line(left, cursorY, right, cursorY)

    cursorY += 20
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(65, 65, 65)
    doc.text(`Generated ${formatDateTime(new Date().toISOString())}`, left, cursorY)
    doc.text(`Prepared by ${organizationDisplayName}`, right, cursorY, { align: 'right' })

    cursorY += 26
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(20, 20, 20)
    doc.text('Agreement Summary', left, cursorY)

    autoTable(doc, {
      startY: cursorY + 10,
      margin: { left, right: 48 },
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 6, textColor: [30, 30, 30] },
      headStyles: { fillColor: [246, 246, 246], textColor: [20, 20, 20], lineColor: [220, 220, 220] },
      body: [
        ['Agent', agreement.agentName || '--'],
        ['Created', `${formatDateTime(agreement.createdAt)} by ${agreement.createdBy || '--'}`],
        ['Agreement date', formatDateTime(agreement.agreementDate)],
        ['Expiry date', formatDateTime(agreement.expiryDate)],
        ['Status', agreement.organizationSignature && agreement.agentSignature ? 'Fully signed' : 'Awaiting signature']
      ]
    })

    cursorY = doc.lastAutoTable.finalY + 24
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Agreement Details', left, cursorY)

    cursorY += 12
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const detailLines = doc.splitTextToSize(agreement.details || '--', right - left)
    doc.text(detailLines, left, cursorY + 4)
    cursorY += detailLines.length * 12 + 20

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Attached Documents', left, cursorY)

    autoTable(doc, {
      startY: cursorY + 10,
      margin: { left, right: 48 },
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 6, textColor: [30, 30, 30] },
      headStyles: { fillColor: [246, 246, 246], textColor: [20, 20, 20], lineColor: [220, 220, 220] },
      head: [['Title', 'Type', 'Source']],
      body: (agreement.documents || []).map((item) => [
        item.title || '--',
        item.type || 'Legal document',
        item.sourceLabel || '--'
      ])
    })

    cursorY = doc.lastAutoTable.finalY + 24
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Signatures', left, cursorY)

    const signatureSections = [
      {
        label: 'Organization',
        value: agreement.organizationSignature
      },
      {
        label: 'Agent',
        value: agreement.agentSignature
      }
    ]

    signatureSections.forEach((section, index) => {
      const blockWidth = (right - left - 16) / 2
      const blockX = left + index * (blockWidth + 16)
      let blockY = cursorY + 14

      doc.setDrawColor(224, 224, 224)
      doc.roundedRect(blockX, blockY, blockWidth, 168, 8, 8)
      blockY += 18

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text(`${section.label} Signature`, blockX + 12, blockY)

      blockY += 16
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`Consent: ${section.value?.value || '--'}`, blockX + 12, blockY)
      blockY += 14
      doc.text(`Signer: ${section.value?.signerName || '--'}`, blockX + 12, blockY)
      blockY += 14
      doc.text(`Signed by: ${section.value?.signedBy || '--'}`, blockX + 12, blockY)
      blockY += 14
      doc.text(`Signed at: ${section.value?.signedAt ? formatDateTime(section.value.signedAt) : '--'}`, blockX + 12, blockY)

      if (section.value?.drawingDataUrl) {
        try {
          doc.addImage(section.value.drawingDataUrl, 'PNG', blockX + 12, blockY + 12, blockWidth - 24, 64, undefined, 'FAST')
        } catch {}
      }
    })

    ;(agreement.documents || []).forEach((item, index) => {
      doc.addPage()
      let attachmentY = 56
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.text(`Attachment ${index + 1}`, left, attachmentY)

      attachmentY += 18
      doc.setDrawColor(210, 210, 210)
      doc.line(left, attachmentY, right, attachmentY)

      autoTable(doc, {
        startY: attachmentY + 14,
        margin: { left, right: 48 },
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 6, textColor: [30, 30, 30] },
        headStyles: { fillColor: [246, 246, 246], textColor: [20, 20, 20], lineColor: [220, 220, 220] },
        body: [
          ['Title', item.title || '--'],
          ['Type', item.type || 'Legal document'],
          ['Source', item.sourceLabel || '--'],
          ['File', item.fileName || '--']
        ]
      })

      attachmentY = doc.lastAutoTable.finalY + 18

      if (isImageFile(item.fileName, item.mimeType) && item.dataUrl) {
        try {
          const maxWidth = right - left
          const maxHeight = pageHeight - attachmentY - 48
          doc.addImage(
            item.dataUrl,
            pdfImageFormatForDocument(item),
            left,
            attachmentY,
            maxWidth,
            Math.max(120, Math.min(maxHeight, 420)),
            undefined,
            'FAST'
          )
        } catch {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10)
          doc.text('Image preview could not be embedded for this attachment.', left, attachmentY + 16)
        }
      } else {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.text('This attachment type is referenced in the report appendix but cannot be inlined as a page image.', left, attachmentY + 16)
      }
    })

    doc.save(buildPdfFileName(agreement.title || 'digital-agreement'))
  }, [organizationDisplayName])

  const openDocumentPreview = useCallback((item) => {
    setPreviewDocument({
      label: item.title,
      subtitle: item.type || 'Legal document',
      url: item.dataUrl,
      fileName: item.fileName,
      isImage: isImageFile(item.fileName, item.mimeType),
      isPdf: isPdfFile(item.fileName, item.mimeType)
    })
    setPreviewZoom(1)
    setPreviewOffset({ x: 0, y: 0 })
    setPreviewDragging(false)
  }, [])

  const openProfilePhotoPreview = useCallback((profile, subtitle) => {
    const photoUrl =
      profile?.profile_photo_url ||
      profile?.avatar_url ||
      profile?.profile_image_url ||
      profile?.profilePhotoUrl ||
      ''
    if (!photoUrl) return

    setPreviewDocument({
      label: `${buildAgentCardName(profile)} profile`,
      subtitle,
      url: photoUrl,
      fileName: `${profile?.username || 'profile-photo'}.png`,
      isImage: true,
      isPdf: false,
      isProfilePhoto: true,
      hidePrimaryActions: true,
      disableContextMenu: true
    })
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
      anchor.download = buildDownloadName(previewDocument.label, previewDocument.fileName)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      const anchor = document.createElement('a')
      anchor.href = previewDocument.url
      anchor.download = buildDownloadName(previewDocument.label, previewDocument.fileName)
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

  const visibleAgreements = useMemo(() => {
    const sorted = [...agreements].sort((left, right) => {
      return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
    })

    if (canManageAgreements) return sorted

    if (agentSide && user?.role === 'customer') {
      const ownScopeKey = documentScopeKeyForUser(user)
      return sorted.filter((item) => {
        return String(item.agentId) === String(user.id) || item.agentScopeKey === ownScopeKey
      })
    }

    return []
  }, [agreements, agentSide, canManageAgreements, user])

  const organizationAgreementDocuments = useMemo(() => {
    return readCompanyDocuments(organizationScopeKey).map((item) => ({
      ...item,
      selectionId: `org:${item.id}`,
      source: 'organization',
      sourceLabel: 'Organization'
    }))
  }, [organizationScopeKey, documents])

  const selectedAgreementAgent = useMemo(() => {
    return agentProfiles.find((item) => String(item.id) === String(agreementForm.agentId)) || null
  }, [agentProfiles, agreementForm.agentId])

  const selectedAgentAgreementDocuments = useMemo(() => {
    if (!selectedAgreementAgent) return []
    return readCompanyDocuments(documentScopeKeyForUser(selectedAgreementAgent)).map((item) => ({
      ...item,
      selectionId: `agent:${selectedAgreementAgent.id}:${item.id}`,
      source: 'agent',
      sourceLabel: buildAgentCardName(selectedAgreementAgent)
    }))
  }, [selectedAgreementAgent])

  const availableAgreementDocuments = useMemo(() => {
    return [...organizationAgreementDocuments, ...selectedAgentAgreementDocuments]
  }, [organizationAgreementDocuments, selectedAgentAgreementDocuments])

  const selectedAgreementDocuments = useMemo(() => {
    return availableAgreementDocuments.filter((item) => agreementForm.documentIds.includes(item.selectionId))
  }, [agreementForm.documentIds, availableAgreementDocuments])

  const discontinuationAgreementOptions = useMemo(() => {
    return agreements.filter((item) => {
      if (item.agreementType === 'discontinuation') return false
      if (agreementForm.agentId && String(item.agentId) !== String(agreementForm.agentId)) return false
      const lifecycleStatus = getAgreementLifecycleStatus(item, agreements)
      if (lifecycleStatus.tone === 'rejected' || lifecycleStatus.tone === 'expired') return false
      return !agreements.some((candidate) => {
        return candidate.agreementType === 'discontinuation' && String(candidate.linkedAgreementId || '') === String(item.id)
      })
    })
  }, [agreementForm.agentId, agreements])

  const filteredAgreements = useMemo(() => {
    return visibleAgreements.filter((agreement) => {
      const fullySigned = isAgreementFullySigned(agreement)
      const lifecycleStatus = getAgreementLifecycleStatus(agreement, agreements)

      if (agreementBoardFilter === 'pending') return !fullySigned
      if (agreementBoardFilter === 'fully_signed') return fullySigned
      if (agreementBoardFilter === 'active') return lifecycleStatus.tone === 'active'
      if (agreementBoardFilter === 'expired') return lifecycleStatus.tone === 'expired'
      if (agreementBoardFilter === 'declined') return lifecycleStatus.tone === 'rejected'
      return true
    })
  }, [agreementBoardFilter, agreements, visibleAgreements])

  const agreementBoardCounts = useMemo(() => {
    return AGREEMENT_BOARD_FILTERS.reduce((acc, filter) => {
      acc[filter.id] = visibleAgreements.filter((agreement) => {
        const fullySigned = isAgreementFullySigned(agreement)
        const lifecycleStatus = getAgreementLifecycleStatus(agreement, agreements)
        if (filter.id === 'pending') return !fullySigned
        if (filter.id === 'fully_signed') return fullySigned
        if (filter.id === 'active') return lifecycleStatus.tone === 'active'
        if (filter.id === 'expired') return lifecycleStatus.tone === 'expired'
        if (filter.id === 'declined') return lifecycleStatus.tone === 'rejected'
        return false
      }).length
      return acc
    }, {})
  }, [agreements, visibleAgreements])

  const groupedAgentSideUsers = useMemo(() => {
    const groups = new Map()
    agentSideUsers.forEach((profile) => {
      const managedAgentName = resolveManagedAgentName(agentProfiles, profile)
      const existing = groups.get(managedAgentName) || []
      existing.push(profile)
      groups.set(managedAgentName, existing)
    })
    return Array.from(groups.entries())
      .map(([agentName, members]) => ({
        agentName,
        members: [...members].sort((left, right) => buildAgentCardName(left).localeCompare(buildAgentCardName(right)))
      }))
      .sort((left, right) => left.agentName.localeCompare(right.agentName))
  }, [agentProfiles, agentSideUsers])

  const visibleOrganizationUsers = useMemo(() => {
    if (canViewAgents) return organizationUsers
    if (agentSide && user?.role === 'customer') return organizationUsers
    return []
  }, [agentSide, canViewAgents, organizationUsers, user?.role])

  useEffect(() => {
    setAgreementForm((current) => {
      if (current.agreementDate === todayDate) return current
      return { ...current, agreementDate: todayDate }
    })
  }, [todayDate])

  useEffect(() => {
    const allowedSelectionIds = new Set(availableAgreementDocuments.map((item) => item.selectionId))
    setAgreementForm((current) => {
      const nextDocumentIds = current.documentIds.filter((id) => allowedSelectionIds.has(id))
      if (nextDocumentIds.length === current.documentIds.length) return current
      return { ...current, documentIds: nextDocumentIds }
    })
  }, [availableAgreementDocuments])

  return (
    <section className="dashboard-panel profiles-page">
      <div className="users-management-header">
        <div>
          <h1>Profiles</h1>
          <p className="muted-text">
            Manage your profile identity, slug, picture, and company documentation from one place.
          </p>
          <p className="muted-text">
            {canViewAgents
              ? 'Organization-side admins can also review agent profiles and their documentation footprint.'
              : 'Agent-side admins can manage only their own documentation scope from this page.'}
          </p>
        </div>
      </div>

      <div className="employee-subtabs" role="tablist" aria-label="Profile tabs">
        {PROFILE_TABS.filter((tab) => {
          if (tab.id === 'documents') return canManageDocuments
          if (tab.id === 'agreements') return canViewAgreements
          return true
        }).map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`employee-subtab${currentTab === tab.id ? ' is-active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
            aria-pressed={currentTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      {currentTab === 'profile' ? (
        <div className="profiles-page-stack">
          <div className="profiles-layout">
            <article className="employee-summary-card profiles-profile-card">
            <div className="profiles-profile-head">
              <div
                className={`employee-card-avatar profiles-profile-avatar${profileImage ? ' profiles-avatar-button' : ''}`}
                role={profileImage ? 'button' : undefined}
                tabIndex={profileImage ? 0 : undefined}
                aria-label={profileImage ? 'Preview profile picture' : undefined}
                onClick={
                  profileImage
                    ? () =>
                        openProfilePhotoPreview(
                          {
                            first_name: profileForm.first_name || user?.first_name,
                            last_name: profileForm.last_name || user?.last_name,
                            username: user?.username,
                            profilePhotoUrl: profileImage
                          },
                          'Current profile picture'
                        )
                    : undefined
                }
                onKeyDown={
                  profileImage
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openProfilePhotoPreview(
                            {
                              first_name: profileForm.first_name || user?.first_name,
                              last_name: profileForm.last_name || user?.last_name,
                              username: user?.username,
                              profilePhotoUrl: profileImage
                            },
                            'Current profile picture'
                          )
                        }
                      }
                    : undefined
                }
              >
                {profileImage ? <img src={profileImage} alt={`${displayName} profile`} /> : <span>{displayName.charAt(0).toUpperCase()}</span>}
              </div>
              <div>
                <h3>{displayName}</h3>
                <p className="muted-text">@{profileForm.slug || user?.username || 'slug-missing'}</p>
                <p className="muted-text">{agentSide ? 'Agent-side workspace' : 'Organization-side workspace'}</p>
              </div>
            </div>

            {profileError ? <p className="error-message">{profileError}</p> : null}

            <form className="settings-form" onSubmit={handleProfileSave}>
              <label>
                First name
                <input
                  type="text"
                  value={profileForm.first_name}
                  onChange={(event) => handleProfileFieldChange('first_name', event.target.value)}
                />
              </label>
              <label>
                Last name
                <input
                  type="text"
                  value={profileForm.last_name}
                  onChange={(event) => handleProfileFieldChange('last_name', event.target.value)}
                />
              </label>
              <label>
                Slug
                <input
                  type="text"
                  value={profileForm.slug}
                  onChange={(event) => handleProfileFieldChange('slug', event.target.value)}
                  placeholder="public profile slug"
                />
              </label>
              <label>
                Profile picture
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => handleProfilePhotoPick(event.target.files?.[0] || null)}
                />
              </label>
              <button type="submit" disabled={profileSaving}>
                {profileSaving ? 'Saving...' : 'Save profile'}
              </button>
            </form>
            </article>

            {(canViewAgents || (agentSide && user?.role === 'customer')) ? (
              <div className="profiles-side-panels">
              {canViewAgents ? (
                <article className="employee-summary-card">
                  <h3>Agents</h3>
                  {loadingAgents ? (
                    <p className="muted-text">Loading agent profiles...</p>
                  ) : agentProfiles.length === 0 ? (
                    <p className="muted-text">No agent profiles found for this organization scope.</p>
                  ) : (
                    <div className="profiles-agent-grid">
                      {agentProfiles.map((agent) => {
                        const scopeKey = documentScopeKeyForUser(agent)
                        const docCount = readCompanyDocuments(scopeKey).length
                        const isAdminProfile = agent?.role === 'admin' || agent?.is_superuser
                        const photo =
                          agent.profile_photo_url ||
                          agent.avatar_url ||
                          agent.profile_image_url ||
                          ''
                        return (
                          <article key={agent.id} className="profiles-agent-card">
                            <div className="profiles-agent-card-head">
                              <button
                                type="button"
                                className="employee-card-avatar profiles-agent-avatar profiles-avatar-button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openProfilePhotoPreview(agent, 'Agent profile photo')
                                }}
                                onContextMenu={(event) => event.preventDefault()}
                                title={photo ? 'Open profile photo' : 'No profile photo'}
                                disabled={!photo}
                              >
                                {photo ? <img src={photo} alt={`${buildAgentCardName(agent)} profile`} /> : <span>{buildAgentCardName(agent).charAt(0).toUpperCase()}</span>}
                              </button>
                              <div>
                                <strong>{buildAgentCardName(agent)}</strong>
                                <p className="muted-text">@{agent.slug || agent.username || 'slug-missing'}</p>
                                <span className="badge badge-warning profiles-admin-badge">Agent</span>
                                {isAdminProfile ? <span className="badge badge-muted profiles-admin-badge">Admin</span> : null}
                              </div>
                            </div>
                            <p className="muted-text">{agent.email || 'No email recorded'}</p>
                            <p className="muted-text">Documents: {docCount}</p>
                            <button type="button" className="btn-secondary" onClick={() => setOpenedAgentProfile(agent)}>
                              Open documents
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </article>
              ) : null}
              </div>
            ) : null}
          </div>

          {(canViewAgents || (agentSide && user?.role === 'customer')) ? (
            <article className="employee-summary-card profiles-users-board">
              <div className="profiles-users-board-sections">
                <section className="profiles-users-board-section">
                  <h3>Organization-side users</h3>
                  {loadingAgents ? (
                    <p className="muted-text">Loading organization-side users...</p>
                  ) : visibleOrganizationUsers.length === 0 ? (
                    <p className="muted-text">No organization-side users found.</p>
                  ) : (
                    <div className="profiles-agent-grid">
                      {visibleOrganizationUsers.map((member) => {
                        const photo =
                          member.profile_photo_url ||
                          member.avatar_url ||
                          member.profile_image_url ||
                          ''
                        const isAdminProfile = member?.role === 'admin' || member?.is_superuser
                        const isSuperadminProfile = member?.role === 'superadmin' || member?.is_superuser
                        return (
                          <article key={member.id} className="profiles-agent-card is-disabled">
                            <div className="profiles-agent-card-head">
                              <button
                                type="button"
                                className="employee-card-avatar profiles-agent-avatar profiles-avatar-button"
                                onClick={() => openProfilePhotoPreview(member, 'Organization-side profile photo')}
                                onContextMenu={(event) => event.preventDefault()}
                                title={photo ? 'Open profile photo' : 'No profile photo'}
                                disabled={!photo}
                              >
                                {photo ? <img src={photo} alt={`${buildAgentCardName(member)} profile`} /> : <span>{buildAgentCardName(member).charAt(0).toUpperCase()}</span>}
                              </button>
                              <div>
                                <strong>{buildAgentCardName(member)}</strong>
                                <p className="muted-text">@{member.slug || member.username || 'slug-missing'}</p>
                                <span className="badge badge-warning profiles-admin-badge">Organization</span>
                                {isAdminProfile ? <span className="badge badge-muted profiles-admin-badge">Admin</span> : null}
                                {isSuperadminProfile ? <span className="badge badge-super profiles-admin-badge">Superadmin</span> : null}
                              </div>
                            </div>
                            <p className="muted-text">{member.email || 'No email recorded'}</p>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>

                {canViewAgents ? (
                  <section className="profiles-users-board-section">
                    <h3>Agent-side users</h3>
                    {loadingAgents ? (
                      <p className="muted-text">Loading agent-side users...</p>
                    ) : groupedAgentSideUsers.length === 0 ? (
                      <p className="muted-text">No additional agent-side staff or admin users found.</p>
                    ) : (
                      <div className="profiles-grouped-user-sections">
                        {groupedAgentSideUsers.map((group) => (
                          <section key={group.agentName} className="profiles-user-group-card">
                            <div className="profiles-user-group-header">
                              <h4>{group.agentName}</h4>
                              <span className="muted-text">{group.members.length} users</span>
                            </div>
                            <div className="profiles-agent-grid profiles-agent-grid--compact">
                              {group.members.map((agentUser) => {
                                const photo =
                                  agentUser.profile_photo_url ||
                                  agentUser.avatar_url ||
                                  agentUser.profile_image_url ||
                                  ''
                                const isAdminProfile = agentUser?.role === 'admin' || agentUser?.is_superuser
                                const isSuperadminProfile = agentUser?.role === 'superadmin' || agentUser?.is_superuser
                                return (
                                  <article key={agentUser.id} className="profiles-agent-card is-disabled">
                                    <div className="profiles-agent-card-head">
                                      <button
                                        type="button"
                                        className="employee-card-avatar profiles-agent-avatar profiles-avatar-button"
                                        onClick={() => openProfilePhotoPreview(agentUser, `${group.agentName} workspace profile photo`)}
                                        onContextMenu={(event) => event.preventDefault()}
                                        title={photo ? 'Open profile photo' : 'No profile photo'}
                                        disabled={!photo}
                                      >
                                        {photo ? <img src={photo} alt={`${buildAgentCardName(agentUser)} profile`} /> : <span>{buildAgentCardName(agentUser).charAt(0).toUpperCase()}</span>}
                                      </button>
                                      <div>
                                        <strong>{buildAgentCardName(agentUser)}</strong>
                                        <p className="muted-text">@{agentUser.slug || agentUser.username || 'slug-missing'}</p>
                                        <span className="badge badge-warning profiles-admin-badge">Agent-side user</span>
                                        {isAdminProfile ? <span className="badge badge-muted profiles-admin-badge">Admin</span> : null}
                                        {isSuperadminProfile ? <span className="badge badge-super profiles-admin-badge">Superadmin</span> : null}
                                      </div>
                                    </div>
                                    <p className="muted-text">{agentUser.email || 'No email recorded'}</p>
                                  </article>
                                )
                              })}
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                  </section>
                ) : null}

                {agentSide && user?.role === 'customer' ? (
                  <section className="profiles-users-board-section">
                    <h3>My side users</h3>
                    {loadingAgents ? (
                      <p className="muted-text">Loading your side users...</p>
                    ) : ownedAgentStaff.length === 0 ? (
                      <p className="muted-text">No staff, admin, or superadmin profiles found for your agent workspace.</p>
                    ) : (
                      <div className="profiles-agent-grid">
                        {ownedAgentStaff.map((member) => {
                          const photo =
                            member.profile_photo_url ||
                            member.avatar_url ||
                            member.profile_image_url ||
                            ''
                          const isAdminProfile = member?.role === 'admin' || member?.is_superuser
                          const isSuperadminProfile = member?.role === 'superadmin' || member?.is_superuser
                          return (
                            <article key={member.id} className="profiles-agent-card is-disabled">
                              <div className="profiles-agent-card-head">
                                <button
                                  type="button"
                                  className="employee-card-avatar profiles-agent-avatar profiles-avatar-button"
                                  onClick={() => openProfilePhotoPreview(member, 'Agent-side profile photo')}
                                  onContextMenu={(event) => event.preventDefault()}
                                  title={photo ? 'Open profile photo' : 'No profile photo'}
                                  disabled={!photo}
                                >
                                  {photo ? <img src={photo} alt={`${buildAgentCardName(member)} profile`} /> : <span>{buildAgentCardName(member).charAt(0).toUpperCase()}</span>}
                                </button>
                                <div>
                                  <strong>{buildAgentCardName(member)}</strong>
                                  <p className="muted-text">@{member.slug || member.username || 'slug-missing'}</p>
                                  <span className="badge badge-warning profiles-admin-badge">Agent-side user</span>
                                  {isAdminProfile ? <span className="badge badge-muted profiles-admin-badge">Admin</span> : null}
                                  {isSuperadminProfile ? <span className="badge badge-super profiles-admin-badge">Superadmin</span> : null}
                                </div>
                              </div>
                              <p className="muted-text">{member.email || 'No email recorded'}</p>
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </section>
                ) : null}
              </div>
            </article>
          ) : null}
        </div>
      ) : null}

      {currentTab === 'documents' && canManageDocuments ? (
        <div className="profiles-layout">
          <article className="employee-summary-card">
            <h3>Company legal documents</h3>
            <p className="muted-text">
              Store licenses, permits, certifications, and other legal documentation for this workspace.
            </p>
            {documentError ? <p className="error-message">{documentError}</p> : null}
            <form className="settings-form" onSubmit={handleDocumentSave}>
              <label>
                Document title
                <input
                  type="text"
                  value={documentForm.title}
                  onChange={(event) => setDocumentForm((current) => ({ ...current, title: event.target.value }))}
                />
              </label>
              <label>
                Document type
                <input
                  type="text"
                  value={documentForm.type}
                  onChange={(event) => setDocumentForm((current) => ({ ...current, type: event.target.value }))}
                  placeholder="License, permit, certificate..."
                />
              </label>
              <label>
                Note
                <input
                  type="text"
                  value={documentForm.note}
                  onChange={(event) => setDocumentForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Optional note"
                />
              </label>
              <label>
                Attachment
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  onChange={(event) => setDocumentFile(event.target.files?.[0] || null)}
                />
              </label>
              <button type="submit" disabled={documentsSaving}>
                {documentsSaving ? 'Saving...' : 'Add document'}
              </button>
            </form>
          </article>

          <article className="employee-summary-card">
            <h3>Uploaded documents</h3>
            {documents.length === 0 ? (
              <p className="muted-text">No company documents stored for this scope yet.</p>
            ) : (
              <div className="profiles-doc-list">
                {documents.map((item) => (
                  <article key={item.id} className="profiles-doc-item">
                    <div>
                      <strong>{item.title}</strong>
                      <p className="muted-text">{item.type || 'Legal document'}</p>
                      <p className="muted-text">{item.note || 'No note added'}</p>
                      <p className="muted-text">Uploaded {formatDateTime(item.uploadedAt)} by {item.uploadedBy || '--'}</p>
                    </div>
                    <div className="employee-card-detail-links">
                      {isImageFile(item.fileName, item.mimeType) ? (
                        <button type="button" className="btn-secondary" onClick={() => openDocumentPreview(item)}>
                          Preview
                        </button>
                      ) : (
                        <a className="btn-secondary profiles-doc-link" href={item.dataUrl} download={item.fileName || item.title}>
                          Download
                        </a>
                      )}
                      <button type="button" className="btn-danger" onClick={() => handleDeleteDocument(item.id)}>
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>
        </div>
      ) : null}

      {currentTab === 'agreements' && canViewAgreements ? (
        <div className="profiles-layout profiles-agreements-layout">
          {canManageAgreements ? (
            <article className="employee-summary-card">
              <h3>Digital agreement</h3>
              <p className="muted-text">
                Create an agreement for a selected agent using the legal documents already stored in this workspace.
              </p>
              {agreementError ? <p className="error-message">{agreementError}</p> : null}
              <form ref={agreementFormRef} className="settings-form" onSubmit={handleAgreementCreate}>
                <label>
                  Title
                  <input
                    name="agreement_title"
                    type="text"
                    value={agreementForm.title}
                    onChange={(event) => handleAgreementFieldChange('title', event.target.value)}
                    placeholder="Digital Agreement"
                  />
                </label>
                <label>
                  Agreement type
                  <select
                    name="agreement_type"
                    value={agreementForm.agreementType}
                    onChange={(event) => handleAgreementFieldChange('agreementType', event.target.value)}
                  >
                    <option value="standard">Standard agreement</option>
                    <option value="discontinuation">Discontinual agreement</option>
                  </select>
                </label>
                <label>
                  Agent
                  <select
                    name="agreement_agent"
                    value={agreementForm.agentId}
                    onChange={(event) => handleAgreementFieldChange('agentId', event.target.value)}
                  >
                    <option value="">Select agent</option>
                    {agentProfiles.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {buildAgentCardName(agent)}
                      </option>
                    ))}
                  </select>
                </label>
                {agreementForm.agreementType === 'discontinuation' ? (
                  <label>
                    Agreement to discontinue
                    <select
                      name="agreement_linked"
                      value={agreementForm.linkedAgreementId}
                      onChange={(event) => handleAgreementFieldChange('linkedAgreementId', event.target.value)}
                    >
                      <option value="">Select agreement</option>
                      {discontinuationAgreementOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title} - {item.agentName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  Agreement date
                  <input
                    name="agreement_date"
                    type="date"
                    value={agreementForm.agreementDate}
                    onChange={(event) => handleAgreementFieldChange('agreementDate', event.target.value)}
                    readOnly
                  />
                </label>
                <label>
                  Agreement expiry date
                  <input
                    name="agreement_expiry_date"
                    type="date"
                    value={agreementForm.expiryDate}
                    onChange={(event) => handleAgreementFieldChange('expiryDate', event.target.value)}
                    disabled={agreementForm.agreementType === 'discontinuation'}
                  />
                </label>
                <label>
                  Agreement details
                  <textarea
                    name="agreement_details"
                    rows={7}
                    value={agreementForm.details}
                    className="textarea--no-resize"
                    onChange={(event) => handleAgreementFieldChange('details', event.target.value)}
                    placeholder="Add the agreement details, conditions, obligations, or signing notes here..."
                  />
                </label>
                <div className="profiles-agreement-doc-picker">
                  <div className="profiles-agreement-doc-picker-head">
                    <strong>Agreement documents</strong>
                    <button
                      type="button"
                      className="btn-secondary"
                      data-agreement-document-trigger="true"
                      onClick={() => setAgreementPickerOpen(true)}
                    >
                      Select documents
                    </button>
                  </div>
                  <p className="muted-text">
                    Choose documents inorder to settle a mutual agreement.
                  </p>
                  {selectedAgreementDocuments.length === 0 ? (
                    <p className="muted-text">No documents selected yet.</p>
                  ) : (
                    <div className="profiles-agreement-selected-grid">
                      {selectedAgreementDocuments.map((item) => {
                        const previewable = isImageFile(item.fileName, item.mimeType) || isPdfFile(item.fileName, item.mimeType)
                        return (
                          <article
                            key={item.selectionId}
                            className={`profiles-agreement-selected-tile${previewable ? ' is-previewable' : ''}`}
                            onClick={() => {
                              if (!previewable) return
                              openDocumentPreview(item)
                            }}
                          >
                            <button
                              type="button"
                              className="profiles-agreement-selected-remove"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleAgreementDocumentToggle(item.selectionId)
                              }}
                              aria-label={`Remove ${item.title}`}
                            >
                              -
                            </button>
                            <div className="profiles-agreement-selected-thumb">
                              {isImageFile(item.fileName, item.mimeType) ? (
                                <img src={item.dataUrl} alt={item.title} />
                              ) : (
                                <span>{isPdfFile(item.fileName, item.mimeType) ? 'PDF' : 'FILE'}</span>
                              )}
                            </div>
                            <strong>{item.title}</strong>
                            <small>{item.sourceLabel}</small>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </div>
                <button type="submit" disabled={agreementsSaving}>
                  {agreementsSaving ? 'Creating...' : 'Create agreement'}
                </button>
              </form>
            </article>
          ) : (
            <article className="employee-summary-card">
              <h3>My agreements</h3>
              <p className="muted-text">
                Review agreements issued by the organization side, open the attached documents, and sign your side when ready.
              </p>
              {agreementError ? <p className="error-message">{agreementError}</p> : null}
            </article>
          )}

          <article className="employee-summary-card">
            <h3>Agreements board</h3>
            <div className="profiles-agreement-board-filters" role="tablist" aria-label="Agreement board filters">
              {AGREEMENT_BOARD_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`employee-subtab${agreementBoardFilter === filter.id ? ' is-active' : ''}`}
                  onClick={() => setAgreementBoardFilter(filter.id)}
                  aria-pressed={agreementBoardFilter === filter.id}
                >
                  {filter.label} {agreementBoardCounts[filter.id] ?? 0}
                </button>
              ))}
            </div>
            {filteredAgreements.length === 0 ? (
              <p className="muted-text">
                No agreements found under the `{AGREEMENT_BOARD_FILTERS.find((item) => item.id === agreementBoardFilter)?.label || 'selected'}` view.
              </p>
            ) : (
              <div className="profiles-agreement-list">
                {filteredAgreements.map((agreement) => {
                  const organizationDraftKey = `${agreement.id}:organization`
                  const agentDraftKey = `${agreement.id}:agent`
                  const isAwaitingAgreement = !(agreement.organizationSignature && agreement.agentSignature)
                  const lifecycleStatus = getAgreementLifecycleStatus(agreement, agreements)
                  const canSignOrganization = canManageAgreements && !agreement.organizationSignature
                  const canSignAgent = agentSide && user?.role === 'customer' && !agreement.agentSignature
                  const canPrepareDiscontinuation =
                    canManageAgreements &&
                    !isAwaitingAgreement &&
                    lifecycleStatus.tone === 'active' &&
                    agreement.agreementType !== 'discontinuation'
                  if (!isAwaitingAgreement) {
                    return (
                      <article key={agreement.id} className="profiles-agreement-item profiles-agreement-item--signed commission-group">
                        <div className="profiles-agreement-head commission-group-header">
                          <div className="profiles-agreement-head-copy">
                            <p className="employee-modal-eyebrow">Digital agreement</p>
                            <h3>{agreement.title}</h3>
                            <p className="muted-text">
                              Agent: {agreement.agentName} | Created {formatDateTime(agreement.createdAt)} by {agreement.createdBy || '--'}
                            </p>
                            <p className="muted-text">
                              Agreement date: {formatDateTime(agreement.agreementDate)} | Expiry date: {formatDateTime(agreement.expiryDate)}
                            </p>
                          </div>
                          <div className="profiles-agreement-head-actions">
                            <span className="badge badge-success profiles-admin-badge profiles-agreement-status profiles-agreement-status--signed">Fully signed</span>
                            <span className={`badge profiles-admin-badge profiles-agreement-status profiles-agreement-status--${lifecycleStatus.tone}`}>
                              {lifecycleStatus.label}
                            </span>
                            {canPrepareDiscontinuation ? (
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handleAgreementDiscontinuationPrepare(agreement)}
                              >
                                Prepare discontinuation
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="commission-group-toggle-button"
                              onClick={() => toggleSignedAgreement(agreement.id)}
                              aria-label={openSignedAgreements[agreement.id] ? 'Collapse agreement' : 'Expand agreement'}
                              aria-expanded={Boolean(openSignedAgreements[agreement.id])}
                            >
                              <span className={`commission-group-toggle-icon${openSignedAgreements[agreement.id] ? ' is-open' : ''}`}>
                                ▸
                              </span>
                            </button>
                          </div>
                        </div>

                        {openSignedAgreements[agreement.id] ? (
                        <div className="profiles-agreement-signed-content commission-settlement-surface">
                          <div className="profiles-agreement-toolbar">
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => handleAgreementPdfDownload(agreement)}
                            >
                              Download PDF
                            </button>
                          </div>

                          <div className="profiles-agreement-details">
                            <p>{agreement.details}</p>
                          </div>

                          <div className="profiles-agreement-doc-list">
                            {agreement.documents.map((item) => (
                              <article key={`${agreement.id}-${item.id}`} className="profiles-doc-item">
                                <div>
                                  <strong>{item.title}</strong>
                                  <p className="muted-text">{item.type || 'Legal document'}</p>
                                  <p className="muted-text">{item.sourceLabel || '--'}</p>
                                </div>
                                <div className="employee-card-detail-links">
                                  {isImageFile(item.fileName, item.mimeType) || isPdfFile(item.fileName, item.mimeType) ? (
                                    <button type="button" className="btn-secondary" onClick={() => openDocumentPreview(item)}>
                                      Preview
                                    </button>
                                  ) : (
                                    <a className="btn-secondary profiles-doc-link" href={item.dataUrl} download={item.fileName || item.title}>
                                      Download
                                    </a>
                                  )}
                                </div>
                              </article>
                            ))}
                          </div>

                          <div className="profiles-signature-board">
                            <section className="profiles-signature-card">
                              <p className="employee-modal-eyebrow">Organization signature</p>
                              <strong>{agreement.organizationSignature.value}</strong>
                              <p className="muted-text">Signer name: {agreement.organizationSignature.signerName || '--'}</p>
                              <p className="muted-text">
                                Signed {formatDateTime(agreement.organizationSignature.signedAt)} by {agreement.organizationSignature.signedBy || '--'}
                              </p>
                              {agreement.organizationSignature.drawingDataUrl ? (
                                <div className="profiles-signature-preview">
                                  <img src={agreement.organizationSignature.drawingDataUrl} alt="Organization signature" />
                                </div>
                              ) : null}
                            </section>

                            <section className="profiles-signature-card">
                              <p className="employee-modal-eyebrow">Agent signature</p>
                              <strong>{agreement.agentSignature.value}</strong>
                              <p className="muted-text">Signer name: {agreement.agentSignature.signerName || '--'}</p>
                              <p className="muted-text">
                                Signed {formatDateTime(agreement.agentSignature.signedAt)} by {agreement.agentSignature.signedBy || '--'}
                              </p>
                              {agreement.agentSignature.drawingDataUrl ? (
                                <div className="profiles-signature-preview">
                                  <img src={agreement.agentSignature.drawingDataUrl} alt="Agent signature" />
                                </div>
                              ) : null}
                            </section>
                          </div>
                        </div>
                        ) : null}
                      </article>
                    )
                  }

                  return (
                    <article key={agreement.id} className="profiles-agreement-item commission-group">
                      <div className="profiles-agreement-head commission-group-header">
                        <div className="profiles-agreement-head-copy">
                          <p className="employee-modal-eyebrow">{buildAgreementKindLabel(agreement.agreementType)}</p>
                          <h3>{agreement.title}</h3>
                          <p className="muted-text">
                            Agent: {agreement.agentName} | Created {formatDateTime(agreement.createdAt)} by {agreement.createdBy || '--'}
                          </p>
                          <p className="muted-text">
                            Agreement date: {formatDateTime(agreement.agreementDate)}{agreement.expiryDate ? ` | Expiry date: ${formatDateTime(agreement.expiryDate)}` : ''}
                          </p>
                        </div>
                        <div className="profiles-agreement-head-actions">
                          <span className="badge badge-warning profiles-admin-badge profiles-agreement-status profiles-agreement-status--pending">
                            {isAwaitingAgreement ? 'Awaiting signature' : 'Fully signed'}
                          </span>
                          <span className={`badge profiles-admin-badge profiles-agreement-status profiles-agreement-status--${lifecycleStatus.tone}`}>
                            {lifecycleStatus.label}
                          </span>
                          {canManageAgreements && isAwaitingAgreement ? (
                            <button
                              type="button"
                              className="btn-danger"
                              onClick={() => handleAgreementCancel(agreement)}
                            >
                              Cancel request
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="commission-group-toggle-button"
                            onClick={() => toggleSignedAgreement(agreement.id)}
                            aria-label={openSignedAgreements[agreement.id] ? 'Collapse agreement' : 'Expand agreement'}
                            aria-expanded={Boolean(openSignedAgreements[agreement.id])}
                          >
                            <span className={`commission-group-toggle-icon${openSignedAgreements[agreement.id] ? ' is-open' : ''}`}>
                              ▸
                            </span>
                          </button>
                        </div>
                      </div>

                      {openSignedAgreements[agreement.id] ? (
                      <>
                      <div className="profiles-agreement-details">
                        <p>{agreement.details}</p>
                      </div>

                      <div className="profiles-agreement-doc-list">
                        {agreement.documents.map((item) => (
                          <article key={`${agreement.id}-${item.id}`} className="profiles-doc-item">
                            <div>
                              <strong>{item.title}</strong>
                              <p className="muted-text">{item.type || 'Legal document'}</p>
                              <p className="muted-text">{item.sourceLabel || '--'}</p>
                            </div>
                            <div className="employee-card-detail-links">
                              {isImageFile(item.fileName, item.mimeType) || isPdfFile(item.fileName, item.mimeType) ? (
                                <button type="button" className="btn-secondary" onClick={() => openDocumentPreview(item)}>
                                  Preview
                                </button>
                              ) : (
                                <a className="btn-secondary profiles-doc-link" href={item.dataUrl} download={item.fileName || item.title}>
                                  Download
                                </a>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>

                      <div className="profiles-signature-board">
                        <section className="profiles-signature-card">
                          <p className="employee-modal-eyebrow">Organization signature</p>
                          {agreement.organizationSignature ? (
                            <>
                              <strong>{agreement.organizationSignature.value}</strong>
                              <p className="muted-text">Signer name: {agreement.organizationSignature.signerName || '--'}</p>
                              <p className="muted-text">
                                Signed {formatDateTime(agreement.organizationSignature.signedAt)} by {agreement.organizationSignature.signedBy || '--'}
                              </p>
                              {agreement.organizationSignature.drawingDataUrl ? (
                                <div className="profiles-signature-preview">
                                  <img src={agreement.organizationSignature.drawingDataUrl} alt="Organization signature" />
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <div className="profiles-signature-pad">
                                {canSignOrganization ? (
                                  <canvas
                                    ref={(node) => registerSignatureCanvas(organizationDraftKey, node)}
                                    width="640"
                                    height="220"
                                    onPointerDown={(event) => handleSignaturePointerDown(organizationDraftKey, event)}
                                    onPointerMove={(event) => handleSignaturePointerMove(organizationDraftKey, event)}
                                    onPointerUp={(event) => handleSignaturePointerUp(organizationDraftKey, event)}
                                    onPointerLeave={(event) => handleSignaturePointerUp(organizationDraftKey, event)}
                                  />
                                ) : (
                                  <span>Awaiting organization signature</span>
                                )}
                              </div>
                              {canSignOrganization ? (
                                <>
                                  <label className="checkbox-label profiles-signature-consent">
                                    <input
                                      ref={(node) => {
                                        if (node) signatureInputRefs.current[organizationDraftKey] = node
                                        else delete signatureInputRefs.current[organizationDraftKey]
                                      }}
                                      type="checkbox"
                                      required
                                      aria-required="true"
                                      checked={Boolean(signatureDrafts[organizationDraftKey])}
                                      onChange={(event) => setSignatureDrafts((current) => ({ ...current, [organizationDraftKey]: event.target.checked }))}
                                    />
                                    I Agree
                                  </label>
                                  <input
                                    ref={(node) => {
                                      if (node) signerNameInputRefs.current[organizationDraftKey] = node
                                      else delete signerNameInputRefs.current[organizationDraftKey]
                                    }}
                                    type="text"
                                    required
                                    aria-required="true"
                                    value={signerNameDrafts[organizationDraftKey] || ''}
                                    onChange={(event) => setSignerNameDrafts((current) => ({ ...current, [organizationDraftKey]: event.target.value }))}
                                    placeholder="Signer name"
                                  />
                                  <button type="button" className="btn-secondary" onClick={() => handleSignatureClear(organizationDraftKey)}>
                                    Clear signature
                                  </button>
                                  <button type="button" className="btn-secondary" onClick={() => handleAgreementSign(agreement, 'organization')}>
                                    Sign as organization
                                  </button>
                                </>
                              ) : null}
                            </>
                          )}
                        </section>

                        <section className="profiles-signature-card">
                          <p className="employee-modal-eyebrow">Agent signature</p>
                          {agreement.agentSignature ? (
                            <>
                              <strong>{agreement.agentSignature.value}</strong>
                              <p className="muted-text">Signer name: {agreement.agentSignature.signerName || '--'}</p>
                              <p className="muted-text">
                                Signed {formatDateTime(agreement.agentSignature.signedAt)} by {agreement.agentSignature.signedBy || '--'}
                              </p>
                              {agreement.agentSignature.drawingDataUrl ? (
                                <div className="profiles-signature-preview">
                                  <img src={agreement.agentSignature.drawingDataUrl} alt="Agent signature" />
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <div className="profiles-signature-pad">
                                {canSignAgent ? (
                                  <canvas
                                    ref={(node) => registerSignatureCanvas(agentDraftKey, node)}
                                    width="640"
                                    height="220"
                                    onPointerDown={(event) => handleSignaturePointerDown(agentDraftKey, event)}
                                    onPointerMove={(event) => handleSignaturePointerMove(agentDraftKey, event)}
                                    onPointerUp={(event) => handleSignaturePointerUp(agentDraftKey, event)}
                                    onPointerLeave={(event) => handleSignaturePointerUp(agentDraftKey, event)}
                                  />
                                ) : (
                                  <span>Awaiting agent signature</span>
                                )}
                              </div>
                              {canSignAgent ? (
                                <>
                                  <label className="checkbox-label profiles-signature-consent">
                                    <input
                                      ref={(node) => {
                                        if (node) signatureInputRefs.current[agentDraftKey] = node
                                        else delete signatureInputRefs.current[agentDraftKey]
                                      }}
                                      type="checkbox"
                                      required
                                      aria-required="true"
                                      checked={Boolean(signatureDrafts[agentDraftKey])}
                                      onChange={(event) => setSignatureDrafts((current) => ({ ...current, [agentDraftKey]: event.target.checked }))}
                                    />
                                    I Agree
                                  </label>
                                  <input
                                    ref={(node) => {
                                      if (node) signerNameInputRefs.current[agentDraftKey] = node
                                      else delete signerNameInputRefs.current[agentDraftKey]
                                    }}
                                    type="text"
                                    required
                                    aria-required="true"
                                    value={signerNameDrafts[agentDraftKey] || ''}
                                    onChange={(event) => setSignerNameDrafts((current) => ({ ...current, [agentDraftKey]: event.target.value }))}
                                    placeholder="Signer name"
                                  />
                                  <button type="button" className="btn-secondary" onClick={() => handleSignatureClear(agentDraftKey)}>
                                    Clear signature
                                  </button>
                                  <button type="button" className="btn-secondary" onClick={() => handleAgreementSign(agreement, 'agent')}>
                                    Sign as agent
                                  </button>
                                </>
                              ) : null}
                            </>
                          )}
                        </section>
                      </div>
                      </>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            )}
          </article>
        </div>
      ) : null}

      {openedAgentProfile ? (
        <div className="employee-review-backdrop" role="presentation" onClick={() => setOpenedAgentProfile(null)}>
          <div
            className="employee-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-profile-docs-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="employee-review-header">
              <div>
                <p className="employee-modal-eyebrow">Agent profile</p>
                <h2 id="agent-profile-docs-title">
                  {buildAgentCardName(openedAgentProfile)}
                </h2>
                <p className="muted-text">@{openedAgentProfile.slug || openedAgentProfile.username || 'slug-missing'}</p>
                {openedAgentProfile?.role === 'customer' ? (
                  <span className="badge badge-warning profiles-admin-badge">Agent</span>
                ) : null}
                {openedAgentProfile?.role === 'admin' || openedAgentProfile?.is_superuser ? (
                  <span className="badge badge-muted profiles-admin-badge">Admin</span>
                ) : null}
              </div>
              <button type="button" className="btn-secondary" onClick={() => setOpenedAgentProfile(null)}>
                Close
              </button>
            </div>

            <div className="employee-summary-card">
              <h3>Attached documents</h3>
              {readCompanyDocuments(documentScopeKeyForUser(openedAgentProfile)).length === 0 ? (
                <p className="muted-text">No company documents stored by this agent yet.</p>
              ) : (
                <div className="profiles-doc-list">
                  {readCompanyDocuments(documentScopeKeyForUser(openedAgentProfile)).map((item) => (
                    <article key={item.id} className="profiles-doc-item">
                      <div>
                        <strong>{item.title}</strong>
                        <p className="muted-text">{item.type || 'Legal document'}</p>
                        <p className="muted-text">{item.note || 'No note added'}</p>
                        <p className="muted-text">Uploaded {formatDateTime(item.uploadedAt)} by {item.uploadedBy || '--'}</p>
                      </div>
                      <div className="employee-card-detail-links">
                        {isImageFile(item.fileName, item.mimeType) ? (
                          <button type="button" className="btn-secondary" onClick={() => openDocumentPreview(item)}>
                            Preview
                          </button>
                        ) : (
                          <a className="btn-secondary profiles-doc-link" href={item.dataUrl} download={item.fileName || item.title}>
                            Download
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {agreementPickerOpen ? (
        <div className="employee-review-backdrop" role="presentation" onClick={() => setAgreementPickerOpen(false)}>
          <div
            className="employee-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agreement-document-picker-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="employee-review-header">
              <div>
                <p className="employee-modal-eyebrow">Agreement documents</p>
                <h2 id="agreement-document-picker-title">Select documents</h2>
                <p className="muted-text">
                  Pick files from your side and the selected agent side for this digital agreement.
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setAgreementPickerOpen(false)}>
                Done
              </button>
            </div>

            <div className="profiles-agreement-doc-options">
              <section className="profiles-agreement-doc-group">
                <p className="employee-modal-eyebrow">Your documents</p>
                {organizationAgreementDocuments.length === 0 ? (
                  <p className="muted-text">No organization documents found yet.</p>
                ) : (
                  organizationAgreementDocuments.map((item) => (
                    <label key={item.selectionId} className="profiles-agreement-doc-option">
                      <input
                        type="checkbox"
                        checked={agreementForm.documentIds.includes(item.selectionId)}
                        onChange={() => handleAgreementDocumentToggle(item.selectionId)}
                      />
                      <span>{item.title}</span>
                      <small>{item.sourceLabel}</small>
                      <small>{item.type || 'Legal document'}</small>
                    </label>
                  ))
                )}
              </section>
              <section className="profiles-agreement-doc-group">
                <p className="employee-modal-eyebrow">
                  {selectedAgreementAgent ? `${buildAgentCardName(selectedAgreementAgent)} documents` : 'Selected agent documents'}
                </p>
                {!agreementForm.agentId ? (
                  <p className="muted-text">Choose an agent first to list that agent&apos;s documents.</p>
                ) : selectedAgentAgreementDocuments.length === 0 ? (
                  <p className="muted-text">No documents found for the selected agent yet.</p>
                ) : (
                  selectedAgentAgreementDocuments.map((item) => (
                    <label key={item.selectionId} className="profiles-agreement-doc-option">
                      <input
                        type="checkbox"
                        checked={agreementForm.documentIds.includes(item.selectionId)}
                        onChange={() => handleAgreementDocumentToggle(item.selectionId)}
                      />
                      <span>{item.title}</span>
                      <small>{item.sourceLabel}</small>
                      <small>{item.type || 'Legal document'}</small>
                    </label>
                  ))
                )}
              </section>
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
            aria-labelledby="profile-doc-preview-title"
            onClick={(event) => event.stopPropagation()}
            onContextMenu={previewDocument.disableContextMenu ? (event) => event.preventDefault() : undefined}
          >
            <div className="employee-review-header">
              <div>
                <p className="employee-modal-eyebrow">Attachment preview</p>
                <h2 id="profile-doc-preview-title">{previewDocument.label}</h2>
                <p className="muted-text">{previewDocument.subtitle}</p>
              </div>
              <div className="document-preview-actions">
                {previewDocument.hidePrimaryActions ? null : (
                  <>
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
                  </>
                )}
                {previewDocument.isImage ? (
                  <>
                    <button type="button" className="btn-secondary" onClick={handlePreviewZoomOut} disabled={previewZoom <= 1}>
                      Zoom out
                    </button>
                    <button type="button" className="btn-secondary" onClick={handlePreviewZoomIn} disabled={previewZoom >= 4}>
                      Zoom in
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handlePreviewReset}
                      disabled={previewZoom === 1 && previewOffset.x === 0 && previewOffset.y === 0}
                    >
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
              className={`document-preview-canvas${previewDocument.isProfilePhoto ? ' profile-photo-preview' : ''}${previewZoom > 1 ? ' is-zoomed' : ''}${previewDragging ? ' is-dragging' : ''}`}
              onWheel={handlePreviewWheel}
              onMouseDown={handlePreviewPointerDown}
            >
              {previewDocument.isImage ? (
                <img
                  src={previewDocument.url}
                  alt={previewDocument.label}
                  draggable={false}
                  onContextMenu={previewDocument.disableContextMenu ? (event) => event.preventDefault() : undefined}
                  className={`document-preview-image${previewDocument.isProfilePhoto ? ' document-preview-image--profile' : ''}`}
                  style={{
                    transform: `translate(${previewOffset.x}px, ${previewOffset.y}px) scale(${previewZoom})`
                  }}
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
