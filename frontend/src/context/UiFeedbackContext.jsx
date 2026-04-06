import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const UiFeedbackContext = createContext(null)

function createToastId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function UiFeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)
  const confirmResolverRef = useRef(null)

  const showToast = useCallback((message, options = {}) => {
    if (!message) return
    const id = createToastId()
    const toast = {
      id,
      message,
      tone: options.tone || 'info',
      title: options.title || '',
      duration: options.duration ?? 3600
    }

    setToasts((prev) => [...prev, toast])

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, toast.duration)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve
      setConfirmState({
        title: options?.title || 'Confirm action',
        message: options?.message || 'Are you sure you want to continue?',
        confirmLabel: options?.confirmLabel || 'Confirm',
        cancelLabel: options?.cancelLabel || 'Cancel',
        tone: options?.tone || 'default'
      })
    })
  }, [])

  const closeConfirm = useCallback((result) => {
    if (confirmResolverRef.current) {
      confirmResolverRef.current(result)
      confirmResolverRef.current = null
    }
    setConfirmState(null)
  }, [])

  const value = useMemo(() => ({
    showToast,
    confirm
  }), [confirm, showToast])

  return (
    <UiFeedbackContext.Provider value={value}>
      {children}
      <div className="app-toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`app-toast app-toast--${toast.tone}`}>
            <div className="app-toast-copy">
              {toast.title ? <strong>{toast.title}</strong> : null}
              <span>{toast.message}</span>
            </div>
            <button type="button" className="app-toast-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">
              ×
            </button>
          </div>
        ))}
      </div>
      {confirmState ? (
        <div className="app-confirm-backdrop" role="presentation" onClick={() => closeConfirm(false)}>
          <div
            className={`app-confirm-dialog app-confirm-dialog--${confirmState.tone}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-confirm-title"
            aria-describedby="app-confirm-message"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="app-confirm-header">
              <h2 id="app-confirm-title">{confirmState.title}</h2>
            </div>
            <p id="app-confirm-message" className="app-confirm-message">{confirmState.message}</p>
            <div className="app-confirm-actions">
              <button type="button" className="btn-secondary" onClick={() => closeConfirm(false)}>
                {confirmState.cancelLabel}
              </button>
              <button
                type="button"
                className={confirmState.tone === 'danger' ? 'btn-danger' : confirmState.tone === 'warning' ? 'btn-warning' : 'btn-secondary'}
                onClick={() => closeConfirm(true)}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </UiFeedbackContext.Provider>
  )
}

export function useUiFeedback() {
  const context = useContext(UiFeedbackContext)
  if (!context) {
    throw new Error('useUiFeedback must be used within UiFeedbackProvider')
  }
  return context
}
