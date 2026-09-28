const ASPRISE_SCANNERJS_URL = '/scanner/scanner.js'
const ASPRISE_SCANNERJS_CDN_URL = 'https://cdn.asprise.com/scannerjs/scanner.js'
const ASPRISE_SCANAPP_DIRECT_DOWNLOAD_URL = 'https://cdn.asprise.com/scanapp/scan-setup.exe'
const ASPRISE_SCANAPP_PAGE_DOWNLOAD_URL = 'https://cdn.asprise.com/scanapp/scan-setup.html'
const ASPRISE_SCANAPP_LOCAL_DOWNLOAD_URL = '/scanner/asprise-scan-setup.exe'
const ASPRISE_LICENSE = import.meta.env.VITE_ASPRISE_SCANNERJS_LICENSE || ''
const ASPRISE_SCRIPT_TIMEOUT_MS = 8000
const ASPRISE_SOURCE_TIMEOUT_MS = 6000
const ASPRISE_SCAN_TIMEOUT_MS = 90000
const ASPRISE_INSTALL_PROMPT_MESSAGE =
  'Asprise scan app is not running. Install or start the bundled scan app, then check again.'
const ASPRISE_ENABLE_PROTOCOL_URL = 'AspriseWebScan://browser'

export const ASPRISE_SCANNER_LINKS = {
  download: ASPRISE_SCANAPP_DIRECT_DOWNLOAD_URL,
  downloadPage: ASPRISE_SCANAPP_PAGE_DOWNLOAD_URL,
  localDownload: ASPRISE_SCANAPP_LOCAL_DOWNLOAD_URL,
  enable: ASPRISE_ENABLE_PROTOCOL_URL
}

let loadPromise = null

const setSafeTimeout = typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout
const clearSafeTimeout = typeof window !== 'undefined' ? window.clearTimeout.bind(window) : clearTimeout
const setSafeInterval = typeof window !== 'undefined' ? window.setInterval.bind(window) : setInterval
const clearSafeInterval = typeof window !== 'undefined' ? window.clearInterval.bind(window) : clearInterval

function withTimeout(promise, timeoutMs, message) {
  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = setSafeTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearSafeTimeout(timer)
  })
}

/**
 * Fast probe to verify if the local Asprise scanapp service is listening.
 * Tests ports 9713 (HTTP/WS) or 9714 (HTTPS/WSS) in under 500ms.
 */
async function probeAspriseService(timeoutMs = 600) {
  const WebSocketImpl =
    typeof WebSocket !== 'undefined'
      ? WebSocket
      : typeof window !== 'undefined'
        ? window.WebSocket
        : null
  if (!WebSocketImpl) return false

  const isHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:'
  const port = isHttps ? 9714 : 9713
  const wsUrl = `${isHttps ? 'wss' : 'ws'}://127.0.0.1:${port}/probe`

  return new Promise((resolve) => {
    let settled = false
    let socket = null

    const timer = setSafeTimeout(() => {
      if (!settled) {
        settled = true
        try { socket?.close() } catch (_) {}
        resolve(false)
      }
    }, timeoutMs)

    try {
      socket = new WebSocketImpl(wsUrl)
      socket.onopen = () => {
        if (!settled) {
          settled = true
          clearSafeTimeout(timer)
          try { socket.close() } catch (_) {}
          resolve(true)
        }
      }
      socket.onerror = () => {
        if (!settled) {
          settled = true
          clearSafeTimeout(timer)
          try { socket?.close() } catch (_) {}
          resolve(false)
        }
      }
    } catch {
      if (!settled) {
        settled = true
        clearSafeTimeout(timer)
        resolve(false)
      }
    }
  })
}

/**
 * Configure global scannerjs settings to prevent intrusive default popups
 * and target the correct port range.
 */
function configureScannerJs() {
  const globalTarget = typeof window !== 'undefined' ? window : globalThis
  globalTarget.scannerjs_config = {
    ...(globalTarget.scannerjs_config || {}),
    ...(ASPRISE_LICENSE ? { license: ASPRISE_LICENSE } : {}),
    scan_app_download_url: ASPRISE_SCANAPP_DIRECT_DOWNLOAD_URL,
    scan_app_port_range_lowest: 9713,
    scan_app_port_range_highest: 9716,
    eager_init: true,
    display_install_func: () => false,
    display_scan_ready_func: () => {}
  }
}

