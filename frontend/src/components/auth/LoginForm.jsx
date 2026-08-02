import { useState } from 'react'
import { Link } from 'react-router-dom'

const loginAccounts = [
  { label: 'Super admin account', username: 'superuser', password: 'superuser123' },
  { label: 'Admin account', username: 'admin', password: 'admin123' },
  { label: 'Agent owner 1', username: 'Agent_owner1', password: 'Agent_owner1123' },
  { label: 'Agent owner 2', username: 'Agent_owner2', password: 'Agent_owner2123' },
  { label: 'Organization staff 1', username: 'Organization_Staff1', password: 'Organization_Staff1123' },
  { label: 'Organization staff 2', username: 'Organization_Staff2', password: 'Organization_Staff2123' },
  { label: 'Agent 1 staff 1', username: 'Agent1_Staff1', password: 'Agent1_Staff1123' },
  { label: 'Agent 2 staff 1', username: 'Agent2_Staff1', password: 'Agent2_Staff1123' },
]

export default function LoginForm({ onSubmit, loading, flash }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    try {
      await onSubmit({ username, password })
      setUsername('')
      setPassword('')
    } catch (submitError) {
      setError(submitError.message || 'Unable to login.')
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h1>portal</h1>

      {flash && <p className="welcome-text">{flash}</p>}

      <div className="login-credentials-card" aria-label="All available user credentials">
        <p className="login-credentials-title">All available user credentials</p>
        {loginAccounts.map((account) => (
          <button
            key={account.username}
            type="button"
            className="login-credentials-row"
            onClick={() => {
              setUsername(account.username)
              setPassword(account.password)
              setError('')
            }}
          >
            <span>{account.label}</span>
            <code>{account.username}</code>
            <code>{account.password}</code>
          </button>
        ))}
      </div>

      <div className="form-group">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Enter username"
          autoComplete="username"
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter password"
          autoComplete="current-password"
          required
        />
      </div>

      {error && <p className="error-message">{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>

      <p className="auth-links muted-text">
        <Link to="/register">Create an account</Link>
        {' · '}
        <Link to="/forgot-password">Forgot password?</Link>
      </p>

    </form>
  )
}
