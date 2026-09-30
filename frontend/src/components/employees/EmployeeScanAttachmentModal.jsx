import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../common'
import { ATTACHMENT_FIELDS } from '../../constants/employeeOptions'
import { MANDATORY_ATTACHMENT_KEYS } from '../../utils/employeeHelpers'

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = (err) => reject(err)
    img.src = url
  })
}

/**
 * EmployeeScanAttachmentModal
 *
 * Universal document adjustment, cropping, and slot-targeting modal.
 * Supports:
 * - High-DPI canvas cropping, pan/zoom, 90deg rotation, horizontal/vertical flip for images.
 * - Interactive mouse wheel zoom & click-drag pan.
 * - PDF preview with fit-to-width, fit-page, and zoom level controls.
 * - Multi-slot assignment targeting candidate document slots (or single-crop export mode).
 */
export default function EmployeeScanAttachmentModal({
  isOpen,
  onClose,
  sourceFile,
  sourcePreviewUrl,
  sourceFileName = '',
  attachmentFields = ATTACHMENT_FIELDS,
  mandatoryKeys = MANDATORY_ATTACHMENT_KEYS,
  attachmentFiles = {},
  existingAttachmentDocs = {},
  attachmentLabels = {},
  initialSelectedKeys,
  onAttach,
  title = 'Attach from Document',
  subtitle = 'Select candidate slots to assign this document. For images, adjust the crop frame.',
  showSlotsPanel = true,
}) {
  const [selectedKeys, setSelectedKeys] = useState([])
  const [rotation, setRotation] = useState(0)
  const [flipX, setFlipX] = useState(false)
  const [flipY, setFlipY] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // PDF controls
  const [pdfZoom, setPdfZoom] = useState(100)
  const [pdfFit, setPdfFit] = useState('FitH')

  const frameRef = useRef(null)
  const imgRef = useRef(null)
  const dragRef = useRef({ startX: 0, startY: 0, originX: 0, originY: 0 })
  const zoomRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const rotationRef = useRef(0)
  const flipXRef = useRef(false)
  const flipYRef = useRef(false)
  const zoomCommitTimeoutRef = useRef(null)

  // Keep refs in sync for fast animation frames / listeners
  useEffect(() => {
    zoomRef.current = zoom
    offsetRef.current = offset
    rotationRef.current = rotation
    flipXRef.current = flipX
    flipYRef.current = flipY
  }, [zoom, offset, rotation, flipX, flipY])

  // Reset or initialize state when opening
  useEffect(() => {
    if (!isOpen) {
      setError('')
      setIsDragging(false)
      setIsSubmitting(false)
      return
    }

    setRotation(0)
    setFlipX(false)
    setFlipY(false)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setIsDragging(false)
    setPdfZoom(100)
    setPdfFit('FitH')
    setError('')
    setIsSubmitting(false)

    if (initialSelectedKeys && Array.isArray(initialSelectedKeys) && initialSelectedKeys.length > 0) {
      setSelectedKeys(initialSelectedKeys)
    } else if (showSlotsPanel && mandatoryKeys && mandatoryKeys.length > 0) {
      const missingMandatory = mandatoryKeys.filter(
        (key) => !attachmentFiles[key] && !existingAttachmentDocs[key]
      )
      setSelectedKeys(
        missingMandatory.length > 0
          ? missingMandatory
          : [mandatoryKeys[0] || (attachmentFields[0]?.key || '')]
      )
    } else if (attachmentFields[0]?.key) {
      setSelectedKeys([attachmentFields[0].key])
    }
  }, [isOpen, initialSelectedKeys, mandatoryKeys, attachmentFiles, existingAttachmentDocs, attachmentFields, showSlotsPanel])

  // Wheel zoom handler on frame
  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !isOpen || !sourceFile?.type?.startsWith('image/')) return undefined

    const handleWheel = (event) => {
      event.preventDefault()
      const rect = frame.getBoundingClientRect()
      const cursorX = event.clientX - (rect.left + rect.width / 2)
      const cursorY = event.clientY - (rect.top + rect.height / 2)

      const curZoom = zoomRef.current
      const curOffset = offsetRef.current
      const img = imgRef.current
      if (!img) return

      const delta = -event.deltaY
      const factor = delta > 0 ? 1.15 : 1 / 1.15

      const nextZoom = Math.min(5, Math.max(1, Math.round(curZoom * factor * 1000) / 1000))
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
      img.style.transform = `translate(${nextX}px, ${nextY}px) rotate(${rotationRef.current}deg) scale(${
        (flipXRef.current ? -1 : 1) * nextZoom
      }, ${(flipYRef.current ? -1 : 1) * nextZoom})`

      if (zoomCommitTimeoutRef.current) clearTimeout(zoomCommitTimeoutRef.current)
      zoomCommitTimeoutRef.current = setTimeout(() => {
        setZoom(zoomRef.current)
        setOffset(offsetRef.current)
        if (imgRef.current) {
          imgRef.current.style.transition = ''
        }
      }, 80)
    }

    frame.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      frame.removeEventListener('wheel', handleWheel)
      if (zoomCommitTimeoutRef.current) clearTimeout(zoomCommitTimeoutRef.current)
    }
  }, [isOpen, sourceFile])

  // Pointer drag handler
  const handlePointerDown = (event) => {
    if (event.button !== 0) return
    if (!sourceFile?.type?.startsWith('image/')) return
    event.preventDefault()
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y,
    }
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return undefined

    const handlePointerMove = (event) => {
      const { startX, startY, originX, originY } = dragRef.current
      const newX = originX + (event.clientX - startX)
      const newY = originY + (event.clientY - startY)
      offsetRef.current = { x: newX, y: newY }

      if (imgRef.current) {
        imgRef.current.style.transition = 'none'
        imgRef.current.style.transform = `translate(${newX}px, ${newY}px) rotate(${
          rotationRef.current
        }deg) scale(${(flipXRef.current ? -1 : 1) * zoomRef.current}, ${
          (flipYRef.current ? -1 : 1) * zoomRef.current
        })`
      }
    }

    const handlePointerUp = () => {
      setIsDragging(false)
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
  }, [isDragging])

  const resetView = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    zoomRef.current = 1
    offsetRef.current = { x: 0, y: 0 }
    setIsDragging(false)
    setPdfFit('FitH')
    setPdfZoom(100)
    if (imgRef.current) {
      imgRef.current.style.transform = ''
      imgRef.current.style.transition = ''
    }
  }

  // Build high-DPI adjusted image file via canvas
  const buildAdjustedFile = useCallback(async () => {
    if (!sourceFile) throw new Error('No scanned document is ready.')
    if (!sourceFile.type?.startsWith('image/')) return sourceFile
    if (typeof document === 'undefined' || !sourcePreviewUrl) return sourceFile

    const image = await loadImageFromUrl(sourcePreviewUrl)
    const frame = frameRef.current
    const frameWidth = Math.max(1, Math.round(frame?.clientWidth || image.naturalWidth))
    const frameHeight = Math.max(1, Math.round(frame?.clientHeight || image.naturalHeight))
    const pixelRatio = 2
    const imageRatio = image.naturalWidth / image.naturalHeight
    const frameRatio = frameWidth / frameHeight
    const drawWidth = imageRatio > frameRatio ? frameWidth : frameHeight * imageRatio
    const drawHeight = imageRatio > frameRatio ? frameWidth / imageRatio : frameHeight
    const normalizedRotation = ((rotation % 360) + 360) % 360

    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = Math.round(frameWidth * pixelRatio)
    outputCanvas.height = Math.round(frameHeight * pixelRatio)
    const outputContext = outputCanvas.getContext('2d')
    if (!outputContext) throw new Error('Could not prepare the adjusted scanned image.')

    outputContext.fillStyle = '#ffffff'
    outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height)
    outputContext.scale(pixelRatio, pixelRatio)
    outputContext.translate(frameWidth / 2 + offset.x, frameHeight / 2 + offset.y)
    outputContext.rotate((normalizedRotation * Math.PI) / 180)
    outputContext.scale((flipX ? -1 : 1) * zoom, (flipY ? -1 : 1) * zoom)
    outputContext.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)

    const blob = await new Promise((resolve, reject) => {
      outputCanvas.toBlob((nextBlob) => {
        if (nextBlob) resolve(nextBlob)
        else reject(new Error('Could not create the adjusted scanned attachment.'))
      }, 'image/jpeg', 0.92)
    })

    const adjustedFile = new File([blob], `scan-attachment-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    })
    const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.92)

    return { file: adjustedFile, blob, dataUrl }
  }, [sourceFile, sourcePreviewUrl, rotation, offset, flipX, flipY, zoom])

  const handleAttachSubmit = async () => {
    if (showSlotsPanel && selectedKeys.length === 0) {
      setError('Select at least one attachment slot.')
      return
    }
    setError('')
    setIsSubmitting(true)
    try {
      const result = await buildAdjustedFile()
      if (onAttach) {
        await onAttach({
          selectedKeys,
          file: result.file || sourceFile,
          blob: result.blob,
          dataUrl: result.dataUrl,
          sourceFile,
        })
      }
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not attach from the document.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyToggle = (key) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    )
  }

  const pdfUrl = useMemo(() => {
    if (!sourcePreviewUrl || sourceFile?.type?.startsWith('image/')) return ''
    const fitParam = pdfFit ? `&view=${pdfFit}` : ''
    return `${sourcePreviewUrl}#toolbar=0&navpanes=0&zoom=${pdfZoom}${fitParam}`
  }, [sourcePreviewUrl, sourceFile, pdfZoom, pdfFit])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      maxWidth="1040px"
      className="employee-scan-modal employee-scan-attach-modal"
      backdropClassName="employee-scan-backdrop"
      footer={
        <div className="employee-scan-modal-footer">
          <div className="employee-scan-footer-summary">
            {showSlotsPanel ? (
              selectedKeys.length > 0 ? (
                <span>
                  Targeting <strong>{selectedKeys.length}</strong>{' '}
                  {selectedKeys.length === 1 ? 'slot' : 'slots'}
                </span>
              ) : (
                <span className="text-warning">Select at least one slot</span>
              )
            ) : (
              <span>Document adjustment ready</span>
            )}
          </div>
          <div className="employee-scan-footer-buttons">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleAttachSubmit}
              disabled={isSubmitting || (showSlotsPanel && selectedKeys.length === 0)}
            >
              {isSubmitting
                ? 'Processing...'
                : showSlotsPanel
                ? selectedKeys.length > 0
                  ? `Attach to ${selectedKeys.length} ${selectedKeys.length === 1 ? 'Slot' : 'Slots'}`
                  : 'Attach selected'
                : 'Save Adjustment'}
            </button>
          </div>
        </div>
      }
    >
      <div className="employee-scan-attach-workspace">
        <div className="employee-scan-attach-preview">
          <div className="employee-scan-preview-tag">
            <span>
              {sourceFile?.type?.startsWith('image/')
                ? 'Image Framing'
                : 'Original Document (PDF)'}
            </span>
          </div>

          {sourcePreviewUrl && sourceFile?.type?.startsWith('image/') ? (
            <>
              <div
                ref={frameRef}
                className={`employee-scan-attach-image-frame${zoom > 1 ? ' is-zoomed' : ''}${
                  isDragging ? ' is-dragging' : ''
                }`}
                onMouseDown={handlePointerDown}
              >
                <div className="employee-scan-frame-guide" aria-hidden="true" />
                <img
                  ref={imgRef}
                  src={sourcePreviewUrl}
                  alt={sourceFileName || 'Scanned document preview'}
                  draggable="false"
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${
                      (flipX ? -1 : 1) * zoom
                    }, ${(flipY ? -1 : 1) * zoom})`,
                  }}
                />
              </div>
              <div className="employee-scan-attach-toolbar" aria-label="Image adjustment controls">
                <button
                  type="button"
                  className="employee-scan-toolbar-btn"
                  onClick={() => setRotation((prev) => (prev + 270) % 360)}
                  title="Rotate left 90 deg"
                  aria-label="Rotate left"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ overflow: 'visible' }}
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="employee-scan-toolbar-btn"
                  onClick={() => setRotation((prev) => (prev + 90) % 360)}
                  title="Rotate right 90 deg"
                  aria-label="Rotate right"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ overflow: 'visible' }}
                  >
                    <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`employee-scan-toolbar-btn${flipX ? ' is-active' : ''}`}
                  onClick={() => setFlipX((prev) => !prev)}
                  title="Flip horizontally"
                  aria-label="Flip horizontal"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ overflow: 'visible' }}
                  >
                    <polyline points="8 4 4 8 8 12" />
                    <polyline points="16 12 20 16 16 20" />
                    <line x1="4" y1="8" x2="16" y2="8" />
                    <line x1="8" y1="16" x2="20" y2="16" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`employee-scan-toolbar-btn${flipY ? ' is-active' : ''}`}
                  onClick={() => setFlipY((prev) => !prev)}
                  title="Flip vertically"
                  aria-label="Flip vertical"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ overflow: 'visible' }}
                  >
                    <polyline points="4 8 8 4 12 8" />
                    <polyline points="12 16 16 20 20 16" />
                    <line x1="8" y1="4" x2="8" y2="16" />
                    <line x1="16" y1="8" x2="16" y2="20" />
                  </svg>
                </button>
                <span className="employee-scan-toolbar-divider" />
                <button
                  type="button"
                  className="employee-scan-toolbar-btn"
                  onClick={() =>
                    setZoom((prev) => {
                      const next = Math.max(1, Number((prev - 0.25).toFixed(2)))
                      if (next === 1) setOffset({ x: 0, y: 0 })
                      return next
                    })
                  }
                  disabled={zoom <= 1}
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ overflow: 'visible' }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </button>
                <span className="employee-scan-toolbar-zoom-badge" title="Zoom level">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  className="employee-scan-toolbar-btn"
                  onClick={() =>
                    setZoom((prev) => Math.min(5, Number((prev + 0.25).toFixed(2))))
                  }
                  disabled={zoom >= 5}
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ overflow: 'visible' }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </button>
                <span className="employee-scan-toolbar-divider" />
                <button
                  type="button"
                  className="employee-scan-toolbar-btn"
                  onClick={resetView}
                  title="Reset view (100% zoom, 0 offset)"
                  aria-label="Reset view"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ overflow: 'visible' }}
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
              </div>
            </>
          ) : sourcePreviewUrl ? (
            <>
              <iframe
                key={pdfUrl}
                src={pdfUrl}
                title="Scanned document preview"
                className="employee-scan-attach-pdf-frame"
                scrolling="no"
              />
              <div className="employee-scan-attach-toolbar" aria-label="PDF adjustment controls">
                <button
                  type="button"
                  className={`employee-scan-toolbar-btn${
                    pdfFit === 'FitH' && pdfZoom === 100 ? ' is-active' : ''
                  }`}
                  onClick={() => {
                    setPdfFit('FitH')
                    setPdfZoom(100)
                  }}
                  title="Fit to width"
                  aria-label="Fit to width"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ overflow: 'visible' }}
                  >
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <polyline points="6 8 2 12 6 16" />
                    <polyline points="18 8 22 12 18 16" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`employee-scan-toolbar-btn${
                    pdfFit === 'Fit' && pdfZoom === 100 ? ' is-active' : ''
                  }`}
                  onClick={() => {
                    setPdfFit('Fit')
                    setPdfZoom(100)
                  }}
                  title="Fit entire page in view"
                  aria-label="Fit entire page in view"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ overflow: 'visible' }}
                  >
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                  </svg>
                </button>
                <span className="employee-scan-toolbar-divider" />
                <button
                  type="button"
                  className="employee-scan-toolbar-btn"
                  onClick={() => {
                    setPdfZoom((prev) => Math.max(50, prev - 25))
                    setPdfFit('')
                  }}
                  disabled={pdfZoom <= 50}
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ overflow: 'visible' }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </button>
                <span className="employee-scan-toolbar-zoom-badge" title="Zoom level">
                  {pdfZoom !== 100
                    ? `${pdfZoom}%`
                    : pdfFit === 'Fit'
                    ? 'Fit Page'
                    : 'Fit Width'}
                </span>
                <button
                  type="button"
                  className="employee-scan-toolbar-btn"
                  onClick={() => {
                    setPdfZoom((prev) => Math.min(300, prev + 25))
                    setPdfFit('')
                  }}
                  disabled={pdfZoom >= 300}
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ overflow: 'visible' }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </button>
                <span className="employee-scan-toolbar-divider" />
                <button
                  type="button"
                  className="employee-scan-toolbar-btn"
                  onClick={() => {
                    setPdfFit('FitH')
                    setPdfZoom(100)
                  }}
                  title="Reset view (Fit to width, 100%)"
                  aria-label="Reset view"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ overflow: 'visible' }}
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <div className="employee-camera-placeholder">No document preview is available.</div>
          )}
        </div>

        {showSlotsPanel && (
          <div className="employee-scan-attach-controls">
            <div className="employee-scan-slots-panel">
              <div className="employee-scan-slots-header">
                <div>
                  <strong>Target Attachment Slots</strong>
                  <span className="employee-scan-slots-subtitle">
                    Select candidate slots to receive this file
                  </span>
                </div>
                <div className="employee-scan-slots-quick-actions">
                  <button
                    type="button"
                    className="employee-scan-quick-btn"
                    onClick={() => {
                      const missing = mandatoryKeys.filter(
                        (k) => !attachmentFiles[k] && !existingAttachmentDocs[k]
                      )
                      setSelectedKeys(
                        missing.length > 0 ? missing : [...mandatoryKeys]
                      )
                    }}
                    title="Select mandatory slots"
                  >
                    Mandatory
                  </button>
                  <button
                    type="button"
                    className="employee-scan-quick-btn"
                    onClick={() =>
                      setSelectedKeys(attachmentFields.map((a) => a.key))
                    }
                    title="Select all slots"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="employee-scan-quick-btn"
                    onClick={() => setSelectedKeys([])}
                    title="Clear selection"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="employee-scan-slot-list">
                {attachmentFields.map((attachment) => {
                  const isSelected = selectedKeys.includes(attachment.key)
                  const isMandatory = mandatoryKeys.includes(attachment.key)
                  const isFilled = Boolean(
                    attachmentFiles[attachment.key] ||
                      existingAttachmentDocs[attachment.key]?.file_url
                  )

                  return (
                    <div
                      key={attachment.key}
                      className={`employee-scan-slot-item${isSelected ? ' is-selected' : ''}`}
                      onClick={() => handleKeyToggle(attachment.key)}
                      role="checkbox"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault()
                          handleKeyToggle(attachment.key)
                        }
                      }}
                    >
                      <div className="employee-scan-slot-checkbox" aria-hidden="true">
                        {isSelected ? (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ overflow: 'visible' }}
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : null}
                      </div>
                      <div className="employee-scan-slot-content">
                        <span className="employee-scan-slot-title">
                          {attachmentLabels[attachment.key] || attachment.label}
                        </span>
                        {isMandatory && (
                          <span className="employee-scan-slot-tag-req">Required</span>
                        )}
                      </div>
                      {isFilled && (
                        <span
                          className="employee-scan-slot-filled-indicator"
                          title="Already has an attached document"
                        >
                          Has file
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {sourceFile?.type?.startsWith('image/') ? (
                <div className="employee-scan-hint-banner">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{ overflow: 'visible' }}
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>
                    Crop tip: The exact framed area shown on the left will be saved into the
                    selected slots.
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
      {error ? <p className="error-message employee-modal-error">{error}</p> : null}
    </Modal>
  )
}
