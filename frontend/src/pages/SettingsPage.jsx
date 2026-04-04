import { useCallback, useEffect, useState } from 'react'
import * as authService from '../services/authService'
import * as platformSettingsService from '../services/platformSettingsService'
import * as preferencesService from '../services/preferencesService'
import { useAuth } from '../context/AuthContext'
import { applyAccent, applyTheme, getStoredAccent, storeAccent } from '../utils/theme'

const TIMEZONES = [
  'UTC',
  'Africa/Addis_Ababa',
  'America/New_York',
  'Europe/London',
  'Asia/Tokyo'
]

const ACCENT_OPTIONS = [{ value: 'orange', label: 'Orange' }]

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()
  const organization = user?.organization
  const subscription = user?.subscription
  const [prefs, setPrefs] = useState(null)
  const [profile, setProfile] = useState({
    username: '',
    first_name: '',
    last_name: '',
    phone: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [platformSaving, setPlatformSaving] = useState(false)
  const [error, setError] = useState('')
  const [profileError, setProfileError] = useState('')
  const [platformError, setPlatformError] = useState('')
  const [saved, setSaved] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [platformSaved, setPlatformSaved] = useState(false)
  const [platformSettings, setPlatformSettings] = useState(null)
  const [accent, setAccent] = useState(() => getStoredAccent())
  const isSuperadmin = user?.role === 'superadmin'
  const permissionOptions = [
    { value: 'users.manage_all', label: 'Manage all users' },
    { value: 'users.manage_limited', label: 'Manage staff/agents' },
    { value: 'audit.view', label: 'View audit log' },
    { value: 'platform.manage', label: 'Manage platform settings' }
  ]

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setPlatformError('')
    try {
      const [prefsData, platformData] = await Promise.all([
        preferencesService.fetchPreferences(),
        isSuperadmin
          ? platformSettingsService.fetchPlatformSettings()
          : Promise.resolve(null)
      ])
      setPrefs(prefsData)
      setPlatformSettings(platformData)
      applyTheme(prefsData.theme)
      applyAccent(accent)
    } catch (e) {
      setError(e.message || 'Could not load settings')
    } finally {
      setLoading(false)
    }
  }, [accent, isSuperadmin])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!user) return
    setProfile({
      username: user.username || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      phone: user.phone || ''
    })
  }, [user])

  const handlePrefChange = (field, value) => {
    setPrefs((p) => (p ? { ...p, [field]: value } : p))
    setSaved(false)
  }

  const handleProfileChange = (field, value) => {
    setProfile((p) => ({ ...p, [field]: value }))
    setProfileSaved(false)
  }

  const handlePlatformChange = (field, value) => {
    setPlatformSettings((current) => (current ? { ...current, [field]: value } : current))
    setPlatformSaved(false)
  }

  const handleFeatureFlagChange = (flag, checked) => {
    setPlatformSettings((current) =>
      current
        ? {
            ...current,
            feature_flags: {
              ...current.feature_flags,
              [flag]: checked
            }
          }
        : current
    )
    setPlatformSaved(false)
  }

  const handleRolePermissionChange = (role, permission, checked) => {
    setPlatformSettings((current) => {
      if (!current) return current
      const next = new Set(current.role_permissions?.[role] || [])
      if (checked) next.add(permission)
      else next.delete(permission)
      return {
        ...current,
        role_permissions: {
          ...current.role_permissions,
          [role]: [...next]
        }
      }
    })
    setPlatformSaved(false)
  }

  const handleProfileSubmit = async (e) => {
    e.preventDefault()
    setProfileSaving(true)
    setProfileError('')
    setProfileSaved(false)
    try {
      await authService.patchProfile({
        username: profile.username.trim(),
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone
      })
      await refreshUser()
      setProfileSaved(true)
    } catch (err) {
      setProfileError(err.message || 'Could not save profile')
    } finally {
      setProfileSaving(false)
    }
  }

  const handlePrefsSubmit = async (e) => {
    e.preventDefault()
    if (!prefs) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const updated = await preferencesService.patchPreferences({
        theme: prefs.theme,
        timezone: prefs.timezone,
        language: prefs.language,
        email_notifications: prefs.email_notifications
      })
      setPrefs(updated)
      applyTheme(updated.theme)
      storeAccent(accent)
      applyAccent(accent)
      setSaved(true)
    } catch (err) {
      setError(err.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const handlePlatformSubmit = async (e) => {
    e.preventDefault()
    if (!platformSettings) return
    setPlatformSaving(true)
    setPlatformError('')
    setPlatformSaved(false)
    try {
      const updated = await platformSettingsService.patchPlatformSettings({
        login_max_failed_attempts: Number(platformSettings.login_max_failed_attempts),
        login_lockout_minutes: Number(platformSettings.login_lockout_minutes),
        feature_flags: platformSettings.feature_flags,
        role_permissions: platformSettings.role_permissions
      })
      setPlatformSettings(updated)
      setPlatformSaved(true)
    } catch (err) {
      setPlatformError(err.message || 'Could not save platform settings')
    } finally {
      setPlatformSaving(false)
    }
  }

  if (loading || !prefs) {
    return (
      <section className="dashboard-panel">
        <h1>Settings</h1>
        <p className="muted-text">{loading ? 'Loading…' : '—'}</p>
      </section>
    )
  }

  return (
    <section className="dashboard-panel settings-page">
      <h1>Settings</h1>
      <p className="muted-text">Profile, grayscale appearance, locale, and notification defaults.</p>

      {organization && (
        <>
          <h2 className="settings-section-title">Organization license</h2>
          <p className="muted-text settings-section-hint">
            Licensing is managed by your company account owner and your provider&apos;s company
            console.
          </p>
          <div className="settings-form">
            <label>
              Organization
              <input type="text" value={organization.name || ''} readOnly disabled className="settings-readonly" />
            </label>
            <label>
              License status
              <input type="text" value={subscription?.status || ''} readOnly disabled className="settings-readonly" />
            </label>
            <label>
              Plan
              <input type="text" value={subscription?.plan_name || ''} readOnly disabled className="settings-readonly" />
            </label>
            <label>
              Seat usage
              <input
                type="text"
                value={`Superadmins ${user?.seat_usage?.superadmin ?? 0}/${user?.seat_limits?.superadmin ?? 0}, Admins ${user?.seat_usage?.admin ?? 0}/${user?.seat_limits?.admin ?? 0}, Staff ${user?.seat_usage?.staff ?? 0}/${user?.seat_limits?.staff ?? 0}, Agents ${user?.seat_usage?.customer ?? 0}/${user?.seat_limits?.customer ?? 0}`}
                readOnly
                disabled
                className="settings-readonly"
              />
            </label>
          </div>
        </>
      )}

      <h2 className="settings-section-title">Profile</h2>
      <p className="muted-text settings-section-hint">
        How you appear in the app. New Google accounts use your email and name automatically; you can
        refine them here.
      </p>
      {profileError && <p className="error-message">{profileError}</p>}
      {profileSaved && <p className="settings-saved">Profile saved.</p>}
      <form className="settings-form" onSubmit={handleProfileSubmit}>
        <label>
          Email
          <input type="text" value={user?.email || ''} readOnly disabled className="settings-readonly" />
        </label>
        <label>
          Username
          <input
            type="text"
            value={profile.username}
            onChange={(e) => handleProfileChange('username', e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          First name
          <input
            type="text"
            value={profile.first_name}
            onChange={(e) => handleProfileChange('first_name', e.target.value)}
            autoComplete="given-name"
          />
        </label>
        <label>
          Last name
          <input
            type="text"
            value={profile.last_name}
            onChange={(e) => handleProfileChange('last_name', e.target.value)}
            autoComplete="family-name"
          />
        </label>
        <label>
          Phone
          <input
            type="text"
            value={profile.phone}
            onChange={(e) => handleProfileChange('phone', e.target.value)}
            autoComplete="tel"
          />
        </label>
        <button type="submit" disabled={profileSaving}>
          {profileSaving ? 'Saving…' : 'Save profile'}
        </button>
      </form>

      <h2 className="settings-section-title">Preferences</h2>
      {error && <p className="error-message">{error}</p>}
      {saved && <p className="settings-saved">Preferences saved.</p>}
      <form className="settings-form" onSubmit={handlePrefsSubmit}>
        <label>
          Theme
          <select
            value={prefs.theme}
            onChange={(e) => handlePrefChange('theme', e.target.value)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label>
          Accent
          <select
            value={accent}
            onChange={(e) => {
              const nextAccent = e.target.value
              setAccent(nextAccent)
              applyAccent(nextAccent)
              setSaved(false)
            }}
          >
            {ACCENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Timezone
          <select
            value={prefs.timezone}
            onChange={(e) => handlePrefChange('timezone', e.target.value)}
          >
            {[...new Set([prefs.timezone, ...TIMEZONES].filter(Boolean))].map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        <label>
          Language
          <select
            value={prefs.language}
            onChange={(e) => handlePrefChange('language', e.target.value)}
          >
            <option value="en">English</option>
            <option value="am">Amharic (beta)</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={prefs.email_notifications}
            onChange={(e) => handlePrefChange('email_notifications', e.target.checked)}
          />
          Email notifications (for future alerts)
        </label>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </form>

      {isSuperadmin && platformSettings && (
        <>
          <h2 className="settings-section-title">Security policy</h2>
          <p className="muted-text settings-section-hint">
            Control how many wrong login attempts are allowed before the app temporarily locks
            sign-in and sends recovery email help.
          </p>
          {platformError && <p className="error-message">{platformError}</p>}
          {platformSaved && <p className="settings-saved">Security policy saved.</p>}
          <form className="settings-form" onSubmit={handlePlatformSubmit}>
            <label>
              Max failed attempts
              <input
                type="number"
                min="1"
                value={platformSettings.login_max_failed_attempts}
                onChange={(e) =>
                  handlePlatformChange('login_max_failed_attempts', e.target.value)
                }
                required
              />
            </label>
            <label>
              Lockout minutes
              <input
                type="number"
                min="1"
                value={platformSettings.login_lockout_minutes}
                onChange={(e) =>
                  handlePlatformChange('login_lockout_minutes', e.target.value)
                }
                required
              />
            </label>
            <button type="submit" disabled={platformSaving}>
              {platformSaving ? 'Savingâ€¦' : 'Save security policy'}
            </button>
          </form>

          <h2 className="settings-section-title">Feature flags</h2>
          <p className="muted-text settings-section-hint">
            Toggle major product capabilities without redeploying.
          </p>
          <form className="settings-form" onSubmit={handlePlatformSubmit}>
            {Object.entries(platformSettings.feature_flags || {}).map(([flag, enabled]) => (
              <label key={flag} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(enabled)}
                  onChange={(e) => handleFeatureFlagChange(flag, e.target.checked)}
                />
                {flag.replaceAll('_', ' ')}
              </label>
            ))}
            <button type="submit" disabled={platformSaving}>
              {platformSaving ? 'Savingâ€¦' : 'Save feature flags'}
            </button>
          </form>

          <h2 className="settings-section-title">Role permissions</h2>
          <p className="muted-text settings-section-hint">
            Adjust capabilities per role without changing code.
          </p>
          <form className="settings-form" onSubmit={handlePlatformSubmit}>
            {Object.keys(platformSettings.role_permissions || {}).map((role) => (
              <div key={role}>
                <strong style={{ display: 'block', marginBottom: 8, textTransform: 'capitalize' }}>
                  {role}
                </strong>
                {permissionOptions.map((option) => (
                  <label key={`${role}-${option.value}`} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={(platformSettings.role_permissions?.[role] || []).includes(
                        option.value
                      )}
                      onChange={(e) =>
                        handleRolePermissionChange(role, option.value, e.target.checked)
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            ))}
            <button type="submit" disabled={platformSaving}>
              {platformSaving ? 'Savingâ€¦' : 'Save role permissions'}
            </button>
          </form>
        </>
      )}
    </section>
  )
}
