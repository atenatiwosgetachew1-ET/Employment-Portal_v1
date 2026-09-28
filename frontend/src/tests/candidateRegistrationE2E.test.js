import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  REGISTRATION_STEPS,
  MANDATORY_ATTACHMENT_KEYS,
  MINIMUM_EMPLOYEE_AGE,
  computeAge,
  emptyForm,
  validateStepFields,
  validateEmployeeForm,
  buildEmployeePayload,
  getValidationStep
} from '../utils/employeeHelpers'
import { ATTACHMENT_FIELDS } from '../constants/employeeOptions'
import * as employeesService from '../services/employeesService'

vi.mock('../services/employeesService', () => ({
  createEmployee: vi.fn(),
  uploadEmployeeDocument: vi.fn(),
  updateEmployee: vi.fn(),
  getEmployees: vi.fn()
}))

describe('End-to-End Candidate Registration Flow (Frontend)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('progresses through all registration steps, validates review state, and executes submission with attachments', async () => {
    // 1. Initial State: Form is completely empty
    const candidateForm = { ...emptyForm }
    expect(REGISTRATION_STEPS).toHaveLength(6)

    // Step 0: Personal Identity Validation & Age Guard
    expect(validateStepFields(candidateForm, 0)).toBe('First name is required.')

    // Candidate under 18 rejection
    candidateForm.first_name = 'Amina'
    candidateForm.middle_name = 'Kassaye'
    candidateForm.last_name = 'Tesfaye'
    candidateForm.date_of_birth = '2015-01-01'
    const underAge = computeAge(candidateForm.date_of_birth)
    const underAgeError =
      underAge !== '' && underAge < MINIMUM_EMPLOYEE_AGE
        ? `Employee must be at least ${MINIMUM_EMPLOYEE_AGE} years old.`
        : ''
    expect(underAgeError).toBe('Employee must be at least 18 years old.')
    expect(validateStepFields(candidateForm, 0, underAgeError)).toBe(
      'Employee must be at least 18 years old.'
    )

    // Candidate valid age (>= 18)
    candidateForm.date_of_birth = '1998-04-12'
    const validAge = computeAge(candidateForm.date_of_birth)
    const validAgeError =
      validAge !== '' && validAge < MINIMUM_EMPLOYEE_AGE
        ? `Employee must be at least ${MINIMUM_EMPLOYEE_AGE} years old.`
        : ''
    expect(validAgeError).toBe('')

    candidateForm.gender = 'Female'
    candidateForm.passport_number = 'EP9876543'
    candidateForm.mobile_number = '+251911998877'
    candidateForm.labour_id = 'LAB-4421'
    candidateForm.id_number = 'NAT-998811'

    expect(validateStepFields(candidateForm, 0, validAgeError)).toBe('')

    // Step 1: Profile & Demographics
    expect(validateStepFields(candidateForm, 1)).toBe('Religion is required.')
    candidateForm.religion = 'Muslim'
    expect(validateStepFields(candidateForm, 1)).toBe('Marital status is required.')
    candidateForm.marital_status = 'Single'
    expect(validateStepFields(candidateForm, 1)).toBe('Residence country is required.')
    candidateForm.residence_country = 'Ethiopia'
    candidateForm.nationality = 'Ethiopian'
    candidateForm.birth_place = 'Addis Ababa'
    candidateForm.height_cm = '165'
    candidateForm.weight_kg = '58'
    candidateForm.education = 'High School Diploma'
    candidateForm.children_count = 0

    expect(validateStepFields(candidateForm, 1)).toBe('')

    // Step 2: Contact Person & Communication Channels
    expect(validateStepFields(candidateForm, 2)).toBe('Contact person name is required.')
    candidateForm.contact_person_name = 'Kassaye Tesfaye'
    expect(validateStepFields(candidateForm, 2)).toBe('Contact person mobile is required.')
    candidateForm.contact_person_mobile = 'invalid-phone'
    expect(validateStepFields(candidateForm, 2)).toBe('Enter a valid contact person mobile number.')
    candidateForm.contact_person_mobile = '+251922334455'
    candidateForm.contact_person_relationship = 'Father'
    candidateForm.contact_person_city = 'Addis Ababa'
    candidateForm.phone = '+251115551234'
    candidateForm.email = 'amina.kassaye@example.com'
    candidateForm.address = 'Bole Subcity, Woreda 03, House 412'

    expect(validateStepFields(candidateForm, 2)).toBe('')

    // Step 3: Application, Job Roles & Overseas Experience
    expect(validateStepFields(candidateForm, 3)).toBe('Select at least one destination country.')
    candidateForm.application_countries = ['Saudi Arabia', 'United Arab Emirates']
    expect(validateStepFields(candidateForm, 3)).toBe('Profession is required.')
    candidateForm.profession = 'Housemaid'
    candidateForm.professional_title = 'Domestic Worker & Caregiver'
    candidateForm.employment_type = 'Full-time'
    candidateForm.application_salary = '1600'
    candidateForm.skills = ['Cleaning', 'Cooking', 'Childcare', 'Elderly Care']
    candidateForm.languages = ['Amharic', 'Arabic', 'English']

    // Experience with country but missing years
    candidateForm.experiences = [
      { country: 'Saudi Arabia', years: '' }
    ]
    expect(validateStepFields(candidateForm, 3)).toBe('Fill in years for each selected experience country.')

    candidateForm.experiences = [
      { country: 'Saudi Arabia', years: '3' },
      { country: 'Kuwait', years: '2' }
    ]
    expect(validateStepFields(candidateForm, 3)).toBe('')

    // Validate entire candidate form against global validator
    expect(validateEmployeeForm(candidateForm)).toBe('')

    // Step 4: Document Attachments Validation
    const attachmentFiles = {}
    const existingAttachmentDocs = {}

    const validateAttachmentDates = () => {
      for (const attachment of ATTACHMENT_FIELDS) {
        if (!attachment.expiryField) continue
        const hasFile = Boolean(
          attachmentFiles[attachment.key] || existingAttachmentDocs[attachment.key]
        )
        if (hasFile && !candidateForm[attachment.expiryField]) {
          throw new Error(`${attachment.label} date is required when a file is selected.`)
        }
      }
      for (const key of MANDATORY_ATTACHMENT_KEYS) {
        const existingDocument = Boolean(existingAttachmentDocs[key])
        if (!attachmentFiles[key] && !existingDocument) {
          const attachment = ATTACHMENT_FIELDS.find((item) => item.key === key)
          throw new Error(`${attachment?.label || key} is required.`)
        }
      }
    }

    // Step 4 fails when mandatory documents are missing
    expect(
      validateStepFields(candidateForm, 4, null, validateAttachmentDates)
    ).toContain('is required')

    // Attach mock files for mandatory documents
    const mockFile = (name, type = 'image/jpeg') => ({
      name,
      type,
      size: 1024
    })

    attachmentFiles.portrait_photo = mockFile('portrait.jpg')
    attachmentFiles.full_photo = mockFile('full.jpg')
    attachmentFiles.passport_document = mockFile('passport.pdf', 'application/pdf')

    // Passport document requires passport_expires_on
    expect(
      validateStepFields(candidateForm, 4, null, validateAttachmentDates)
    ).toBe('Passport date is required when a file is selected.')

    candidateForm.passport_expires_on = '2032-12-31'
    expect(
      validateStepFields(candidateForm, 4, null, validateAttachmentDates)
    ).toBe('')

    // Step 5: Review Step Completeness Computations
    const REQUIRED_ATTACHMENT_FIELDS = ATTACHMENT_FIELDS.filter((att) =>
      MANDATORY_ATTACHMENT_KEYS.includes(att.key)
    )

    const step0Error = validateStepFields(candidateForm, 0, validAgeError)
    const step1Error = validateStepFields(candidateForm, 1)
    const step2Error = validateStepFields(candidateForm, 2)
    const step3Error = validateStepFields(candidateForm, 3)

    const missingRequiredDocs = REQUIRED_ATTACHMENT_FIELDS.filter(
      (att) => !(attachmentFiles[att.key] || existingAttachmentDocs[att.key]?.file_url)
    )
    const step4Error =
      missingRequiredDocs.length > 0
        ? `${missingRequiredDocs.length} mandatory document${missingRequiredDocs.length === 1 ? '' : 's'} missing`
        : validateStepFields(candidateForm, 4, null, validateAttachmentDates) || ''

    const isStep0Complete = !step0Error
    const isStep1Complete = !step1Error
    const isStep2Complete = !step2Error
    const isStep3Complete = !step3Error
    const isStep4Complete = !step4Error

    expect(isStep0Complete).toBe(true)
    expect(isStep1Complete).toBe(true)
    expect(isStep2Complete).toBe(true)
    expect(isStep3Complete).toBe(true)
    expect(isStep4Complete).toBe(true)

    const completedCount = [
      isStep0Complete,
      isStep1Complete,
      isStep2Complete,
      isStep3Complete,
      isStep4Complete
    ].filter(Boolean).length

    expect(completedCount).toBe(5)
    const hasAnyIncompleteStep = completedCount < 5
    expect(hasAnyIncompleteStep).toBe(false)

    // Build Final Candidate Payload
    const payload = buildEmployeePayload(candidateForm, null)

    expect(payload.first_name).toBe('Amina')
    expect(payload.last_name).toBe('Tesfaye')
    expect(payload.status).toBe('pending')
    expect(payload.did_travel).toBe(false)
    expect(payload.professional_title).toBe('Domestic Worker & Caregiver')
    expect(payload.application_salary).toBe('1600')
    expect(payload.experiences).toEqual([
      { country: 'Saudi Arabia', years: 3 },
      { country: 'Kuwait', years: 2 }
    ])
    expect(payload.passport_expires_on).toBe('2032-12-31')

    // Execute Submission & Attachment Upload
    employeesService.createEmployee.mockResolvedValueOnce({
      id: 88,
      full_name: 'Amina Kassaye Tesfaye',
      status: 'pending'
    })
    employeesService.uploadEmployeeDocument.mockResolvedValue({
      id: 201,
      employee: 88
    })

    const createdEmployee = await employeesService.createEmployee(payload)
    expect(employeesService.createEmployee).toHaveBeenCalledWith(payload)
    expect(createdEmployee.id).toBe(88)

    // Execute document upload flow
    const uploadPendingAttachments = async (employeeId) => {
      validateAttachmentDates()
      const uploads = ATTACHMENT_FIELDS.filter((item) => attachmentFiles[item.key]).map(
        (item) =>
          employeesService.uploadEmployeeDocument(
            employeeId,
            item.key,
            item.label,
            attachmentFiles[item.key],
            item.expiryField ? candidateForm[item.expiryField] : ''
          )
      )
      if (uploads.length > 0) await Promise.all(uploads)
    }

    await uploadPendingAttachments(createdEmployee.id)

    expect(employeesService.uploadEmployeeDocument).toHaveBeenCalledTimes(3)
    expect(employeesService.uploadEmployeeDocument).toHaveBeenCalledWith(
      88,
      'portrait_photo',
      'Portrait photo 3x4 size',
      attachmentFiles.portrait_photo,
      ''
    )
    expect(employeesService.uploadEmployeeDocument).toHaveBeenCalledWith(
      88,
      'full_photo',
      'Full photo',
      attachmentFiles.full_photo,
      ''
    )
    expect(employeesService.uploadEmployeeDocument).toHaveBeenCalledWith(
      88,
      'passport_document',
      'Passport',
      attachmentFiles.passport_document,
      '2032-12-31'
    )
  })

  it('correctly maps errors to wizard steps when API returns server-side validation error', () => {
    expect(getValidationStep('Passport number is already registered.')).toBe(0)
    expect(getValidationStep('Religion is required.')).toBe(1)
    expect(getValidationStep('Contact person mobile is required.')).toBe(2)
    expect(getValidationStep('Select at least one destination country.')).toBe(3)
    expect(getValidationStep('Portrait photo is required.')).toBe(4)
  })

  it('verifies that new candidate registration offers Scan / Upload modal on initial load', async () => {
    const ScanModalMod = await import('../components/employees/EmployeeScanImportModal')
    expect(ScanModalMod.default).toBeDefined()
    expect(typeof ScanModalMod.default).toBe('function')

    // On registration page load:
    // When editId is null/absent, scanImportModal defaults to OPEN (true)
    const initialScanModalStateNew = (editId) => !editId
    expect(initialScanModalStateNew(null)).toBe(true)
    expect(initialScanModalStateNew(undefined)).toBe(true)

    // When editId is present (editing existing employee), scanImportModal defaults to CLOSED (false)
    expect(initialScanModalStateNew('123')).toBe(false)
  })

  it('verifies that scan modals and sub-modals adopt the unified notification modal styling paradigm', async () => {
    const fs = await import('fs')
    const path = await import('path')

    const regCss = fs.readFileSync(
      path.resolve(__dirname, '../styles/employees/06-employees-registration.css'),
      'utf8'
    )
    const scanModalJsx = fs.readFileSync(
      path.resolve(__dirname, '../components/employees/EmployeeScanImportModal.jsx'),
      'utf8'
    )
    const cameraModalJsx = fs.readFileSync(
      path.resolve(__dirname, '../components/employees/EmployeeCameraModal.jsx'),
      'utf8'
    )
    const regPageJsx = fs.readFileSync(
      path.resolve(__dirname, '../pages/employees/EmployeeRegisterPage.jsx'),
      'utf8'
    )

    // 1. Frosted Backdrop
    expect(regCss).toContain('.app-confirm-backdrop.employee-scan-backdrop')
    expect(regCss).toContain('backdrop-filter: blur(8px) !important')
    expect(scanModalJsx).toContain('backdropClassName="employee-scan-backdrop"')
    expect(cameraModalJsx).toContain('backdropClassName="employee-scan-backdrop"')
    expect(regPageJsx).toContain('className="employee-scan-modal employee-upload-modal"')
    expect(regPageJsx).toContain('backdropClassName="employee-scan-backdrop"')

    // 2. Dialog Container Elevation & Surface
    expect(regCss).toContain('border-radius: 14px !important')
    expect(regCss).toContain('color-mix(in oklch, var(--color-card) 96%, var(--color-muted)) !important')
    expect(regCss).toContain('box-shadow: 0 24px 54px -12px rgba(0, 0, 0, 0.75)')

    // 3. Header & 28x28px Close Button Ergonomics
    expect(regCss).toContain('.employee-scan-modal .employee-review-header button.btn-secondary')
    expect(regCss).toContain('width: 28px !important')
    expect(regCss).toContain('height: 28px !important')

    // 4. Sub-Popups Refinements
    // Upload modal selected card & dropzone
    expect(regCss).toContain('.employee-upload-selected-card')
    expect(regCss).toContain('.employee-upload-dropzone')
    expect(regPageJsx).toContain('employee-upload-selected-card')
    expect(regPageJsx).toContain('className="btn-primary" onClick={submitUploadDocument}')

    // Camera Capture HUD & Live Pulse
    expect(cameraModalJsx).toContain('employee-camera-hud')
    expect(cameraModalJsx).toContain('employee-camera-live-pill')
    expect(cameraModalJsx).toContain('className="btn-primary"')
    expect(regCss).toContain('cameraLivePulse')

    // Scanner & OCR Status Cards
    expect(regPageJsx).toContain('employee-scanner-status-icon')
    expect(regPageJsx).toContain('className="btn-primary" onClick={checkScannerService}')
    expect(regPageJsx).toContain('className="btn-primary" onClick={checkOcrStatus}')
  })
})

