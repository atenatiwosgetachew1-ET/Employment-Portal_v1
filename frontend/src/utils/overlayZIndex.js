import { useEffect, useState } from 'react'

let currentOverlayZIndex = 10000

/**
 * Returns a new z-index strictly higher than any previously issued z-index.
 * Implements "late comer to be on top" stacking logic for all overlays.
 */
export function getNextOverlayZIndex() {
  currentOverlayZIndex += 10
  return currentOverlayZIndex
}

/**
 * React hook that allocates a dynamic z-index whenever isOpen becomes true.
 * Guarantees that any modal or popup opening after another one is placed on top.
 *
 * @param {boolean} isOpen - Whether the overlay is currently open
 * @param {number} [initialZIndex] - Optional fallback base
 * @returns {number} The current dynamic z-index for this overlay
 */
export function useOverlayZIndex(isOpen = true, initialZIndex = 10000) {
  const [zIndex, setZIndex] = useState(() => (isOpen ? getNextOverlayZIndex() : initialZIndex))

  useEffect(() => {
    if (isOpen) {
      setZIndex(getNextOverlayZIndex())
    }
  }, [isOpen])

  return zIndex
}
