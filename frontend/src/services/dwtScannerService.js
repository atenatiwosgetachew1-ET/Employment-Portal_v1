const DWT_CONTAINER_ID = 'employee-dwt-container'
const DWT_RESOURCES_PATH = 'dwt-resources'
const DWT_PRODUCT_KEY = import.meta.env.VITE_DWT_PRODUCT_KEY || 'LICENSE-KEY'

export const DWT_SERVICE_INSTALLERS = {
  windows: '/dwt-resources/dist/DynamicWebTWAINServiceSetup.msi',
  macos: '/dwt-resources/dist/DynamicWebTWAINServiceSetup.pkg',
  linux: '/dwt-resources/dist/DynamicWebTWAINServiceSetup.deb',
  docs: 'https://www.dynamsoft.com/web-twain/docs/extended-usage/dynamsoft-service-configuration.html'
}

let dynamsoftModule = null
let webTwainObject = null
let loadPromise = null

function getDWTNamespace(module) {
  return module?.default?.DWT ? module.default : module?.DWT ? module : module?.default || module
}

function convertToBlob(dwObject, indices, type) {
  return new Promise((resolve, reject) => {
    dwObject.ConvertToBlob(
      indices,
      type,
      (blob) => resolve(blob),
      (_errorCode, errorString) => reject(new Error(errorString || 'Could not export scanned document.'))
    )
  })
}

async function loadDWT() {
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const module = await import('dwt')
    const Dynamsoft = getDWTNamespace(module)
    dynamsoftModule = Dynamsoft

    Dynamsoft.DWT.ResourcesPath = DWT_RESOURCES_PATH
    Dynamsoft.DWT.ProductKey = DWT_PRODUCT_KEY
    Dynamsoft.DWT.UseDefaultViewer = true
    Dynamsoft.DWT.Containers = [{ ContainerId: DWT_CONTAINER_ID, Width: '100%', Height: '240px' }]

    await Dynamsoft.DWT.Load()
    webTwainObject = Dynamsoft.DWT.GetWebTwain(DWT_CONTAINER_ID)
    if (!webTwainObject) {
      throw new Error('Dynamic Web TWAIN loaded, but the scanner bridge did not create a WebTwain instance.')
    }
    return { Dynamsoft, webTwainObject }
  })()

  try {
    return await loadPromise
  } catch (error) {
    loadPromise = null
    webTwainObject = null
    throw error
  }
}

export async function checkDWTScannerService() {
  const { Dynamsoft, webTwainObject: dwObject } = await loadDWT()
  const deviceType =
    Dynamsoft.DWT.EnumDWT_DeviceType.TWAINSCANNER |
    Dynamsoft.DWT.EnumDWT_DeviceType.TWAINX64SCANNER |
    Dynamsoft.DWT.EnumDWT_DeviceType.WIASCANNER

  const devices = await dwObject.GetDevicesAsync(deviceType, true)
  return { Dynamsoft, dwObject, devices }
}

export async function scanWithDWTDevice(device) {
  const { Dynamsoft, dwObject } = await checkDWTScannerService()
  if (!device) {
    throw new Error('Choose a scanner first.')
  }

  if (dwObject.HowManyImagesInBuffer > 0) {
    dwObject.RemoveAllImages()
  }
  await dwObject.SelectDeviceAsync(device)
  await dwObject.OpenSourceAsync()
  await dwObject.AcquireImageAsync({
    IfShowUI: true,
    IfDisableSourceAfterAcquire: true,
    IfCloseSourceAfterAcquire: true
  })

  if (typeof dwObject.HowManyImagesInBuffer === 'number' && dwObject.HowManyImagesInBuffer <= 0) {
    throw new Error('No pages were scanned.')
  }

  const lastIndex = Math.max(0, (dwObject.HowManyImagesInBuffer || 1) - 1)
  const blob = await convertToBlob(dwObject, [lastIndex], Dynamsoft.DWT.EnumDWT_ImageType.IT_JPG)
  return new File([blob], `scanner-scan-${Date.now()}.jpg`, { type: 'image/jpeg' })
}

export function resetDWTScannerService() {
  if (webTwainObject) {
    try {
      webTwainObject.CloseSource()
    } catch {
      // Ignore close failures; service cleanup is best-effort.
    }
  }
}
