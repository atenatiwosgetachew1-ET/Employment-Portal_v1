import { describe, it, expect, vi } from 'vitest'
import {
  REGISTRATION_STEPS,
  validateStepFields,
  getValidationStep,
  applyRegistrationTemplate,
  buildRegistrationTemplate,
  emptyForm,
  cleanupPrintFrame,
  printDocumentSilently,
  PORTAL_PRINT_FRAME_ID
} from '../utils/employeeHelpers'

describe('Employee Registration Configuration & Canonical Steps', () => {
  it('defines the 6 canonical registration steps in correct order', () => {
    expect(REGISTRATION_STEPS).toHaveLength(6)
    expect(REGISTRATION_STEPS.map((s) => s.id)).toEqual([
      'personal',
      'profile',
      'contact',
      'application',
      'attachments',
      'summary'
    ])
  })

  it('validates Step 0 (Personal Identity) strictly for personal credentials', () => {
    const invalidForm = { ...emptyForm }
    expect(validateStepFields(invalidForm, 0)).toBe('First name is required.')

    invalidForm.first_name = 'John'
    expect(validateStepFields(invalidForm, 0)).toBe('Middle name is required.')

    invalidForm.middle_name = 'A'
    expect(validateStepFields(invalidForm, 0)).toBe('Last name is required.')

    invalidForm.last_name = 'Doe'
    expect(validateStepFields(invalidForm, 0)).toBe('Date of birth is required.')

    invalidForm.date_of_birth = '1995-05-15'
    expect(validateStepFields(invalidForm, 0)).toBe('Gender is required.')

    invalidForm.gender = 'Male'
    expect(validateStepFields(invalidForm, 0)).toBe('Passport number is required.')

    invalidForm.passport_number = 'EP1234567'
    expect(validateStepFields(invalidForm, 0)).toBe('Mobile number is required.')

    invalidForm.mobile_number = '+251911223344'
    expect(validateStepFields(invalidForm, 0)).toBe('')
  })

  it('validates Step 1 (Profile & Demographics) independently of other steps', () => {
    const validStep0Form = {
      ...emptyForm,
      first_name: 'John',
      middle_name: 'A',
      last_name: 'Doe',
      date_of_birth: '1995-05-15',
      gender: 'Male',
      passport_number: 'EP1234567',
      mobile_number: '+251911223344'
    }

    expect(validateStepFields(validStep0Form, 1)).toBe('Religion is required.')

    validStep0Form.religion = 'Orthodox'
    expect(validateStepFields(validStep0Form, 1)).toBe('Marital status is required.')

    validStep0Form.marital_status = 'Single'
    expect(validateStepFields(validStep0Form, 1)).toBe('Residence country is required.')

    validStep0Form.residence_country = 'Ethiopia'
    expect(validateStepFields(validStep0Form, 1)).toBe('')
  })

  it('validates Step 2 (Contact Person & Emergency Contacts)', () => {
    const form = { ...emptyForm }
    expect(validateStepFields(form, 2)).toBe('Contact person name is required.')

    form.contact_person_name = 'Jane Doe'
    expect(validateStepFields(form, 2)).toBe('Contact person mobile is required.')

    form.contact_person_mobile = '123'
    expect(validateStepFields(form, 2)).toBe('Enter a valid contact person mobile number.')

    form.contact_person_mobile = '+251911223355'
    expect(validateStepFields(form, 2)).toBe('')
  })

  it('validates Step 3 (Application, Job Role & Skills)', () => {
    const form = { ...emptyForm }
    expect(validateStepFields(form, 3)).toBe('Select at least one destination country.')

    form.application_countries = ['Saudi Arabia']
    expect(validateStepFields(form, 3)).toBe('Profession is required.')

    form.profession = 'Driver'
    expect(validateStepFields(form, 3)).toBe('Type is required.')

    form.employment_type = 'Full-time'
    expect(validateStepFields(form, 3)).toBe('Salary is required.')

    form.application_salary = '1500'
    expect(validateStepFields(form, 3)).toBe('Select at least one skill.')

    form.skills = ['Driving']
    expect(validateStepFields(form, 3)).toBe('Select at least one language.')

    form.languages = ['Arabic', 'English']
    expect(validateStepFields(form, 3)).toBe('')
  })

  it('maps validation error messages to the correct canonical step index', () => {
    expect(getValidationStep('First name is required.')).toBe(0)
    expect(getValidationStep('Passport number is required.')).toBe(0)
    expect(getValidationStep('Religion is required.')).toBe(1)
    expect(getValidationStep('Residence country is required.')).toBe(1)
    expect(getValidationStep('Contact person name is required.')).toBe(2)
    expect(getValidationStep('Select at least one destination country.')).toBe(3)
    expect(getValidationStep('Profession is required.')).toBe(3)
    expect(getValidationStep('Passport document is required.')).toBe(4)
  })

  it('correctly builds and restores templates', () => {
    const formWithDefaults = {
      ...emptyForm,
      application_countries: ['UAE', 'Saudi Arabia'],
      profession: 'Housekeeper',
      religion: 'Muslim',
      residence_country: 'Ethiopia'
    }

    const template = buildRegistrationTemplate(formWithDefaults)
    expect(template.application_countries).toEqual(['UAE', 'Saudi Arabia'])
    expect(template.profession).toBe('Housekeeper')

    const restored = applyRegistrationTemplate(template)
    expect(restored.application_countries).toEqual(['UAE', 'Saudi Arabia'])
    expect(restored.profession).toBe('Housekeeper')
    expect(restored.first_name).toBe('')
  })

  it('loads EmployeeRegisterPage without syntax or evaluation errors', async () => {
    const mod = await import('../pages/employees/EmployeeRegisterPage')
    expect(mod.default).toBeDefined()
    expect(typeof mod.default).toBe('function')
  })

  it('loads EmployeeDocumentPreview without syntax or evaluation errors', async () => {
    const mod = await import('../components/employees/EmployeeDocumentPreview')
    expect(mod.default).toBeDefined()
    expect(typeof mod.default).toBe('function')
  })
})

