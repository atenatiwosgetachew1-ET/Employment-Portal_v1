import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUiFeedback } from '../context/UiFeedbackContext'
import * as employeesService from '../services/employeesService'
import { searchFlightAvailabilities, searchTravelLocations } from '../services/travelService'
import { normalizeSearchValue } from '../utils/filtering'

const TRAVEL_TABS = [
  { id: 'awaiting', label: 'Awaiting Travel' },
  { id: 'booked', label: 'Booked Travels' },
  { id: 'travelers', label: 'Travelers' }
]

async function fetchAllEmployeePages(params = {}) {
  let page = 1
  let aggregated = []
  let pageCount = 1

  while (page <= pageCount) {
    const response = await employeesService.fetchEmployees({
      ...params,
      page
    })
    aggregated = aggregated.concat(response.results || [])
    pageCount = response.total_pages || response.totalPages || 1
    page += 1
  }

  return aggregated
}

function formatDate(value) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function formatDateTime(dateValue, timeValue = '') {
  if (!dateValue) return '--'
  return timeValue ? `${formatDate(dateValue)} at ${timeValue}` : formatDate(dateValue)
}

function departureTimestamp(booking) {
  if (!booking?.departureDate) return Number.POSITIVE_INFINITY
  const raw = `${booking.departureDate}T${booking.departureTime || '00:00'}:00`
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime()
}

function employeeProfessionLabel(employee) {
  return employee?.profession || employee?.professional_title || '--'
}

function employeeProcessOwnerLabel(employee) {
  return employee?.selection_state?.selection?.agent_name || '--'
}

function isDepartureToday(booking) {
  if (!booking?.departureDate) return false
  const today = new Date()
  const currentDate = today.toISOString().slice(0, 10)
  return booking.departureDate === currentDate
}

function compareText(left, right) {
  return String(left || '').localeCompare(String(right || ''))
}

function travelQueueTimestamp(employee) {
  const raw = (
    employee?.selection_state?.selection?.updated_at ||
    employee?.selection_state?.selection?.created_at ||
    employee?.updated_at ||
    employee?.created_at ||
    ''
  )
  const parsed = raw ? new Date(raw).getTime() : Number.NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

function compareAwaitingEmployees(left, right, sortBy) {
  if (sortBy === 'queue_newest') return travelQueueTimestamp(right) - travelQueueTimestamp(left)
  if (sortBy === 'queue_oldest') return travelQueueTimestamp(left) - travelQueueTimestamp(right)
  if (sortBy === 'profession') return compareText(employeeProfessionLabel(left), employeeProfessionLabel(right))
  if (sortBy === 'owner') return compareText(employeeProcessOwnerLabel(left), employeeProcessOwnerLabel(right))
  if (sortBy === 'progress_desc') return (right?.progress_status?.overall_completion ?? 0) - (left?.progress_status?.overall_completion ?? 0)
  return compareText(left?.full_name, right?.full_name)
}

function compareBookedEntries(left, right, sortBy) {
  if (sortBy === 'name') return compareText(left?.employee?.full_name, right?.employee?.full_name)
  if (sortBy === 'profession') return compareText(employeeProfessionLabel(left?.employee), employeeProfessionLabel(right?.employee))
  if (sortBy === 'owner') return compareText(employeeProcessOwnerLabel(left?.employee), employeeProcessOwnerLabel(right?.employee))
  if (sortBy === 'airline') return compareText(left?.booking?.airline, right?.booking?.airline)
  return departureTimestamp(left?.booking) - departureTimestamp(right?.booking)
}

function normalizedTravelStatus(employee) {
  return String(employee?.travel_status || '').trim().toLowerCase().replace(/\s+/g, '_')
}

function isReturned(employee) {
  return Boolean(
    employee?.returned_from_employment ||
    employee?.return_request?.status === 'approved'
  )
}

function isTravelled(employee) {
  const travelStatus = normalizedTravelStatus(employee)
  return Boolean(
    !isReturned(employee) &&
    !employee?.did_travel &&
    ['traveled', 'travelled'].includes(travelStatus)
  )
}

function isEmployed(employee) {
  return Boolean(
    !isReturned(employee) &&
    !isTravelled(employee) &&
    employee?.did_travel
  )
}

function isUnderProcess(employee) {
  return Boolean(
    !isReturned(employee) &&
    !isTravelled(employee) &&
    !isEmployed(employee) &&
    employee?.selection_state?.selection?.status === 'under_process'
  )
}

function isReadyForTravel(employee) {
  return Boolean(
    isUnderProcess(employee) &&
    (
      employee?.progress_override_complete ||
      (employee?.progress_status?.overall_completion ?? 0) >= 100
    ) &&
    !employee?.did_travel
  )
}

function employeeBelongsToCurrentAgent(employee, user) {
  const currentAgentId = user?.agent_context?.agent_id || (user?.role === 'customer' ? user?.id : null)
  const employeeAgentId = employee?.selection_state?.selection?.agent || null

  if (currentAgentId && employeeAgentId) {
    return String(currentAgentId) === String(employeeAgentId)
  }

  const userCandidates = [
    [user?.first_name, user?.last_name].filter(Boolean).join(' '),
    user?.staff_side,
    user?.username,
    user?.email
  ]
    .map(normalizeSearchValue)
    .filter(Boolean)

  const employeeCandidates = [
    employee?.selection_state?.selection?.agent_name,
    employee?.selection_state?.selection?.selected_by_username,
    employee?.selection_state?.agent_name,
    employee?.registered_by_username
  ]
    .map(normalizeSearchValue)
    .filter(Boolean)

  return employeeCandidates.some((candidate) => userCandidates.includes(candidate))
}

function employeeMatchesSearch(employee, query) {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) return true

  return [
    employee?.full_name,
    employee?.profession,
    employee?.professional_title,
    employee?.passport_number,
    employee?.mobile_number,
    employee?.phone,
    employee?.selection_state?.selection?.agent_name
  ]
    .map(normalizeSearchValue)
    .some((value) => value.includes(normalizedQuery))
}

function bookingMatchesSearch(booking, query) {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) return true

  return [
    booking?.pnr,
    booking?.ticketNumber,
    booking?.airline,
    booking?.origin,
    booking?.destination
  ]
    .map(normalizeSearchValue)
    .some((value) => value.includes(normalizedQuery))
}

function createBookingDraft(employee, existing = {}) {
  return {
    employeeId: employee?.id || '',
    pnr: existing.pnr || '',
    ticketNumber: existing.ticketNumber || '',
    airline: existing.airline || '',
    origin: existing.origin || '',
    destination: existing.destination || '',
    departureDate: existing.departureDate || employee?.departure_date || '',
    departureTime: existing.departureTime || '',
    arrivalDate: existing.arrivalDate || '',
    arrivalTime: existing.arrivalTime || '',
    routeSummary: existing.routeSummary || '',
    notes: existing.notes || ''
  }
}

