import { useState } from 'react'
import { Link } from 'react-router-dom'
import * as authService from '../services/authService'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authService.requestPasswordReset({ email })
      setDone(true)
    } catch (err) {
      setError(err.message || 'Request failed.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <main className="page centered-page">
        <div className="auth-form">
          <h1>Check your email</h1>
          <p className="welcome-text">
            If an account exists for that address, we sent instructions to reset your password.
          </p>
          <p className="muted-text">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="page centered-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Reset password</h1>
        <p className="muted-text">
          Enter your account email and we will send you a link. Company-managed superadmins should
          use the reset link sent from the company control center.
        </p>

        <div className="form-group">
          <label htmlFor="fp-email">Email</label>
          <input
            id="fp-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        {error && <p className="error-message">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>

        <p className="auth-links muted-text">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </main>
  )
}
