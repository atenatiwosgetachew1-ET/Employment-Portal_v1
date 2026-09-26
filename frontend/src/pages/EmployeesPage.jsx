import { useSearchParams } from 'react-router-dom'
import EmployeeRegisterPage from './employees/EmployeeRegisterPage'
import EmployeesListingView from '../components/employees/EmployeesListingView'

export default function EmployeesPage() {
  const [searchParams] = useSearchParams()
  const view = (searchParams.get('view') || 'list').trim()

  if (view === 'register') {
    return <EmployeeRegisterPage />
  }

  return <EmployeesListingView stage={view} />
}
