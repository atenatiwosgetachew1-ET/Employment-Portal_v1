import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import * as authService from '../services/authService'
import * as preferencesService from '../services/preferencesService'
import { applyTheme } from '../utils/theme'
import { applyStoredProfileOverride } from '../utils/profileStore'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null)
      applyTheme('dark')
    }
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [])

  useEffect(() => {
    const onProfileUpdated = () => {
      setUser((current) => (current ? applyStoredProfileOverride(current) : current))
    }
    window.addEventListener('profile:updated', onProfileUpdated)
    return () => window.removeEventListener('profile:updated', onProfileUpdated)
  }, [])

  useEffect(() => {
    authService
      .fetchCurrentUser()
      .then(async (u) => {
        setUser(applyStoredProfileOverride(u))
        try {
          const prefs = await preferencesService.fetchPreferences()
          applyTheme('dark')
        } catch {
          applyTheme('dark')
        }
      })
      .catch(() => {
        setUser(null)
        applyTheme('dark')
      })
      .finally(() => setBootstrapping(false))
  }, [])

  const signIn = async ({ username, password }) => {
    setAuthLoading(true)
    try {
      const loggedInUser = applyStoredProfileOverride(await authService.login({ username, password }))
      setUser(loggedInUser)
      try {
        await preferencesService.fetchPreferences()
        applyTheme('dark')
      } catch {
        applyTheme('dark')
      }
      return loggedInUser
    } finally {
      setAuthLoading(false)
    }
  }

  const signInWithGoogle = async (credential) => {
    setAuthLoading(true)
    try {
      const loggedInUser = applyStoredProfileOverride(await authService.loginWithGoogle(credential))
      setUser(loggedInUser)
      try {
        await preferencesService.fetchPreferences()
        applyTheme('dark')
      } catch {
        applyTheme('dark')
      }
      return loggedInUser
    } finally {
      setAuthLoading(false)
    }
  }

  const signOut = async () => {
    try {
      await authService.logout()
    } finally {
      setUser(null)
      applyTheme('dark')
    }
  }

  const refreshUser = async () => {
    const u = applyStoredProfileOverride(await authService.fetchCurrentUser())
    setUser(u)
    return u
  }

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      authLoading,
      bootstrapping,
      signIn,
      signInWithGoogle,
      signOut,
      refreshUser
    }),
    [user, authLoading, bootstrapping]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