function createFlightSearchDraft({ origin = '', destination = '', departureDate = '', adults = 1 } = {}) {
  return {
    originLocationCode: String(origin || '').trim().toUpperCase(),
    destinationLocationCode: String(destination || '').trim().toUpperCase(),
    departureDate: String(departureDate || '').trim(),
    adults: Math.max(1, Number(adults || 1))
  }
}

function splitDateTimeParts(value) {
  const raw = String(value || '').trim()
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (match) {
    return { date: match[1], time: match[2] }
  }
  return { date: '', time: '' }
}

function summarizeAvailability(result) {
  const availability = (result?.segments || [])
    .flatMap((segment) => Array.isArray(segment.availabilityClasses) ? segment.availabilityClasses : [])
    .filter((entry) => entry?.class && entry?.numberOfBookableSeats)
    .slice(0, 4)
    .map((entry) => `${entry.class} (${entry.numberOfBookableSeats})`)
  return availability.length ? availability.join(' | ') : 'Seat classes not provided'
}

function bookingFieldsFromFlight(result) {
  const departure = splitDateTimeParts(result?.departureAt)
  const arrival = splitDateTimeParts(result?.arrivalAt)
  return {
    airline: Array.isArray(result?.carrierCodes) ? result.carrierCodes.join(', ') : '',
    origin: result?.originIataCode || '',
    destination: result?.destinationIataCode || '',
    departureDate: departure.date,
    departureTime: departure.time,
    arrivalDate: arrival.date,
    arrivalTime: arrival.time,
    routeSummary: result?.routeSummary || ''
  }
}

function flightLocationOptionLabel(location) {
  const iataCode = String(location?.iataCode || '').trim().toUpperCase()
  const detailedName = String(location?.detailedName || location?.name || '').trim()
  const cityName = String(location?.cityName || '').trim()
  const countryName = String(location?.countryName || '').trim()

  return {
    title: [iataCode, detailedName].filter(Boolean).join(' | '),
    subtitle: [cityName, countryName].filter(Boolean).join(', ')
  }
}

