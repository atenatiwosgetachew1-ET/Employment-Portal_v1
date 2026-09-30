import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import EmployeeDocumentPreview from '../components/employees/EmployeeDocumentPreview'
import EmployeeReviewModal from '../components/employees/EmployeeReviewModal'
import EmployeeCameraModal from '../components/employees/EmployeeCameraModal'
import EmployeeScanAttachmentModal from '../components/employees/EmployeeScanAttachmentModal'
import { isImageDocument, isPdfDocumentUrl } from '../utils/employeeHelpers'

const PortalOverlayContext = createContext(null)

/**
 * PortalOverlayProvider
 *
 * Mounts universal overlay modals:
 *  - Document/image/PDF preview
 *  - Candidate profile review drawer
 *  - Live camera photo capture modal
 *  - Document framing, zoom, rotation, and slot adjustment modal
 *
 * at the root dashboard level so they are accessible from any page without local state duplication.
 *
 * Wrap this around the dashboard outlet. It provides:
 *  - useDocumentPreview()
 *  - useCandidateReview()
 *  - useCameraCapture()
 *  - useDocumentAdjust()
 *
 * Also registers global window event bridges:
 *  - 'portal:preview-document'
 *  - 'portal:open-candidate-review'
 *  - 'portal:open-camera-capture'
 *  - 'portal:open-document-adjust'
 */
