import { apiFetch } from '../api/client'

function firstFieldError(data) {
  if (!data || typeof data !== 'object') return 'Registration failed'
  if (typeof data.message === 'string') return data.message
  if (typeof data.detail === 'string') return data.detail
  for (const v of Object.values(data)) {
    if (Array.isArray(v) && v.length) return String(v[0])
    if (typeof v === 'string') return v
  }
  return 'Registration failed'
}

export async function loginWithGoogle(idToken) {
  const response = await apiFetch('/api/auth/google/', {
    method: 'POST',
    body: JSON.stringify({ id_token: idToken })
  })
  let data = null
  try {
    data = await response.json()
  } catch {
    throw new Error('Invalid server response.')
  }
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Google sign-in failed')
  }
  return data.user
}

export async function login({ username, password }) {
  const response = await apiFetch('/api/login/', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    throw new Error('Invalid server response.')
  }

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Login failed')
  }

  return data.user
}

export async function register({ username, email, password, passwordConfirm }) {
  const response = await apiFetch('/api/register/', {
    method: 'POST',
    body: JSON.stringify({
      username,
      email,
      password,
      password_confirm: passwordConfirm
    })
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    throw new Error('Invalid server response.')
  }

  if (!response.ok) {
    throw new Error(firstFieldError(data))
  }

  return data
}

export async function verifyEmail({ email, code }) {
  const response = await apiFetch('/api/verify-email/', {
    method: 'POST',
    body: JSON.stringify({ email, code })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || 'Verification failed')
  }
  return data
}

export async function resendVerificationCode({ email }) {
  const response = await apiFetch('/api/resend-verification/', {
    method: 'POST',
    body: JSON.stringify({ email })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || 'Could not resend code')
  }
  return data
}

export async function requestPasswordReset({ email }) {
  const response = await apiFetch('/api/password-reset/', {
    method: 'POST',
    body: JSON.stringify({ email })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || 'Request failed')
  }
  return data
}

export async function confirmPasswordReset({ uid, token, newPassword, newPasswordConfirm }) {
  const response = await apiFetch('/api/password-reset/confirm/', {
    method: 'POST',
    body: JSON.stringify({
      uid,
      token,
      new_password: newPassword,
      new_password_confirm: newPasswordConfirm
    })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || 'Reset failed')
  }
  return data
}

export async function fetchPublicAuthOptions() {
  const response = await apiFetch('/api/auth/options/')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || 'Could not load sign-in options')
  }
  return data
}

export async function validateCompanySuperadminResetToken({ token }) {
  const response = await apiFetch('/api/password-reset/company-superadmin/validate/', {
    method: 'POST',
    body: JSON.stringify({ token })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || 'Reset link is invalid or expired')
  }
  return data
}

export async function confirmCompanySuperadminReset({
  token,
  newPassword,
  newPasswordConfirm
}) {
  const response = await apiFetch('/api/password-reset/company-superadmin/consume/', {
    method: 'POST',
    body: JSON.stringify({
      token,
      new_password: newPassword,
      new_password_confirm: newPasswordConfirm
    })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || 'Reset failed')
  }
  return data
}

export async function fetchCurrentUser() {
  const response = await apiFetch('/api/me/')
  if (!response.ok) {
    throw new Error('Not authenticated')
  }
  return response.json()
}

export async function patchProfile(data) {
  const response = await apiFetch('/api/me/', {
    method: 'PATCH',
    body: JSON.stringify(data)
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (typeof body.detail === 'string') {
      throw new Error(body.detail)
    }
    for (const v of Object.values(body)) {
      if (Array.isArray(v) && v.length) {
        throw new Error(String(v[0]))
      }
    }
    throw new Error('Could not update profile')
  }
  return body
}

export async function logout() {
  const response = await apiFetch('/api/logout/', { method: 'POST' })
  if (!response.ok) {
    return
  }
}
