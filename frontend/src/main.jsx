import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app.jsx'
import { applyDensity, getStoredDensity } from './utils/density'
import { applyAccent, applyTheme, getStoredAccent, getStoredTheme } from './utils/theme'

applyTheme(getStoredTheme())
applyAccent(getStoredAccent())
applyDensity(getStoredDensity())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
