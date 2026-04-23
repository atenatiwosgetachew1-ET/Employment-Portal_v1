import {
  EMPLOYMENT_TYPE_OPTIONS,
  GENDER_OPTIONS,
  LANGUAGE_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  PROFESSION_OPTIONS,
  RELIGION_OPTIONS,
  RESIDENCE_COUNTRY_OPTIONS
} from '../constants/employeeOptions'

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
const OCR_TIMEOUT_MS = 120000
const OCR_MAX_IMAGE_EDGE = 2200
const OCR_UPSCALE_FACTOR = 2

let tesseractLoadPromise = null

function withTimeout(promise, timeoutMs, message) {
  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) window.clearTimeout(timer)
  })
}

function loadTesseract() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('OCR can only run in the browser.'))
  }
  if (window.Tesseract) return Promise.resolve(window.Tesseract)
  if (tesseractLoadPromise) return tesseractLoadPromise

  tesseractLoadPromise = withTimeout(new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${TESSERACT_URL}"]`)
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.Tesseract), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Could not load OCR engine. Check internet connection.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = TESSERACT_URL
    script.async = true
    script.onload = () => resolve(window.Tesseract)
    script.onerror = () => reject(new Error('Could not load OCR engine. Check internet connection.'))
    document.head.appendChild(script)
  }), 20000, 'Loading OCR engine timed out.')

  return tesseractLoadPromise
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not prepare the scan for OCR.'))
    }, type, quality)
  })
}

async function loadImageBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
  }

  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    throw new Error('This browser cannot prepare images for OCR.')
  }

  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load the scanned image for OCR.'))
    }
    image.src = url
  })
}

function enhanceCanvasForOcr(canvas) {
  const context = canvas.getContext('2d')
  if (!context) return
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData

  for (let index = 0; index < data.length; index += 4) {
    const gray = (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114)
    const contrasted = Math.max(0, Math.min(255, ((gray - 128) * 1.65) + 128))
    const sharpened = contrasted > 168 ? 255 : contrasted < 92 ? 0 : contrasted
    data[index] = sharpened
    data[index + 1] = sharpened
    data[index + 2] = sharpened
  }

  context.putImageData(imageData, 0, 0)
}

