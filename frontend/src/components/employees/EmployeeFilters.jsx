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

  return (
    <div className="candidate-filter-system" role="search" aria-label="Candidate search and filtration system">
      {/* 1. Main Razor-Clean Toolbar (Single compact row) */}
      <form className="candidate-list-toolbar" onSubmit={handleSubmit}>
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
              className="candidate-filters-reset-btn"
              onClick={handleResetAll}
              disabled={!hasAnyFilter}
              title="Reset all filters"
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
              <span>Profession / Trade</span>
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
              <span>Workflow Tag</span>
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
              <span>Gender</span>
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
              <span>Religion</span>
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
              <span>Target Destination</span>
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
              <span>Experience Level</span>
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
  )
}