export default function TravelPage() {
  const { user } = useAuth()
  const { showToast, confirm } = useUiFeedback()
  const features = user?.feature_flags || {}

  const [activeTab, setActiveTab] = useState('awaiting')
  const [searchQuery, setSearchQuery] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [professionFilter, setProfessionFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [bookingEditorEmployeeId, setBookingEditorEmployeeId] = useState(null)
  const [bookingDraft, setBookingDraft] = useState(null)
  const [selectedAwaitingEmployeeIds, setSelectedAwaitingEmployeeIds] = useState([])
  const [bulkBookingEmployeeIds, setBulkBookingEmployeeIds] = useState([])
  const [bulkBookingDraft, setBulkBookingDraft] = useState(null)
  const [flightSearchDraft, setFlightSearchDraft] = useState(() => createFlightSearchDraft())
  const [flightSearchResults, setFlightSearchResults] = useState([])
  const [flightSearchError, setFlightSearchError] = useState('')
  const [flightSearchLoading, setFlightSearchLoading] = useState(false)
  const [flightLocationSuggestions, setFlightLocationSuggestions] = useState({
    originLocationCode: [],
    destinationLocationCode: []
  })
  const [flightLocationLoadingField, setFlightLocationLoadingField] = useState('')
  const [pnrEditorEmployeeId, setPnrEditorEmployeeId] = useState(null)
  const [pnrDraft, setPnrDraft] = useState('')
  const [busyEmployeeId, setBusyEmployeeId] = useState(null)

  const readOnly = Boolean(user?.is_read_only || user?.is_suspended)
  const isAgentSideUser = user?.role === 'customer'

  const loadTravelEmployees = useCallback(async (event) => {
    if (event?.preventDefault) {
      window.location.reload()
      return
    }
    setLoading(true)
    setPageError('')
    try {
      const results = await fetchAllEmployeePages({ q: '' })
      const scopedResults = isAgentSideUser
        ? results.filter((employee) => employeeBelongsToCurrentAgent(employee, user))
        : results
      setEmployees(scopedResults)
    } catch (err) {
      setPageError(err.message || 'Could not load travel employees')
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }, [isAgentSideUser, user])

  useEffect(() => {
    loadTravelEmployees()
  }, [loadTravelEmployees])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('employment-portal.travel-bookings')
    }
  }, [])

  const employeesById = useMemo(() => {
    return employees.reduce((map, employee) => {
      map[employee.id] = employee
      return map
    }, {})
  }, [employees])

  const bookings = useMemo(() => {
    return employees.reduce((map, employee) => {
      if (employee?.travel_booking) {
        map[employee.id] = {
          employeeId: employee.id,
          ...employee.travel_booking
        }
      }
      return map
    }, {})
  }, [employees])

  const awaitingTravelPool = useMemo(() => {
    return employees
      .filter((employee) => isReadyForTravel(employee))
      .filter((employee) => !bookings[employee.id])
      .sort((left, right) => left.full_name.localeCompare(right.full_name))
  }, [bookings, employees])

  useEffect(() => {
    const awaitingIds = new Set(awaitingTravelPool.map((employee) => employee.id))
    setSelectedAwaitingEmployeeIds((prev) => prev.filter((id) => awaitingIds.has(id)))
    setBulkBookingEmployeeIds((prev) => prev.filter((id) => awaitingIds.has(id)))
  }, [awaitingTravelPool])

  const bookedTravelPool = useMemo(() => {
    return Object.values(bookings)
      .map((booking) => ({
        booking,
        employee: employeesById[booking.employeeId]
      }))
      .filter(({ employee }) => Boolean(employee))
      .filter(({ employee }) => !isReturned(employee) && !isEmployed(employee))
      .sort((left, right) => departureTimestamp(left.booking) - departureTimestamp(right.booking))
  }, [bookings, employeesById])

  const travelerPool = useMemo(() => {
    return bookedTravelPool
      .filter(({ booking }) => Boolean(booking.departureDate))
      .sort((left, right) => departureTimestamp(left.booking) - departureTimestamp(right.booking))
  }, [bookedTravelPool])

  const currentTabEmployees = useMemo(() => {
    if (activeTab === 'awaiting') return awaitingTravelPool
    if (activeTab === 'booked') return bookedTravelPool.map(({ employee }) => employee)
    return travelerPool.map(({ employee }) => employee)
  }, [activeTab, awaitingTravelPool, bookedTravelPool, travelerPool])

  const processOwnerOptions = useMemo(() => (
    Array.from(new Set(
      currentTabEmployees
        .map((employee) => employeeProcessOwnerLabel(employee))
        .filter((value) => value && value !== '--')
    )).sort((left, right) => left.localeCompare(right))
  ), [currentTabEmployees])

  const professionOptions = useMemo(() => (
    Array.from(new Set(
      currentTabEmployees
        .map((employee) => employeeProfessionLabel(employee))
        .filter((value) => value && value !== '--')
    )).sort((left, right) => left.localeCompare(right))
  ), [currentTabEmployees])

  const sortOptions = useMemo(() => {
    if (activeTab === 'awaiting') {
      return [
        { value: 'queue_newest', label: 'Delivered to awaiting: newest first' },
        { value: 'queue_oldest', label: 'Delivered to awaiting: oldest first' },
        { value: 'progress_desc', label: 'Progress high to low' },
        { value: 'owner', label: 'Process owner' },
        { value: 'profession', label: 'Profession' },
        { value: 'name', label: 'Name' }
      ]
    }

    return [
      { value: 'departure', label: 'Departure date' },
      { value: 'name', label: 'Name' },
      { value: 'profession', label: 'Profession' },
      { value: 'owner', label: 'Process owner' },
      { value: 'airline', label: 'Airline' }
    ]
  }, [activeTab])

  useEffect(() => {
    if (!sortOptions.some((option) => option.value === sortBy)) {
      setSortBy(activeTab === 'awaiting' ? 'queue_newest' : 'departure')
    }
  }, [activeTab, sortBy, sortOptions])

  const awaitingTravelEmployees = useMemo(() => {
    return awaitingTravelPool
      .filter((employee) => employeeMatchesSearch(employee, searchQuery))
      .filter((employee) => ownerFilter === 'all' || employeeProcessOwnerLabel(employee) === ownerFilter)
      .filter((employee) => professionFilter === 'all' || employeeProfessionLabel(employee) === professionFilter)
      .slice()
      .sort((left, right) => compareAwaitingEmployees(left, right, sortBy))
  }, [awaitingTravelPool, searchQuery, ownerFilter, professionFilter, sortBy])

  const bookedTravelEntries = useMemo(() => {
    return bookedTravelPool
      .filter(({ employee, booking }) => employeeMatchesSearch(employee, searchQuery) || bookingMatchesSearch(booking, searchQuery))
      .filter(({ employee }) => ownerFilter === 'all' || employeeProcessOwnerLabel(employee) === ownerFilter)
      .filter(({ employee }) => professionFilter === 'all' || employeeProfessionLabel(employee) === professionFilter)
      .slice()
      .sort((left, right) => compareBookedEntries(left, right, sortBy))
  }, [bookedTravelPool, searchQuery, ownerFilter, professionFilter, sortBy])

  const travelerEntries = useMemo(() => {
    return travelerPool
      .filter(({ employee, booking }) => employeeMatchesSearch(employee, searchQuery) || bookingMatchesSearch(booking, searchQuery))
      .filter(({ employee }) => ownerFilter === 'all' || employeeProcessOwnerLabel(employee) === ownerFilter)
      .filter(({ employee }) => professionFilter === 'all' || employeeProfessionLabel(employee) === professionFilter)
      .slice()
      .sort((left, right) => compareBookedEntries(left, right, sortBy))
  }, [travelerPool, searchQuery, ownerFilter, professionFilter, sortBy])

  const travelSummary = useMemo(() => {
    const departureTodayCount = travelerEntries.filter(({ booking }) => isDepartureToday(booking)).length

    return {
      awaiting: awaitingTravelEmployees.length,
      booked: bookedTravelEntries.length,
      travelers: travelerEntries.length,
      departureToday: departureTodayCount
    }
  }, [awaitingTravelEmployees.length, bookedTravelEntries.length, travelerEntries])

  const travelerCalendar = useMemo(() => {
    return travelerEntries.reduce((groups, entry) => {
      const key = entry.booking.departureDate || 'Undated departures'
      if (!groups[key]) groups[key] = []
      groups[key].push(entry)
      return groups
    }, {})
  }, [travelerEntries])

  const openBookingEditor = useCallback((employee) => {
    setBookingEditorEmployeeId(employee.id)
    setBookingDraft(createBookingDraft(employee, employee?.travel_booking || bookings[employee.id]))
    setFlightSearchDraft(createFlightSearchDraft({
      origin: employee?.travel_booking?.origin || bookings[employee.id]?.origin || '',
      destination: employee?.travel_booking?.destination || bookings[employee.id]?.destination || '',
      departureDate: employee?.travel_booking?.departureDate || bookings[employee.id]?.departureDate || employee?.departure_date || '',
      adults: 1
    }))
    setFlightSearchResults([])
    setFlightSearchError('')
    setFlightLocationSuggestions({ originLocationCode: [], destinationLocationCode: [] })
    setFlightLocationLoadingField('')
  }, [bookings])

  const closeBookingEditor = useCallback(() => {
    setBookingEditorEmployeeId(null)
    setBookingDraft(null)
    setFlightSearchResults([])
    setFlightSearchError('')
    setFlightSearchLoading(false)
    setFlightLocationSuggestions({ originLocationCode: [], destinationLocationCode: [] })
    setFlightLocationLoadingField('')
  }, [])

  const handleToggleAwaitingEmployeeSelection = useCallback((employeeId) => {
    setSelectedAwaitingEmployeeIds((prev) => (
      prev.includes(employeeId)
        ? prev.filter((id) => id !== employeeId)
        : [...prev, employeeId]
    ))
  }, [])

  const handleToggleAllAwaitingEmployees = useCallback(() => {
    setSelectedAwaitingEmployeeIds((prev) => (
      prev.length === awaitingTravelEmployees.length
        ? []
        : awaitingTravelEmployees.map((employee) => employee.id)
    ))
  }, [awaitingTravelEmployees])

  const openBulkBookingEditor = useCallback(() => {
    if (!selectedAwaitingEmployeeIds.length) return
    const selectedEmployees = selectedAwaitingEmployeeIds
      .map((id) => employeesById[id])
      .filter(Boolean)

    if (!selectedEmployees.length) return

    setBulkBookingEmployeeIds(selectedEmployees.map((employee) => employee.id))
    setBulkBookingDraft({
      airline: '',
      origin: '',
      destination: '',
      departureDate: '',
      departureTime: '',
      arrivalDate: '',
      arrivalTime: '',
      routeSummary: '',
      notes: '',
      passengers: selectedEmployees.reduce((map, employee) => {
        map[employee.id] = {
          ticketNumber: '',
          pnr: ''
        }
        return map
      }, {})
    })
    setFlightSearchDraft(createFlightSearchDraft({ adults: selectedEmployees.length }))
    setFlightSearchResults([])
    setFlightSearchError('')
    setFlightLocationSuggestions({ originLocationCode: [], destinationLocationCode: [] })
    setFlightLocationLoadingField('')
  }, [employeesById, selectedAwaitingEmployeeIds])

  const closeBulkBookingEditor = useCallback(() => {
    setBulkBookingEmployeeIds([])
    setBulkBookingDraft(null)
    setFlightSearchResults([])
    setFlightSearchError('')
    setFlightSearchLoading(false)
    setFlightLocationSuggestions({ originLocationCode: [], destinationLocationCode: [] })
    setFlightLocationLoadingField('')
  }, [])

  const openPnrEditor = useCallback((employee) => {
    setPnrEditorEmployeeId(employee.id)
    setPnrDraft(employee?.travel_booking?.pnr || bookings[employee.id]?.pnr || '')
  }, [bookings])

  const closePnrEditor = useCallback(() => {
    setPnrEditorEmployeeId(null)
    setPnrDraft('')
  }, [])

  const handleBookingDraftChange = useCallback((field, value) => {
    setBookingDraft((prev) => ({
      ...prev,
      [field]: value
    }))
  }, [])

  const handleBulkBookingDraftChange = useCallback((field, value) => {
    setBulkBookingDraft((prev) => (
      prev
        ? {
            ...prev,
            [field]: value
          }
        : prev
    ))
  }, [])

  const handleBulkPassengerDraftChange = useCallback((employeeId, field, value) => {
    setBulkBookingDraft((prev) => (
      prev
        ? {
            ...prev,
            passengers: {
              ...prev.passengers,
              [employeeId]: {
                ...(prev.passengers?.[employeeId] || {}),
                [field]: value
              }
            }
          }
        : prev
    ))
  }, [])

  const handleFlightSearchDraftChange = useCallback((field, value) => {
    setFlightSearchDraft((prev) => ({
      ...prev,
      [field]: field === 'adults' ? Math.max(1, Number(value || 1)) : value
    }))
  }, [])

  const handleSelectFlightLocation = useCallback((field, location) => {
    const nextCode = String(location?.iataCode || '').trim().toUpperCase()
    if (!nextCode) return

    setFlightSearchDraft((prev) => ({
      ...prev,
      [field]: nextCode
    }))
    setFlightLocationSuggestions((prev) => ({
      ...prev,
      [field]: []
    }))
  }, [])

  useEffect(() => {
    const field = 'originLocationCode'
    const query = String(flightSearchDraft.originLocationCode || '').trim()
    if (query.length < 2) {
      setFlightLocationSuggestions((prev) => ({ ...prev, [field]: [] }))
      setFlightLocationLoadingField((current) => (current === field ? '' : current))
      return undefined
    }

    let ignore = false
    const timeoutId = window.setTimeout(async () => {
      setFlightLocationLoadingField(field)
      try {
        const result = await searchTravelLocations(query)
        if (!ignore) {
          setFlightLocationSuggestions((prev) => ({ ...prev, [field]: result.data || [] }))
        }
      } catch {
        if (!ignore) {
          setFlightLocationSuggestions((prev) => ({ ...prev, [field]: [] }))
        }
      } finally {
        if (!ignore) {
          setFlightLocationLoadingField((current) => (current === field ? '' : current))
        }
      }
    }, 280)

    return () => {
      ignore = true
      window.clearTimeout(timeoutId)
    }
  }, [flightSearchDraft.originLocationCode])

  useEffect(() => {
    const field = 'destinationLocationCode'
    const query = String(flightSearchDraft.destinationLocationCode || '').trim()
    if (query.length < 2) {
      setFlightLocationSuggestions((prev) => ({ ...prev, [field]: [] }))
      setFlightLocationLoadingField((current) => (current === field ? '' : current))
      return undefined
    }

    let ignore = false
    const timeoutId = window.setTimeout(async () => {
      setFlightLocationLoadingField(field)
      try {
        const result = await searchTravelLocations(query)
        if (!ignore) {
          setFlightLocationSuggestions((prev) => ({ ...prev, [field]: result.data || [] }))
        }
      } catch {
        if (!ignore) {
          setFlightLocationSuggestions((prev) => ({ ...prev, [field]: [] }))
        }
      } finally {
        if (!ignore) {
          setFlightLocationLoadingField((current) => (current === field ? '' : current))
        }
      }
    }, 280)

    return () => {
      ignore = true
      window.clearTimeout(timeoutId)
    }
  }, [flightSearchDraft.destinationLocationCode])

  const renderFlightLocationSuggestions = useCallback((field) => {
    const suggestions = flightLocationSuggestions[field] || []
    const isLoading = flightLocationLoadingField === field

    if (!suggestions.length && !isLoading) return null

    return (
      <div className="travel-airport-suggestion-panel">
        {isLoading ? <p className="travel-airport-hint">Looking up airports...</p> : null}
        {suggestions.length ? (
          <div className="travel-airport-suggestion-list">
            {suggestions.map((location) => {
              const label = flightLocationOptionLabel(location)
              return (
                <button
                  key={`${field}-${location.id || location.iataCode || label.title}`}
                  type="button"
                  className="travel-airport-suggestion"
                  onClick={() => handleSelectFlightLocation(field, location)}
                >
                  <strong>{label.title || '--'}</strong>
                  {label.subtitle ? <span>{label.subtitle}</span> : null}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }, [flightLocationLoadingField, flightLocationSuggestions, handleSelectFlightLocation])

  const handleSaveBooking = useCallback(async (employee) => {
    if (!bookingDraft) return
    if (!bookingDraft.ticketNumber.trim() || !bookingDraft.pnr.trim()) {
      setPageError('Ticket number and PNR are required before saving a travel booking.')
      return
    }
    if (!bookingDraft.origin.trim() || !bookingDraft.destination.trim()) {
      setPageError('Origin and destination are required before saving a travel booking.')
      return
    }
    if (!bookingDraft.departureDate) {
      setPageError('Departure date is required before saving a travel booking.')
      return
    }

    setBusyEmployeeId(employee.id)
    setPageError('')
    try {
      const normalizedBooking = {
        ticketNumber: bookingDraft.ticketNumber.trim(),
        pnr: bookingDraft.pnr.trim().toUpperCase(),
        airline: bookingDraft.airline.trim(),
        origin: bookingDraft.origin.trim(),
        destination: bookingDraft.destination.trim(),
        departureDate: bookingDraft.departureDate,
        departureTime: bookingDraft.departureTime || null,
        arrivalDate: bookingDraft.arrivalDate || null,
        arrivalTime: bookingDraft.arrivalTime || null,
        routeSummary: bookingDraft.routeSummary.trim(),
        notes: bookingDraft.notes.trim()
      }

      await employeesService.saveEmployeeTravelBooking(employee.id, normalizedBooking)

      showToast('Travel booking saved for the employee.', { tone: 'success', title: 'Travel updated' })
      closeBookingEditor()
      await loadTravelEmployees()
    } catch (err) {
      setPageError(err.message || 'Could not save the travel booking')
    } finally {
      setBusyEmployeeId(null)
    }
  }, [bookingDraft, closeBookingEditor, loadTravelEmployees, showToast])

  const handleSavePnr = useCallback(async (employee) => {
    const normalizedPnr = pnrDraft.trim().toUpperCase()
    if (!normalizedPnr) {
      setPageError('PNR code is required before updating the booking.')
      return
    }

    setBusyEmployeeId(employee.id)
    setPageError('')
    try {
      await employeesService.updateEmployeeTravelBooking(employee.id, {
        pnr: normalizedPnr
      })
      showToast('PNR code updated for the booking.', { tone: 'success', title: 'Travel updated' })
      closePnrEditor()
      await loadTravelEmployees()
    } catch (err) {
      setPageError(err.message || 'Could not update the PNR code')
    } finally {
      setBusyEmployeeId(null)
    }
  }, [closePnrEditor, loadTravelEmployees, pnrDraft, showToast])

  const handleFlightSearch = useCallback(async () => {
    if (!flightSearchDraft.originLocationCode || !flightSearchDraft.destinationLocationCode) {
      setFlightSearchError('Origin and destination airport codes are required before searching flights.')
      return
    }
    if (!flightSearchDraft.departureDate) {
      setFlightSearchError('Departure date is required before searching flights.')
      return
    }

    setFlightSearchLoading(true)
    setFlightSearchError('')
    try {
      const result = await searchFlightAvailabilities(flightSearchDraft)
      setFlightSearchResults(result.data || [])
    } catch (err) {
      setFlightSearchResults([])
      setFlightSearchError(err.message || 'Could not search live flight availability')
    } finally {
      setFlightSearchLoading(false)
    }
  }, [flightSearchDraft])

  const handleUseFlightForSingleBooking = useCallback((result) => {
    const nextFields = bookingFieldsFromFlight(result)
    setBookingDraft((prev) => ({
      ...prev,
      ...nextFields
    }))
    showToast('Flight details were applied to the booking form.', { tone: 'success', title: 'Flight selected' })
  }, [showToast])

  const handleUseFlightForBulkBooking = useCallback((result) => {
    const nextFields = bookingFieldsFromFlight(result)
    setBulkBookingDraft((prev) => (
      prev
        ? {
            ...prev,
            ...nextFields
          }
        : prev
    ))
    showToast('Flight details were applied to the shared booking form.', { tone: 'success', title: 'Flight selected' })
  }, [showToast])

  const handleSaveBulkBooking = useCallback(async () => {
    if (!bulkBookingDraft || !bulkBookingEmployeeIds.length) return
    if (!bulkBookingDraft.departureDate) {
      setPageError('Departure date is required before saving booked travel.')
      return
    }
    if (!bulkBookingDraft.origin.trim() || !bulkBookingDraft.destination.trim()) {
      setPageError('Origin and destination are required before saving booked travel.')
      return
    }

    const selectedEmployees = bulkBookingEmployeeIds
      .map((id) => employeesById[id])
      .filter(Boolean)

    if (!selectedEmployees.length) {
      setPageError('No employees are available for bulk booking.')
      return
    }

    for (const employee of selectedEmployees) {
      const passenger = bulkBookingDraft.passengers?.[employee.id]
      if (!passenger?.ticketNumber?.trim() || !passenger?.pnr?.trim()) {
        setPageError(`Ticket number and PNR are required for ${employee.full_name}.`)
        return
      }
    }

    setBusyEmployeeId('bulk-booking')
    setPageError('')
    try {
      await Promise.all(
        selectedEmployees.map((employee) => {
          const passenger = bulkBookingDraft.passengers[employee.id]
          return employeesService.saveEmployeeTravelBooking(employee.id, {
            ticketNumber: passenger.ticketNumber.trim(),
            pnr: passenger.pnr.trim().toUpperCase(),
            airline: bulkBookingDraft.airline.trim(),
            origin: bulkBookingDraft.origin.trim(),
            destination: bulkBookingDraft.destination.trim(),
            departureDate: bulkBookingDraft.departureDate,
            departureTime: bulkBookingDraft.departureTime || null,
            arrivalDate: bulkBookingDraft.arrivalDate || null,
            arrivalTime: bulkBookingDraft.arrivalTime || null,
            routeSummary: bulkBookingDraft.routeSummary.trim(),
            notes: bulkBookingDraft.notes.trim()
          })
        })
      )

      showToast(`Travel booked for ${selectedEmployees.length} employees.`, { tone: 'success', title: 'Travel updated' })
      setSelectedAwaitingEmployeeIds([])
      closeBulkBookingEditor()
      await loadTravelEmployees()
    } catch (err) {
      setPageError(err.message || 'Could not save the bulk travel booking')
    } finally {
      setBusyEmployeeId(null)
    }
  }, [bulkBookingDraft, bulkBookingEmployeeIds, closeBulkBookingEditor, employeesById, loadTravelEmployees, showToast])

  const handleMarkTravelled = useCallback(async (employee, booking) => {
    const confirmed = await confirm({
      title: 'Mark as traveled',
      message: `Mark ${employee.full_name} as traveled and move the employee out of the travel queue into the employed workflow?`,
      confirmLabel: 'Mark traveled',
      cancelLabel: 'Cancel',
      tone: 'warning'
    })
    if (!confirmed) return

    setBusyEmployeeId(employee.id)
    setPageError('')
    try {
      await employeesService.updateEmployee(employee.id, {
        did_travel: true,
        progress_override_complete: true,
        departure_date: booking?.departureDate || employee?.departure_date || ''
      })
      showToast('Employee marked as traveled.', { tone: 'success', title: 'Travel updated' })
      await loadTravelEmployees()
    } catch (err) {
      setPageError(err.message || 'Could not mark employee as traveled')
    } finally {
      setBusyEmployeeId(null)
    }
  }, [confirm, loadTravelEmployees, showToast])

  const bookingEditorEmployee = bookingEditorEmployeeId ? employeesById[bookingEditorEmployeeId] : null
  const bulkBookingEmployees = bulkBookingEmployeeIds
    .map((id) => employeesById[id])
    .filter(Boolean)
  const allAwaitingEmployeesSelected = awaitingTravelEmployees.length > 0 && selectedAwaitingEmployeeIds.length === awaitingTravelEmployees.length

  if (features.employees_enabled === false) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <section className="dashboard-panel travel-page">
      <div className="page-panel-header">
        <div>
          <h1>Travel</h1>
          <p className="muted-text">
            Move employees from completed process work into ticketing, booking control, and departure coordination.
          </p>
          <p className="muted-text">
            Awaiting Travel captures process-complete employees, Booked Travels stores ticket records linked by PNR and ticket number, and Travelers gives the live departure calendar.
          </p>
        </div>
        <div className="employees-header-actions">
          <button type="button" className="btn-secondary" onClick={loadTravelEmployees} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      <div className="travel-summary-grid">
        <article className="employee-summary-card">
          <strong>{travelSummary.awaiting}</strong>
          <span>Awaiting ticketing</span>
        </article>
        <article className="employee-summary-card">
          <strong>{travelSummary.booked}</strong>
          <span>Booked travels</span>
        </article>
        <article className="employee-summary-card">
          <strong>{travelSummary.travelers}</strong>
          <span>Travelers on calendar</span>
        </article>
        <article className="employee-summary-card">
          <strong>{travelSummary.departureToday}</strong>
          <span>Departing today</span>
        </article>
      </div>

      <div className="employee-subtabs" role="tablist" aria-label="Travel workflow views">
        {TRAVEL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`employee-subtab${activeTab === tab.id ? ' is-active' : ''}`}
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form className="form-grid employees-filter-grid travel-filter-grid" onSubmit={(event) => event.preventDefault()}>
        <label>
          Search
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Employee, profession, passport, PNR, ticket number"
          />
        </label>
        <label>
          Sort by
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          Process owner
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
            <option value="all">All owners</option>
            {processOwnerOptions.map((owner) => (
              <option key={owner} value={owner}>{owner}</option>
            ))}
          </select>
        </label>
        <label>
          Profession
          <select value={professionFilter} onChange={(event) => setProfessionFilter(event.target.value)}>
            <option value="all">All professions</option>
            {professionOptions.map((profession) => (
              <option key={profession} value={profession}>{profession}</option>
            ))}
          </select>
        </label>
        <div className="travel-filter-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setSearchQuery('')
              setOwnerFilter('all')
              setProfessionFilter('all')
              setSortBy(activeTab === 'awaiting' ? 'queue_newest' : 'departure')
            }}
          >
            Clear filters
          </button>
        </div>
      </form>

      {!loading && activeTab === 'awaiting' && awaitingTravelEmployees.length > 0 ? (
        <div className="travel-bulk-toolbar">
          <label className="employee-selection-select-all">
            <input
              type="checkbox"
              checked={allAwaitingEmployeesSelected}
              onChange={handleToggleAllAwaitingEmployees}
            />
            <span>Select all employees</span>
          </label>
          <div className="travel-bulk-toolbar-actions">
            <span className="muted-text">{selectedAwaitingEmployeeIds.length} selected</span>
            <button
              type="button"
              className="btn-secondary"
              onClick={openBulkBookingEditor}
              disabled={readOnly || selectedAwaitingEmployeeIds.length === 0}
            >
              Book a ticket
            </button>
          </div>
        </div>
      ) : null}

      {pageError ? <p className="error-message">{pageError}</p> : null}

      <div className="travel-layout">
        <div>
          {loading ? <p className="muted-text">Loading travel workspace...</p> : null}

          {!loading && activeTab === 'awaiting' ? (
            awaitingTravelEmployees.length === 0 ? (
              <article className="employee-summary-card">
                <h3>Awaiting Travel</h3>
                <p className="muted-text">No employees are waiting for ticket booking right now.</p>
              </article>
            ) : (
              <div className="table-scroll activity-log-table-wrap">
                  <table className="users-table activity-log-table">
                    <thead>
                      <tr>
                        <th />
                        <th>Employee</th>
                        <th>Profession</th>
                        <th>Progress</th>
                        <th>Owner</th>
                        <th>Passport</th>
                        <th>Phone</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {awaitingTravelEmployees.map((employee) => {
                        const progress = employee.progress_status?.overall_completion ?? 0
                        const isSelected = selectedAwaitingEmployeeIds.includes(employee.id)

                        return (
                          <tr key={employee.id} className={isSelected ? 'is-selected' : ''}>
                            <td>
                              <label className="toggle-cell travel-select-cell">
                                <input
                                  type="checkbox"
                                  aria-label="Select employee"
                                  checked={isSelected}
                                  onChange={() => handleToggleAwaitingEmployeeSelection(employee.id)}
                                />
                              </label>
                            </td>
                            <td>
                              <strong>{employee.full_name}</strong>
                            </td>
                            <td>{employee.profession || employee.professional_title || '--'}</td>
                            <td className="nowrap">{progress}%</td>
                            <td>{employee.selection_state?.selection?.agent_name || '--'}</td>
                            <td className="nowrap">{employee.passport_number || '--'}</td>
                            <td className="nowrap">{employee.mobile_number || employee.phone || '--'}</td>
                            <td className="travel-actions-cell">
                              <div className="travel-actions-row">
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => openBookingEditor(employee)}
                                  disabled={readOnly}
                                >
                                  Book Now
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
            )
          ) : null}

          {!loading && activeTab === 'booked' ? (
            bookedTravelEntries.length === 0 ? (
              <article className="employee-summary-card">
                <h3>Booked Travels</h3>
                <p className="muted-text">No booked travel records found yet.</p>
              </article>
            ) : (
              <div className="table-scroll activity-log-table-wrap">
                  <table className="users-table activity-log-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Profession</th>
                        <th>Airline</th>
                        <th>Ticket</th>
                        <th>PNR</th>
                        <th>Route</th>
                        <th>Departure</th>
                        <th>Arrival</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {bookedTravelEntries.map(({ employee, booking }) => (
                        <tr key={`booked-${employee.id}`}>
                          <td>
                            <strong>{employee.full_name}</strong>
                          </td>
                          <td>{employee.profession || employee.professional_title || '--'}</td>
                          <td>{booking.airline || 'Airline pending'}</td>
                          <td className="nowrap">{booking.ticketNumber || '--'}</td>
                          <td className="nowrap">{booking.pnr || '--'}</td>
                          <td className="nowrap">
                            {booking.origin || '--'} → {booking.destination || '--'}
                          </td>
                          <td className="nowrap">{formatDateTime(booking.departureDate, booking.departureTime)}</td>
                          <td className="nowrap">{booking.arrivalDate ? formatDateTime(booking.arrivalDate, booking.arrivalTime) : '--'}</td>
                          <td className="travel-actions-cell">
                            <div className="travel-actions-row">
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => openPnrEditor(employee)}
                                disabled={readOnly}
                              >
                                Update booking
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            )
          ) : null}

          {!loading && activeTab === 'travelers' ? (
            travelerEntries.length === 0 ? (
              <article className="employee-summary-card">
                <h3>Travelers</h3>
                <p className="muted-text">No departures are scheduled on the travel calendar yet.</p>
              </article>
            ) : (
              <div className="travel-calendar-list">
                {Object.entries(travelerCalendar)
                  .sort(([left], [right]) => left.localeCompare(right))
                  .map(([departureDate, entries]) => (
                    <section key={departureDate} className="employee-summary-card">
                      <h3>{formatDate(departureDate)}</h3>
                      <div className="table-scroll activity-log-table-wrap">
                          <table className="users-table activity-log-table">
                            <thead>
                              <tr>
                                <th>Employee</th>
                                <th>Airline</th>
                                <th>Route</th>
                                <th>PNR</th>
                                <th>Ticket</th>
                                <th>Departure time</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {entries.map(({ employee, booking }) => (
                                <tr key={`traveler-${employee.id}`}>
                                  <td>
                                    <strong>{employee.full_name}</strong>
                                  </td>
                                  <td>{booking.airline || '--'}</td>
                                  <td className="nowrap">
                                    {booking.origin || '--'} → {booking.destination || '--'}
                                  </td>
                                  <td className="nowrap">{booking.pnr || '--'}</td>
                                  <td className="nowrap">{booking.ticketNumber || '--'}</td>
                                  <td className="nowrap">{booking.departureTime || '--:--'}</td>
                                  <td className="travel-actions-cell">
                                    <div className="travel-actions-row">
                                      <button
                                        type="button"
                                        className="btn-info"
                                        onClick={() => handleMarkTravelled(employee, booking)}
                                        disabled={readOnly || busyEmployeeId === employee.id}
                                      >
                                        {busyEmployeeId === employee.id ? 'Saving...' : 'Confirm departure'}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                    </section>
                  ))}
              </div>
            )
          ) : null}
        </div>
      </div>

      {bulkBookingDraft && bulkBookingEmployees.length > 0 ? (
        <div className="app-confirm-backdrop" role="presentation" onClick={closeBulkBookingEditor}>
          <div
            className="app-confirm-dialog travel-booking-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="travel-bulk-booking-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="app-confirm-header">
              <h2 id="travel-bulk-booking-title">Book a ticket</h2>
            </div>
            <p className="muted-text">
              Apply one shared itinerary to {bulkBookingEmployees.length} selected employees, then enter each employee&apos;s ticket number and PNR.
            </p>
            <div className="travel-live-search">
              <div className="travel-live-search-header">
                <h3>Search live flight availability</h3>
                <p className="muted-text">Uses the portal travel search foundation so you can prefill the shared itinerary from a live availability result.</p>
              </div>
              <div className="travel-booking-form">
                <label className="travel-airport-field">
                  Origin airport
                  <input
                    value={flightSearchDraft.originLocationCode}
                    onChange={(event) => handleFlightSearchDraftChange('originLocationCode', event.target.value.toUpperCase())}
                    placeholder="Search by city, airport, or IATA code"
                  />
                  {renderFlightLocationSuggestions('originLocationCode')}
                </label>
                <label className="travel-airport-field">
                  Destination airport
                  <input
                    value={flightSearchDraft.destinationLocationCode}
                    onChange={(event) => handleFlightSearchDraftChange('destinationLocationCode', event.target.value.toUpperCase())}
                    placeholder="Search by city, airport, or IATA code"
                  />
                  {renderFlightLocationSuggestions('destinationLocationCode')}
                </label>
                <label>
                  Departure date
                  <input
                    type="date"
                    value={flightSearchDraft.departureDate}
                    onChange={(event) => handleFlightSearchDraftChange('departureDate', event.target.value)}
                  />
                </label>
                <label>
                  Adults
                  <input
                    type="number"
                    min="1"
                    value={flightSearchDraft.adults}
                    onChange={(event) => handleFlightSearchDraftChange('adults', event.target.value)}
                  />
                </label>
              </div>
              <div className="travel-live-search-actions">
                <button type="button" className="btn-secondary" onClick={handleFlightSearch} disabled={flightSearchLoading}>
                  {flightSearchLoading ? 'Searching...' : 'Search flights'}
                </button>
              </div>
              {flightSearchError ? <p className="error-message">{flightSearchError}</p> : null}
              {flightSearchResults.length ? (
                <div className="travel-live-result-list">
                  {flightSearchResults.map((result) => (
                    <article key={`bulk-flight-${result.id}`} className="travel-live-result-card">
                      <div>
                        <strong>{result.routeSummary || `${result.originIataCode} -> ${result.destinationIataCode}`}</strong>
                        <p className="muted-text">
                          {(result.carrierCodes || []).join(', ') || '--'} | {formatDateTime(splitDateTimeParts(result.departureAt).date, splitDateTimeParts(result.departureAt).time)} to {formatDateTime(splitDateTimeParts(result.arrivalAt).date, splitDateTimeParts(result.arrivalAt).time)}
                        </p>
                        <p className="muted-text">Duration {result.duration || '--'} | {summarizeAvailability(result)}</p>
                      </div>
                      <button type="button" className="btn-secondary" onClick={() => handleUseFlightForBulkBooking(result)}>
                        Use this flight
                      </button>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="travel-booking-form">
              <label>
                Airline
                <input value={bulkBookingDraft.airline} onChange={(event) => handleBulkBookingDraftChange('airline', event.target.value)} autoFocus />
              </label>
              <label>
                Origin
                <input value={bulkBookingDraft.origin} onChange={(event) => handleBulkBookingDraftChange('origin', event.target.value)} />
              </label>
              <label>
                Destination
                <input value={bulkBookingDraft.destination} onChange={(event) => handleBulkBookingDraftChange('destination', event.target.value)} />
              </label>
              <label>
                Departure date
                <input type="date" value={bulkBookingDraft.departureDate} onChange={(event) => handleBulkBookingDraftChange('departureDate', event.target.value)} />
              </label>
              <label>
                Departure time
                <input type="time" value={bulkBookingDraft.departureTime} onChange={(event) => handleBulkBookingDraftChange('departureTime', event.target.value)} />
              </label>
              <label>
                Arrival date
                <input type="date" value={bulkBookingDraft.arrivalDate} onChange={(event) => handleBulkBookingDraftChange('arrivalDate', event.target.value)} />
              </label>
              <label>
                Arrival time
                <input type="time" value={bulkBookingDraft.arrivalTime} onChange={(event) => handleBulkBookingDraftChange('arrivalTime', event.target.value)} />
              </label>
              <label className="employee-span-two">
                Route summary
                <input value={bulkBookingDraft.routeSummary} onChange={(event) => handleBulkBookingDraftChange('routeSummary', event.target.value)} placeholder="Example: ADD -> DXB -> DOH" />
              </label>
              <label className="employee-span-two">
                Notes
                <textarea value={bulkBookingDraft.notes} onChange={(event) => handleBulkBookingDraftChange('notes', event.target.value)} rows={3} />
              </label>
            </div>
            <div className="table-scroll activity-log-table-wrap travel-bulk-passenger-table">
              <table className="users-table activity-log-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Profession</th>
                    <th>Ticket number</th>
                    <th>PNR</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkBookingEmployees.map((employee) => (
                    <tr key={`bulk-booking-${employee.id}`}>
                      <td>
                        <strong>{employee.full_name}</strong>
                      </td>
                      <td>{employee.profession || employee.professional_title || '--'}</td>
                      <td className="travel-input-cell">
                        <input
                          value={bulkBookingDraft.passengers?.[employee.id]?.ticketNumber || ''}
                          onChange={(event) => handleBulkPassengerDraftChange(employee.id, 'ticketNumber', event.target.value)}
                          placeholder="Ticket number"
                        />
                      </td>
                      <td className="travel-input-cell">
                        <input
                          value={bulkBookingDraft.passengers?.[employee.id]?.pnr || ''}
                          onChange={(event) => handleBulkPassengerDraftChange(employee.id, 'pnr', event.target.value.toUpperCase())}
                          placeholder="PNR"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="app-confirm-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleSaveBulkBooking}
                disabled={readOnly || busyEmployeeId === 'bulk-booking'}
              >
                {busyEmployeeId === 'bulk-booking' ? 'Saving...' : 'Save booked travels'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeBulkBookingEditor}
                disabled={busyEmployeeId === 'bulk-booking'}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pnrEditorEmployeeId ? (
        <div className="app-confirm-backdrop" role="presentation" onClick={closePnrEditor}>
          <div
            className="app-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="travel-pnr-editor-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="app-confirm-header">
              <h2 id="travel-pnr-editor-title">Update booking</h2>
            </div>
            <div className="travel-booking-form">
              <label className="employee-span-two">
                PNR code
                <input
                  value={pnrDraft}
                  onChange={(event) => setPnrDraft(event.target.value.toUpperCase())}
                  placeholder="Enter PNR code"
                  autoFocus
                />
              </label>
            </div>
            <div className="app-confirm-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSavePnr(employeesById[pnrEditorEmployeeId])}
                disabled={readOnly || busyEmployeeId === pnrEditorEmployeeId}
              >
                {busyEmployeeId === pnrEditorEmployeeId ? 'Saving...' : 'Save PNR'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={closePnrEditor}
                disabled={busyEmployeeId === pnrEditorEmployeeId}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bookingEditorEmployee ? (
        <div className="app-confirm-backdrop" role="presentation" onClick={closeBookingEditor}>
          <div
            className="app-confirm-dialog travel-booking-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="travel-booking-editor-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="app-confirm-header">
              <h2 id="travel-booking-editor-title">Book Now</h2>
            </div>
            <p className="muted-text">
              Search and prepare the flight booking for {bookingEditorEmployee.full_name}, then save the ticket details to move the employee into Booked Travels.
            </p>
            <div className="travel-live-search">
              <div className="travel-live-search-header">
                <h3>Search live flight availability</h3>
                <p className="muted-text">Uses the portal travel search foundation so you can prefill the booking from a live availability result.</p>
              </div>
              <div className="travel-booking-form">
                <label className="travel-airport-field">
                  Origin airport
                  <input
                    value={flightSearchDraft.originLocationCode}
                    onChange={(event) => handleFlightSearchDraftChange('originLocationCode', event.target.value.toUpperCase())}
                    placeholder="Search by city, airport, or IATA code"
                  />
                  {renderFlightLocationSuggestions('originLocationCode')}
                </label>
                <label className="travel-airport-field">
                  Destination airport
                  <input
                    value={flightSearchDraft.destinationLocationCode}
                    onChange={(event) => handleFlightSearchDraftChange('destinationLocationCode', event.target.value.toUpperCase())}
                    placeholder="Search by city, airport, or IATA code"
                  />
                  {renderFlightLocationSuggestions('destinationLocationCode')}
                </label>
                <label>
                  Departure date
                  <input
                    type="date"
                    value={flightSearchDraft.departureDate}
                    onChange={(event) => handleFlightSearchDraftChange('departureDate', event.target.value)}
                  />
                </label>
                <label>
                  Adults
                  <input
                    type="number"
                    min="1"
                    value={flightSearchDraft.adults}
                    onChange={(event) => handleFlightSearchDraftChange('adults', event.target.value)}
                  />
                </label>
              </div>
              <div className="travel-live-search-actions">
                <button type="button" className="btn-secondary" onClick={handleFlightSearch} disabled={flightSearchLoading}>
                  {flightSearchLoading ? 'Searching...' : 'Search flights'}
                </button>
              </div>
              {flightSearchError ? <p className="error-message">{flightSearchError}</p> : null}
              {flightSearchResults.length ? (
                <div className="travel-live-result-list">
                  {flightSearchResults.map((result) => (
                    <article key={`single-flight-${result.id}`} className="travel-live-result-card">
                      <div>
                        <strong>{result.routeSummary || `${result.originIataCode} -> ${result.destinationIataCode}`}</strong>
                        <p className="muted-text">
                          {(result.carrierCodes || []).join(', ') || '--'} | {formatDateTime(splitDateTimeParts(result.departureAt).date, splitDateTimeParts(result.departureAt).time)} to {formatDateTime(splitDateTimeParts(result.arrivalAt).date, splitDateTimeParts(result.arrivalAt).time)}
                        </p>
                        <p className="muted-text">Duration {result.duration || '--'} | {summarizeAvailability(result)}</p>
                      </div>
                      <button type="button" className="btn-secondary" onClick={() => handleUseFlightForSingleBooking(result)}>
                        Use this flight
                      </button>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="travel-booking-form">
              <label>
                Ticket number
                <input
                  value={bookingDraft?.ticketNumber || ''}
                  onChange={(event) => handleBookingDraftChange('ticketNumber', event.target.value)}
                  autoFocus
                />
              </label>
              <label>
                PNR
                <input
                  value={bookingDraft?.pnr || ''}
                  onChange={(event) => handleBookingDraftChange('pnr', event.target.value.toUpperCase())}
                />
              </label>
              <label>
                Airline
                <input value={bookingDraft?.airline || ''} onChange={(event) => handleBookingDraftChange('airline', event.target.value)} />
              </label>
              <label>
                Origin
                <input value={bookingDraft?.origin || ''} onChange={(event) => handleBookingDraftChange('origin', event.target.value)} />
              </label>
              <label>
                Destination
                <input value={bookingDraft?.destination || ''} onChange={(event) => handleBookingDraftChange('destination', event.target.value)} />
              </label>
              <label>
                Departure date
                <input type="date" value={bookingDraft?.departureDate || ''} onChange={(event) => handleBookingDraftChange('departureDate', event.target.value)} />
              </label>
              <label>
                Departure time
                <input type="time" value={bookingDraft?.departureTime || ''} onChange={(event) => handleBookingDraftChange('departureTime', event.target.value)} />
              </label>
              <label>
                Arrival date
                <input type="date" value={bookingDraft?.arrivalDate || ''} onChange={(event) => handleBookingDraftChange('arrivalDate', event.target.value)} />
              </label>
              <label>
                Arrival time
                <input type="time" value={bookingDraft?.arrivalTime || ''} onChange={(event) => handleBookingDraftChange('arrivalTime', event.target.value)} />
              </label>
              <label className="employee-span-two">
                Route summary
                <input value={bookingDraft?.routeSummary || ''} onChange={(event) => handleBookingDraftChange('routeSummary', event.target.value)} placeholder="Example: ADD -> DXB -> DOH" />
              </label>
              <label className="employee-span-two">
                Notes
                <textarea value={bookingDraft?.notes || ''} onChange={(event) => handleBookingDraftChange('notes', event.target.value)} rows={3} />
              </label>
            </div>
            <div className="app-confirm-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSaveBooking(bookingEditorEmployee)}
                disabled={readOnly || busyEmployeeId === bookingEditorEmployee.id}
              >
                {busyEmployeeId === bookingEditorEmployee.id ? 'Saving...' : 'Save booking'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeBookingEditor}
                disabled={busyEmployeeId === bookingEditorEmployee.id}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
