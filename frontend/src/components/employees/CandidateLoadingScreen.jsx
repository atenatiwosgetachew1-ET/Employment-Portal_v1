import React from 'react'

/**
 * Modern, mobile-responsive, flexible loading and skeleton screen
 * for candidate card listings (grid & list layouts).
 */
export function CandidateLoadingProgressBar() {
  return (
    <div className="candidate-loading-progress-bar" role="progressbar" aria-label="Updating candidates">
      <div className="candidate-loading-progress-bar-fill" />
    </div>
  )
}

export function CandidateGridCardSkeleton({ index }) {
  return (
    <div className="candidate-skeleton-card" aria-hidden="true" key={index}>
      {/* Identity Header */}
      <div className="candidate-skeleton-card-header">
        <div className="candidate-skeleton-identity">
          <span className="candidate-skeleton-bone candidate-skeleton-avatar" />
          <div className="candidate-skeleton-titles">
            <span
              className="candidate-skeleton-bone candidate-skeleton-name"
              style={{ width: `${60 + (index % 4) * 10}%` }}
            />
            <span className="candidate-skeleton-bone candidate-skeleton-code" />
          </div>
        </div>
        <span className="candidate-skeleton-bone candidate-skeleton-badge" />
      </div>

      {/* Meta Chips */}
      <div className="candidate-skeleton-chips">
        <span className="candidate-skeleton-bone candidate-skeleton-chip candidate-skeleton-chip--lg" />
        <span className="candidate-skeleton-bone candidate-skeleton-chip" />
        <span className="candidate-skeleton-bone candidate-skeleton-chip candidate-skeleton-chip--sm" />
      </div>

      {/* Progress Box */}
      <div className="candidate-skeleton-progress-box">
        <div className="candidate-skeleton-progress-meta">
          <span className="candidate-skeleton-bone candidate-skeleton-progress-label" />
          <span className="candidate-skeleton-bone candidate-skeleton-progress-percent" />
        </div>
        <span className="candidate-skeleton-bone candidate-skeleton-progress-bar" />
      </div>

      {/* KV Grid Details */}
      <div className="candidate-skeleton-kv-grid">
        <div className="candidate-skeleton-kv-row">
          <span className="candidate-skeleton-bone candidate-skeleton-kv-label" />
          <span className="candidate-skeleton-bone candidate-skeleton-kv-value" />
        </div>
        <div className="candidate-skeleton-kv-row">
          <span className="candidate-skeleton-bone candidate-skeleton-kv-label" />
          <span className="candidate-skeleton-bone candidate-skeleton-kv-value" style={{ width: '65%' }} />
        </div>
        <div className="candidate-skeleton-kv-row">
          <span className="candidate-skeleton-bone candidate-skeleton-kv-label" />
          <span className="candidate-skeleton-bone candidate-skeleton-kv-value" style={{ width: '85%' }} />
        </div>
        <div className="candidate-skeleton-kv-row">
          <span className="candidate-skeleton-bone candidate-skeleton-kv-label" />
          <span className="candidate-skeleton-bone candidate-skeleton-kv-value" style={{ width: '50%' }} />
        </div>
      </div>

      {/* Card Action Footer */}
      <div className="candidate-skeleton-footer">
        <span className="candidate-skeleton-bone candidate-skeleton-btn" />
        <span className="candidate-skeleton-bone candidate-skeleton-btn--sm" />
      </div>
    </div>
  )
}

export function CandidateListCardSkeleton({ index }) {
  return (
    <div className="candidate-skeleton-list-card" aria-hidden="true" key={index}>
      {/* Left Photo box */}
      <span className="candidate-skeleton-bone candidate-skeleton-list-photo" />

      {/* Center Details */}
      <div className="candidate-skeleton-list-content">
        <div className="candidate-skeleton-card-header">
          <div className="candidate-skeleton-titles">
            <span
              className="candidate-skeleton-bone candidate-skeleton-name"
              style={{ width: `${40 + (index % 3) * 15}%`, height: '18px' }}
            />
            <span className="candidate-skeleton-bone candidate-skeleton-code" style={{ width: '110px' }} />
          </div>
          <span className="candidate-skeleton-bone candidate-skeleton-badge" />
        </div>

        <div className="candidate-skeleton-chips">
          <span className="candidate-skeleton-bone candidate-skeleton-chip candidate-skeleton-chip--lg" />
          <span className="candidate-skeleton-bone candidate-skeleton-chip" />
          <span className="candidate-skeleton-bone candidate-skeleton-chip candidate-skeleton-chip--sm" />
        </div>

        <div className="candidate-skeleton-kv-grid">
          <div className="candidate-skeleton-kv-row">
            <span className="candidate-skeleton-bone candidate-skeleton-kv-label" />
            <span className="candidate-skeleton-bone candidate-skeleton-kv-value" />
          </div>
          <div className="candidate-skeleton-kv-row">
            <span className="candidate-skeleton-bone candidate-skeleton-kv-label" />
            <span className="candidate-skeleton-bone candidate-skeleton-kv-value" />
          </div>
        </div>

        <div className="candidate-skeleton-footer">
          <span className="candidate-skeleton-bone candidate-skeleton-chip" style={{ width: '130px', height: '26px' }} />
          <span className="candidate-skeleton-bone candidate-skeleton-chip" style={{ width: '110px', height: '26px' }} />
        </div>
      </div>

      {/* Side Actions Column */}
      <div className="candidate-skeleton-list-side">
        <span className="candidate-skeleton-bone candidate-skeleton-btn" />
        <span className="candidate-skeleton-bone candidate-skeleton-btn" />
      </div>
    </div>
  )
}

export default function CandidateLoadingScreen({
  layout = 'grid',
  count = 6,
  statusText = 'Loading candidates...',
  showMessageBlock = true
}) {
  const isList = layout === 'list'
  const itemsCount = isList ? Math.min(count, 4) : count
  const skeletonIndices = Array.from({ length: itemsCount }, (_, i) => i)

  return (
    <div className="candidate-loading-screen" role="status" aria-live="polite" aria-busy="true">
      {showMessageBlock && (
        <div className="candidate-loading-header">
          <div className="candidate-loading-status-pill">
            <svg
              className="candidate-loading-spinner"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
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
            <span>{statusText}</span>
          </div>
          <span className="candidate-skeleton-bone candidate-loading-counter-placeholder" />
        </div>
      )}

      {isList ? (
        <div className="candidate-skeleton-list">
          {skeletonIndices.map((idx) => (
            <CandidateListCardSkeleton key={idx} index={idx} />
          ))}
        </div>
      ) : (
        <div className="candidate-skeleton-grid">
          {skeletonIndices.map((idx) => (
            <CandidateGridCardSkeleton key={idx} index={idx} />
          ))}
        </div>
      )}
    </div>
  )
}
