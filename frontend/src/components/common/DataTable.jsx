/**
 * Accessible, responsive data table with sticky headers, pagination, and loading/empty states.
 *
 * @param {object} props
 * @param {Array<{ key: string, label: React.ReactNode, render?: (row: any, index: number) => React.ReactNode, className?: string, align?: 'left'|'center'|'right', width?: string }>} props.columns
 * @param {Array<any>} props.data - Rows of data to display
 * @param {string} [props.keyField='id'] - Unique key identifier field in row objects
 * @param {boolean} [props.loading=false] - Whether data is actively loading
 * @param {string} [props.loadingText='Loading…'] - Text displayed when loading
 * @param {string} [props.emptyText='No records found.'] - Text displayed when data is empty
 * @param {number} [props.page] - Current page number (enables pagination if provided)
 * @param {boolean} [props.hasNext=false] - Whether there is a next page
 * @param {boolean} [props.hasPrev=false] - Whether there is a previous page
 * @param {(newPage: number) => void} [props.onPageChange] - Callback when page changes
 * @param {number} [props.totalCount] - Total number of items across all pages
 * @param {string} [props.className=''] - Container wrapper class
 * @param {string} [props.tableClassName='users-table'] - Table element class
 * @param {(row: any, index: number) => void} [props.onRowClick] - Row click handler
 */
export default function DataTable({
  columns = [],
  data = [],
  keyField = 'id',
  loading = false,
  loadingText = 'Loading…',
  emptyText = 'No records found.',
  page,
  hasNext = false,
  hasPrev = false,
  onPageChange,
  totalCount,
  className = '',
  tableClassName = 'users-table',
  onRowClick
}) {
  const showPagination = typeof page === 'number' && typeof onPageChange === 'function'

  return (
    <div className={`data-table-container ${className}`.trim()}>
      <div className="table-scroll">
        <table className={tableClassName}>
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={col.key || idx}
                  className={col.className}
                  style={{
                    textAlign: col.align || 'left',
                    width: col.width || undefined
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '28px' }}>
                  <p className="muted-text" style={{ margin: 0 }}>{loadingText}</p>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '28px' }}>
                  <p className="muted-text" style={{ margin: 0 }}>{emptyText}</p>
                </td>
              </tr>
            ) : (
              data.map((row, rowIdx) => (
                <tr
                  key={row[keyField] ?? rowIdx}
                  onClick={onRowClick ? () => onRowClick(row, rowIdx) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((col, colIdx) => {
                    const value = col.render ? col.render(row, rowIdx) : row[col.key]
                    return (
                      <td
                        key={col.key || colIdx}
                        className={col.className}
                        style={{ textAlign: col.align || 'left' }}
                      >
                        {value ?? '—'}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div
          className="table-pagination"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '16px',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          {typeof totalCount === 'number' && (
            <span className="muted-text" style={{ fontSize: '0.9rem' }}>
              Showing {data.length} of {totalCount}
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={!hasPrev || loading}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              Previous
            </button>
            <span className="muted-text">Page {page}</span>
            <button
              type="button"
              className="btn-secondary"
              disabled={!hasNext || loading}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}