/**
 * Unified filter and search bar for tabular pages and lists.
 *
 * @param {object} props
 * @param {string} [props.searchValue] - Controlled search input value
 * @param {(value: string) => void} [props.onSearchChange] - Search input change handler
 * @param {string} [props.searchPlaceholder='Search…'] - Placeholder for search input
 * @param {(e: React.FormEvent) => void} [props.onSubmit] - Submit handler for filter form
 * @param {() => void} [props.onClear] - Clear filters handler
 * @param {React.ReactNode} [props.children] - Additional filter controls (e.g. selects, date pickers)
 * @param {string} [props.submitLabel='Apply filters'] - Label for submit button
 * @param {boolean} [props.loading=false] - Whether filtering is processing
 * @param {string} [props.className='users-filter-grid'] - Form grid CSS class
 */
export default function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  onSubmit,
  onClear,
  children,
  submitLabel = 'Apply filters',
  loading = false,
  className = 'users-filter-grid'
}) {
  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit?.(e)
  }

  const hasSearch = typeof searchValue === 'string' && typeof onSearchChange === 'function'

  return (
    <form className={className} onSubmit={handleSubmit}>
      {hasSearch && (
        <label>
          Search
          <input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            disabled={loading}
          />
        </label>
      )}

      {children}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
        <button type="submit" className="btn-secondary users-filter-submit" disabled={loading}>
          {submitLabel}
        </button>
        {onClear && (
          <button type="button" className="btn-secondary" onClick={onClear} disabled={loading}>
            Clear
          </button>
        )}
      </div>
    </form>
  )
}