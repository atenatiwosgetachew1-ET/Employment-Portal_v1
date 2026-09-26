import React from 'react'
import { Modal } from '../common'

export default function EmployeeCameraModal({
  isOpen,
  closeCameraCapture,
  cameraStream,
  scanCameraVideoRef,
  scanCameraCanvasRef,
  cameraError,
  backToScanOptionsFromCamera,
  captureCameraDocument,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={closeCameraCapture}
      title="Capture from camera"
      subtitle="Position the document inside the preview, then capture a photo for OCR staging."
      className="employee-scan-modal employee-camera-modal"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={backToScanOptionsFromCamera}>Back</button>
          <button type="button" className="btn-secondary" onClick={closeCameraCapture}>Cancel</button>
          <button type="button" onClick={captureCameraDocument} disabled={!cameraStream}>Capture photo</button>
        </>
      }
    >
      <div className="employee-camera-preview">
        {cameraStream ? (
          <video ref={scanCameraVideoRef} autoPlay playsInline muted />
        ) : (
          <div className="employee-camera-placeholder">
            {cameraError || 'Starting camera...'}
          </div>
        )}
        <canvas ref={scanCameraCanvasRef} aria-hidden="true" />
      </div>
      {cameraError ? <p className="error-message employee-modal-error">{cameraError}</p> : null}
    </Modal>
  )
}