function getScanner() {
  if (typeof window !== 'undefined' && (window.scanner || window.scannerjs)) {
    return window.scanner || window.scannerjs
  }
  if (typeof globalThis !== 'undefined' && (globalThis.scanner || globalThis.scannerjs)) {
    return globalThis.scanner || globalThis.scannerjs
  }
  if (typeof window === 'undefined') {
    return {
      listSources: (cb) => { cb(true, null, '[]') },
      isConnectedToScanWebSocket: () => true
    }
  }
  throw new Error('Asprise Scanner script is not loaded.')
}

function loadScript() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(getScanner())
  }
  if (window.scanner || window.scannerjs) {
    return Promise.resolve(getScanner())
  }
  if (loadPromise) return loadPromise

  configureScannerJs()

  const loadSingleScript = (src) =>
    new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${src}"]`)
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(getScanner()), { once: true })
        existingScript.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.onload = () => resolve(getScanner())
      script.onerror = () => reject(new Error(`Failed to load ${src}`))
      document.head.appendChild(script)
    })

  loadPromise = withTimeout(
    loadSingleScript(ASPRISE_SCANNERJS_URL).catch(() => loadSingleScript(ASPRISE_SCANNERJS_CDN_URL)),
    ASPRISE_SCRIPT_TIMEOUT_MS,
    'Loading Asprise Scanner library timed out. Check your network or local assets.'
  ).catch((err) => {
    loadPromise = null
    throw err
  })

  return loadPromise
}

/**
 * Ensures scanner.js has an active WebSocket connection to scanapp.
 * If not connected, initializes scanner with forceReinit = true and waits for the ready state.
 */
async function ensureScannerConnected(scanner, timeoutMs = 3000) {
  if (scanner?.isConnectedToScanWebSocket?.()) {
    return true
  }

  try {
    if (typeof scanner?.cancelFuncCalls === 'function') {
      scanner.cancelFuncCalls()
    }
    if (typeof scanner?.setRequestStatus === 'function') {
      scanner.setRequestStatus(undefined)
    }
  } catch (_) {}

  configureScannerJs()

  return new Promise((resolve, reject) => {
    let settled = false

    const timer = setSafeTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      if (scanner?.isConnectedToScanWebSocket?.()) {
        resolve(true)
      } else {
        reject(new Error(ASPRISE_INSTALL_PROMPT_MESSAGE))
      }
    }, timeoutMs)

    const prevEventListener = windowTarget?.scannerjs_config?.event_listener

    function handleEvent(eventName, data) {
      if (typeof prevEventListener === 'function') {
        try { prevEventListener(eventName, data) } catch (_) {}
      }
      if (settled) return
      if (eventName === 'ready') {
        settled = true
        cleanup()
        resolve(true)
      } else if (eventName === 'failed-to-connect-final') {
        settled = true
        cleanup()
        reject(new Error(ASPRISE_INSTALL_PROMPT_MESSAGE))
      }
    }

    function cleanup() {
      clearSafeTimeout(timer)
      if (pollTimer) clearSafeInterval(pollTimer)
      if (windowTarget?.scannerjs_config) {
        windowTarget.scannerjs_config.event_listener = prevEventListener
      }
    }

    const windowTarget = typeof window !== 'undefined' ? window : globalThis
    windowTarget.scannerjs_config = {
      ...(windowTarget.scannerjs_config || {}),
      event_listener: handleEvent
    }

    const pollTimer = setSafeInterval(() => {
      if (settled) return
      if (scanner?.isConnectedToScanWebSocket?.()) {
        settled = true
        cleanup()
        resolve(true)
      }
    }, 100)

    try {
      if (typeof scanner?.initialize === 'function') {
        scanner.initialize(true)
      } else {
        cleanup()
        reject(new Error('Scanner initialize function not found.'))
      }
    } catch (err) {
      cleanup()
      reject(err)
    }
  })
}

/**
 * Direct WebSocket query fallback: queries the local Asprise service directly
 * for the source list in <100ms.
 */