export function PortalOverlayProvider({ children }) {
  // ── 1. Document Preview State ─────────────────────────────────────────
  const [previewDocument, setPreviewDocument] = useState(null)

  const openDocumentPreview = useCallback((payload) => {
    if (!payload) return
    const url = typeof payload === 'string'
      ? payload
      : (payload.url || payload.file_url || payload.fileUrl || payload.dataUrl || payload.file_path || payload.path || '')
    if (!url) return

    const isPdf = typeof payload === 'object' && payload.isPdf !== undefined
      ? Boolean(payload.isPdf)
      : isPdfDocumentUrl(url)
    const isImg = typeof payload === 'object' && payload.isImage !== undefined
      ? Boolean(payload.isImage)
      : (payload?.isProfilePhoto || (!isPdf && isImageDocument({ ...payload, file_url: url })))
    const label = (typeof payload === 'object' && (payload.label || payload.name || payload.title)) || 'Document preview'

    setPreviewDocument({
      ...(typeof payload === 'object' ? payload : {}),
      url,
      file_url: url,
      label,
      name: label,
      isPdf,
      isImage: isImg,
    })
  }, [])

  const closeDocumentPreview = useCallback(() => {
    setPreviewDocument(null)
  }, [])

  // ── 2. Candidate Review Modal State ───────────────────────────────────
  const [candidateReviewTarget, setCandidateReviewTarget] = useState(null)
  const [candidateReviewOptions, setCandidateReviewOptions] = useState({})

  const openCandidateReview = useCallback((target, options = {}) => {
    if (!target) return
    setCandidateReviewTarget(target)
    setCandidateReviewOptions(options)
  }, [])

  const closeCandidateReview = useCallback(() => {
    setCandidateReviewTarget(null)
    setCandidateReviewOptions({})
  }, [])

  // ── 3. Camera Capture Modal State ─────────────────────────────────────
  const [cameraCaptureConfig, setCameraCaptureConfig] = useState(null)

  const openCameraCapture = useCallback((options = {}) => {
    setCameraCaptureConfig(options)
  }, [])

  const closeCameraCapture = useCallback(() => {
    if (cameraCaptureConfig?.onClose) {
      cameraCaptureConfig.onClose()
    }
    setCameraCaptureConfig(null)
  }, [cameraCaptureConfig])

  // ── 4. Document Adjust / Framing Modal State ──────────────────────────
  const [documentAdjustConfig, setDocumentAdjustConfig] = useState(null)

  const openDocumentAdjust = useCallback((options = {}) => {
    setDocumentAdjustConfig(options)
  }, [])

  const closeDocumentAdjust = useCallback(() => {
    if (documentAdjustConfig?.onClose) {
      documentAdjustConfig.onClose()
    }
    setDocumentAdjustConfig(null)
  }, [documentAdjustConfig])

  // ── Window Event Bridges ──────────────────────────────────────────────
  useEffect(() => {
    const previewHandler = (event) => {
      const detail = event?.detail
      if (detail?.url) {
        openDocumentPreview(detail)
      }
    }

    const reviewHandler = (event) => {
      const detail = event?.detail
      const target = detail?.employee || detail?.candidate || detail?.employeeId || detail?.candidateId
      if (target) {
        openCandidateReview(target, detail?.options || {})
      }
    }

    const cameraHandler = (event) => {
      const detail = event?.detail || {}
      openCameraCapture(detail)
    }

    const adjustHandler = (event) => {
      const detail = event?.detail || {}
      openDocumentAdjust(detail)
    }

    window.addEventListener('portal:preview-document', previewHandler)
    window.addEventListener('portal:open-candidate-review', reviewHandler)
    window.addEventListener('portal:open-camera-capture', cameraHandler)
    window.addEventListener('portal:open-document-adjust', adjustHandler)

    return () => {
      window.removeEventListener('portal:preview-document', previewHandler)
      window.removeEventListener('portal:open-candidate-review', reviewHandler)
      window.removeEventListener('portal:open-camera-capture', cameraHandler)
      window.removeEventListener('portal:open-document-adjust', adjustHandler)
    }
  }, [openDocumentPreview, openCandidateReview, openCameraCapture, openDocumentAdjust])

  // ── Context Value ─────────────────────────────────────────────────────
  const value = useMemo(() => ({
    // Document preview
    openDocumentPreview,
    closeDocumentPreview,
    previewDocument,
    // Candidate review
    openCandidateReview,
    closeCandidateReview,
    candidateReviewTarget,
    // Camera capture
    openCameraCapture,
    closeCameraCapture,
    isCameraOpen: Boolean(cameraCaptureConfig),
    // Document adjust
    openDocumentAdjust,
    closeDocumentAdjust,
    isDocumentAdjustOpen: Boolean(documentAdjustConfig),
  }), [
    openDocumentPreview,
    closeDocumentPreview,
    previewDocument,
    openCandidateReview,
    closeCandidateReview,
    candidateReviewTarget,
    openCameraCapture,
    closeCameraCapture,
    cameraCaptureConfig,
    openDocumentAdjust,
    closeDocumentAdjust,
    documentAdjustConfig,
  ])

  return (
    <PortalOverlayContext.Provider value={value}>
      {children}

      {/* Universal Document / Image / PDF Preview — mounted once, portals to body */}
      <EmployeeDocumentPreview
        previewDocument={previewDocument}
        closeDocumentPreview={closeDocumentPreview}
      />

      {/* Universal Candidate Profile Review Drawer — mounted once, portals to body */}
      {candidateReviewTarget && (
        <EmployeeReviewModal
          employee={typeof candidateReviewTarget === 'object' ? candidateReviewTarget : null}
          employeeId={typeof candidateReviewTarget === 'object' ? candidateReviewTarget.id : candidateReviewTarget}
          isOpen={Boolean(candidateReviewTarget)}
          onClose={closeCandidateReview}
          {...candidateReviewOptions}
        />
      )}

      {/* Universal Camera Capture Modal — autonomous camera lifecycle */}
      {cameraCaptureConfig && (
        <EmployeeCameraModal
          isOpen={Boolean(cameraCaptureConfig)}
          onClose={closeCameraCapture}
          onCapture={(captureResult) => {
            if (cameraCaptureConfig?.onCapture) {
              cameraCaptureConfig.onCapture(captureResult)
            }
            closeCameraCapture()
          }}
          title={cameraCaptureConfig.title}
          subtitle={cameraCaptureConfig.subtitle}
        />
      )}

      {/* Universal Document Framing & Slot Adjustment Modal */}
      {documentAdjustConfig && (
        <EmployeeScanAttachmentModal
          isOpen={Boolean(documentAdjustConfig)}
          onClose={closeDocumentAdjust}
          sourceFile={documentAdjustConfig.sourceFile || documentAdjustConfig.file}
          sourcePreviewUrl={documentAdjustConfig.sourcePreviewUrl || documentAdjustConfig.previewUrl}
          sourceFileName={documentAdjustConfig.sourceFileName || documentAdjustConfig.fileName}
          attachmentFields={documentAdjustConfig.attachmentFields}
          mandatoryKeys={documentAdjustConfig.mandatoryKeys}
          attachmentFiles={documentAdjustConfig.attachmentFiles}
          existingAttachmentDocs={documentAdjustConfig.existingAttachmentDocs}
          attachmentLabels={documentAdjustConfig.attachmentLabels}
          initialSelectedKeys={documentAdjustConfig.initialSelectedKeys}
          showSlotsPanel={documentAdjustConfig.showSlotsPanel ?? true}
          title={documentAdjustConfig.title}
          subtitle={documentAdjustConfig.subtitle}
          onAttach={async (result) => {
            if (documentAdjustConfig?.onAttach) {
              await documentAdjustConfig.onAttach(result)
            }
            closeDocumentAdjust()
          }}
        />
      )}
    </PortalOverlayContext.Provider>
  )
}

