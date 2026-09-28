import { describe, it, expect } from 'vitest'
import {
  cleanCsvValue,
  normalizeDateToYMD,
  normalizePhoneNumber,
  validateRow,
  buildCsvTemplateContent,
  mapHeaderToKey,
  CSV_TEMPLATE_HEADERS
} from '../components/employees/EmployeeBatchRegistrationModal'

describe('Batch Registration Helpers', () => {
  describe('cleanCsvValue', () => {
    it('strips Excel formula prefixes and quotes', () => {
      expect(cleanCsvValue('="0911998877"')).toBe('0911998877')
      expect(cleanCsvValue('="+251911998877"')).toBe('+251911998877')
      expect(cleanCsvValue('="1998-04-12"')).toBe('1998-04-12')
      expect(cleanCsvValue('"Amina"')).toBe('Amina')
      expect(cleanCsvValue('\'0911998877')).toBe('0911998877')
      expect(cleanCsvValue('  Dawit  ')).toBe('Dawit')
      expect(cleanCsvValue(null)).toBe('')
    })
  })

  describe('normalizeDateToYMD', () => {
    it('preserves valid YYYY-MM-DD dates', () => {
      expect(normalizeDateToYMD('1998-04-12')).toBe('1998-04-12')
      expect(normalizeDateToYMD('1995-08-23')).toBe('1995-08-23')
    })

    it('normalizes DD/MM/YYYY and DD-MM-YYYY dates from Excel', () => {
      expect(normalizeDateToYMD('12/04/1998')).toBe('1998-04-12')
      expect(normalizeDateToYMD('23/08/1995')).toBe('1995-08-23')
      expect(normalizeDateToYMD('12-04-1998')).toBe('1998-04-12')
      expect(normalizeDateToYMD('23.08.1995')).toBe('1995-08-23')
    })

    it('normalizes YYYY/MM/DD dates', () => {
      expect(normalizeDateToYMD('1998/04/12')).toBe('1998-04-12')
    })

    it('normalizes Excel date serial numbers', () => {
      // 35897 is 1998-04-12 in Excel epoch
      expect(normalizeDateToYMD('35897')).toBe('1998-04-12')
    })

    it('handles quoted and formula-wrapped dates', () => {
      expect(normalizeDateToYMD('="1998-04-12"')).toBe('1998-04-12')
      expect(normalizeDateToYMD('="12/04/1998"')).toBe('1998-04-12')
    })
  })

  describe('normalizePhoneNumber', () => {
    it('recovers phone numbers from Excel scientific notation', () => {
      expect(normalizePhoneNumber('2.51941E+11')).toBe('+251941000000')
      expect(normalizePhoneNumber('2.51911e+11')).toBe('+251911000000')
      expect(normalizePhoneNumber('2.51922E+11')).toBe('+251922000000')
    })

    it('restores leading zero stripped by Excel from 09XXXXXXXX', () => {
      expect(normalizePhoneNumber('911998877')).toBe('0911998877')
      expect(normalizePhoneNumber('922334455')).toBe('0922334455')
    })

    it('preserves clean local and international formats', () => {
      expect(normalizePhoneNumber('0911998877')).toBe('0911998877')
      expect(normalizePhoneNumber('+251911998877')).toBe('+251911998877')
      expect(normalizePhoneNumber('251911998877')).toBe('+251911998877')
    })

    it('handles formula and quote wrappers', () => {
      expect(normalizePhoneNumber('="0911998877"')).toBe('0911998877')
      expect(normalizePhoneNumber('="+251911998877"')).toBe('+251911998877')
      expect(normalizePhoneNumber('\'0911998877')).toBe('0911998877')
    })
  })

  describe('validateRow', () => {
    it('validates a complete and normalized candidate row as valid', () => {
      const row = {
        first_name: 'Amina',
        last_name: 'Tesfaye',
        gender: 'Female',
        date_of_birth: '1998-04-12',
        passport_number: 'EP9876543',
        mobile_number: '0911998877'
      }
      expect(validateRow(row)).toEqual([])
    })

    it('flags missing required fields', () => {
      const row = {
        first_name: '',
        last_name: '',
        gender: '',
        date_of_birth: '',
        passport_number: '',
        mobile_number: ''
      }
      const errors = validateRow(row)
      expect(errors).toContain('First name is required')
      expect(errors).toContain('Last name is required')
      expect(errors).toContain('Gender is required')
      expect(errors).toContain('Date of birth is required')
      expect(errors).toContain('Passport is required')
      expect(errors).toContain('Mobile is required')
    })

    it('flags under-age candidates', () => {
      const row = {
        first_name: 'Young',
        last_name: 'Candidate',
        gender: 'Female',
        date_of_birth: '2020-01-01',
        passport_number: 'EP1112223',
        mobile_number: '0911223344'
      }
      const errors = validateRow(row)
      expect(errors.some((e) => e.includes('Age'))).toBe(true)
    })
  })

  describe('buildCsvTemplateContent', () => {
    it('generates a clean template with all 20 headers and empty rows ready for user input', () => {
      const csv = buildCsvTemplateContent()
      // Verifies all headers are present
      CSV_TEMPLATE_HEADERS.forEach((h) => {
        expect(csv).toContain(h)
      })
      // Should not contain sample candidate names
      expect(csv).not.toContain('Amina')
      expect(csv).not.toContain('Dawit')
    })

    it('formats date of birth and phone numbers as Excel text formulas when rows are supplied', () => {
      const sampleRows = [
        ['Test', 'User', 'One', 'Female', '1998-04-12', 'EP1234567', '0911998877']
      ]
      const csv = buildCsvTemplateContent(sampleRows)
      expect(csv).toContain('="1998-04-12"')
      expect(csv).toContain('="0911998877"')
    })
  })

  describe('mapHeaderToKey', () => {
    it('maps Birth Place to birth_place and NOT date_of_birth', () => {
      expect(mapHeaderToKey('Birth Place')).toBe('birth_place')
      expect(mapHeaderToKey('Place of Birth')).toBe('birth_place')
      expect(mapHeaderToKey('Date of Birth (YYYY-MM-DD)')).toBe('date_of_birth')
      expect(mapHeaderToKey('DOB')).toBe('date_of_birth')
    })

    it('maps all CSV_TEMPLATE_HEADERS without any key collision', () => {
      const mappings = CSV_TEMPLATE_HEADERS.map((h) => ({ header: h, key: mapHeaderToKey(h) }))
      mappings.forEach(({ header, key }) => {
        expect(key, `Header "${header}" should map to a valid key`).not.toBeNull()
      })
      const mappedKeys = mappings.map((m) => m.key)
      const uniqueKeys = new Set(mappedKeys)
      expect(uniqueKeys.size).toBe(CSV_TEMPLATE_HEADERS.length)
    })
  })
})
