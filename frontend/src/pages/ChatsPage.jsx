import OperationsConceptPage from './OperationsConceptPage'

const foundation = [
  {
    kicker: 'Core workflow',
    title: 'Conversation list and status',
    description: 'Start with assigned conversation lanes, unread state, recent activity, and a simple ownership model.'
  },
  {
    kicker: 'Operations',
    title: 'Employee-linked chat context',
    description: 'Let teams open discussions from employee records so operational decisions stay attached to the right case.'
  },
  {
    kicker: 'Guardrails',
    title: 'Role-aware visibility',
    description: 'Respect organization side, agent side, and read-only access so messages stay visible only to the right participants.'
  }
]

const roadmap = [
  {
    kicker: 'Phase 1',
    title: 'Operational message boards',
    description: 'Focus on case coordination first rather than consumer-style chat features.'
  },
  {
    kicker: 'Phase 2',
    title: 'Timeline and attachments',
    description: 'Bring messages, documents, and status changes into one shared operational feed.'
  },
  {
    kicker: 'Phase 3',
    title: 'Escalation and handoff',
    description: 'Add approval-aware chat flows for high-friction employee and licensing scenarios.'
  }
]

export default function ChatsPage() {
  return (
    <OperationsConceptPage
      title="Chats"
      description="A concept page for operational communication across employee movement, approvals, and handoffs."
      foundation={foundation}
      roadmap={roadmap}
    />
  )
}
