import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '../common'

/**
 * EmployeeCameraModal
 *
 * Dual-Mode Camera Modal:
 * 1. Controlled mode: Accepts external cameraStream, scanCameraVideoRef, scanCameraCanvasRef, etc.
 * 2. Autonomous mode: Self-manages mediaStream, getUserMedia requests, video/canvas refs, and stream cleanup.
 *
 * Exposes capture result via onCapture({ blob, file, dataUrl }).
 */
export default function EmployeeCameraModal({
  isOpen,
  closeCameraCapture,
  onClose,
  cameraStream: externalCameraStream,
  scanCameraVideoRef: externalVideoRef,
  scanCameraCanvasRef: externalCanvasRef,
  cameraError: externalCameraError,
  cameraLoading: externalCameraLoading = false,
  retryCameraCapture: externalRetryCapture,
  backToScanOptionsFromCamera,
  captureCameraDocument: externalCaptureDocument,
  onCapture,
  title = 'Capture from Camera',
  subtitle = 'Position the document inside the preview, then capture a photo for OCR staging.',
}) {
  const isAutonomous = externalCameraStream === undefined && externalVideoRef === undefined

  // Autonomous state & refs
  const localVideoRef = useRef(null)
  const localCanvasRef = useRef(null)
  const localStreamRef = useRef(null)
  const requestCounterRef = useRef(0)

  const [localStream, setLocalStream] = useState(null)
  const [localLoading, setLocalLoading] = useState(false)
  const [localError, setLocalError] = useState('')

  const videoRef = externalVideoRef || localVideoRef
  const canvasRef = externalCanvasRef || localCanvasRef
  const cameraStream = isAutonomous ? localStream : externalCameraStream
  const cameraLoading = isAutonomous ? localLoading : externalCameraLoading
  const cameraError = isAutonomous ? localError : externalCameraError

  const handleClose = onClose || closeCameraCapture

  // Stop stream helper
  const stopAutonomousStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }
    setLocalStream(null)
  }, [])

  // Start stream helper
  const startAutonomousStream = useCallback(async () => {
    const requestId = ++requestCounterRef.current
    setLocalError('')
    setLocalLoading(true)

    if (!navigator.mediaDevices?.getUserMedia) {
      setLocalLoading(false)
      setLocalError('This browser does not support direct camera capture. Use scanner or upload instead.')
      return
    }

    try {
      stopAutonomousStream()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1600 },
          height: { ideal: 1200 },
        },
        audio: false,
      })

      if (requestCounterRef.current !== requestId) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      localStreamRef.current = stream
      setLocalStream(stream)
      setLocalError('')
    } catch (err) {
      if (requestCounterRef.current === requestId) {
        const isDenied =
          err?.name === 'NotAllowedError' ||
          /permission|denied|dismissed|notallowed/i.test(err?.message || '')
        setLocalError(
          isDenied
            ? 'Permission denied. Please allow camera permissions in your browser to take a photo.'
            : err?.message || 'Could not access the camera. Check browser permissions and try again.'
        )
      }
    } finally {
      if (requestCounterRef.current === requestId) {
        setLocalLoading(false)
      }
    }
  }, [stopAutonomousStream])

  // Attach stream to video element when ready in autonomous mode
  useEffect(() => {
    if (isAutonomous && videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream
      videoRef.current.play?.().catch(() => {})
    }
  }, [isAutonomous, cameraStream, videoRef])

  // Autonomous lifecycle hook
  useEffect(() => {
    if (!isAutonomous) return undefined
    if (isOpen) {
      startAutonomousStream()
    } else {
      stopAutonomousStream()
      setLocalError('')
      setLocalLoading(false)
    }
    return () => {
      stopAutonomousStream()
    }
  }, [isAutonomous, isOpen, startAutonomousStream, stopAutonomousStream])

  // Capture photo handler
  const handleCapture = useCallback(() => {
    if (externalCaptureDocument) {
      externalCaptureDocument()
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      if (isAutonomous) setLocalError('Camera preview is not ready yet.')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      if (isAutonomous) setLocalError('Could not prepare camera frame capture.')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) {
        if (isAutonomous) setLocalError('Could not capture camera frame.')
        return
      }
      const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)

      if (onCapture) {
        onCapture({ blob, file, dataUrl })
      }
      if (handleClose) {
        handleClose()
      }
    }, 'image/jpeg', 0.92)
  }, [externalCaptureDocument, videoRef, canvasRef, isAutonomous, onCapture, handleClose])

  const handleRetry = externalRetryCapture || (isAutonomous ? startAutonomousStream : null)

  const isPermissionDenied =
    Boolean(cameraError) &&
    /permission|denied|dismissed|notallowed/i.test(cameraError)

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      subtitle={subtitle}
      maxWidth="600px"
      className="employee-scan-modal employee-camera-modal"
      backdropClassName="employee-scan-backdrop"
      footer={
        <>
          {backToScanOptionsFromCamera && (
            <button type="button" className="btn-secondary" onClick={backToScanOptionsFromCamera}>
              Back
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          {cameraError && handleRetry ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleRetry}
              disabled={cameraLoading}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ marginRight: '6px' }}
                className={cameraLoading ? 'is-spinning' : ''}
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {cameraLoading ? 'Requesting...' : 'Request Permission Again'}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={handleCapture}
              disabled={!cameraStream || cameraLoading}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ marginRight: '6px', verticalAlign: '-1px' }}
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Capture Photo
            </button>
          )}
        </>
      }
    >
      <div className="employee-camera-preview">
        {cameraStream ? (
          <div className="employee-camera-stream-wrap">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="employee-camera-hud">
              <div className="employee-camera-live-pill">
                <span className="employee-camera-live-dot" />
                Live Camera
              </div>
              <div className="employee-camera-reticle">
                <span className="reticle-corner top-left" />
                <span className="reticle-corner top-right" />
                <span className="reticle-corner bottom-left" />
                <span className="reticle-corner bottom-right" />
                <div className="reticle-instruction">Fit document edges inside the guide</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="employee-camera-placeholder">
            <div className="employee-camera-loader" aria-hidden="true">
              {cameraLoading ? (
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="is-spinning"
                >
                  <line x1="12" y1="2" x2="12" y2="6" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                  <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                  <line x1="2" y1="12" x2="6" y2="12" />
                  <line x1="18" y1="12" x2="22" y2="12" />
                  <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                  <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                </svg>
              ) : isPermissionDenied ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 1l22 22m-2-7v-4a2 2 0 0 0-2-2h-3.17l-1.24-1.86A2 2 0 0 0 12.92 6H11m-6.42.58A2 2 0 0 0 3.17 8H2a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h15" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </div>
            <strong>
              {cameraLoading
                ? 'Requesting Camera Permission...'
                : isPermissionDenied
                ? 'Camera Permission Denied'
                : cameraError
                ? 'Camera Unavailable'
                : 'Initializing camera device...'}
            </strong>
            <span className="employee-camera-placeholder-desc">
              {cameraLoading
                ? 'Please check your browser prompt and click "Allow" to enable the camera.'
                : cameraError
                ? cameraError
                : 'Please allow browser camera permissions when prompted.'}
            </span>

            {isPermissionDenied && (
              <div className="employee-camera-tip-card">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>
                  If blocked, click the <strong>camera or lock icon</strong> in your browser address bar to allow access, then click <strong>Request Permission Again</strong> below.
                </span>
              </div>
            )}
          </div>
        )}
        <canvas ref={canvasRef} aria-hidden="true" style={{ display: 'none' }} />
      </div>
      {cameraError && !isPermissionDenied ? <p className="error-message employee-modal-error">{cameraError}</p> : null}
    </Modal>
  )
}