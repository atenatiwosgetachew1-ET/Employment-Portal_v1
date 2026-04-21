const ASPRISE_SCANNERJS_URL = 'https://cdn.asprise.com/scannerjs/scanner.js'
const ASPRISE_LICENSE = import.meta.env.VITE_ASPRISE_SCANNERJS_LICENSE || ''
const ASPRISE_SCRIPT_TIMEOUT_MS = 12000
const ASPRISE_SOURCE_TIMEOUT_MS = 35000
const ASPRISE_SCAN_TIMEOUT_MS = 90000
const ASPRISE_INSTALL_PROMPT_MESSAGE = 'Asprise scan app is not connected. Install or start the bundled scan app, then check again.'
const ASPRISE_ENABLE_PROTOCOL_URL = 'AspriseWebScan://enable'

export const ASPRISE_SCANNER_LINKS = {
  download: '/scanner/asprise-scan-setup.exe',
  enable: ASPRISE_ENABLE_PROTOCOL_URL
}

let loadPromise = null
let installPromptVisible = false
let currentAllowInstallPrompt = false

function withTimeout(promise, timeoutMs, message) {
  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) window.clearTimeout(timer)
  })
}

function configureScannerJs(allowInstallPrompt = false) {
  if (typeof window === 'undefined') return
  currentAllowInstallPrompt = allowInstallPrompt
  window.scannerjs_config = {
    ...(window.scannerjs_config || {}),
    ...(ASPRISE_LICENSE ? { license: ASPRISE_LICENSE } : {}),
    eager_init: true,
    display_install_func: (show) => {
      installPromptVisible = Boolean(show)
      return undefined
    }
  }
}

function getScanner() {
  if (typeof window === 'undefined') {
    throw new Error('Asprise Scanner can only run in the browser.')
  }
  if (!window.scanner) {
    throw new Error('Asprise Scanner is not loaded.')
  }
  return window.scanner
}

function loadScript(allowInstallPrompt = false) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Asprise Scanner can only run in the browser.'))
  }
  if (window.scanner) return Promise.resolve(window.scanner)
  if (loadPromise) return loadPromise

  configureScannerJs(allowInstallPrompt)
  loadPromise = withTimeout(new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${ASPRISE_SCANNERJS_URL}"]`)
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(getScanner()), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Could not load Asprise Scanner. Check your internet connection or host it locally.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = ASPRISE_SCANNERJS_URL
    script.async = true
    script.onload = () => resolve(getScanner())
    script.onerror = () => reject(new Error('Could not load Asprise Scanner. Check your internet connection or host it locally.'))
    document.head.appendChild(script)
  }), ASPRISE_SCRIPT_TIMEOUT_MS, 'Loading Asprise Scanner timed out. Check your internet connection, or host it locally instead of using the CDN.')

  return loadPromise
}

function forceInstallPrompt(scanner) {
  installPromptVisible = true
  if (typeof window.scannerjs_config?.display_install_func === 'function') {
    const shouldContinueDefault = window.scannerjs_config.display_install_func(true)
    if (shouldContinueDefault) return true
  }
  if (typeof scanner?.showInstallDialog === 'function') {
    scanner.showInstallDialog()
    return true
  }
  if (typeof scanner?.displayInstallDialog === 'function') {
    scanner.displayInstallDialog(true)
    return true
  }
  if (typeof scanner?.display_install_func === 'function') {
    scanner.display_install_func(true)
    return true
  }
  return false
}

function parseSources(result) {
  if (!result) return []
  if (Array.isArray(result)) return result

  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result)
      if (Array.isArray(parsed)) return parsed
      if (parsed?.sources && Array.isArray(parsed.sources)) return parsed.sources
    } catch {
      return result
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({ name, displayName: name }))
    }
  }

  if (result?.sources && Array.isArray(result.sources)) return result.sources
  return []
}

function dataUrlToFile(dataUrl, fileName) {
  const [header, base64Data = ''] = String(dataUrl || '').split(',')
  const mimeMatch = header.match(/data:(.*?);base64/i)
  const mimeType = mimeMatch?.[1] || 'image/jpeg'
  const binary = window.atob(base64Data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new File([bytes], fileName, { type: mimeType })
}

export async function checkAspriseScannerService(options = {}) {
  const allowInstallPrompt = options.allowInstallPrompt !== false
  installPromptVisible = false
  const scanner = await loadScript(allowInstallPrompt)
  configureScannerJs(allowInstallPrompt)
  if (allowInstallPrompt) {
    forceInstallPrompt(scanner)
  }
  if (installPromptVisible && !allowInstallPrompt) {
    throw new Error(ASPRISE_INSTALL_PROMPT_MESSAGE)
  }
  const devices = await withTimeout(new Promise((resolve, reject) => {
    if (typeof scanner.listSources !== 'function') {
      resolve([{ name: 'select', displayName: 'Select scanner in Asprise dialog' }])
      return
    }

    scanner.listSources((successful, message, result) => {
      if (!successful) {
        reject(new Error(message || 'Asprise scan app is not ready. Install or start the Asprise scanner app, then check again.'))
        return
      }
      if (installPromptVisible && !allowInstallPrompt) {
        reject(new Error(ASPRISE_INSTALL_PROMPT_MESSAGE))
        return
      }
      resolve(parseSources(result))
    }, false, 'all', true, true)
  }), ASPRISE_SOURCE_TIMEOUT_MS, 'Asprise Scanner loaded and the scan app was enabled, but scanner source detection did not respond yet. Try Scan document, or check again in a moment.')

  return { scanner, devices }
}

export async function scanWithAspriseScanner(device) {
  installPromptVisible = false
  const scanner = await loadScript(false)
  configureScannerJs(false)
  if (installPromptVisible) {
    throw new Error(ASPRISE_INSTALL_PROMPT_MESSAGE)
  }
  const sourceName = device?.name || device?.displayName || 'select'
  const request = {
    use_asprise_dialog: true,
    show_scanner_ui: false,
    source_name: sourceName,
    twain_cap_setting: {
      ICAP_PIXELTYPE: 'TWPT_RGB'
    },
    output_settings: [
      {
        type: 'return-base64',
        format: 'jpg',
        jpeg_quality: 90
      }
    ]
  }

  return withTimeout(new Promise((resolve, reject) => {
    scanner.scan((successful, message, response) => {
      if (!successful) {
        reject(new Error(message || 'Scanner acquisition failed.'))
        return
      }
      if (installPromptVisible) {
        reject(new Error(ASPRISE_INSTALL_PROMPT_MESSAGE))
        return
      }
      if (message && message.toLowerCase().includes('user cancel')) {
        reject(new Error('Scanner acquisition was cancelled.'))
        return
      }

      const scannedImages = scanner.getScannedImages(response, true, false)
      if (!Array.isArray(scannedImages) || scannedImages.length === 0) {
        reject(new Error('No scanned image was returned.'))
        return
      }
      const scannedImage = scannedImages[0]
      resolve(dataUrlToFile(scannedImage.src, `asprise-scan-${Date.now()}.jpg`))
    }, request, true, false)
  }), ASPRISE_SCAN_TIMEOUT_MS, 'Scanning timed out. Check the Asprise scan app prompt and scanner UI, then try again.')
}

export function resetAspriseScannerService() {
  // Asprise Scanner owns its local app lifecycle. There is no source handle to close here.
}
