import React from 'react'
import { Modal } from '../common'

export default function EmployeeCameraModal({
  isOpen,
  closeCameraCapture,
  cameraStream,
  scanCameraVideoRef,
  scanCameraCanvasRef,
  cameraError,
  cameraLoading = false,
  retryCameraCapture,
  backToScanOptionsFromCamera,
  captureCameraDocument,
}) {
  const isPermissionDenied =
    Boolean(cameraError) &&
    /permission|denied|dismissed|notallowed/i.test(cameraError)

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeCameraCapture}
      title="Capture from Camera"
      subtitle="Position the document inside the preview, then capture a photo for OCR staging."
      maxWidth="600px"
      className="employee-scan-modal employee-camera-modal"
      backdropClassName="employee-scan-backdrop"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={backToScanOptionsFromCamera}>Back</button>
          <button type="button" className="btn-secondary" onClick={closeCameraCapture}>Cancel</button>
          {cameraError && retryCameraCapture ? (
            <button
              type="button"
              className="btn-primary"
              onClick={retryCameraCapture}
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
              onClick={captureCameraDocument}
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
            <video ref={scanCameraVideoRef} autoPlay playsInline muted />
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
        <canvas ref={scanCameraCanvasRef} aria-hidden="true" style={{ display: 'none' }} />
      </div>
      {cameraError && !isPermissionDenied ? <p className="error-message employee-modal-error">{cameraError}</p> : null}
    </Modal>
  )
}