describe('Document Silent Print Mechanism', () => {
  it('safely handles non-DOM environments without crashing', async () => {
    expect(() => cleanupPrintFrame()).not.toThrow()
    await expect(printDocumentSilently({ url: 'test.jpg' })).resolves.toBeUndefined()
  })

  it('cleans up print frames and creates hidden iframe without window.open when DOM is present', async () => {
    const createdElements = []
    const fakeDoc = {
      createElement: vi.fn((tag) => {
        const el = {
          tagName: tag.toUpperCase(),
          id: '',
          className: '',
          style: {},
          setAttribute: vi.fn(),
          remove: vi.fn(),
          contentWindow: {
            focus: vi.fn(),
            print: vi.fn(),
            addEventListener: vi.fn()
          },
          contentDocument: {
            open: vi.fn(),
            write: vi.fn(),
            close: vi.fn(),
            getElementById: vi.fn(() => ({ complete: true }))
          }
        }
        createdElements.push(el)
        return el
      }),
      querySelectorAll: vi.fn((sel) => {
        return createdElements.filter((el) => {
          if (el.id && sel.includes(el.id)) return true
          if (el.className && sel.includes(el.className)) return true
          return false
        })
      }),
      body: {
        appendChild: vi.fn()
      }
    }
    const fakeWin = {
      open: vi.fn(),
      URL: {
        createObjectURL: vi.fn(),
        revokeObjectURL: vi.fn()
      }
    }

    globalThis.document = fakeDoc
    globalThis.window = fakeWin

    try {
      const dummy = fakeDoc.createElement('iframe')
      dummy.id = PORTAL_PRINT_FRAME_ID
      expect(fakeDoc.querySelectorAll(`#${PORTAL_PRINT_FRAME_ID}`).length).toBe(1)

      cleanupPrintFrame()
      expect(dummy.remove).toHaveBeenCalled()

      await printDocumentSilently({ url: 'data:image/png;base64,abc', isImage: true })

      expect(fakeWin.open).not.toHaveBeenCalled()
      expect(fakeDoc.createElement).toHaveBeenCalledWith('iframe')
    } finally {
      delete globalThis.document
      delete globalThis.window
    }
  })
})
