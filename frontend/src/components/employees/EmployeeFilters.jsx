import React from 'react'

export default function EmployeeFilters({
  currentView,
  searchInput,
  setSearchInput,
  filters,
  setFilters,
  setPage,
  EMPLOYEE_TAG_FILTER_OPTIONS,
}) {
  if (currentView === 'register') return null

  return (
    <form
      className="form-grid employees-filter-grid"
      onSubmit={(event) => {
        event.preventDefault()
        setPage(1)
        setFilters((prev) => ({ ...prev, q: searchInput.trim() }))
      }}
    >
      <label>
        Search
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Name, passport, mobile, profession"
        />
      </label>
      <label>
        Availability
        <select
          value={filters.isActive}
          onChange={(event) => {
            setPage(1)
            setFilters((prev) => ({ ...prev, isActive: event.target.value }))
          }}
        >
          <option value="">All employees</option>
          <option value="true">Available</option>
          <option value="false">Not available</option>
        </select>
      </label>
      <label>
        Tag
        <select
          value={filters.tag}
          onChange={(event) => {
            setPage(1)
            setFilters((prev) => ({ ...prev, tag: event.target.value }))
          }}
        >
          {EMPLOYEE_TAG_FILTER_OPTIONS.map((option) => (
            <option key={option.value || 'all-tags'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn-secondary">
        Apply filters
      </button>
    </form>
  )
}
