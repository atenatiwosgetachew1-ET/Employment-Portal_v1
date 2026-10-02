import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  resolvedProcessAgentId,
  employeeWorkflowState,
  employeeAvailability,
  isEmployeeEmployedInView,
  isEmployeeReturned,
  isEmployeeAvailableBadged,
  getSavedCandidateCardsLayout,
  saveCandidateCardsLayout,
  getSavedCandidateCardsSort,
  saveCandidateCardsSort,
  CANDIDATE_CARDS_LAYOUT_STORAGE_KEY,
  employeeProcessOwnerName,
  employeeOwnerDisplay,
  computeCandidateProgressTimeline,
  getEmployeeStateChangeDate,
  parseDateTimeToMillis
} from '../utils/employeeHelpers'

describe('Candidate Workflow States & Actions Logic', () => {
  const baseApprovedCandidate = {
    id: 101,
    candidate_id: 'CAND-101',
    first_name: 'Sara',
    last_name: 'Haile',
    status: 'approved',
    availability_status: 'available',
    travel_status: 'pending',
    arrival_status: 'pending',
    documents: [],
    selection_state: {
      can_unselect: false,
      selected_by_current_agent: false,
      selection: null
    }
  }

  const baseFormOptions = {
    agent_options: [
      { id: 10, name: 'First Agent Agency' },
      { id: 20, name: 'Second Agent Agency' }
    ]
  }

  describe('resolvedProcessAgentId resolution', () => {
    it('prioritizes explicit processAgentAssignments over all else', () => {
      expect(
        resolvedProcessAgentId(
          baseApprovedCandidate,
          { 101: 20 },
          baseFormOptions.agent_options
        )
      ).toBe('20')
    })

    it('falls back to candidate selection agent when not in processAgentAssignments', () => {
      const candidateWithSelection = {
        ...baseApprovedCandidate,
        selection_state: {
          selection: { agent: 10, agent_name: 'First Agent Agency' }
        }
      }
      expect(
        resolvedProcessAgentId(
          candidateWithSelection,
          {},
          baseFormOptions.agent_options
        )
      ).toBe('10')
    })

    it('falls back to single agent option if only 1 agent exists in the organization', () => {
      expect(
        resolvedProcessAgentId(
          baseApprovedCandidate,
          {},
          [{ id: 99, name: 'Sole Agency' }]
        )
      ).toBe('99')
    })

    it('returns empty string when multiple agents exist and no assignment/selection is made', () => {
      expect(
        resolvedProcessAgentId(
          baseApprovedCandidate,
          {},
          baseFormOptions.agent_options
        )
      ).toBe('')
    })
  })

  describe('Card Action Visibility Rules (Org Side vs Agent Side)', () => {
    function computeCardActionPermissions(employee, isAgentSideUser) {
      const workflowState = employeeWorkflowState(employee)
      const isUnderProcess = workflowState === 'under_process'
      const isEmployedEmployee = isEmployeeEmployedInView(employee)
      const isTravelledEmployee = workflowState === 'traveled'
      const isReturnedEmployee = isEmployeeReturned(employee)
      const isAvailableEmployee = employeeAvailability(employee) === 'Available'

      const canSelectCandidate =
        !isEmployedEmployee &&
        !isTravelledEmployee &&
        !isReturnedEmployee &&
        !isUnderProcess &&
        isAvailableEmployee &&
        isAgentSideUser

      const canInitiateCandidate =
        !isAgentSideUser &&
        !isEmployedEmployee &&
        !isTravelledEmployee &&
        !isReturnedEmployee &&
        !isUnderProcess &&
        employee.status === 'approved'

      return { canSelectCandidate, canInitiateCandidate }
    }

    it('allows agent side users to select available approved candidates, but disables initiate candidate on card', () => {
      const perms = computeCardActionPermissions(baseApprovedCandidate, true)
      expect(perms.canSelectCandidate).toBe(true)
      expect(perms.canInitiateCandidate).toBe(false)
    })

    it('allows organization side users to initiate candidate on card, but completely hides candidate selection', () => {
      const perms = computeCardActionPermissions(baseApprovedCandidate, false)
      expect(perms.canSelectCandidate).toBe(false)
      expect(perms.canInitiateCandidate).toBe(true)
    })

    it('disables both selection and initiation once candidate is under process, employed, travelled, or returned', () => {
      const underProcessCandidate = {
        ...baseApprovedCandidate,
        selection_state: { selection: { status: 'under_process' } }
      }
      expect(computeCardActionPermissions(underProcessCandidate, true).canSelectCandidate).toBe(false)
      expect(computeCardActionPermissions(underProcessCandidate, false).canInitiateCandidate).toBe(false)

      const employedCandidate = {
        ...baseApprovedCandidate,
        did_travel: true
      }
      expect(computeCardActionPermissions(employedCandidate, true).canSelectCandidate).toBe(false)
      expect(computeCardActionPermissions(employedCandidate, false).canInitiateCandidate).toBe(false)

      const travelledCandidate = {
        ...baseApprovedCandidate,
        travel_status: 'traveled'
      }
      expect(computeCardActionPermissions(travelledCandidate, true).canSelectCandidate).toBe(false)
      expect(computeCardActionPermissions(travelledCandidate, false).canInitiateCandidate).toBe(false)

      const returnedCandidate = {
        ...baseApprovedCandidate,
        returned_from_employment: true
      }
      expect(computeCardActionPermissions(returnedCandidate, true).canSelectCandidate).toBe(false)
      expect(computeCardActionPermissions(returnedCandidate, false).canInitiateCandidate).toBe(false)
    })
  })

  describe('Workflow Lifecycle States & Permission Guards', () => {
    it('accurately resolves employeeWorkflowState across all stages', () => {
      expect(employeeWorkflowState({ status: 'pending' })).toBe('pending')
      expect(employeeWorkflowState({ status: 'approved' })).toBe('approved')
      expect(
        employeeWorkflowState({
          status: 'approved',
          selection_state: { selection: { status: 'selected' } }
        })
      ).toBe('selected')
      expect(
        employeeWorkflowState({
          status: 'approved',
          selection_state: { selection: { status: 'under_process' } }
        })
      ).toBe('under_process')
      expect(
        employeeWorkflowState({
          status: 'approved',
          travel_status: 'traveled'
        })
      ).toBe('traveled')
      expect(
        employeeWorkflowState({
          status: 'approved',
          did_travel: true
        })
      ).toBe('employed')
      expect(
        employeeWorkflowState({
          returned_from_employment: true
        })
      ).toBe('returned')
    })

    it('enforces deletion guard: ONLY org admin and ONLY for pending approval candidates', () => {
      function canDeleteCandidate(employee, userRole, isAgentSideUser) {
        const isOrgAdmin = !isAgentSideUser && (userRole === 'admin' || userRole === 'superadmin')
        const workflowState = employeeWorkflowState(employee)
        const isPendingApproval = workflowState === 'pending' && (employee?.status || '').toLowerCase() === 'pending'
        return Boolean(isOrgAdmin && isPendingApproval)
      }

      // Org admin with pending candidate -> ALLOWED
      expect(canDeleteCandidate({ status: 'pending' }, 'admin', false)).toBe(true)
      expect(canDeleteCandidate({ status: 'pending' }, 'superadmin', false)).toBe(true)

      // Org staff with pending candidate -> DISALLOWED
      expect(canDeleteCandidate({ status: 'pending' }, 'staff', false)).toBe(false)

      // Agent with pending candidate -> DISALLOWED
      expect(canDeleteCandidate({ status: 'pending' }, 'customer', true)).toBe(false)

      // Org admin with approved candidate -> DISALLOWED (only pending approval can be deleted)
      expect(canDeleteCandidate({ status: 'approved' }, 'admin', false)).toBe(false)

      // Org admin with employed candidate -> DISALLOWED
      expect(canDeleteCandidate({ status: 'approved', did_travel: true }, 'admin', false)).toBe(false)
    })

    it('enforces edit guard: ONLY allowed below employed state (pending, approved, selected, under_process)', () => {
      function canEditCandidate(employee, isAgentSideUser) {
        const canEditRecords = !isAgentSideUser
        const workflowState = employeeWorkflowState(employee)
        const isEmployed = isEmployeeEmployedInView(employee)
        const isTravelled = workflowState === 'traveled' || Boolean(employee?.did_travel)
        const isReturned = isEmployeeReturned(employee)

        const isBelowEmployed =
          ['pending', 'approved', 'selected', 'under_process'].includes(workflowState) &&
          !isEmployed &&
          !isTravelled &&
          !isReturned

        return Boolean(canEditRecords && isBelowEmployed)
      }

      // Organization users can edit below employed
      expect(canEditCandidate({ status: 'pending' }, false)).toBe(true)
      expect(canEditCandidate({ status: 'approved' }, false)).toBe(true)
      expect(
        canEditCandidate(
          { status: 'approved', selection_state: { selection: { status: 'selected' } } },
          false
        )
      ).toBe(true)
      expect(
        canEditCandidate(
          { status: 'approved', selection_state: { selection: { status: 'under_process' } } },
          false
        )
      ).toBe(true)

      // Organization users CANNOT edit once travelled, employed, or returned
      expect(canEditCandidate({ status: 'approved', travel_status: 'traveled' }, false)).toBe(false)
      expect(canEditCandidate({ status: 'approved', did_travel: true }, false)).toBe(false)
      expect(canEditCandidate({ returned_from_employment: true }, false)).toBe(false)

      // Agent side users CANNOT edit candidate records at any stage
      expect(canEditCandidate({ status: 'pending' }, true)).toBe(false)
      expect(canEditCandidate({ status: 'approved' }, true)).toBe(false)
    })
  })

  describe('Card Initiate Process & Dedicated Modal Workflow', () => {
    it('verifies EmployeeInitiateProcessModal module exists and exports default component', async () => {
      const modalModule = await import('../components/employees/EmployeeInitiateProcessModal')
      expect(modalModule.default).toBeDefined()
      expect(typeof modalModule.default).toBe('function')
    })

    it('verifies card initiate click triggers dedicated modal callback without opening full review modal', () => {
      let initiatedCandidate = null
      let fullModalOpenedId = null

      const fakeOnRequestInitiate = (emp) => {
        initiatedCandidate = emp
      }
      const fakeSetOpenedEmployeeId = (id) => {
        fullModalOpenedId = id
      }

      // Simulate card Initiate click handler
      const handleCardInitiateClick = (employee, onRequestInitiateProcess, setOpenedEmployeeId, onStartProcess, assignedAgentId) => {
        if (onRequestInitiateProcess) {
          onRequestInitiateProcess(employee)
        } else if (!assignedAgentId) {
          setOpenedEmployeeId(employee.id)
        } else {
          onStartProcess(employee, assignedAgentId)
        }
      }

      const sampleEmployee = { id: 42, full_name: 'Test Candidate', status: 'approved' }
      handleCardInitiateClick(sampleEmployee, fakeOnRequestInitiate, fakeSetOpenedEmployeeId, null, null)

      // Must call onRequestInitiateProcess and NOT open full modal
      expect(initiatedCandidate).toEqual(sampleEmployee)
      expect(fullModalOpenedId).toBeNull()
    })

    it('validates agent resolution logic for dedicated initiate modal', () => {
      const agentList = [
        { id: '1', name: 'Agent 1' },
        { id: '2', name: 'Agent 2' }
      ]

      // Helper simulating modal preselected agent logic
      const resolveModalInitialAgent = (employee, assignedAgentId, agentOptions) => {
        return (
          assignedAgentId ||
          (employee?.selection_state?.selection?.agent
            ? String(employee.selection_state.selection.agent)
            : (agentOptions?.length === 1 ? String(agentOptions[0].id) : ''))
        )
      }

      // When assigned agent passed -> use it
      expect(resolveModalInitialAgent(baseApprovedCandidate, '2', agentList)).toBe('2')

      // When no assigned agent, multiple agents -> empty string (forcing user to pick)
      expect(resolveModalInitialAgent(baseApprovedCandidate, '', agentList)).toBe('')

      // When only 1 agent available -> auto-selected
      expect(resolveModalInitialAgent(baseApprovedCandidate, '', [{ id: '99', name: 'Solo Agent' }])).toBe('99')
    })

    it('verifies agent initiate button appears automatically between profile and unselect when candidate is selected', () => {
      // Simulating card list side actions sequence logic
      function getListSideButtonSequence({
        isAgentSideUser,
        isSelectedByCurrentAgent,
        status,
        isUnderProcess = false,
        isEmployed = false,
        isTravelled = false,
        isReturned = false
      }) {
        const canAgentInitiate =
          Boolean(isAgentSideUser) &&
          Boolean(isSelectedByCurrentAgent) &&
          !isEmployed &&
          !isTravelled &&
          !isReturned &&
          !isUnderProcess &&
          status === 'approved'

        const canOrgInitiate =
          !isAgentSideUser &&
          !isEmployed &&
          !isTravelled &&
          !isReturned &&
          !isUnderProcess &&
          status === 'approved'

        const canSelectCandidate =
          !isEmployed &&
          !isTravelled &&
          !isReturned &&
          !isUnderProcess &&
          status === 'approved' &&
          isAgentSideUser

        const buttons = ['profile']

        if (canAgentInitiate) {
          buttons.push('initiate')
        }

        if (canSelectCandidate) {
          buttons.push(isSelectedByCurrentAgent ? 'unselect' : 'select')
        } else if (canOrgInitiate) {
          buttons.push('initiate')
        } else {
          buttons.push('docs')
        }

        return buttons
      }

      // Case 1: Agent side, candidate available (not selected yet)
      const agentAvailableButtons = getListSideButtonSequence({
        isAgentSideUser: true,
        isSelectedByCurrentAgent: false,
        status: 'approved'
      })
      expect(agentAvailableButtons).toEqual(['profile', 'select'])

      // Case 2: Agent side, candidate selected -> Initiate is in between Profile and Unselect!
      const agentSelectedButtons = getListSideButtonSequence({
        isAgentSideUser: true,
        isSelectedByCurrentAgent: true,
        status: 'approved'
      })
      expect(agentSelectedButtons).toEqual(['profile', 'initiate', 'unselect'])
      expect(agentSelectedButtons.indexOf('initiate')).toBe(1)
      expect(agentSelectedButtons[0]).toBe('profile')
      expect(agentSelectedButtons[2]).toBe('unselect')

      // Case 3: Org side, candidate approved
      const orgApprovedButtons = getListSideButtonSequence({
        isAgentSideUser: false,
        isSelectedByCurrentAgent: false,
        status: 'approved'
      })
      expect(orgApprovedButtons).toEqual(['profile', 'initiate'])
    })
  })

  describe('Multi-Agent Candidate Conflict & Privacy Scenarios', () => {
    it('resolves Not available badge, retains candidate in selected view, and suppresses initiate and unselect buttons for rival agent', async () => {
      const {
        employeeStatusLabel,
        employeeStatusBadgeClass,
        isEmployeeSelected,
        employeeBelongsToCurrentAgent,
        employeeMatchesTagFilter
      } = await import('../utils/employeeHelpers')

      // Candidate was selected by Agent B, but secured by Agent A
      const candidateSecuredByOtherAgent = {
        ...baseApprovedCandidate,
        status: 'approved',
        selection_state: {
          is_selected: true,
          selected_by_current_agent: true,
          is_under_process: true,
          is_secured_by_other_agent: true,
          can_unselect: false,
          can_initiate_process: false,
          secured_by_agent_name: '',
          all_agents: [],
          selection: { status: 'under_process', agent_name: '' }
        }
      }

      // Badge and workflow state for Agent B
      expect(employeeWorkflowState(candidateSecuredByOtherAgent)).toBe('not_available')
      expect(employeeAvailability(candidateSecuredByOtherAgent)).toBe('Not available')
      expect(employeeStatusLabel(candidateSecuredByOtherAgent)).toBe('Not available')
      expect(employeeStatusBadgeClass(candidateSecuredByOtherAgent)).toBe('badge-muted')

      // Card is NOT removed from Agent B's Selected tab
      const agentUser = { id: 2, role: 'customer', agent_context: { is_agent_side: true, agent_id: 2 } }
      expect(isEmployeeSelected(candidateSecuredByOtherAgent)).toBe(true)
      expect(employeeBelongsToCurrentAgent(candidateSecuredByOtherAgent, agentUser)).toBe(true)
      expect(employeeMatchesTagFilter(candidateSecuredByOtherAgent, 'selected')).toBe(true)

      // Test button sequence for Agent B: neither initiate nor unselect appear
      const isSecuredByOtherAgent = Boolean(candidateSecuredByOtherAgent.selection_state.is_secured_by_other_agent)
      const isAgentSideUser = true
      const isSelectedByCurrentAgent = Boolean(candidateSecuredByOtherAgent.selection_state.selected_by_current_agent)
      const isAvailableEmployee = employeeAvailability(candidateSecuredByOtherAgent) === 'Available'
      const workflowState = employeeWorkflowState(candidateSecuredByOtherAgent)
      const isUnderProcess = workflowState === 'under_process'

      const canSelectCandidate =
        !isSecuredByOtherAgent &&
        !isUnderProcess &&
        isAvailableEmployee &&
        isAgentSideUser
      const canAgentInitiate =
        !isSecuredByOtherAgent &&
        isAgentSideUser &&
        isSelectedByCurrentAgent &&
        !isUnderProcess &&
        candidateSecuredByOtherAgent.status === 'approved'

      const buttons = ['profile']
      if (canAgentInitiate) buttons.push('initiate')
      if (canSelectCandidate) {
        buttons.push(isSelectedByCurrentAgent ? 'unselect' : 'select')
      } else {
        buttons.push('docs')
      }

      // Only Profile and Docs are rendered, neither Initiate nor Unselect!
      expect(buttons).toEqual(['profile', 'docs'])
      expect(buttons).not.toContain('initiate')
      expect(buttons).not.toContain('unselect')
      expect(buttons).not.toContain('select')
    })
  })

  describe('isEmployeeAvailableBadged & Available First Sorting', () => {
    it('identifies available-badged candidates accurately', () => {
      expect(isEmployeeAvailableBadged(baseApprovedCandidate)).toBe(true)
      expect(isEmployeeAvailableBadged({ ...baseApprovedCandidate, return_request: { status: 'pending' } })).toBe(false)
      expect(isEmployeeAvailableBadged({ ...baseApprovedCandidate, reversal_request: { status: 'pending' } })).toBe(false)
      expect(isEmployeeAvailableBadged({ ...baseApprovedCandidate, is_overdue: true })).toBe(false)
      expect(isEmployeeAvailableBadged({ ...baseApprovedCandidate, arrival_status: 'declined' })).toBe(false)
      expect(isEmployeeAvailableBadged({
        ...baseApprovedCandidate,
        selection_state: { is_secured_by_other_agent: true }
      })).toBe(false)
      expect(isEmployeeAvailableBadged({
        ...baseApprovedCandidate,
        progress_status: { overall_completion: 50, is_completed: false }
      })).toBe(true)
      expect(isEmployeeAvailableBadged({
        ...baseApprovedCandidate,
        status: 'under_process'
      })).toBe(false)
      expect(isEmployeeAvailableBadged(null)).toBe(false)
    })

    it('correctly sorts candidate array placing Available First, then newest first', () => {
      const candidates = [
        { id: 1, full_name: 'Under Process Candidate', status: 'under_process', created_at: '2026-09-01T10:00:00Z' },
        { id: 2, full_name: 'Old Available Candidate', status: 'approved', created_at: '2026-08-01T10:00:00Z' },
        { id: 3, full_name: 'Overdue Candidate', status: 'approved', is_overdue: true, created_at: '2026-09-15T10:00:00Z' },
        { id: 4, full_name: 'New Available Candidate', status: 'approved', created_at: '2026-09-20T10:00:00Z' }
      ]

      const byDate = (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

      const sorted = [...candidates].sort((a, b) => {
        const aAvail = isEmployeeAvailableBadged(a) ? 1 : 0
        const bAvail = isEmployeeAvailableBadged(b) ? 1 : 0
        if (aAvail !== bAvail) {
          return bAvail - aAvail
        }
        return byDate(a, b)
      })

      // Candidate 4 (newest available), then Candidate 2 (older available), then Candidate 3 (newest non-available), then Candidate 1 (older non-available)
      expect(sorted.map((c) => c.id)).toEqual([4, 2, 3, 1])
    })
  })

  describe('Candidate Cards Layout & Sort Persistence Across Pages', () => {
    let mockStorage = {}
    const originalWindow = globalThis.window

    beforeEach(() => {
      mockStorage = {}
      globalThis.window = {
        localStorage: {
          getItem: (key) => (key in mockStorage ? mockStorage[key] : null),
          setItem: (key, val) => {
            mockStorage[key] = String(val)
          },
          removeItem: (key) => {
            delete mockStorage[key]
          },
          clear: () => {
            mockStorage = {}
          }
        },
        dispatchEvent: () => true
      }
    })

    afterEach(() => {
      globalThis.window = originalWindow
    })

    it('defaults layout to list when unconfigured', () => {
      expect(getSavedCandidateCardsLayout()).toBe('list')
    })

    it('saves and retrieves grid layout across pages', () => {
      saveCandidateCardsLayout('grid')
      expect(getSavedCandidateCardsLayout()).toBe('grid')
      expect(window.localStorage.getItem(CANDIDATE_CARDS_LAYOUT_STORAGE_KEY)).toBe('grid')

      saveCandidateCardsLayout('list')
      expect(getSavedCandidateCardsLayout()).toBe('list')
    })

    it('saves and retrieves sort preference per view with graceful fallback', () => {
      expect(getSavedCandidateCardsSort('list')).toBe('available_first')
      saveCandidateCardsSort('newest', 'list')
      expect(getSavedCandidateCardsSort('list')).toBe('newest')
      saveCandidateCardsSort('available_first', 'list')
      expect(getSavedCandidateCardsSort('list')).toBe('available_first')

      // Other views like under-process fall back to newest when global sort is available_first
      expect(getSavedCandidateCardsSort('under-process')).toBe('newest')

      // Custom sort for under-process is preserved independently
      saveCandidateCardsSort('name_asc', 'under-process')
      expect(getSavedCandidateCardsSort('under-process')).toBe('name_asc')
      expect(getSavedCandidateCardsSort('list')).toBe('available_first')
    })
  })

  describe('Process Owner & Ownership Truthfulness Logic', () => {
    it('returns only the single agent directly connected with the active process', () => {
      const underProcessCandidate = {
        id: 201,
        status: 'approved',
        selection_state: {
          is_under_process: true,
          process_owner_name: 'Agent Alpha',
          all_agents: ['Agent Alpha', 'Agent Beta'],
          selection: {
            agent_name: 'Agent Alpha',
            status: 'under_process'
          }
        }
      }

      // employeeProcessOwnerName must strictly return the single owning agent ("Agent Alpha"), not all agents
      expect(employeeProcessOwnerName(underProcessCandidate)).toBe('Agent Alpha')

      // Org user display returns the single process owner
      const orgUser = { role: 'admin', staff_side: '' }
      expect(employeeOwnerDisplay(underProcessCandidate, orgUser)).toBe('Agent Alpha')

      // Owning agent user display returns the process owner
      const owningAgentUser = { role: 'customer', username: 'Agent Alpha', agent_context: { is_agent_side: true } }
      expect(employeeOwnerDisplay(underProcessCandidate, owningAgentUser)).toBe('Agent Alpha')
    })

    it('masks process owner for rival agents when secured by another agent', () => {
      const rivalCandidate = {
        id: 202,
        status: 'approved',
        selection_state: {
          is_under_process: true,
          is_secured_by_other_agent: true,
          process_owner_name: '',
          all_agents: ['Agent Alpha'],
          selection: {
            agent_name: '',
            status: 'under_process'
          }
        }
      }

      expect(employeeProcessOwnerName(rivalCandidate)).toBe('')

      const rivalAgentUser = { role: 'customer', username: 'Agent Beta', agent_context: { is_agent_side: true } }
      expect(employeeOwnerDisplay(rivalCandidate, rivalAgentUser)).toBe('')
    })

    it('returns empty process owner when candidate is in selected stage, but shows selecting agents appropriately', () => {
      const selectedCandidate = {
        id: 203,
        status: 'approved',
        selection_state: {
          is_under_process: false,
          all_agents: ['Agent Alpha', 'Agent Beta'],
          selected_by_current_agent: true,
          selection: {
            agent_name: 'Agent Alpha',
            status: 'selected'
          }
        }
      }

      // In selected stage, there is NO process owner yet
      expect(employeeProcessOwnerName(selectedCandidate)).toBe('')

      // Org user sees the selecting agents summary
      const orgUser = { role: 'admin' }
      expect(employeeOwnerDisplay(selectedCandidate, orgUser)).toBe('2 Agents')

      // Agent Alpha user sees their own selection
      const agentAlpha = { role: 'customer', username: 'Agent Alpha', agent_context: { is_agent_side: true } }
      expect(employeeOwnerDisplay(selectedCandidate, agentAlpha)).toBe('Agent Alpha')
    })
  })

  describe('computeCandidateProgressTimeline & Stepper Logic', () => {
    it('returns empty default configuration when employee is missing', () => {
      const result = computeCandidateProgressTimeline(null)
      expect(result.allSteps).toEqual([])
      expect(result.phasesToShow).toEqual([])
      expect(result.remainingSteps).toEqual([])
      expect(result.hasRemaining).toBe(false)
      expect(result.totalItemsCount).toBe(0)
    })

    it('positions Under Process strictly between Selected and Traveled', () => {
      const candidate = {
        id: 101,
        status: 'approved',
        selection_state: {
          selection: {
            status: 'selected',
            created_at: '2026-10-01T08:00:00Z'
          }
        }
      }
      const timeline = computeCandidateProgressTimeline(candidate)
      const stepKeys = timeline.allSteps.map((s) => s.key)
      const selectedIndex = stepKeys.indexOf('selected')
      const underProcessIndex = stepKeys.indexOf('under_process')
      const travelIndex = stepKeys.indexOf('travel')

      expect(selectedIndex).toBeGreaterThanOrEqual(0)
      expect(underProcessIndex).toBe(selectedIndex + 1)
      expect(travelIndex).toBe(underProcessIndex + 1)
      expect(timeline.allSteps[underProcessIndex].label).toBe('Under Process')
    })

    it('renders strictly 3 stats for Selected candidate with remaining steps collapsed', () => {
      const selectedCandidate = {
        id: 102,
        status: 'approved',
        progress_status: { field_completion: 100, document_completion: 100 },
        selection_state: {
          selection: {
            status: 'selected',
            created_at: '2026-10-01T10:00:00Z'
          }
        }
      }
      const timeline = computeCandidateProgressTimeline(selectedCandidate)

      // Strictly 3 stats in phasesToShow
      expect(timeline.phasesToShow).toHaveLength(3)
      expect(timeline.phasesToShow.map((s) => s.key)).toEqual(['selected', 'under_process', 'travel'])
      expect(timeline.phasesToShow[0].label).toBe('Selected')
      expect(timeline.phasesToShow[0].done).toBe(true)
      expect(timeline.phasesToShow[0].isCurrent).toBe(true)
      expect(timeline.phasesToShow[0].date).toBe('2026-10-01T10:00:00Z')

      expect(timeline.phasesToShow[1].label).toBe('Under Process')
      expect(timeline.phasesToShow[1].done).toBe(false)
      expect(timeline.phasesToShow[1].isCurrent).toBe(false)

      expect(timeline.phasesToShow[2].label).toBe('Traveled')
      expect(timeline.phasesToShow[2].done).toBe(false)
      expect(timeline.phasesToShow[2].isCurrent).toBe(false)

      // Remaining steps collapsed
      expect(timeline.hasRemaining).toBe(true)
      expect(timeline.remainingSteps).toHaveLength(2)
      expect(timeline.remainingSteps.map((s) => s.key)).toEqual(['arrived', 'returned'])
      expect(timeline.totalItemsCount).toBe(4) // 3 stats + 1 more item
    })

    it('advances window to Under Process as current with remaining Arrived and Returned collapsed', () => {
      const underProcessCandidate = {
        id: 103,
        status: 'approved',
        selection_state: {
          selection: {
            status: 'under_process',
            process_started_at: '2026-10-05T09:00:00Z'
          }
        }
      }
      const timeline = computeCandidateProgressTimeline(underProcessCandidate)

      expect(timeline.phasesToShow).toHaveLength(3)
      expect(timeline.phasesToShow.map((s) => s.key)).toEqual(['under_process', 'travel', 'arrived'])

      expect(timeline.phasesToShow[0].key).toBe('under_process')
      expect(timeline.phasesToShow[0].done).toBe(true)
      expect(timeline.phasesToShow[0].isCurrent).toBe(true)
      expect(timeline.phasesToShow[0].date).toBe('2026-10-05T09:00:00Z')

      expect(timeline.phasesToShow[1].key).toBe('travel')
      expect(timeline.phasesToShow[1].done).toBe(false)

      expect(timeline.phasesToShow[2].key).toBe('arrived')
      expect(timeline.phasesToShow[2].done).toBe(false)

      expect(timeline.hasRemaining).toBe(true)
      expect(timeline.remainingSteps).toHaveLength(1)
      expect(timeline.remainingSteps[0].key).toBe('returned')
    })

    it('advances window to Traveled with Arrived and Returned shown (no remaining collapse)', () => {
      const traveledCandidate = {
        id: 104,
        status: 'approved',
        travel_status: 'traveled',
        departure_date: '2026-10-10'
      }
      const timeline = computeCandidateProgressTimeline(traveledCandidate)

      expect(timeline.phasesToShow).toHaveLength(3)
      expect(timeline.phasesToShow.map((s) => s.key)).toEqual(['travel', 'arrived', 'returned'])

      expect(timeline.phasesToShow[0].key).toBe('travel')
      expect(timeline.phasesToShow[0].done).toBe(true)
      expect(timeline.phasesToShow[0].isCurrent).toBe(true)
      expect(timeline.phasesToShow[0].date).toBe('2026-10-10')

      expect(timeline.phasesToShow[1].key).toBe('arrived')
      expect(timeline.phasesToShow[1].done).toBe(false)

      expect(timeline.hasRemaining).toBe(false)
      expect(timeline.remainingSteps).toHaveLength(0)
    })

    it('handles Arrived (Employed) stage correctly within the 3 visible stats', () => {
      const employedCandidate = {
        id: 105,
        status: 'approved',
        did_travel: true,
        travel_status: 'confirmed',
        arrival_status: 'confirmed',
        arrived_at: '2026-10-12T14:00:00Z'
      }
      const timeline = computeCandidateProgressTimeline(employedCandidate)

      expect(timeline.phasesToShow).toHaveLength(3)
      expect(timeline.phasesToShow.map((s) => s.key)).toEqual(['travel', 'arrived', 'returned'])

      // Traveled is completed earlier in sequence
      expect(timeline.phasesToShow[0].key).toBe('travel')
      expect(timeline.phasesToShow[0].done).toBe(true)
      expect(timeline.phasesToShow[0].isCurrent).toBe(false)

      // Arrived is current active step
      expect(timeline.phasesToShow[1].key).toBe('arrived')
      expect(timeline.phasesToShow[1].done).toBe(true)
      expect(timeline.phasesToShow[1].isCurrent).toBe(true)
      expect(timeline.phasesToShow[1].date).toBe('2026-10-12T14:00:00Z')

      // Returned is upcoming/not done
      expect(timeline.phasesToShow[2].key).toBe('returned')
      expect(timeline.phasesToShow[2].done).toBe(false)

      expect(timeline.hasRemaining).toBe(false)
    })

    it('handles Returned stage correctly with Returned as current active step', () => {
      const returnedCandidate = {
        id: 106,
        status: 'approved',
        returned_from_employment: true,
        returned_at: '2026-11-01T12:00:00Z'
      }
      const timeline = computeCandidateProgressTimeline(returnedCandidate)

      expect(timeline.phasesToShow).toHaveLength(3)
      expect(timeline.phasesToShow.map((s) => s.key)).toEqual(['travel', 'arrived', 'returned'])

      expect(timeline.phasesToShow[0].done).toBe(true)
      expect(timeline.phasesToShow[1].done).toBe(true)
      expect(timeline.phasesToShow[2].key).toBe('returned')
      expect(timeline.phasesToShow[2].done).toBe(true)
      expect(timeline.phasesToShow[2].isCurrent).toBe(true)
      expect(timeline.phasesToShow[2].date).toBe('2026-11-01T12:00:00Z')
      expect(timeline.hasRemaining).toBe(false)
    })

    it('marks Under Process as done when administrative override is completed for a processing candidate', () => {
      const overrideCandidate = {
        id: 107,
        status: 'approved',
        selection_state: {
          selection: { status: 'under_process' }
        },
        progress_override_complete: true,
        administratively_completed_at: '2026-10-06T15:30:00Z'
      }
      const timeline = computeCandidateProgressTimeline(overrideCandidate)
      const underProcessStep = timeline.allSteps.find((s) => s.key === 'under_process')

      expect(underProcessStep.done).toBe(true)
      expect(underProcessStep.date).toBe('2026-10-06T15:30:00Z')
    })

    it('accurately visualizes Available candidates and never says Under Process even with progress_override_complete', () => {
      const availableCandidate = {
        id: 108,
        status: 'approved',
        progress_override_complete: true,
        selection_state: {
          selection: null,
          is_selected: false,
          selected_by_current_agent: false
        }
      }
      const timeline = computeCandidateProgressTimeline(availableCandidate)
      expect(timeline.phasesToShow).toHaveLength(3)
      expect(timeline.phasesToShow.map((s) => s.key)).toEqual(['available', 'selected', 'under_process'])
      expect(timeline.phasesToShow[0].label).toBe('Available')
      expect(timeline.phasesToShow[0].done).toBe(true)
      expect(timeline.phasesToShow[0].isCurrent).toBe(true)

      expect(timeline.phasesToShow[1].label).toBe('Selected')
      expect(timeline.phasesToShow[1].done).toBe(false)
      expect(timeline.phasesToShow[1].isCurrent).toBe(false)

      expect(timeline.phasesToShow[2].label).toBe('Under Process')
      expect(timeline.phasesToShow[2].done).toBe(false)
      expect(timeline.phasesToShow[2].isCurrent).toBe(false)

      expect(timeline.hasRemaining).toBe(true)
      expect(timeline.remainingSteps.map((s) => s.key)).toEqual(['travel', 'arrived', 'returned'])
    })

    it('accurately visualizes Pending Approval candidates waiting for registration review', () => {
      const pendingCandidate = {
        id: 109,
        status: 'pending',
        created_at: '2026-10-01T08:00:00Z'
      }
      const timeline = computeCandidateProgressTimeline(pendingCandidate)
      expect(timeline.phasesToShow).toHaveLength(3)
      expect(timeline.phasesToShow.map((s) => s.key)).toEqual(['registered', 'approval', 'available'])
      expect(timeline.phasesToShow[0].label).toBe('Registered')
      expect(timeline.phasesToShow[0].done).toBe(true)

      expect(timeline.phasesToShow[1].label).toBe('Pending Approval')
      expect(timeline.phasesToShow[1].done).toBe(false)
      expect(timeline.phasesToShow[1].isCurrent).toBe(true)

      expect(timeline.phasesToShow[2].label).toBe('Available')
      expect(timeline.phasesToShow[2].done).toBe(false)
      expect(timeline.phasesToShow[2].isCurrent).toBe(false)

      expect(timeline.hasRemaining).toBe(true)
      expect(timeline.remainingSteps.map((s) => s.key)).toEqual(['selected', 'under_process', 'travel', 'arrived', 'returned'])
    })
  })

  describe('Candidate State-Driven Sorting Logic', () => {
    it('under-process page sorting by Newest First prioritizes latest recorded process_started_at over registration date', () => {
      // Candidate A: registered 1 year ago (2025), but moved to under process today (2026-10-02T11:30:00Z)
      const candidateA = {
        id: 'cand-a',
        full_name: 'Candidate A (Recent Process)',
        status: 'approved',
        created_at: '2025-01-01T10:00:00Z',
        selection_state: {
          is_under_process: true,
          selection: {
            status: 'under_process',
            process_started_at: '2026-10-02T11:30:00Z',
            created_at: '2025-01-01T10:00:00Z'
          }
        }
      }

      // Candidate B: registered yesterday (2026-10-01), but moved to under process yesterday (2026-10-01T09:00:00Z)
      const candidateB = {
        id: 'cand-b',
        full_name: 'Candidate B (Older Process)',
        status: 'approved',
        created_at: '2026-10-01T08:00:00Z',
        selection_state: {
          is_under_process: true,
          selection: {
            status: 'under_process',
            process_started_at: '2026-10-01T09:00:00Z',
            created_at: '2026-10-01T08:00:00Z'
          }
        }
      }

      // Candidate C: registered 6 months ago, moved to under process 2 hours ago (2026-10-02T09:30:00Z)
      const candidateC = {
        id: 'cand-c',
        full_name: 'Candidate C (Medium Process)',
        status: 'approved',
        created_at: '2026-04-01T10:00:00Z',
        selection_state: {
          is_under_process: true,
          selection: {
            status: 'under_process',
            process_started_at: '2026-10-02T09:30:00Z',
            created_at: '2026-04-01T10:00:00Z'
          }
        }
      }

      // Under-process view resolves process_started_at
      expect(getEmployeeStateChangeDate(candidateA, 'under-process')).toBe(
        new Date('2026-10-02T11:30:00Z').getTime()
      )
      expect(getEmployeeStateChangeDate(candidateB, 'under-process')).toBe(
        new Date('2026-10-01T09:00:00Z').getTime()
      )
      expect(getEmployeeStateChangeDate(candidateC, 'under-process')).toBe(
        new Date('2026-10-02T09:30:00Z').getTime()
      )

      // Sort by newest first: candidateA (11:30) > candidateC (09:30) > candidateB (yesterday)
      const list = [candidateB, candidateA, candidateC]
      const sortedNewest = [...list].sort((a, b) => {
        const aTime = getEmployeeStateChangeDate(a, 'under-process')
        const bTime = getEmployeeStateChangeDate(b, 'under-process')
        return bTime - aTime
      })

      expect(sortedNewest.map((c) => c.id)).toEqual(['cand-a', 'cand-c', 'cand-b'])

      // Sort by oldest first: candidateB (yesterday) > candidateC (09:30) > candidateA (11:30)
      const sortedOldest = [...list].sort((a, b) => {
        const aTime = getEmployeeStateChangeDate(a, 'under-process')
        const bTime = getEmployeeStateChangeDate(b, 'under-process')
        return aTime - bTime
      })

      expect(sortedOldest.map((c) => c.id)).toEqual(['cand-b', 'cand-c', 'cand-a'])
    })

    it('selected page sorting prioritizes candidate selection timestamps', () => {
      const selectedRecently = {
        id: 201,
        created_at: '2024-01-01T00:00:00Z',
        selection_state: {
          selection: {
            status: 'selected',
            created_at: '2026-10-02T10:00:00Z'
          }
        }
      }
      const selectedEarlier = {
        id: 202,
        created_at: '2026-09-01T00:00:00Z',
        selection_state: {
          all_interests: [
            { created_at: '2026-09-15T10:00:00Z' }
          ]
        }
      }

      expect(getEmployeeStateChangeDate(selectedRecently, 'selected')).toBe(
        new Date('2026-10-02T10:00:00Z').getTime()
      )
      expect(getEmployeeStateChangeDate(selectedEarlier, 'selected')).toBe(
        new Date('2026-09-15T10:00:00Z').getTime()
      )

      const sorted = [selectedEarlier, selectedRecently].sort((a, b) => {
        return getEmployeeStateChangeDate(b, 'selected') - getEmployeeStateChangeDate(a, 'selected')
      })
      expect(sorted.map((c) => c.id)).toEqual([201, 202])
    })

    it('employed and returned page sorting prioritizes stage completion timestamps', () => {
      const candidateEmployed = {
        id: 301,
        created_at: '2024-01-01T00:00:00Z',
        employment_activated_at: '2026-10-02T08:00:00Z'
      }
      const candidateTraveled = {
        id: 302,
        created_at: '2026-01-01T00:00:00Z',
        travel_confirmed_at: '2026-09-20T08:00:00Z'
      }

      expect(getEmployeeStateChangeDate(candidateEmployed, 'employed')).toBe(
        new Date('2026-10-02T08:00:00Z').getTime()
      )
      expect(getEmployeeStateChangeDate(candidateTraveled, 'employed')).toBe(
        new Date('2026-09-20T08:00:00Z').getTime()
      )

      const candidateReturned = {
        id: 401,
        created_at: '2023-01-01T00:00:00Z',
        return_confirmed_at: '2026-10-01T15:00:00Z'
      }
      expect(getEmployeeStateChangeDate(candidateReturned, 'returned')).toBe(
        new Date('2026-10-01T15:00:00Z').getTime()
      )
    })

    it('gracefully falls back to created_at when state timestamps are omitted', () => {
      const legacyCandidate = {
        id: 501,
        created_at: '2025-06-15T12:00:00Z'
      }
      expect(getEmployeeStateChangeDate(legacyCandidate, 'under-process')).toBe(
        new Date('2025-06-15T12:00:00Z').getTime()
      )
      expect(getEmployeeStateChangeDate(null, 'under-process')).toBe(0)
    })
  })
})

