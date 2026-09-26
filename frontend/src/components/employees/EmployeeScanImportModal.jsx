import React from 'react'
import { Modal } from '../common'

export default function EmployeeScanImportModal({
  isOpen,
  closeScanImportModal,
  ocrImportSource,
  triggerScanImport,
  openOcrSetupModal,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={closeScanImportModal}
      title="Scan from document"
      subtitle="Choose how you want to bring the document in, then use Auto fill to let the backend extract matching employee fields."
      className="employee-scan-modal"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={openOcrSetupModal}>OCR setup</button>
          <button type="button" className="btn-secondary" onClick={closeScanImportModal}>Cancel</button>
        </>
      }
    >
      <div className="notification-reminder-options employee-scan-option-grid">
        <button
          type="button"
          className={`notification-reminder-option employee-scan-option-card${ocrImportSource === 'camera' ? ' is-selected' : ''}`}
          onClick={() => triggerScanImport('camera')}
        >
          <span className="employee-scan-option-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 7h4l2-2h4l2 2h4v12H4V7Z" />
              <path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
            </svg>
          </span>
          <span className="employee-scan-option-copy">
            <strong>From camera</strong>
            <span>Capture a document photo from this device and stage it for OCR.</span>
          </span>
        </button>
        <button
          type="button"
          className={`notification-reminder-option employee-scan-option-card${ocrImportSource === 'scanner' ? ' is-selected' : ''}`}
          onClick={() => triggerScanImport('scanner')}
        >
          <span className="employee-scan-option-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 9V4h12v5" />
              <path d="M6 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-2" />
              <path d="M7 14h10v6H7v-6Z" />
            </svg>
          </span>
          <span className="employee-scan-option-copy">
            <strong>Scanner</strong>
            <span>Choose a scanned PDF or image from a scanner workflow on this device.</span>
          </span>
        </button>
        <button
          type="button"
          className={`notification-reminder-option employee-scan-option-card${ocrImportSource === 'upload' ? ' is-selected' : ''}`}
          onClick={() => triggerScanImport('upload')}
        >
          <span className="employee-scan-option-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 16V4" />
              <path d="M8 8l4-4 4 4" />
              <path d="M4 20h16" />
            </svg>
          </span>
          <span className="employee-scan-option-copy">
            <strong>Upload a document</strong>
            <span>Select an existing PDF or image so OCR can later read it and prefill the registration form.</span>
          </span>
        </button>
      </div>
    </Modal>
  )
}