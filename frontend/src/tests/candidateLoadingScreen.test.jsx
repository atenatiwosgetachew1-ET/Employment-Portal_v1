import { describe, it, expect } from 'vitest'
import React from 'react'
import CandidateLoadingScreen, {
  CandidateLoadingProgressBar,
  CandidateGridCardSkeleton,
  CandidateListCardSkeleton
} from '../components/employees/CandidateLoadingScreen'
import {
  CandidateLoadingScreen as ReexportedCandidateLoadingScreen,
  CandidateLoadingProgressBar as ReexportedCandidateLoadingProgressBar
} from '../components/candidates'

describe('CandidateLoadingScreen Component', () => {
  it('exports properly from both employees and candidates domains', () => {
    expect(CandidateLoadingScreen).toBeDefined()
    expect(ReexportedCandidateLoadingScreen).toBe(CandidateLoadingScreen)
    expect(ReexportedCandidateLoadingProgressBar).toBe(CandidateLoadingProgressBar)
  })

  it('renders default grid layout with 6 skeleton cards', () => {
    const element = CandidateLoadingScreen({ layout: 'grid', count: 6 })
    expect(element).toBeDefined()
    expect(element.props.className).toContain('candidate-loading-screen')
    expect(element.props.role).toBe('status')
    expect(element.props['aria-busy']).toBe('true')
  })

  it('renders list layout when layout="list"', () => {
    const element = CandidateLoadingScreen({ layout: 'list', count: 4 })
    expect(element).toBeDefined()
    expect(element.props.className).toContain('candidate-loading-screen')
  })

  it('renders CandidateLoadingProgressBar with appropriate accessibility attributes', () => {
    const progressBar = CandidateLoadingProgressBar()
    expect(progressBar).toBeDefined()
    expect(progressBar.props.className).toContain('candidate-loading-progress-bar')
    expect(progressBar.props.role).toBe('progressbar')
  })

  it('renders individual grid and list card skeletons without errors', () => {
    const gridCard = CandidateGridCardSkeleton({ index: 0 })
    expect(gridCard).toBeDefined()
    expect(gridCard.props.className).toContain('candidate-skeleton-card')

    const listCard = CandidateListCardSkeleton({ index: 0 })
    expect(listCard).toBeDefined()
    expect(listCard.props.className).toContain('candidate-skeleton-list-card')
  })
})
