import { useEffect, useState } from 'react'

const THEME_STORAGE_KEY = 'rhet_ui_theme'

/** @returns {'dark' | 'light'} */
export function readStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function isDarkModeEnabled() {
  return readStoredTheme() === 'dark'
}

/** Persist and apply theme on <html data-theme>. */
export function setDarkModeEnabled(enabled) {
  const theme = enabled ? 'dark' : 'light'
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Ignore private mode / quota failures.
  }
  document.documentElement.dataset.theme = theme
  return theme
}

/** Call on app boot so the theme applies before/with first paint. */
export function applyStoredTheme() {
  const theme = readStoredTheme()
  document.documentElement.dataset.theme = theme
  return theme
}

/** Live theme flag for charts / components that need JS colors. */
export function useIsDarkTheme() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')

  useEffect(() => {
    const root = document.documentElement
    const sync = () => setDark(root.dataset.theme === 'dark')
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return dark
}

/** Recharts tick / grid / tooltip colors for the active theme. */
export function chartThemeColors(isDark) {
  if (isDark) {
    return {
      grid: '#2f4250',
      tick: '#c5d0d8',
      axis: '#6d8290',
      tooltipBg: '#152229',
      tooltipBorder: '#2a3c48',
      tooltipText: '#e8eef2',
    }
  }
  return {
    grid: '#edf0f5',
    tick: '#5a6575',
    axis: '#c5cbd4',
    tooltipBg: '#fff',
    tooltipBorder: '#e3e7ee',
    tooltipText: '#24304a',
  }
}
