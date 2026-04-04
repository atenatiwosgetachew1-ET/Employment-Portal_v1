import OperationsConceptPage from './OperationsConceptPage'

const foundation = [
  {
    kicker: 'Platform',
    title: 'Plan and feature visibility',
    description: 'Start with a clean operational readout of plan tiers, included feature flags, and seat boundaries.'
  },
  {
    kicker: 'Control',
    title: 'Organization eligibility',
    description: 'Make it easy to see which organizations are active, in grace, suspended, or overdue.'
  },
  {
    kicker: 'Support',
    title: 'Subscription diagnostics',
    description: 'Give superadmins enough context to understand why an organization is restricted before escalating to billing workflows.'
  }
]

const roadmap = [
  {
    kicker: 'Phase 1',
    title: 'Read model first',
    description: 'Prioritise visibility into plans and subscription state before introducing edit-heavy billing controls.'
  },
  {
    kicker: 'Phase 2',
    title: 'Manual support actions',
    description: 'Allow trusted platform operators to apply controlled overrides for urgent support cases.'
  },
  {
    kicker: 'Phase 3',
    title: 'Billing workflow integration',
    description: 'Connect renewal actions, dunning state, and payment outcomes once the external system contract is stable.'
  }
]

export default function SubscriptionPlansPage() {
  return (
    <OperationsConceptPage
      title="Subscription Plans"
      description="A superadmin concept page for platform plans, feature access, and organization subscription posture."
      foundation={foundation}
      roadmap={roadmap}
      superadminOnly
    />
  )
}