/**
 * useDocumentPreview()
 *
 * Returns { openDocumentPreview, closeDocumentPreview, previewDocument }
 */
export function useDocumentPreview() {
  const context = useContext(PortalOverlayContext)
  if (!context) {
    throw new Error('useDocumentPreview must be used within PortalOverlayProvider')
  }
  return {
    openDocumentPreview: context.openDocumentPreview,
    closeDocumentPreview: context.closeDocumentPreview,
    previewDocument: context.previewDocument,
  }
}

/**
 * useCandidateReview()
 *
 * Returns { openCandidateReview, closeCandidateReview, activeCandidate }
 */
export function useCandidateReview() {
  const context = useContext(PortalOverlayContext)
  if (!context) {
    throw new Error('useCandidateReview must be used within PortalOverlayProvider')
  }
  return {
    openCandidateReview: context.openCandidateReview,
    closeCandidateReview: context.closeCandidateReview,
    activeCandidate: context.candidateReviewTarget,
  }
}

/**
 * useCameraCapture()
 *
 * Returns { openCameraCapture, closeCameraCapture, isCameraOpen }
 *
 * Usage:
 *   const { openCameraCapture } = useCameraCapture()
 *   openCameraCapture({
 *     onCapture: ({ file, blob, dataUrl }) => { ... },
 *     title: 'Take photo',
 *   })
 */
export function useCameraCapture() {
  const context = useContext(PortalOverlayContext)
  if (!context) {
    throw new Error('useCameraCapture must be used within PortalOverlayProvider')
  }
  return {
    openCameraCapture: context.openCameraCapture,
    closeCameraCapture: context.closeCameraCapture,
    isCameraOpen: context.isCameraOpen,
  }
}

/**
 * useDocumentAdjust()
 *
 * Returns { openDocumentAdjust, closeDocumentAdjust, isDocumentAdjustOpen }
 *
 * Usage:
 *   const { openDocumentAdjust } = useDocumentAdjust()
 *   openDocumentAdjust({
 *     sourceFile: file,
 *     sourcePreviewUrl: url,
 *     onAttach: async ({ selectedKeys, file, blob }) => { ... },
 *   })
 */
export function useDocumentAdjust() {
  const context = useContext(PortalOverlayContext)
  if (!context) {
    throw new Error('useDocumentAdjust must be used within PortalOverlayProvider')
  }
  return {
    openDocumentAdjust: context.openDocumentAdjust,
    closeDocumentAdjust: context.closeDocumentAdjust,
    isDocumentAdjustOpen: context.isDocumentAdjustOpen,
  }
}