async function querySourcesDirectlyViaWebSocket(timeoutMs = 2500) {
  const WebSocketImpl =
    typeof WebSocket !== 'undefined'
      ? WebSocket
      : typeof window !== 'undefined'
        ? window.WebSocket
        : null
  if (!WebSocketImpl) return []

  const isHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:'
  const port = isHttps ? 9714 : 9713
  const token = Math.random().toString(36).substring(2, 10)
  const currentUrl = typeof window !== 'undefined' && window.location?.href ? window.location.href : 'http://localhost/'
  const wsUrl = `${isHttps ? 'wss' : 'ws'}://127.0.0.1:${port}/${token}/${encodeURIComponent(currentUrl)}`

  return new Promise((resolve, reject) => {
    let resolved = false
    let socket = null

    const timer = setSafeTimeout(() => {
      if (!resolved) {
        resolved = true
        try { socket?.close() } catch (_) {}
        reject(new Error('Scanner source detection timed out.'))
      }
    }, timeoutMs)

    try {
      socket = new WebSocketImpl(wsUrl)
      socket.onopen = () => {
        const payload = JSON.stringify({
          funcCallId: `${Date.now()}-direct`,
          funcName: 'listSources',
          funcArgs: [false, 'all', true, true]
        })
        socket.send(payload)
      }

      socket.onmessage = (event) => {
        if (resolved) return
        resolved = true
        clearSafeTimeout(timer)
        try {
          const data = JSON.parse(event.data)
          if (Array.isArray(data) && data[0] === true) {
            const sources = parseSources(data[5])
            try { socket.close() } catch (_) {}
            resolve(sources)
            return
          }
          try { socket.close() } catch (_) {}
          reject(new Error(data[1] || 'Failed to list scanner sources.'))
        } catch (err) {
          try { socket.close() } catch (_) {}
          reject(err)
        }
      }

      socket.onerror = (err) => {
        if (!resolved) {
          resolved = true
          clearSafeTimeout(timer)
          try { socket?.close() } catch (_) {}
          reject(err)
        }
      }
    } catch (err) {
      if (!resolved) {
        resolved = true
        clearSafeTimeout(timer)
        reject(err)
      }
    }
  })
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

/**
 * Check if the Asprise Scanner companion app is available and enumerate devices.
 */
export async function checkAspriseScannerService() {
  // 1. Fast probe: check if the local service is even running
  const isListening = await probeAspriseService(700)
  if (!isListening) {
    throw new Error(ASPRISE_INSTALL_PROMPT_MESSAGE)
  }

  // 2. Load scanner.js
  const scanner = await loadScript()
  configureScannerJs()

  // 3. Connect scanner.js to WebSocket
  try {
    await ensureScannerConnected(scanner, 2500)
  } catch (_) {
    // If scanner.js initialization was delayed, we'll try direct WebSocket fallback
  }

  // 4. Retrieve devices via scanner.listSources, or direct WebSocket if scanner.js was unresponsive
  let devices = []
  try {
    devices = await withTimeout(
      new Promise((resolve, reject) => {
        if (typeof scanner?.listSources !== 'function') {
          resolve([{ name: 'select', displayName: 'Select scanner in Asprise dialog' }])
          return
        }

        const dispatched = scanner.listSources(
          (successful, message, result) => {
            if (!successful) {
              reject(new Error(message || 'Failed to detect scanner sources.'))
              return
            }
            resolve(parseSources(result))
          },
          false,
          'all',
          true,
          true
        )

        if (dispatched === false && !scanner?.isConnectedToScanWebSocket?.()) {
          reject(new Error('Scanner not connected to local service.'))
        }
      }),
      ASPRISE_SOURCE_TIMEOUT_MS,
      'Scanner source detection timed out.'
    )
  } catch (err) {
    // Fall back to direct WebSocket query
    try {
      devices = await querySourcesDirectlyViaWebSocket(2500)
    } catch (_) {
      throw err
    }
  }

  return { scanner, devices }
}

export async function scanWithAspriseScanner(device) {
  const isListening = await probeAspriseService(700)
  if (!isListening) {
    throw new Error(ASPRISE_INSTALL_PROMPT_MESSAGE)
  }

  const scanner = await loadScript()
  configureScannerJs()
  await ensureScannerConnected(scanner, 3000)

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

  return withTimeout(
    new Promise((resolve, reject) => {
      scanner.scan(
        (successful, message, response) => {
          if (!successful) {
            reject(new Error(message || 'Scanner acquisition failed.'))
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
        },
        request,
        true,
        false
      )
    }),
    ASPRISE_SCAN_TIMEOUT_MS,
    'Scanning timed out. Check the Asprise scan app prompt and scanner UI, then try again.'
  )
}

export function resetAspriseScannerService() {
  if (typeof window !== 'undefined' && window.scanner) {
    try {
      if (typeof window.scanner.cancelFuncCalls === 'function') {
        window.scanner.cancelFuncCalls()
      }
      if (typeof window.scanner.setRequestStatus === 'function') {
        window.scanner.setRequestStatus(undefined)
      }
    } catch (_) {}
  }
}
