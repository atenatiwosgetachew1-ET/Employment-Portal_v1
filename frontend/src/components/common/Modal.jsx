import { useEffect, useRef } from 'react'
import { useOverlayZIndex } from '../../utils/overlayZIndex'
import { createPortal } from 'react-dom'

/**
 * Accessible, reusable Modal component for dialogs, forms, and alerts.
 *
 * @param {object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {() => void} props.onClose - Callback invoked when close is requested
 * @param {string} [props.title] - Modal title text
 * @param {string} [props.subtitle] - Optional subtitle or description text
 * @param {React.ReactNode} props.children - Modal body content
 * @param {React.ReactNode} [props.footer] - Modal action buttons / footer
 * @param {string} [props.className=''] - Additional class for the modal container
 * @param {string} [props.backdropClassName=''] - Additional class for the backdrop
 * @param {boolean} [props.closeOnEscape=true] - Close when Escape is pressed
 * @param {boolean} [props.closeOnBackdrop=true] - Close when backdrop is clicked
 * @param {'dialog'|'alertdialog'} [props.role='dialog'] - ARIA role
 * @param {string} [props.ariaLabelledBy] - Custom ID for aria-labelledby
 * @param {string} [props.maxWidth] - Custom inline max-width (e.g. '640px')
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className = '',
  backdropClassName = '',
  closeOnEscape = true,
  closeOnBackdrop = true,
  role = 'dialog',
  ariaLabelledBy,
  maxWidth,
  ...rest
}) {
  const zIndex = useOverlayZIndex(isOpen)
  const dialogRef = useRef(null)
  const previousActiveElement = useRef(null)
  const titleId = ariaLabelledBy || (title ? `modal-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return

    previousActiveElement.current = document.activeElement

    // Prevent background scrolling while modal is active
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown, true)
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        try {
          previousActiveElement.current.focus()
        } catch {
          // ignore focus errors
        }
      }
    }
  }, [isOpen, closeOnEscape])

  if (!isOpen) return null

  const handleBackdropClick = (e) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose?.()
    }
  }

  const modalElement = (
    <div
      className={`app-confirm-backdrop ${backdropClassName}`.trim()}
      role="presentation"
      onClick={handleBackdropClick}
      style={{
        zIndex,
        '--overlay-z-index': zIndex,
      }}
    >
      <div
        ref={dialogRef}
        className={`employee-review-modal ${className}`.trim()}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        {...rest}
      >
        {title && (
          <div className="employee-review-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 id={titleId}>{title}</h2>
              {subtitle && <p className="app-confirm-message" style={{ margin: '4px 0 0' }}>{subtitle}</p>}
            </div>
            {onClose && (
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                aria-label="Close dialog"
                style={{ minHeight: '32px', padding: '4px 10px', fontSize: '1.2rem', lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </div>
        )}

        <div className="modal-body">
          {children}
        </div>

        {footer && (
          <div className="app-confirm-actions">
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(modalElement, document.body)
  }

  return modalElement
}