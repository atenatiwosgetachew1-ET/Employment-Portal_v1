import React from 'react'

export default function EmployeeDocumentPreview({
  previewDocument,
  closeDocumentPreview,
  handlePreviewDownload,
  handlePreviewPrint,
  previewZoom,
  handlePreviewZoomOut,
  handlePreviewZoomIn,
  handlePreviewReset,
  previewOffset,
  previewDragging,
  handlePreviewWheel,
  handlePreviewPointerDown,
}) {
  if (!previewDocument) return null

  return (
    <div className="document-preview-backdrop" role="presentation" onClick={closeDocumentPreview}>
      <div
        className="document-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={previewDocument.label || 'Document preview'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="document-preview-toolbar">
          <div>
            <h3 className="document-preview-title">{previewDocument.label}</h3>
            <p className="muted-text document-preview-subtitle">
              Previewing attached document
            </p>
          </div>
          <div className="document-preview-actions">
            <button
              type="button"
              className="btn-secondary document-preview-download"
              onClick={handlePreviewDownload}
            >
              Download
            </button>
            <button type="button" className="btn-secondary" onClick={handlePreviewPrint}>
              Print
            </button>
            {previewDocument.isImage ? (
              <>
                <button type="button" className="btn-secondary" onClick={handlePreviewZoomOut} disabled={previewZoom <= 1}>
                  Zoom out
                </button>
                <button type="button" className="btn-secondary" onClick={handlePreviewZoomIn} disabled={previewZoom >= 4}>
                  Zoom in
                </button>
                <button type="button" className="btn-secondary" onClick={handlePreviewReset} disabled={previewZoom === 1 && previewOffset.x === 0 && previewOffset.y === 0}>
                  Reset
                </button>
              </>
            ) : null}
            <button type="button" className="btn-secondary" onClick={closeDocumentPreview}>
              Close
            </button>
          </div>
        </div>
        <div
          className={`document-preview-canvas${previewZoom > 1 ? ' is-zoomed' : ''}${previewDragging ? ' is-dragging' : ''}`}
          onWheel={handlePreviewWheel}
          onMouseDown={handlePreviewPointerDown}
        >
          {previewDocument.isImage ? (
            <img
              src={previewDocument.url}
              alt={previewDocument.label}
              decoding="async"
              draggable={false}
              style={{ transform: `translate(${previewOffset.x}px, ${previewOffset.y}px) scale(${previewZoom})` }}
            />
          ) : previewDocument.isPdf ? (
            <iframe
              src={previewDocument.url}
              title={previewDocument.label}
              className="document-preview-frame"
            />
          ) : (
            <div className="employee-attachment-preview-file">
              Preview unavailable for this file type.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
