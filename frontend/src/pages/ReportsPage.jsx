import OperationsConceptPage from './OperationsConceptPage'

const foundation = [
  {
    kicker: 'Core workflow',
    title: 'Operational summaries',
    description: 'Begin with totals across employee states, returns, active agent relationships, and licensing impact.'
  },
  {
    kicker: 'Management',
    title: 'Performance visibility',
    description: 'Show travel completion, return pressure, and bottlenecks so managers can intervene earlier.'
  },
  {
    kicker: 'Trust',
    title: 'Role-scoped reporting',
    description: 'Expose only the data each workspace should see, whether that is organization-wide or agent-side limited.'
  }
]

const roadmap = [
  {
    kicker: 'Phase 1',
    title: 'Dashboard-grade reporting',
    description: 'Focus on practical operational views before moving into exports and finance-style analytics.'
  },
  {
    kicker: 'Phase 2',
    title: 'Saved report views',
    description: 'Let teams preserve report filters and recurring breakdowns they use often.'
  },
  {
    kicker: 'Phase 3',
    title: 'Export and scheduling',
    description: 'Add CSV/PDF exports and recurring report delivery once the core metrics stabilise.'
  }
]

export default function ReportsPage() {
  return (
    <OperationsConceptPage
      title="Reports"
      description="A concept page for operational reporting across employee flow, approvals, returns, and subscription impact."
      foundation={foundation}
      roadmap={roadmap}
    />
  )
}
