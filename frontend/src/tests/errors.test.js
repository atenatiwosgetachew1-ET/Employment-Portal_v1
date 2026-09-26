import { describe, it, expect } from 'vitest'
import { extractApiErrorMessage } from '../utils/errors'

describe('extractApiErrorMessage', () => {
  it('returns fallback for null, undefined, or empty values', () => {
    expect(extractApiErrorMessage(null)).toBe('An unexpected error occurred')
    expect(extractApiErrorMessage(undefined, 'Custom fallback')).toBe('Custom fallback')
    expect(extractApiErrorMessage('')).toBe('An unexpected error occurred')
  })

  it('unwraps Error instances', () => {
    const error = new Error('Network failure')
    expect(extractApiErrorMessage(error)).toBe('Network failure')
  })

  it('handles raw error strings', () => {
    expect(extractApiErrorMessage('Server temporarily unavailable')).toBe('Server temporarily unavailable')
  })

  it('extracts detail property from API responses', () => {
    expect(extractApiErrorMessage({ detail: 'Authentication credentials were not provided.' })).toBe(
      'Authentication credentials were not provided.'
    )
  })

  it('extracts message property from API responses', () => {
    expect(extractApiErrorMessage({ message: 'User suspended' })).toBe('User suspended')
  })

  it('formats Django REST framework field error arrays', () => {
    const drfError = {
      username: ['A user with that username already exists.']
    }
    expect(extractApiErrorMessage(drfError)).toBe('username: A user with that username already exists.')
  })

  it('strips non_field_errors prefix for cleaner user display', () => {
    const drfError = {
      non_field_errors: ['Unable to log in with provided credentials.']
    }
    expect(extractApiErrorMessage(drfError)).toBe('Unable to log in with provided credentials.')
  })

  it('handles multiple validation errors cleanly', () => {
    const multiError = {
      email: ['Enter a valid email address.'],
      phone: ['Invalid phone number format.']
    }
    const result = extractApiErrorMessage(multiError)
    expect(result).toContain('email: Enter a valid email address.')
    expect(result).toContain('phone: Invalid phone number format.')
  })
})