import { createContext, useContext, useMemo } from 'react'

/** Mirrors backend DEFAULT_SETTINGS for offline / pre-load UI. */
export const DEFAULT_SETTINGS = Object.freeze({
  organizationName: 'RHET Inventory System',
  timezone: 'Asia/Manila',
  defaultLowStockThreshold: 20,
  courierPresets: Object.freeze(['LBC Express', 'J&T Express', 'Lalamove']),
  uniformSizes: Object.freeze(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']),
  shirtSizes: Object.freeze(['XS', 'S', 'M', 'L', 'XL', 'Teen']),
  helpAssistantEnabled: true,
  updatedAt: null,
  updatedBy: null,
})

const SettingsContext = createContext(DEFAULT_SETTINGS)

export function SettingsProvider({ settings, children }) {
  const value = useMemo(() => ({
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    courierPresets: settings?.courierPresets?.length
      ? settings.courierPresets
      : [...DEFAULT_SETTINGS.courierPresets],
    uniformSizes: settings?.uniformSizes?.length
      ? settings.uniformSizes
      : [...DEFAULT_SETTINGS.uniformSizes],
    shirtSizes: settings?.shirtSizes?.length
      ? settings.shirtSizes
      : [...DEFAULT_SETTINGS.shirtSizes],
  }), [settings])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  return useContext(SettingsContext)
}
