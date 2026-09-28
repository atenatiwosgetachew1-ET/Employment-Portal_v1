import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cleanupPrintFrame, printDocumentSilently } from '../../utils/employeeHelpers'

export default function EmployeeDocumentPreview({
  previewDocument,
  closeDocumentPreview,
  handlePreviewDownload,
  handlePreviewPrint,
  handlePreviewReset,
}) {
  const [rotation, setRotation] = useState(0)
  const [flipX, setFlipX] = useState(false)
  const [flipY, setFlipY] = useState(false)

  const [pdfFit, setPdfFit] = useState('FitH')
  const [pdfZoom, setPdfZoom] = useState(100)

  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  const imgRef = useRef(null)
  const canvasRef = useRef(null)
  const dragRef = useRef({ startX: 0, startY: 0, originX: 0, originY: 0 })
  const zoomRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const rotationRef = useRef(0)
  const flipXRef = useRef(false)
  const flipYRef = useRef(false)
  const zoomCommitTimeoutRef = useRef(null)

  rotationRef.current = rotation
  flipXRef.current = flipX
  flipYRef.current = flipY

  const isImage = Boolean(
    previewDocument?.isImage ??
    (
      previewDocument?.type?.startsWith('image/') ||
      previewDocument?.mime?.startsWith('image/') ||
      previewDocument?.file?.type?.startsWith('image/') ||
      previewDocument?.isProfilePhoto ||
      (typeof previewDocument?.url === 'string' && (
        previewDocument.url.startsWith('data:image/') ||
        previewDocument.url.startsWith('blob:') ||
        /\.(jpe?g|png|webp|gif|svg|bmp|avif)($|\?)/i.test(previewDocument.url)
      )) ||
      (typeof previewDocument?.name === 'string' && /\.(jpe?g|png|webp|gif|svg|bmp|avif)($|\?)/i.test(previewDocument.name))
    )
  )

  const isPdf = Boolean(
    previewDocument?.isPdf ??
    (
      !isImage && (
        previewDocument?.type === 'application/pdf' ||
        previewDocument?.mime === 'application/pdf' ||
        previewDocument?.file?.type === 'application/pdf' ||
        (typeof previewDocument?.url === 'string' && (
          previewDocument.url.startsWith('data:application/pdf') ||
          /\.pdf($|\?)/i.test(previewDocument.url)
        )) ||
        (typeof previewDocument?.name === 'string' && /\.pdf($|\?)/i.test(previewDocument.name))
      )
    )
  )

  const computedPdfUrl = useMemo(() => {
    if (!previewDocument?.url) return ''
    const baseUrl = previewDocument.url.split('#')[0]
    const params = ['toolbar=0', 'navpanes=0']
    if (pdfFit === 'Fit') {
      params.push('view=Fit')
    } else if (pdfFit === 'FitH') {
      params.push('view=FitH')
    }
    if (pdfZoom !== 100) {
      params.push(`zoom=${pdfZoom}`)
    }
    return `${baseUrl}#${params.join('&')}`
  }, [previewDocument?.url, pdfFit, pdfZoom])

  useEffect(() => {
    if (!previewDocument) {
      cleanupPrintFrame()
      return undefined
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cleanupPrintFrame()
        closeDocumentPreview?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown, true)
      cleanupPrintFrame()
    }
  }, [previewDocument, closeDocumentPreview])

  useEffect(() => {
    setRotation(0)
    setFlipX(false)
    setFlipY(false)
    setPdfFit('FitH')
    setPdfZoom(100)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    zoomRef.current = 1
    offsetRef.current = { x: 0, y: 0 }
    setDragging(false)
    if (imgRef.current) {
      imgRef.current.style.transform = ''
      imgRef.current.style.transition = ''
    }
  }, [previewDocument?.url])

  useEffect(() => {
    if (!dragging) return undefined

    const handlePointerMove = (event) => {
      const { startX, startY, originX, originY } = dragRef.current
      const newX = originX + (event.clientX - startX)
      const newY = originY + (event.clientY - startY)
      offsetRef.current = { x: newX, y: newY }

      if (imgRef.current) {
        imgRef.current.style.transition = 'none'
        imgRef.current.style.transform = `translate(${newX}px, ${newY}px) rotate(${rotationRef.current}deg) scale(${(flipXRef.current ? -1 : 1) * zoomRef.current}, ${(flipYRef.current ? -1 : 1) * zoomRef.current})`
      }
    }

    const handlePointerUp = () => {
      setDragging(false)
      setOffset(offsetRef.current)
      if (imgRef.current) {
        imgRef.current.style.transition = ''
      }
    }

    window.addEventListener('mousemove', handlePointerMove, { passive: true })
    window.addEventListener('mouseup', handlePointerUp)

    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [dragging])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !isImage) return undefined

    const handleWheelNative = (event) => {
      event.preventDefault()
      const img = imgRef.current
      if (!img) return

      const rect = canvas.getBoundingClientRect()
      const cursorX = event.clientX - (rect.left + rect.width / 2)
      const cursorY = event.clientY - (rect.top + rect.height / 2)

      const curZoom = zoomRef.current
      const curOffset = offsetRef.current

      const delta = -event.deltaY * (event.deltaMode === 1 ? 0.03 : event.deltaMode === 2 ? 0.6 : 0.0015)
      const factor = Math.min(1.25, Math.max(0.8, Math.exp(delta)))

      const nextZoom = Math.min(6, Math.max(1, Math.round(curZoom * factor * 1000) / 1000))
      if (nextZoom === curZoom) return

      let nextX = 0
      let nextY = 0
      if (nextZoom > 1) {
        const ratio = nextZoom / curZoom
        nextX = Math.round(cursorX - (cursorX - curOffset.x) * ratio)
        nextY = Math.round(cursorY - (cursorY - curOffset.y) * ratio)
      }

      zoomRef.current = nextZoom
      offsetRef.current = { x: nextX, y: nextY }

      img.style.transition = 'none'
      img.style.transform = `translate(${nextX}px, ${nextY}px) rotate(${rotationRef.current}deg) scale(${(flipXRef.current ? -1 : 1) * nextZoom}, ${(flipYRef.current ? -1 : 1) * nextZoom})`

      if (zoomCommitTimeoutRef.current) clearTimeout(zoomCommitTimeoutRef.current)
      zoomCommitTimeoutRef.current = setTimeout(() => {
        setZoom(zoomRef.current)
        setOffset(offsetRef.current)
        if (imgRef.current) {
          imgRef.current.style.transition = ''
        }
      }, 80)
    }

    canvas.addEventListener('wheel', handleWheelNative, { passive: false })
    return () => {
      canvas.removeEventListener('wheel', handleWheelNative)
      if (zoomCommitTimeoutRef.current) clearTimeout(zoomCommitTimeoutRef.current)
    }
  }, [isImage])

  const handleResetAll = () => {
    setRotation(0)
    setFlipX(false)
    setFlipY(false)
    setPdfFit('FitH')
    setPdfZoom(100)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    zoomRef.current = 1
    offsetRef.current = { x: 0, y: 0 }
    setDragging(false)
    if (imgRef.current) {
      imgRef.current.style.transform = ''
      imgRef.current.style.transition = ''
    }
    handlePreviewReset?.()
  }

  const handlePointerDown = (event) => {
    if (event.button !== 0) return
    if (!isImage) return
    event.preventDefault()
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y
    }
    setDragging(true)
  }

  const handleZoomIn = () => {
    const curZoom = zoomRef.current
    const nextZoom = Math.min(6, Math.round(curZoom * 1.25 * 100) / 100)
    zoomRef.current = nextZoom
    setZoom(nextZoom)
    if (imgRef.current) {
      imgRef.current.style.transition = ''
    }
  }

  const handleZoomOut = () => {
    const curZoom = zoomRef.current
    const nextZoom = Math.max(1, Math.round(curZoom * 0.8 * 100) / 100)
    zoomRef.current = nextZoom
    if (nextZoom === 1) {
      offsetRef.current = { x: 0, y: 0 }
      setOffset({ x: 0, y: 0 })
    }
    setZoom(nextZoom)
    if (imgRef.current) {
      imgRef.current.style.transition = ''
    }
  }

  const onDownload = () => {
    if (typeof handlePreviewDownload === 'function') {
      handlePreviewDownload()
      return
    }
    if (!previewDocument?.url) return
    const anchor = document.createElement('a')
    anchor.href = previewDocument.url
    anchor.download = previewDocument.label || previewDocument.name || 'document'
    anchor.target = '_blank'
    anchor.rel = 'noreferrer'
    anchor.click()
  }

  const onPrint = () => {
    if (typeof handlePreviewPrint === 'function') {
      handlePreviewPrint()
      return
    }
    if (!previewDocument?.url) return
    printDocumentSilently(previewDocument)
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      cleanupPrintFrame()
      closeDocumentPreview?.()
    }
  }

  if (!previewDocument) return null

  const documentLabel = previewDocument.label || previewDocument.name || 'Document preview'

  const modalContent = (
    <div
      className="app-confirm-backdrop employee-scan-backdrop document-preview-backdrop"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        className="employee-review-modal document-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={documentLabel}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="employee-review-header document-preview-toolbar">
          <div>
            <h2 className="document-preview-title">{documentLabel}</h2>
            <p className="app-confirm-message document-preview-subtitle">
              {previewDocument.subtitle || (previewDocument.name && previewDocument.name !== documentLabel ? previewDocument.name : 'Previewing attached document')}
            </p>
          </div>
          <div className="document-preview-header-right">
            <div className="document-preview-actions">
              <button
                type="button"
                className="btn-secondary document-preview-download"
                onClick={onDownload}
                title="Download document"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download</span>
              </button>
              <button
                type="button"
                className="btn-secondary document-preview-print"
                onClick={onPrint}
                title="Print document"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                <span>Print</span>
              </button>
            </div>
            <button
              type="button"
              className="btn-secondary document-preview-close-btn"
              onClick={() => {
                cleanupPrintFrame()
                closeDocumentPreview?.()
              }}
              aria-label="Close document preview"
              title="Close"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <div
          ref={canvasRef}
          className={`document-preview-canvas${zoom > 1 ? ' is-zoomed' : ''}${dragging ? ' is-dragging' : ''}`}
          onMouseDown={handlePointerDown}
        >
          {isImage ? (
            <>
              <img
                ref={imgRef}
                src={previewDocument.url}
                alt={documentLabel}
                decoding="async"
                draggable={false}
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${(flipX ? -1 : 1) * zoom}, ${(flipY ? -1 : 1) * zoom})`
                }}
              />
              <div
                className="document-preview-floating-toolbar"
                aria-label="Image adjustment controls"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="document-preview-toolbar-btn"
                  onClick={() => setRotation((prev) => (prev + 270) % 360)}
                  title="Rotate left 90°"
                  aria-label="Rotate left"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="document-preview-toolbar-btn"
                  onClick={() => setRotation((prev) => (prev + 90) % 360)}
                  title="Rotate right 90°"
                  aria-label="Rotate right"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`document-preview-toolbar-btn${flipX ? ' is-active' : ''}`}
                  onClick={() => setFlipX((prev) => !prev)}
                  title="Flip horizontally"
                  aria-label="Flip horizontal"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="8 4 4 8 8 12" />
                    <polyline points="16 12 20 16 16 20" />
                    <line x1="4" y1="8" x2="16" y2="8" />
                    <line x1="8" y1="16" x2="20" y2="16" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`document-preview-toolbar-btn${flipY ? ' is-active' : ''}`}
                  onClick={() => setFlipY((prev) => !prev)}
                  title="Flip vertically"
                  aria-label="Flip vertical"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 8 8 4 12 8" />
                    <polyline points="12 16 16 20 20 16" />
                    <line x1="8" y1="4" x2="8" y2="16" />
                    <line x1="16" y1="8" x2="16" y2="20" />
                  </svg>
                </button>
                <span className="document-preview-toolbar-divider" />
                <button
                  type="button"
                  className="document-preview-toolbar-btn"
                  onClick={handleZoomOut}
                  disabled={zoom <= 1}
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </button>
                <span className="document-preview-toolbar-zoom-badge" title="Zoom level">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  className="document-preview-toolbar-btn"
                  onClick={handleZoomIn}
                  disabled={zoom >= 5}
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </button>
                <span className="document-preview-toolbar-divider" />
                <button
                  type="button"
                  className="document-preview-toolbar-btn"
                  onClick={handleResetAll}
                  disabled={zoom === 1 && offset.x === 0 && offset.y === 0 && rotation === 0 && !flipX && !flipY}
                  title="Reset view (100% zoom, 0° rotation)"
                  aria-label="Reset view"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
              </div>
            </>
          ) : isPdf ? (
            <>
              <iframe
                key={computedPdfUrl}
                src={computedPdfUrl}
                title={documentLabel}
                className="document-preview-frame"
                scrolling="no"
              />
              <div
                className="document-preview-floating-toolbar"
                aria-label="PDF adjustment controls"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className={`document-preview-toolbar-btn${pdfFit === 'FitH' && pdfZoom === 100 ? ' is-active' : ''}`}
                  onClick={() => {
                    setPdfFit('FitH')
                    setPdfZoom(100)
                  }}
                  title="Fit to width"
                  aria-label="Fit to width"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <polyline points="6 8 2 12 6 16" />
                    <polyline points="18 8 22 12 18 16" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`document-preview-toolbar-btn${pdfFit === 'Fit' && pdfZoom === 100 ? ' is-active' : ''}`}
                  onClick={() => {
                    setPdfFit('Fit')
                    setPdfZoom(100)
                  }}
                  title="Fit entire page in view"
                  aria-label="Fit entire page in view"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                  </svg>
                </button>
                <span className="document-preview-toolbar-divider" />
                <button
                  type="button"
                  className="document-preview-toolbar-btn"
                  onClick={() => {
                    setPdfZoom((prev) => Math.max(50, prev - 25))
                    setPdfFit('')
                  }}
                  disabled={pdfZoom <= 50}
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </button>
                <span className="document-preview-toolbar-zoom-badge" title="Zoom level">
                  {pdfZoom !== 100 ? `${pdfZoom}%` : pdfFit === 'Fit' ? 'Fit Page' : 'Fit Width'}
                </span>
                <button
                  type="button"
                  className="document-preview-toolbar-btn"
                  onClick={() => {
                    setPdfZoom((prev) => Math.min(300, prev + 25))
                    setPdfFit('')
                  }}
                  disabled={pdfZoom >= 300}
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </button>
                <span className="document-preview-toolbar-divider" />
                <button
                  type="button"
                  className="document-preview-toolbar-btn"
                  onClick={() => {
                    setPdfFit('FitH')
                    setPdfZoom(100)
                  }}
                  title="Reset view (Fit to width, 100%)"
                  aria-label="Reset view"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <div className="employee-attachment-preview-file">
              Preview unavailable for this file type.
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body)
  }

  return modalContent
}