async function prepareImageForOcr(file, crop) {
  if (typeof document === 'undefined') return null
  const bitmap = await loadImageBitmap(file)
  const sourceWidth = bitmap.width || bitmap.naturalWidth
  const sourceHeight = bitmap.height || bitmap.naturalHeight
  if (!sourceWidth || !sourceHeight) return null

  const sx = crop?.x ? Math.round(sourceWidth * crop.x) : 0
  const sy = crop?.y ? Math.round(sourceHeight * crop.y) : 0
  const sw = crop?.width ? Math.round(sourceWidth * crop.width) : sourceWidth
  const sh = crop?.height ? Math.round(sourceHeight * crop.height) : sourceHeight
  const scale = Math.min(OCR_UPSCALE_FACTOR, OCR_MAX_IMAGE_EDGE / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  const context = canvas.getContext('2d')
  if (!context) return null

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  if (typeof bitmap.close === 'function') bitmap.close()
  enhanceCanvasForOcr(canvas)
  return canvasToBlob(canvas)
}

async function buildOcrInputs(file) {
  const inputs = [{ image: file, mode: 'full-original' }]
  try {
    const enhancedFull = await prepareImageForOcr(file)
    if (enhancedFull) inputs.push({ image: enhancedFull, mode: 'full-enhanced' })
  } catch {
    // The original image is still available if browser preprocessing is blocked.
  }

  try {
    const mrzCrop = await prepareImageForOcr(file, { x: 0, y: 0.62, width: 1, height: 0.38 })
    if (mrzCrop) inputs.push({ image: mrzCrop, mode: 'passport-mrz' })
  } catch {
    // OCR can continue without the MRZ crop.
  }

  return inputs
}

function normalizeComparable(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lineValue(text, labels) {
  const lines = normalizeText(text).split('\n').map((line) => line.trim()).filter(Boolean)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    for (const label of labels) {
      const pattern = new RegExp(`^\\s*${escapeRegExp(label)}\\s*(?:[:#\\-]|no\\.?|number)?\\s*(.+)$`, 'i')
      const match = line.match(pattern)
      if (match?.[1]) {
        const value = cleanValue(match[1])
        if (value && !['no', 'number'].includes(normalizeComparable(value))) return value
      }

      if (isLabelLine(line, label)) {
        const nextValue = findNextValueLine(lines, index + 1, labels)
        if (nextValue) return nextValue
      }
    }
  }

  for (const label of labels) {
    const pattern = new RegExp(`${escapeRegExp(label)}\\s*(?:[:#\\-]|no\\.?|number)?\\s*([^\\n]{2,80})`, 'i')
    const match = text.match(pattern)
    if (match?.[1]) return cleanValue(match[1])
  }
  return ''
}

function isLabelLine(line, label) {
  const comparableLine = normalizeComparable(line)
  const comparableLabel = normalizeComparable(label)
  if (!comparableLine || !comparableLabel) return false
  return comparableLine === comparableLabel ||
    comparableLine === `${comparableLabel} number` ||
    comparableLine === `${comparableLabel} no` ||
    comparableLine.startsWith(`${comparableLabel} `)
}

function findNextValueLine(lines, startIndex, currentLabels) {
  const allKnownLabels = [
    ...currentLabels,
    'full name',
    'name',
    'passport number',
    'date of birth',
    'mobile number',
    'phone number',
    'email',
    'nationality',
    'address',
    'gender'
  ]

  for (let index = startIndex; index < Math.min(lines.length, startIndex + 3); index += 1) {
    const value = cleanValue(lines[index])
    if (!value) continue
    const comparable = normalizeComparable(value)
    const looksLikeAnotherLabel = allKnownLabels.some((label) => {
      const comparableLabel = normalizeComparable(label)
      return comparable === comparableLabel || comparable.startsWith(`${comparableLabel} `)
    })
    if (!looksLikeAnotherLabel) return value
  }
  return ''
}

function cleanValue(value) {
  return String(value || '')
    .replace(/^[#:\-\s]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function findFirstMatch(text, regex) {
  const match = text.match(regex)
  return match?.[1] ? cleanValue(match[1]) : ''
}

function parseDate(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const iso = raw.match(/\b(19|20)\d{2}[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/)
  if (iso) {
    const [year, month, day] = iso[0].split(/[-/.]/)
    return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const dmy = raw.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.]((?:19|20)?\d{2})\b/)
  if (dmy) {
    const day = dmy[1]
    const month = dmy[2]
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  return ''
}

function parseMrzDate(value, type = 'birth') {
  const raw = String(value || '').replace(/\D/g, '')
  if (raw.length !== 6) return ''
  const year = Number(raw.slice(0, 2))
  const month = raw.slice(2, 4)
  const day = raw.slice(4, 6)
  const currentYear = new Date().getFullYear()
  const currentCentury = Math.floor(currentYear / 100) * 100
  let fullYear = currentCentury + year

  if (type === 'birth' && fullYear > currentYear) {
    fullYear -= 100
  }
  if (type !== 'birth' && fullYear < currentYear - 20) {
    fullYear += 100
  }

  const candidate = `${fullYear}-${month}-${day}`
  return Number.isNaN(Date.parse(candidate)) ? '' : candidate
}

function findDate(text, labels) {
  const value = lineValue(text, labels)
  const parsed = parseDate(value)
  if (parsed) return parsed
  return parseDate(findFirstMatch(text, /\b((?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)?\d{2})\b/))
}

function findOption(text, options) {
  const comparableText = ` ${normalizeComparable(text)} `
  return options.find((option) => comparableText.includes(` ${normalizeComparable(option)} `)) || ''
}

function findOptions(text, options) {
  const comparableText = ` ${normalizeComparable(text)} `
  return options.filter((option) => comparableText.includes(` ${normalizeComparable(option)} `))
}

function findPhone(value) {
  const match = String(value || '').match(/(?:\+?\d[\d\s().-]{7,}\d)/)
  if (!match) return ''
  const raw = match[0].trim()
  const compact = raw.replace(/[^\d+]/g, '')
  return compact.length >= 8 ? compact : raw.replace(/\s{2,}/g, ' ').trim()
}

function findEmail(value) {
  const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match?.[0] || ''
}

function splitName(fullName) {
  const parts = cleanValue(fullName)
    .replace(/[^A-Za-z\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  if (parts.length < 2) return {}
  return {
    first_name: parts[0] || '',
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    last_name: parts[parts.length - 1] || ''
  }
}

function valueNear(text, label, regex) {
  const value = lineValue(text, [label])
  if (value) {
    const match = value.match(regex)
    if (match?.[1] || match?.[0]) return cleanValue(match[1] || match[0])
  }
  return ''
}

function normalizeDocumentNumber(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9/-]/g, '')
    .toUpperCase()
}

function normalizeMrzLine(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[«‹]/g, '<')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9<]/g, '')
}

function cleanMrzName(value) {
  return String(value || '')
    .replace(/</g, ' ')
    .replace(/[^A-Z\s'-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function parseMrzText(text) {
  const lines = normalizeText(text)
    .split('\n')
    .map(normalizeMrzLine)
    .filter((line) => line.includes('<') && line.length >= 20)
  const line1 = lines.find((line) => /^P[A-Z0-9<]/.test(line)) || ''
  const line2 = lines.find((line) => /^\w?[A-Z]\d[A-Z0-9<]{20,}/.test(line) && /\d{6}[0-9<][MF<]/.test(line)) ||
    lines.find((line) => /\d{6}[0-9<][MF<]/.test(line)) ||
    ''

  const result = {}
  if (line1) {
    const nameSection = line1.replace(/^P[A-Z0-9<]{1,4}/, '')
    const [surname, givenNames = ''] = nameSection.split('<<')
    const givenParts = cleanMrzName(givenNames).split(' ').filter(Boolean)
    const surnameValue = cleanMrzName(surname)
    if (givenParts.length > 0 || surnameValue) {
      result.first_name = givenParts[0] || ''
      result.middle_name = givenParts.slice(1).join(' ')
      result.last_name = surnameValue
    }
  }

  if (line2) {
    const passportNumber = normalizeDocumentNumber(line2.slice(0, 9).replace(/</g, ''))
    const nationality = line2.slice(10, 13).replace(/</g, '')
    const dateOfBirth = parseMrzDate(line2.slice(13, 19), 'birth')
    const gender = line2[20] === 'M' ? 'Male' : line2[20] === 'F' ? 'Female' : ''

    if (passportNumber) result.passport_number = passportNumber
    if (nationality === 'ETH') result.nationality = 'Ethiopian'
    if (dateOfBirth) result.date_of_birth = dateOfBirth
    if (gender) result.gender = gender
  }

  return result
}

function buildFieldCandidates(text, formOptions = {}) {
  const normalized = normalizeText(text)
  const mrz = parseMrzText(normalized)
  const destinationOptions = formOptions.destination_countries || []
  const salaryOptions = Object.values(formOptions.salary_options_by_country || {}).flat()
  const fullName = lineValue(normalized, ['full name', 'name', 'employee name', 'applicant name'])
  const nameParts = splitName(fullName)
  const mobile = findPhone(lineValue(normalized, ['mobile', 'mobile number', 'phone', 'phone number', 'telephone']) || normalized)
  const contactMobile = findPhone(lineValue(normalized, ['contact person mobile', 'emergency mobile', 'contact mobile', 'guardian mobile']))
  const salary = lineValue(normalized, ['salary', 'application salary', 'expected salary']) || findOption(normalized, salaryOptions)

  return {
    ...nameParts,
    ...mrz,
    date_of_birth: findDate(normalized, ['date of birth', 'birth date', 'dob']) || mrz.date_of_birth || '',
    gender: findOption(normalized, GENDER_OPTIONS) || mrz.gender || '',
    id_number: normalizeDocumentNumber(lineValue(normalized, ['id number', 'id no', 'national id', 'identity number'])),
    passport_number: normalizeDocumentNumber(lineValue(normalized, ['passport number', 'passport no', 'passport'])) || mrz.passport_number || '',
    labour_id: normalizeDocumentNumber(lineValue(normalized, ['labour id', 'labor id', 'labour number'])),
    mobile_number: mobile,
    email: findEmail(lineValue(normalized, ['email', 'email address']) || normalized),
    phone: findPhone(lineValue(normalized, ['secondary phone', 'alternate phone', 'other phone'])),
    application_countries: findOptions(normalized, destinationOptions),
    profession: findOption(normalized, PROFESSION_OPTIONS),
    employment_type: findOption(normalized, EMPLOYMENT_TYPE_OPTIONS),
    application_salary: salary ? String(salary).replace(/[^\d.]/g, '') || salary : '',
    professional_title: lineValue(normalized, ['professional title', 'job title', 'title']),
    languages: findOptions(normalized, LANGUAGE_OPTIONS),
    religion: findOption(normalized, RELIGION_OPTIONS),
    marital_status: findOption(normalized, MARITAL_STATUS_OPTIONS),
    children_count: valueNear(normalized, 'children', /(\d+)/),
    address: lineValue(normalized, ['address', 'current address', 'residential address']),
    residence_country: findOption(normalized, RESIDENCE_COUNTRY_OPTIONS),
    nationality: lineValue(normalized, ['nationality', 'citizenship']) || mrz.nationality || '',
    birth_place: lineValue(normalized, ['birth place', 'place of birth']),
    weight_kg: valueNear(normalized, 'weight', /(\d+(?:\.\d+)?)/),
    height_cm: valueNear(normalized, 'height', /(\d+(?:\.\d+)?)/),
    summary: lineValue(normalized, ['summary', 'profile summary']),
    education: lineValue(normalized, ['education', 'educational background']),
    experience: lineValue(normalized, ['experience notes', 'experience', 'work experience']),
    contact_person_name: lineValue(normalized, ['contact person name', 'emergency contact name', 'guardian name']),
    contact_person_id_number: lineValue(normalized, ['contact person id', 'emergency contact id', 'guardian id']),
    contact_person_mobile: contactMobile,
    references: lineValue(normalized, ['references', 'reference']),
    notes: lineValue(normalized, ['notes', 'remarks']),
    certifications: lineValue(normalized, ['certifications', 'certificates', 'certificate notes'])
  }
}

function stepFields(stepIndex) {
  if (stepIndex === 0) {
    return ['first_name', 'middle_name', 'last_name', 'date_of_birth', 'gender', 'id_number', 'passport_number', 'labour_id', 'mobile_number']
  }
  if (stepIndex === 1) {
    return ['religion', 'marital_status', 'children_count', 'residence_country', 'nationality', 'birth_place', 'address', 'weight_kg', 'height_cm', 'summary', 'education', 'experience']
  }
  if (stepIndex === 2) {
    return ['contact_person_name', 'contact_person_id_number', 'contact_person_mobile', 'email', 'phone', 'references', 'notes']
  }
  if (stepIndex === 3) {
    return ['application_countries', 'profession', 'employment_type', 'application_salary', 'professional_title', 'languages']
  }
  return []
}

export async function extractTextFromEmployeeDocument(file) {
  if (!file) throw new Error('No scanned document is available for OCR.')
  if (!file.type?.startsWith('image/')) {
    throw new Error('OCR auto fill currently supports image scans only. Convert PDF scans to an image or use camera/scanner JPG output.')
  }
  const Tesseract = await loadTesseract()
  const inputs = await buildOcrInputs(file)
  const recognizedTexts = []
  let lastError = null

  for (const input of inputs) {
    try {
      const result = await withTimeout(
        Tesseract.recognize(input.image, 'eng', {
          preserve_interword_spaces: '1',
          tessedit_pageseg_mode: input.mode === 'passport-mrz' ? '6' : '11',
          tessedit_char_whitelist: input.mode === 'passport-mrz'
            ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<'
            : undefined
        }),
        OCR_TIMEOUT_MS,
        'OCR extraction timed out. Try a clearer scan or crop the document before scanning.'
      )
      const text = normalizeText(result?.data?.text || '')
      if (text) recognizedTexts.push(text)
    } catch (err) {
      lastError = err
    }
  }

  const text = normalizeText(recognizedTexts.join('\n\n'))
  if (!text) throw new Error('OCR did not find readable text in this scan.')
  if (lastError && recognizedTexts.length === 0) throw lastError
  return text
}

export function mapEmployeeOcrText(text, stepIndex, form, formOptions = {}) {
  const candidates = buildFieldCandidates(text, formOptions)
  const fields = stepFields(stepIndex)
  const updates = {}

  fields.forEach((field) => {
    const value = candidates[field]
    if (Array.isArray(value)) {
      if (value.length === 0) return
      const current = Array.isArray(form[field]) ? form[field] : []
      const merged = Array.from(new Set([...current, ...value]))
      if (merged.length !== current.length) updates[field] = merged
      return
    }
    if (value === undefined || value === null || String(value).trim() === '') return
    if (Array.isArray(form[field])) return
    updates[field] = String(value).trim()
  })

  return updates
}
