const PROFILE_OVERRIDES_STORAGE_KEY = 'employment-portal.profile-overrides'
const COMPANY_DOCUMENTS_STORAGE_KEY = 'employment-portal.company-documents'
const COMPANY_AGREEMENTS_STORAGE_KEY = 'employment-portal.company-agreements'

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : fallback
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function isAgentSideWorkspace(user) {
  if (user?.agent_context?.is_agent_side) return true
  if (user?.role === 'customer') return true
  if (user?.role !== 'staff') return false
  const staffSide = (user?.staff_side || '').trim()
  const organizationName = (user?.organization?.name || '').trim()
  return Boolean(staffSide) && staffSide !== organizationName
}

export function readProfileOverride(userId) {
  if (!userId) return null
  const all = readJson(PROFILE_OVERRIDES_STORAGE_KEY, {})
  return all[String(userId)] || null
}

export function saveProfileOverride(userId, override) {
  if (!userId) return null
  const all = readJson(PROFILE_OVERRIDES_STORAGE_KEY, {})
  const next = {
    ...all,
    [String(userId)]: {
      ...(all[String(userId)] || {}),
      ...override
    }
  }
  writeJson(PROFILE_OVERRIDES_STORAGE_KEY, next)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('profile:updated', { detail: { userId: String(userId) } }))
  }
  return next[String(userId)]
}

export function applyStoredProfileOverride(user) {
  if (!user?.id) return user
  const override = readProfileOverride(user.id)
  if (!override) return user
  const photo = override.profilePhotoUrl || user.profile_photo_url || user.avatar_url || user.profile_image_url || ''
  return {
    ...user,
    slug: override.slug || user.slug || '',
    profile_photo_url: photo,
    avatar_url: photo,
    profile_image_url: photo
  }
}

export function documentScopeKeyForUser(user) {
  if (!user) return 'unknown'
  if (isAgentSideWorkspace(user)) {
    return `agent:${user?.agent_context?.agent_id || user.id || user.username || 'unknown'}`
  }
  return `org:${user?.organization?.id || user?.organization?.name || user.id || user.username || 'unknown'}`
}

export function organizationScopeKeyForUser(user) {
  if (!user) return 'unknown'
  return `org:${user?.organization?.id || user?.organization?.name || user.id || user.username || 'unknown'}`
}

export function readCompanyDocuments(scopeKey) {
  const all = readJson(COMPANY_DOCUMENTS_STORAGE_KEY, {})
  return Array.isArray(all[scopeKey]) ? all[scopeKey] : []
}

export function saveCompanyDocuments(scopeKey, documents) {
  const all = readJson(COMPANY_DOCUMENTS_STORAGE_KEY, {})
  const next = {
    ...all,
    [scopeKey]: documents
  }
  writeJson(COMPANY_DOCUMENTS_STORAGE_KEY, next)
  return next[scopeKey]
}

export function readCompanyAgreements(scopeKey) {
  const all = readJson(COMPANY_AGREEMENTS_STORAGE_KEY, {})
  return Array.isArray(all[scopeKey]) ? all[scopeKey] : []
}

export function saveCompanyAgreements(scopeKey, agreements) {
  const all = readJson(COMPANY_AGREEMENTS_STORAGE_KEY, {})
  const next = {
    ...all,
    [scopeKey]: agreements
  }
  writeJson(COMPANY_AGREEMENTS_STORAGE_KEY, next)
  return next[scopeKey]
}
