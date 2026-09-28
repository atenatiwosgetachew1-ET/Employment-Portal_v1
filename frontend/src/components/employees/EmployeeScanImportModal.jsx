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
      title="Scan / Upload Candidate Document"
      subtitle="Speed up registration by letting OCR extract passport and identification details automatically, or choose to fill the form manually."
      maxWidth="720px"
      className="employee-scan-modal employee-scan-import-dialog"
      backdropClassName="employee-scan-backdrop"
      footer={
        <div className="employee-scan-modal-footer">
          <button
            type="button"
            className="btn-secondary employee-scan-btn-setup"
            onClick={openOcrSetupModal}
            title="Configure OCR extraction service"
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
              style={{ marginRight: '6px', verticalAlign: '-2px' }}
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            OCR Service Settings
          </button>
          <div className="employee-scan-modal-actions-right">
            <span className="employee-scan-footer-hint">Prefer manual entry?</span>
            <button
              type="button"
              className="btn-secondary employee-scan-btn-skip"
              onClick={closeScanImportModal}
            >
              Fill Form Manually
            </button>
          </div>
        </div>
      }
    >
      <div className="employee-scan-modal-content">
        <div className="employee-scan-intro-banner">
          <span className="employee-scan-intro-badge">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            >
              <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
            </svg>
            Recommended First Step
          </span>
          <p className="employee-scan-intro-text">
            Upload or capture the candidate's passport/ID. Our automated scanner extracts candidate details (names, dates, passport number, nationality) to prefill the registration form in seconds.
          </p>
        </div>

        <div className="employee-scan-choices-grid">
          {/* Option 1: File Upload (Most common) */}
          <button
            type="button"
            className={`employee-scan-choice-card employee-scan-choice-card--upload${ocrImportSource === 'upload' ? ' is-selected' : ''}`}
            onClick={() => triggerScanImport('upload')}
          >
            <span className="employee-scan-choice-badge">Fastest</span>
            <div className="employee-scan-choice-icon-wrap" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="employee-scan-choice-body">
              <div className="employee-scan-choice-title">Upload Document File</div>
              <div className="employee-scan-choice-desc">
                Select or drag & drop a PDF, JPG, or PNG document directly from your computer or phone.
              </div>
            </div>
            <div className="employee-scan-choice-footer">
              <span className="employee-scan-choice-action">Upload file</span>
              <div className="employee-scan-choice-arrow" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>
          </button>

          {/* Option 2: Live Camera Capture */}
          <button
            type="button"
            className={`employee-scan-choice-card employee-scan-choice-card--camera${ocrImportSource === 'camera' ? ' is-selected' : ''}`}
            onClick={() => triggerScanImport('camera')}
          >
            <div className="employee-scan-choice-icon-wrap" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <div className="employee-scan-choice-body">
              <div className="employee-scan-choice-title">Capture with Camera</div>
              <div className="employee-scan-choice-desc">
                Hold the physical document in front of this device’s webcam or phone camera to snap a photo.
              </div>
            </div>
            <div className="employee-scan-choice-footer">
              <span className="employee-scan-choice-action">Snap photo</span>
              <div className="employee-scan-choice-arrow" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>
          </button>

          {/* Option 3: Local Hardware Scanner */}
          <button
            type="button"
            className={`employee-scan-choice-card employee-scan-choice-card--scanner${ocrImportSource === 'scanner' ? ' is-selected' : ''}`}
            onClick={() => triggerScanImport('scanner')}
          >
            <div className="employee-scan-choice-icon-wrap" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
            </div>
            <div className="employee-scan-choice-body">
              <div className="employee-scan-choice-title">Local Scanner (Asprise)</div>
              <div className="employee-scan-choice-desc">
                Scan directly from an office flatbed scanner or feeder using the local TWAIN/WIA driver.
              </div>
            </div>
            <div className="employee-scan-choice-footer">
              <span className="employee-scan-choice-action">Connect scanner</span>
              <div className="employee-scan-choice-arrow" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>
          </button>
        </div>
      </div>
    </Modal>
  )
}
