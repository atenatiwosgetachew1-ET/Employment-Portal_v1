/**
 * Accessible form field wrapper supporting input, select, textarea, and custom controls.
 * Automatically wires label, error messages, hint text, and ARIA attributes.
 *
 * @param {object} props
 * @param {React.ReactNode} props.label - Field label
 * @param {string} [props.name] - Form field name
 * @param {string} [props.id] - Element ID (auto-generated if omitted)
 * @param {string} [props.type='text'] - Input type ('text', 'email', 'number', 'select', 'textarea', etc.)
 * @param {any} [props.value] - Controlled field value
 * @param {(e: any) => void} [props.onChange] - Change handler
 * @param {string} [props.error] - Error message to display
 * @param {React.ReactNode} [props.hint] - Helper hint text
 * @param {boolean} [props.required=false] - Whether the field is mandatory
 * @param {boolean} [props.disabled=false] - Whether the field is disabled
 * @param {string} [props.placeholder] - Placeholder text
 * @param {Array<{ value: any, label: string }>} [props.options] - Options for type='select'
 * @param {string} [props.className=''] - Container class name
 * @param {React.ReactNode} [props.children] - Custom input element (replaces default input/select/textarea)
 */
export default function FormField({
  label,
  name,
  id,
  type = 'text',
  value,
  onChange,
  error,
  hint,
  required = false,
  disabled = false,
  placeholder,
  options = [],
  className = '',
  children,
  ...rest
}) {
  const generatedId = id || (name ? `field-${name}` : undefined)
  const errorId = error && generatedId ? `${generatedId}-error` : undefined
  const hintId = hint && generatedId ? `${generatedId}-hint` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <label className={`form-field ${className}`.trim()} htmlFor={children ? undefined : generatedId}>
      {label && (
        <span className="form-field-label" style={{ display: 'block', marginBottom: '4px' }}>
          {label}
          {required && <span className="form-field-required" aria-hidden="true" style={{ color: 'var(--color-destructive, #e53e3e)', marginLeft: '4px' }}>*</span>}
        </span>
      )}

      {children ? (
        children
      ) : type === 'textarea' ? (
        <textarea
          id={generatedId}
          name={name}
          value={value ?? ''}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...rest}
        />
      ) : type === 'select' ? (
        <select
          id={generatedId}
          name={name}
          value={value ?? ''}
          onChange={onChange}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={generatedId}
          name={name}
          type={type}
          value={value ?? ''}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...rest}
        />
      )}

      {hint && (
        <span id={hintId} className="muted-text" style={{ display: 'block', fontSize: '0.85rem', marginTop: '4px' }}>
          {hint}
        </span>
      )}

      {error && (
        <span id={errorId} className="error-message" role="alert" style={{ display: 'block', fontSize: '0.85rem', marginTop: '4px' }}>
          {error}
        </span>
      )}
    </label>
  )
}