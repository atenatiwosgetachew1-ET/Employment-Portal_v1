import { describe, it, expect } from 'vitest'
import { isAgentSideWorkspace } from '../utils/profileStore'

describe('isAgentSideWorkspace', () => {
  it('returns true when agent_context indicates agent side', () => {
    expect(isAgentSideWorkspace({ agent_context: { is_agent_side: true } })).toBe(true)
  })

  it('returns true for customer role', () => {
    expect(isAgentSideWorkspace({ role: 'customer' })).toBe(true)
  })

  it('returns false for non-staff, non-customer without agent context', () => {
    expect(isAgentSideWorkspace({ role: 'superadmin' })).toBe(false)
    expect(isAgentSideWorkspace({ role: 'admin' })).toBe(false)
    expect(isAgentSideWorkspace(null)).toBe(false)
  })

  it('returns true for staff belonging to an external agent side', () => {
    const awayStaff = {
      role: 'staff',
      staff_side: 'Partner Agency Alpha',
      organization: { name: 'Main Organization' }
    }
    expect(isAgentSideWorkspace(awayStaff)).toBe(true)
  })

  it('returns false for staff belonging to the main home organization', () => {
    const homeStaff = {
      role: 'staff',
      staff_side: 'Main Organization',
      organization: { name: 'Main Organization' }
    }
    expect(isAgentSideWorkspace(homeStaff)).toBe(false)
  })
})