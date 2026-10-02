import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import DashboardLayoutSidebar from '../components/layout/DashboardLayoutSidebar'

describe('Dashboard Responsive Sidebar Architecture', () => {
  it('exports DashboardLayoutSidebar cleanly', () => {
    expect(DashboardLayoutSidebar).toBeDefined()
    expect(typeof DashboardLayoutSidebar).toBe('function')
  })

  it('defines custom properties for expanded, collapsed widths and z-indexing in 01-shell.css', () => {
    const cssPath = path.resolve(__dirname, '../styles/01-shell.css')
    const css = fs.readFileSync(cssPath, 'utf8')

    expect(css).toContain('--sidebar-width-expanded: 240px;')
    expect(css).toContain('--sidebar-width-collapsed: 68px;')
    expect(css).toContain('--z-sidebar-backdrop: 900;')
    expect(css).toContain('--z-sidebar-expanded: 1000;')
  })

  it('ensures sidebar expanded z-index is strictly higher than backdrop component', () => {
    const shellCss = fs.readFileSync(path.resolve(__dirname, '../styles/01-shell.css'), 'utf8')
    const themesCss = fs.readFileSync(path.resolve(__dirname, '../styles/08-themes.css'), 'utf8')

    // In 01-shell.css
    expect(shellCss).toContain('z-index: var(--z-sidebar-backdrop)')
    expect(shellCss).toContain('z-index: var(--z-sidebar-expanded)')

    // In 08-themes.css
    expect(themesCss).toContain('.dashboard-sidebar.is-expanded')
    expect(themesCss).toContain('z-index: var(--z-sidebar-expanded, 1000) !important;')
    expect(themesCss).toContain('z-index: var(--z-sidebar-backdrop, 900) !important;')
  })

  it('contains toggled-off rail styles where menu items appear as icons with full height', () => {
    const cssPath = path.resolve(__dirname, '../styles/01-shell.css')
    const css = fs.readFileSync(cssPath, 'utf8')

    expect(css).toContain('.dashboard-sidebar:not(.is-expanded)')
    expect(css).toContain('width: var(--sidebar-width-collapsed);')
    expect(css).toContain('.dashboard-sidebar-collapse-toggle')
    expect(css).toContain('.dashboard-brand-compact')
    expect(css).toContain('.dashboard-brand-full')
    expect(css).toContain('.dashboard-nav-link-copy')
  })

  it('contains mobile and tablet responsive media queries in 01-shell.css', () => {
    const cssPath = path.resolve(__dirname, '../styles/01-shell.css')
    const css = fs.readFileSync(cssPath, 'utf8')

    // Tablet & mobile overlay
    expect(css).toContain('@media (max-width: 1023px)')
    expect(css).toContain('.dashboard-shell.is-sidebar-expanded .dashboard-sidebar-backdrop')
    expect(css).toContain('.dashboard-mobile-header')

    // Phone vertical aspect ratios
    expect(css).toContain('@media (max-width: 480px)')

    // Short vertical height aspect ratios
    expect(css).toContain('@media (max-height: 740px)')
    expect(css).toContain('@media (max-height: 560px)')
  })

  it('has removed conflicting legacy flex-wrap overrides from 04-commissions.css', () => {
    const cssPath = path.resolve(__dirname, '../styles/04-commissions.css')
    const css = fs.readFileSync(cssPath, 'utf8')

    expect(css).not.toContain('.dashboard-sidebar {')
    expect(css).not.toContain('@media (max-width: 640px)')
  })

  it('has removed conflicting legacy overrides from 08-themes.css', () => {
    const cssPath = path.resolve(__dirname, '../styles/08-themes.css')
    const css = fs.readFileSync(cssPath, 'utf8')

    expect(css).not.toContain('@media (max-width: 900px)')
    expect(css).toContain('@media (max-width: 1023px)')
  })

  it('guarantees dashboard-mobile-header is 100% full-width and dashboard-sidebar is off-canvas when closed on mobile', () => {
    const cssPath = path.resolve(__dirname, '../styles/01-shell.css')
    const css = fs.readFileSync(cssPath, 'utf8')

    // Mobile header spans 100% full width like a navbar
    expect(css).toContain('width: 100%;')
    expect(css).toContain('min-width: 100%;')

    // Main content resets left margin on mobile
    expect(css).toContain('margin-left: 0 !important;')

    // Sidebar is completely hidden off-canvas on mobile by default
    expect(css).toContain('transform: translateX(-100%);')

    // Sidebar only appears when toggled open
    expect(css).toContain('.dashboard-sidebar.is-mobile-open')
    expect(css).toContain('transform: translateX(0)')
  })

  it('guarantees dashboard-sidebar is-mobile-open is-collapsed has at least 70% vw width', () => {
    const shellCss = fs.readFileSync(path.resolve(__dirname, '../styles/01-shell.css'), 'utf8')
    const themesCss = fs.readFileSync(path.resolve(__dirname, '../styles/08-themes.css'), 'utf8')

    // In 01-shell.css
    expect(shellCss).toContain('.dashboard-sidebar.is-mobile-open.is-collapsed')
    expect(shellCss).toContain('min-width: 70vw')
    expect(shellCss).toContain('width: 75vw')

    // In 08-themes.css
    expect(themesCss).toContain('.dashboard-sidebar.is-mobile-open.is-collapsed')
    expect(themesCss).toContain('min-width: 70vw')
    expect(themesCss).toContain('width: 75vw')
  })

  it('guarantees desktop main container follows togglemenu conditions and expands cleanly', () => {
    const shellCss = fs.readFileSync(path.resolve(__dirname, '../styles/01-shell.css'), 'utf8')
    const primCss = fs.readFileSync(path.resolve(__dirname, '../styles/07-primitives.css'), 'utf8')

    // In 01-shell.css: toggle menu collapsed condition
    expect(shellCss).toContain('.dashboard-shell.is-sidebar-collapsed .dashboard-content')
    expect(shellCss).toContain('.dashboard-shell.is-sidebar-collapsed .dashboard-panel')
    expect(shellCss).toContain('padding: 24px 36px;')

    // In 01-shell.css: toggle menu expanded condition
    expect(shellCss).toContain('.dashboard-shell.is-sidebar-expanded .dashboard-content')
    expect(shellCss).toContain('.dashboard-shell.is-sidebar-expanded .dashboard-panel')
    expect(shellCss).toContain('padding: 20px 24px;')

    // In 07-primitives.css: align-items stretch allows containers to expand fully
    expect(primCss).toContain('.dashboard-content {')
    expect(primCss).toContain('align-items: stretch;')
  })

  it('guarantees collapsed rail has centered icons, centered profile avatar, and non-overlapping brand/toggle row', () => {
    const shellCss = fs.readFileSync(path.resolve(__dirname, '../styles/01-shell.css'), 'utf8')
    const themesCss = fs.readFileSync(path.resolve(__dirname, '../styles/08-themes.css'), 'utf8')

    // Brand row height is auto to prevent overflow/overlap onto nav items below
    expect(shellCss).toContain('.dashboard-sidebar.is-collapsed .dashboard-brand-row')
    expect(shellCss).toContain('height: auto !important;')
    expect(themesCss).toContain('.dashboard-sidebar.is-collapsed .dashboard-brand-row')
    expect(themesCss).toContain('height: auto !important;')

    // Centered nav buttons & zero-margin icons
    expect(shellCss).toContain('.dashboard-sidebar.is-collapsed .dashboard-nav-link')
    expect(shellCss).toContain('justify-content: center !important;')
    expect(shellCss).toContain('margin: 0 !important;')
    expect(themesCss).toContain('.dashboard-sidebar.is-collapsed .dashboard-nav-link')
    expect(themesCss).toContain('justify-content: center !important;')
    expect(themesCss).toContain('margin: 0 !important;')

    // Centered logout action
    expect(shellCss).toContain('.dashboard-sidebar.is-collapsed .dashboard-logout')
    expect(shellCss).toContain('justify-content: center !important;')
    expect(themesCss).toContain('.dashboard-sidebar.is-collapsed .dashboard-logout')
    expect(themesCss).toContain('justify-content: center !important;')
  })
})
