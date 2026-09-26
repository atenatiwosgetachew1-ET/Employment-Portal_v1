import * as usersService from '../services/usersService'
import { normalizeSearchValue } from './filtering'

export function readCssCustomProperty(name) {
  if (typeof window === 'undefined') return ''
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value
}

export function formatDateTime(value) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '--'
  return parsed.toLocaleString()
}

export function isImageFile(name = '', mimeType = '') {
  return mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)
}

export function isPdfFile(name = '', mimeType = '') {
  return mimeType === 'application/pdf' || /\.pdf$/i.test(name)
}

export function buildDownloadName(label, fileName = '') {
  const safeLabel = (label || 'document')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'document'

  const extensionMatch = String(fileName || '').toLowerCase().match(/(\.[a-z0-9]+)$/i)
  return `${safeLabel}${extensionMatch?.[1] || ''}`
}

export function buildPdfFileName(label) {
  const safeLabel = String(label || 'agreement')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agreement'
  return `${safeLabel}.pdf`
}

export function pdfImageFormatForDocument(document) {
  const mime = String(document?.mimeType || '').toLowerCase()
  const fileName = String(document?.fileName || '').toLowerCase()
  if (mime.includes('png') || fileName.endsWith('.png')) return 'PNG'
  return 'JPEG'
}

export async function fetchPreviewBlob(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Could not load file for preview action.')
  }
  return response.blob()
}

export function buildAgentCardName(agent) {
  return [agent?.first_name, agent?.last_name].filter(Boolean).join(' ') || agent?.username || 'Unnamed agent'
}

export function belongsToSameAgentWorkspace(owner, candidate) {
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

export function resolveManagedAgentName(agentProfiles, profile) {
  const matchedAgent = agentProfiles.find((agent) => belongsToSameAgentWorkspace(agent, profile) && agent?.role === 'customer')
  return matchedAgent
    ? buildAgentCardName(matchedAgent)
    : profile?.staff_side || profile?.organization?.name || '--'
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export async function fetchAllUsers(params = {}) {
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

export function todayDateInputValue() {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}

export function createAgreementFormState(todayDate, overrides = {}) {
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

export function isAgreementFullySigned(agreement) {
  return Boolean(agreement?.organizationSignature && agreement?.agentSignature)
}

export function getAgreementLifecycleStatus(agreement, agreements = []) {
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

export function buildAgreementDocumentSelectionKey(documents = []) {
  return documents
    .map((item) => `${item.source}:${item.id}`)
    .sort()
    .join('|')
}

export function buildAgreementDocumentRefs(documents = []) {
  return documents.map((item) => ({
    source: item.source,
    id: item.id
  }))
}

export function buildAgreementKindLabel(agreementType) {
  return agreementType === 'discontinuation' ? 'Discontinuation' : 'Digital agreement'
}

export function pickContrastingStrokeColor(backgroundColor) {
  const match = String(backgroundColor || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  const contrastDark = readCssCustomProperty('--preview-contrast-dark') || readCssCustomProperty('--color-foreground')
  const contrastLight = readCssCustomProperty('--preview-contrast-light') || readCssCustomProperty('--color-background')
  if (!match) return contrastDark
  const [, rText, gText, bText] = match
  const [r, g, b] = [Number(rText), Number(gText), Number(bText)]
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.58 ? contrastDark : contrastLight
}



