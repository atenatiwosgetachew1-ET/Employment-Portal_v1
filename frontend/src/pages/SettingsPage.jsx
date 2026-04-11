import { useCallback, useEffect, useState } from 'react'
import * as platformSettingsService from '../services/platformSettingsService'
import * as preferencesService from '../services/preferencesService'
import { useAuth } from '../context/AuthContext'
import { ACCENT_VALUES, applyAccent, applyTheme, getStoredAccent, storeAccent } from '../utils/theme'

const TIMEZONES = [
  'UTC',
  'Africa/Addis_Ababa',
  'America/New_York',
  'Europe/London',
  'Asia/Tokyo'
]

const LOCKED_THEME = 'dark'
const ACCENT_LABELS = {
  natural: 'Natural',
  orange: 'Orange'
}
const SETTINGS_TABS = [
  { id: 'organization', label: 'Organization' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'platform', label: 'Platform' }
]

export default function SettingsPage() {
  const { user } = useAuth()
  const organization = user?.organization
  const subscription = user?.subscription
  const [prefs, setPrefs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [platformSaving, setPlatformSaving] = useState(false)
  const [error, setError] = useState('')
  const [platformError, setPlatformError] = useState('')
  const [saved, setSaved] = useState(false)
  const [platformSaved, setPlatformSaved] = useState(false)
  const [platformSettings, setPlatformSettings] = useState(null)
  const [accent, setAccent] = useState(getStoredAccent())
  const [currentTab, setCurrentTab] = useState(organization ? 'organization' : 'preferences')
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
      setPrefs({ ...prefsData, theme: LOCKED_THEME })
      setPlatformSettings(platformData)
      applyTheme(LOCKED_THEME)
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
    if (currentTab !== 'platform') return
    if (!isSuperadmin) {
      setCurrentTab(organization ? 'organization' : 'preferences')
    }
  }, [currentTab, isSuperadmin, organization])

  const handlePrefChange = (field, value) => {
    setPrefs((p) => (p ? { ...p, [field]: value } : p))
    setSaved(false)
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

  const handlePrefsSubmit = async (e) => {
    e.preventDefault()
    if (!prefs) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const updated = await preferencesService.patchPreferences({
        theme: LOCKED_THEME,
        timezone: prefs.timezone,
        language: prefs.language,
        email_notifications: prefs.email_notifications
      })
      setPrefs({ ...updated, theme: LOCKED_THEME })
      applyTheme(LOCKED_THEME)
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
        <p className="muted-text">{loading ? 'Loading...' : '--'}</p>
      </section>
    )
  }

  return (
    <section className="dashboard-panel settings-page">
      <h1>Settings</h1>
      <p className="muted-text">Profile, organization, locale, and platform controls from one workspace.</p>

      <div className="employee-subtabs settings-tabs" role="tablist" aria-label="Settings views">
        {SETTINGS_TABS.filter((tab) => {
          if (tab.id === 'organization') return Boolean(organization)
          if (tab.id === 'platform') return isSuperadmin
          return true
        }).map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`employee-subtab${currentTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setCurrentTab(tab.id)}
            aria-pressed={currentTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {organization && currentTab === 'organization' ? (
        <article className="employee-summary-card settings-tab-card">
          <h2 className="settings-section-title">Organization license</h2>
          <p className="muted-text settings-section-hint">
            Licensing is managed by your company account owner and your provider's company console.
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
        </article>
      ) : null}

      {currentTab === 'preferences' ? (
        <article className="employee-summary-card settings-tab-card">
          <h2 className="settings-section-title">Preferences</h2>
          {error && <p className="error-message">{error}</p>}
          {saved && <p className="settings-saved">Preferences saved.</p>}
          <form className="settings-form" onSubmit={handlePrefsSubmit}>
            <label>
              Theme
              <input type="text" value="Dark" readOnly disabled className="settings-readonly" />
            </label>
            <label>
              Accent
              <select value={accent} onChange={(e) => setAccent(e.target.value)}>
                {ACCENT_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {ACCENT_LABELS[value] || value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Timezone
              <select value={prefs.timezone} onChange={(e) => handlePrefChange('timezone', e.target.value)}>
                {[...new Set([prefs.timezone, ...TIMEZONES].filter(Boolean))].map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Language
              <select value={prefs.language} onChange={(e) => handlePrefChange('language', e.target.value)}>
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
              {saving ? 'Saving...' : 'Save preferences'}
            </button>
          </form>
        </article>
      ) : null}

      {isSuperadmin && platformSettings && currentTab === 'platform' ? (
        <article className="employee-summary-card settings-tab-card">
          <h2 className="settings-section-title">Security policy</h2>
          <p className="muted-text settings-section-hint">
            Control how many wrong login attempts are allowed before the app temporarily locks sign-in and sends recovery email help.
          </p>
          {platformError && <p className="error-message">{platformError}</p>}
          {platformSaved && <p className="settings-saved">Platform settings saved.</p>}
          <form className="settings-form" onSubmit={handlePlatformSubmit}>
            <label>
              Max failed attempts
              <input
                type="number"
                min="1"
                value={platformSettings.login_max_failed_attempts}
                onChange={(e) => handlePlatformChange('login_max_failed_attempts', e.target.value)}
                required
              />
            </label>
            <label>
              Lockout minutes
              <input
                type="number"
                min="1"
                value={platformSettings.login_lockout_minutes}
                onChange={(e) => handlePlatformChange('login_lockout_minutes', e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={platformSaving}>
              {platformSaving ? 'Saving...' : 'Save security policy'}
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
              {platformSaving ? 'Saving...' : 'Save feature flags'}
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
                      checked={(platformSettings.role_permissions?.[role] || []).includes(option.value)}
                      onChange={(e) => handleRolePermissionChange(role, option.value, e.target.checked)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            ))}
            <button type="submit" disabled={platformSaving}>
              {platformSaving ? 'Saving...' : 'Save role permissions'}
            </button>
          </form>
        </article>
      ) : null}
    </section>
  )
}
