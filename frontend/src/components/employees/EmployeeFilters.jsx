import { useEffect, useMemo, useRef, useState } from 'react'
import {
  GENDER_OPTIONS,
  RELIGION_OPTIONS,
  EXPERIENCE_COUNTRIES,
  PROFESSION_OPTIONS
} from '../../constants/employeeOptions'

export default function EmployeeFilters({
  currentView,
  searchInput = '',
  setSearchInput = () => {},
  filters = {},
  setFilters = () => {},
  setPage = () => {},
  EMPLOYEE_TAG_FILTER_OPTIONS = [],
  employeeCardsLayout = 'list',
  setEmployeeCardsLayout = () => {},
  employeeCardsSort = 'newest',
  setEmployeeCardsSort = () => {},
  loading = false,
  onRefresh,
  employees = [],
  visibleCount,
  totalCount
}) {
  if (currentView === 'register') return null

  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const isInitialMount = useRef(true)

  // Debounced search to auto-filter as the user types without requiring manual "Apply" click
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    const timer = setTimeout(() => {
      const trimmed = (searchInput || '').trim()
      setFilters((prev) => {
        if ((prev.q || '') === trimmed) return prev
        setPage(1)
        return { ...prev, q: trimmed }
      })
    }, 300)

    return () => clearTimeout(timer)
  }, [searchInput, setFilters, setPage])

  const handleSubmit = (event) => {
    if (event) event.preventDefault()
    const trimmed = (searchInput || '').trim()
    setPage(1)
    setFilters((prev) => ({ ...prev, q: trimmed }))
  }

  const handleClearSearch = () => {
    setSearchInput('')
    setPage(1)
    setFilters((prev) => ({ ...prev, q: '' }))
  }

  const updateFilter = (key, value) => {
    setPage(1)
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleResetAll = () => {
    setSearchInput('')
    setPage(1)
    setFilters({
      q: '',
      isActive: '',
      profession: '',
      gender: '',
      religion: '',
      experience: '',
      destinationCountry: '',
      docStatus: '',
      tag: ''
    })
  }

  // Combined professions from loaded records and standard catalog
  const professionOptions = useMemo(() => {
    const set = new Set()
    if (Array.isArray(employees)) {
      employees.forEach((emp) => {
        const p = String(emp.profession || '').trim()
        if (p) set.add(p)
      })
    }
    PROFESSION_OPTIONS.forEach((p) => set.add(p))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [employees])

  // Count active non-search filters
  const activeFilterFields = [
    'isActive',
    'profession',
    'gender',
    'religion',
    'destinationCountry',
    'experience',
    'docStatus',
    'tag'
  ]
  const activeFiltersCount = activeFilterFields.filter((k) => Boolean(filters[k])).length

  const hasAnyFilter = Boolean(
    (searchInput || '').trim() ||
    filters.q ||
    activeFiltersCount > 0
  )

  // Label lookups for active chips
  const getExperienceLabel = (val) => {
    if (val === 'fresher') return 'Fresher'
    if (val === 'experienced') return 'Experienced'
    return val
  }

  const getDocStatusLabel = (val) => {
    if (val === 'has_medical') return 'Medical Ready'
    if (val === 'has_passport') return 'Passport'
    if (val === 'has_photo') return 'Photo'
    if (val === 'complete') return 'Core Docs'
    return val
  }

  const getTagLabel = (val) => {
    const match = EMPLOYEE_TAG_FILTER_OPTIONS.find((opt) => opt.value === val)
    return match ? match.label : val
  }

  // Applied filter chips positioned directly beside the filter toggling button
  const appliedChips = useMemo(() => {
    const list = []
    if (filters.isActive) {
      list.push({
        id: 'isActive',
        key: 'Status:',
        val: filters.isActive === 'true' ? 'Available' : 'Not available',
        onRemove: () => updateFilter('isActive', '')
      })
    }
    if (filters.profession) {
      list.push({
        id: 'profession',
        key: 'Role:',
        val: filters.profession,
        onRemove: () => updateFilter('profession', '')
      })
    }
    if (filters.gender) {
      list.push({
        id: 'gender',
        key: 'Gender:',
        val: filters.gender,
        onRemove: () => updateFilter('gender', '')
      })
    }
    if (filters.religion) {
      list.push({
        id: 'religion',
        key: 'Faith:',
        val: filters.religion,
        onRemove: () => updateFilter('religion', '')
      })
    }
    if (filters.destinationCountry) {
      list.push({
        id: 'destinationCountry',
        key: 'Target:',
        val: filters.destinationCountry,
        onRemove: () => updateFilter('destinationCountry', '')
      })
    }
    if (filters.experience) {
      list.push({
        id: 'experience',
        key: 'Exp:',
        val: getExperienceLabel(filters.experience),
        onRemove: () => updateFilter('experience', '')
      })
    }
    if (filters.docStatus) {
      list.push({
        id: 'docStatus',
        key: 'Docs:',
        val: getDocStatusLabel(filters.docStatus),
        onRemove: () => updateFilter('docStatus', '')
      })
    }
    if (filters.tag) {
      list.push({
        id: 'tag',
        key: 'Tag:',
        val: getTagLabel(filters.tag),
        onRemove: () => updateFilter('tag', '')
      })
    }
    return list
  }, [filters, EMPLOYEE_TAG_FILTER_OPTIONS])

  const [isPinned, setIsPinned] = useState(false)
  const sentinelRef = useRef(null)
  const filterRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const filterEl = filterRef.current
    const sentinelEl = sentinelRef.current
    if (!filterEl) return

    const scroller = filterEl.closest('.dashboard-content') || window

    const updatePinned = () => {
      if (!filterEl) return
      const filterRect = filterEl.getBoundingClientRect()
      const scrollerRect = scroller instanceof Element
        ? scroller.getBoundingClientRect()
        : { top: 0 }

      const pinned = filterRect.top <= (scrollerRect.top + 4)
      setIsPinned((prev) => (prev !== pinned ? pinned : prev))
    }

    let observer = null
    if (typeof IntersectionObserver !== 'undefined' && sentinelEl) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const rootTop = entry.rootBounds ? entry.rootBounds.top : 0
            const isPast = !entry.isIntersecting && entry.boundingClientRect.top <= rootTop + 4
            setIsPinned((prev) => (prev !== isPast ? isPast : prev))
          }
        },
        {
          root: scroller instanceof Element ? scroller : null,
          threshold: [0, 1]
        }
      )
      observer.observe(sentinelEl)
    }

    let rafId = null
    const handleScroll = () => {
      if (rafId) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        updatePinned()
      })
    }

    scroller.addEventListener('scroll', handleScroll, { passive: true })
    updatePinned()

    return () => {
      scroller.removeEventListener('scroll', handleScroll)
      if (rafId) window.cancelAnimationFrame(rafId)
      if (observer) observer.disconnect()
    }
  }, [])

  return (
    <>
      <div ref={sentinelRef} className="candidate-filter-sentinel" aria-hidden="true" />
      <div
        ref={filterRef}
        className={`candidate-filter-system${isPinned ? ' is-pinned' : ''}${isFiltersOpen ? ' is-expanded' : ''}`}
        role="search"
        aria-label="Candidate search and filtration system"
      >
        {/* 1. Main Razor-Clean Toolbar (Single compact row) */}
        <form
          className={`candidate-list-toolbar${isPinned ? ' is-pinned' : ''}${isFiltersOpen ? ' is-expanded' : ''}`}
          onSubmit={handleSubmit}
        >
          {/* 1. First container: Search input & Filter toggling button */}
          <div className="candidate-toolbar-left">
          {/* Search Input */}
          <div className="candidate-search-wrap">
            <svg
              className="candidate-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" x2="16.65" y1="21" y2="16.65" />
            </svg>
            <input
              type="text"
              className="candidate-search-input"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search name, passport, mobile, profession…"
              aria-label="Search candidates by name, passport, mobile, or profession"
              autoComplete="off"
              spellCheck="false"
            />
            {searchInput && (
              <button
                type="button"
                className="candidate-search-clear"
                onClick={handleClearSearch}
                aria-label="Clear search query"
                title="Clear search query"
              >
                ×
              </button>
            )}
          </div>

          {/* Filter Toggle Button */}
          <button
            type="button"
            className={`btn-secondary candidate-filter-toggle-btn${isFiltersOpen ? ' is-active' : ''}${activeFiltersCount > 0 ? ' has-filters' : ''}`}
            onClick={() => setIsFiltersOpen((prev) => !prev)}
            aria-expanded={isFiltersOpen}
            title={isFiltersOpen ? 'Hide filter options' : 'Show filter options'}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="candidate-filter-badge">{activeFiltersCount}</span>
            )}
            <svg
              className={`candidate-filter-chevron${isFiltersOpen ? ' is-rotated' : ''}`}
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* 2. Second container: Actively applied filter values */}
        <div
          className="candidate-toolbar-middle candidate-chips-scroll-container"
          onWheel={(e) => {
            if (e.deltaY !== 0 && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) {
              e.currentTarget.scrollLeft += e.deltaY
            }
          }}
          aria-label="Active filter chips"
        >
          {appliedChips.map((chip) => (
            <span key={chip.id} className="checkbox-pill is-checked candidate-filter-chip">
              <span className="candidate-chip-key">{chip.key}</span>
              <span className="candidate-chip-val">{chip.val}</span>
              <button
                type="button"
                className="candidate-chip-remove"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  chip.onRemove()
                }}
                aria-label={`Remove ${chip.key} filter`}
                title={`Remove ${chip.key} filter`}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="8"
                  height="8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>

        {/* 3. Third container: Sort, Layout View & Refresh */}
        <div className="candidate-toolbar-right">
          <label className="candidate-sort-wrap" aria-label="Sort candidates">
            <span className="candidate-sort-label">Sort:</span>
            <select
              className="candidate-toolbar-select candidate-sort-select"
              value={employeeCardsSort}
              onChange={(event) => setEmployeeCardsSort(event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="available_first">Available First</option>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
            </select>
          </label>

          <div className="candidate-view-toggle" role="group" aria-label="Candidate list view layout">
            <button
              type="button"
              className={`candidate-view-toggle-btn${employeeCardsLayout === 'grid' ? ' is-active' : ''}`}
              aria-pressed={employeeCardsLayout === 'grid'}
              title="Grid view"
              onClick={() => setEmployeeCardsLayout('grid')}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <rect x="3" y="3" width="8" height="8" rx="1.5" />
                <rect x="13" y="3" width="8" height="8" rx="1.5" />
                <rect x="3" y="13" width="8" height="8" rx="1.5" />
                <rect x="13" y="13" width="8" height="8" rx="1.5" />
              </svg>
            </button>
            <button
              type="button"
              className={`candidate-view-toggle-btn${employeeCardsLayout === 'list' ? ' is-active' : ''}`}
              aria-pressed={employeeCardsLayout === 'list'}
              title="List view"
              onClick={() => setEmployeeCardsLayout('list')}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <rect x="3" y="4" width="4.5" height="4" rx="1" />
                <rect x="9.5" y="4.5" width="11.5" height="3" rx="1" />
                <rect x="3" y="10" width="4.5" height="4" rx="1" />
                <rect x="9.5" y="10.5" width="11.5" height="3" rx="1" />
                <rect x="3" y="16" width="4.5" height="4" rx="1" />
                <rect x="9.5" y="16.5" width="11.5" height="3" rx="1" />
              </svg>
            </button>
          </div>
        </div>
      </form>

      {/* 2. Candidate Filter Options Container Below candidate-list-toolbar */}
      {isFiltersOpen && (
        <div className="candidate-filters-container" aria-label="Candidate filter options">
          <div className="candidate-filters-header">
            <button
              type="button"
              className={`candidate-filters-reset-btn${hasAnyFilter ? ' has-filters' : ''}`}
              onClick={handleResetAll}
              title={hasAnyFilter ? 'Reset all filters' : 'All filters clear'}
              aria-label="Reset all filters"
            >
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>

          <div className="candidate-filters-grid">
            <label className="candidate-filters-field">
              <span className="candidate-filters-title">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                <span>Profession / Trade</span>
              </span>
              <select
                className={`candidate-filters-select${filters.profession ? ' has-value' : ''}`}
                value={filters.profession || ''}
                onChange={(e) => updateFilter('profession', e.target.value)}
              >
                <option value="">All professions</option>
                {professionOptions.map((prof) => (
                  <option key={prof} value={prof}>{prof}</option>
                ))}
              </select>
            </label>

            <label className="candidate-filters-field">
              <span className="candidate-filters-title">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
                <span>Workflow Tag</span>
              </span>
              <select
                className={`candidate-filters-select${filters.tag ? ' has-value' : ''}`}
                value={filters.tag || ''}
                onChange={(e) => updateFilter('tag', e.target.value)}
              >
                {EMPLOYEE_TAG_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all-tags'} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <label className="candidate-filters-field">
              <span className="candidate-filters-title">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>Gender</span>
              </span>
              <select
                className={`candidate-filters-select${filters.gender ? ' has-value' : ''}`}
                value={filters.gender || ''}
                onChange={(e) => updateFilter('gender', e.target.value)}
              >
                <option value="">All genders</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>

            <label className="candidate-filters-field">
              <span className="candidate-filters-title">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                <span>Religion</span>
              </span>
              <select
                className={`candidate-filters-select${filters.religion ? ' has-value' : ''}`}
                value={filters.religion || ''}
                onChange={(e) => updateFilter('religion', e.target.value)}
              >
                <option value="">All religions</option>
                {RELIGION_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>

            <label className="candidate-filters-field">
              <span className="candidate-filters-title">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>Target Destination</span>
              </span>
              <select
                className={`candidate-filters-select${filters.destinationCountry ? ' has-value' : ''}`}
                value={filters.destinationCountry || ''}
                onChange={(e) => updateFilter('destinationCountry', e.target.value)}
              >
                <option value="">All destinations</option>
                {EXPERIENCE_COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>

            <label className="candidate-filters-field">
              <span className="candidate-filters-title">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="6" />
                  <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
                </svg>
                <span>Experience Level</span>
              </span>
              <select
                className={`candidate-filters-select${filters.experience ? ' has-value' : ''}`}
                value={filters.experience || ''}
                onChange={(e) => updateFilter('experience', e.target.value)}
              >
                <option value="">All experience levels</option>
                <option value="fresher">Fresher (First-time)</option>
                <option value="experienced">Experienced (Overseas)</option>
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
