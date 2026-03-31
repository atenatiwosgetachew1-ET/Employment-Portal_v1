import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import * as authService from '../services/authService'

function decodeConsoleValue(value) {
  if (!value) return ''
  let normalized = String(value).replace(/\s+/g, '').replace(/^=+/, '')
  if (normalized.startsWith('3D')) {
    normalized = normalized.slice(2)
  }
  normalized = normalized.replace(/=([0-9A-F]{2})/gi, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  )
  return normalized
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const uid = useMemo(() => decodeConsoleValue(searchParams.get('uid') || ''), [searchParams])
  const token = useMemo(() => decodeConsoleValue(searchParams.get('token') || ''), [searchParams])
  const isCompanyTokenFlow = Boolean(token && !uid)

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(isCompanyTokenFlow)
  const [tokenMeta, setTokenMeta] = useState(null)

  useEffect(() => {
    if (!isCompanyTokenFlow) {
      setValidating(false)
      return
    }
    let active = true
    setValidating(true)
    setError('')
    authService
      .validateCompanySuperadminResetToken({ token })
      .then((data) => {
        if (!active) return
        setTokenMeta(data)
      })
      .catch((err) => {
        if (!active) return
        setError(err.message || 'Invalid or expired reset link.')
      })
      .finally(() => {
        if (active) setValidating(false)
      })
    return () => {
      active = false
    }
  }, [isCompanyTokenFlow, token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!isCompanyTokenFlow && (!uid || !token)) {
      setError('Invalid or expired reset link.')
      return
    }
    setLoading(true)
    try {
      if (isCompanyTokenFlow) {
        await authService.confirmCompanySuperadminReset({
          token,
          newPassword: password,
          newPasswordConfirm: passwordConfirm
        })
      } else {
        await authService.confirmPasswordReset({
          uid,
          token,
          newPassword: password,
          newPasswordConfirm: passwordConfirm
        })
      }
      navigate('/login', { replace: true, state: { flash: 'Password updated. Sign in with your new password.' } })
    } catch (err) {
      setError(err.message || 'Reset failed.')
    } finally {
      setLoading(false)
    }
  }

  if (!isCompanyTokenFlow && (!uid || !token)) {
    return (
      <main className="page centered-page">
        <div className="auth-form">
          <h1>Reset password</h1>
          <p className="error-message">This link is invalid or incomplete.</p>
          <p className="muted-text">
            If you copied it from the backend console, copy only the URL itself.
          </p>
          <p className="muted-text">
            <Link to="/forgot-password">Request a new link</Link> or <Link to="/login">sign in</Link>
          </p>
        </div>
      </main>
    )
  }

  if (validating) {
    return (
      <main className="page centered-page">
        <div className="auth-form">
          <h1>Reset password</h1>
          <p className="muted-text">Checking your reset link…</p>
        </div>
      </main>
    )
  }

  if (isCompanyTokenFlow && error) {
    return (
      <main className="page centered-page">
        <div className="auth-form">
          <h1>Reset password</h1>
          <p className="error-message">{error}</p>
          <p className="muted-text">
            Ask your company operator to send a fresh reset link or <Link to="/login">sign in</Link>.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="page centered-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>New password</h1>
        <p className="muted-text">
          {isCompanyTokenFlow
            ? `Choose a new password for ${tokenMeta?.organization?.name || 'your organization'} superadmin account.`
            : 'Choose a strong password for your account.'}
        </p>

        <div className="form-group">
          <label htmlFor="np-password">New password</label>
          <input
            id="np-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="np-password2">Confirm password</label>
          <input
            id="np-password2"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        {error && <p className="error-message">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Update password'}
        </button>

        <p className="auth-links muted-text">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </main>
  )
}
