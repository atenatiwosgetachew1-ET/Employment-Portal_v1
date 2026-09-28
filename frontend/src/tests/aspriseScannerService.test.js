import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ASPRISE_SCANNER_LINKS,
  checkAspriseScannerService,
  resetAspriseScannerService
} from '../services/aspriseScannerService'

describe('aspriseScannerService', () => {
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    vi.restoreAllMocks()
    resetAspriseScannerService()
  })

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
    delete globalThis.scanner
    delete globalThis.scannerjs
  })

  it('exposes valid download and protocol activation links', () => {
    expect(ASPRISE_SCANNER_LINKS.download).toBe('https://cdn.asprise.com/scanapp/scan-setup.exe')
    expect(ASPRISE_SCANNER_LINKS.downloadPage).toBe('https://cdn.asprise.com/scanapp/scan-setup.html')
    expect(ASPRISE_SCANNER_LINKS.localDownload).toBe('/scanner/asprise-scan-setup.exe')
    expect(ASPRISE_SCANNER_LINKS.enable).toBe('AspriseWebScan://browser')
  })

  it('fails fast when the local Asprise companion service is not running', async () => {
    // Mock WebSocket to simulate immediate connection failure (service down)
    class MockFailingWebSocket {
      constructor() {
        setTimeout(() => {
          if (typeof this.onerror === 'function') {
            this.onerror(new Error('Connection refused'))
          }
        }, 10)
      }
      close() {}
    }
    globalThis.WebSocket = MockFailingWebSocket

    await expect(checkAspriseScannerService()).rejects.toThrow(
      'Asprise scan app is not running. Install or start the bundled scan app, then check again.'
    )
  })

  it('successfully connects and returns devices when service is running with attached scanners', async () => {
    const mockDevicesJson = JSON.stringify([
      { name: 'Epson Perfection V39', displayName: 'Epson Perfection V39' }
    ])

    class MockActiveWebSocket {
      constructor(url) {
        this.url = url
        setTimeout(() => {
          if (url.includes('/probe')) {
            // Probe socket succeeds immediately
            if (typeof this.onopen === 'function') this.onopen()
          } else {
            // Data socket opens and handles JSON-RPC
            if (typeof this.onopen === 'function') this.onopen()
          }
        }, 10)
      }
      send(data) {
        const payload = JSON.parse(data)
        if (payload.funcName === 'listSources') {
          setTimeout(() => {
            if (typeof this.onmessage === 'function') {
              this.onmessage({
                data: JSON.stringify([true, null, null, 'listSources', 1, mockDevicesJson, payload.funcCallId])
              })
            }
          }, 10)
        }
      }
      close() {}
    }
    globalThis.WebSocket = MockActiveWebSocket
    globalThis.scanner = {
      isConnectedToScanWebSocket: () => true,
      listSources: (cb) => { cb(true, null, mockDevicesJson) }
    }

    const result = await checkAspriseScannerService()
    expect(result).toBeDefined()
    expect(result.devices).toHaveLength(1)
    expect(result.devices[0].displayName).toBe('Epson Perfection V39')
  })

  it('handles running service with no connected physical scanners without hanging', async () => {
    class MockEmptyWebSocket {
      constructor(url) {
        this.url = url
        setTimeout(() => {
          if (typeof this.onopen === 'function') this.onopen()
        }, 10)
      }
      send(data) {
        const payload = JSON.parse(data)
        if (payload.funcName === 'listSources') {
          setTimeout(() => {
            if (typeof this.onmessage === 'function') {
              this.onmessage({
                data: JSON.stringify([true, null, null, 'listSources', 1, '[]', payload.funcCallId])
              })
            }
          }, 10)
        }
      }
      close() {}
    }
    globalThis.WebSocket = MockEmptyWebSocket

    const result = await checkAspriseScannerService()
    expect(result).toBeDefined()
    expect(result.devices).toEqual([])
  })
})
