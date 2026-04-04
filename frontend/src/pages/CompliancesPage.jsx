import OperationsConceptPage from './OperationsConceptPage'

const foundation = [
  {
    kicker: 'Core workflow',
    title: 'Expiry and validity tracking',
    description: 'Start with document expiry, missing requirement alerts, and validity summaries tied directly to employee records.'
  },
  {
    kicker: 'Operations',
    title: 'Review queues',
    description: 'Give the organization a focused queue of cases that need action before travel, employment, or return milestones.'
  },
  {
    kicker: 'Auditability',
    title: 'Decision trace',
    description: 'Store who reviewed what, when it changed, and why it was approved, rejected, or escalated.'
  }
]

const roadmap = [
  {
    kicker: 'Phase 1',
    title: 'Compliance monitoring board',
    description: 'Create a single place for teams to see at-risk cases before they become operational problems.'
  },
  {
    kicker: 'Phase 2',
    title: 'Automated nudges',
    description: 'Send proactive reminders when key deadlines or expiries are approaching.'
  },
  {
    kicker: 'Phase 3',
    title: 'Policy templates',
    description: 'Allow each organization to define its own compliance pack per destination and employment type.'
  }
]

export default function CompliancesPage() {
  return (
    <OperationsConceptPage
      title="Compliances"
      description="A concept page for document validity, policy tracking, and approval-ready operational compliance."
      foundation={foundation}
      roadmap={roadmap}
    />
  )
}
