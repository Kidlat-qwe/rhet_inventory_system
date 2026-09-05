import { useMemo } from 'react'
import Snowfall from 'react-snowfall'
import { useSettings } from '../context/SettingsContext'
import { SantaSleighParade } from './SantaSleighParade'

const SNOWFLAKE_SRCS = [
  '/snowflakes/flake-1.svg',
  '/snowflakes/flake-2.svg',
  '/snowflakes/flake-3.svg',
  '/snowflakes/flake-4.svg',
]

/**
 * Full-viewport decorative snowfall + Santa/reindeer parade.
 * Pointer-events none so UI stays clickable.
 * Controlled by Settings → Features → Snowfall.
 */
export function SnowfallOverlay() {
  const settings = useSettings()
  const images = useMemo(
    () => SNOWFLAKE_SRCS.map((src) => {
      const img = new Image()
      img.src = src
      return img
    }),
    [],
  )

  if (settings.snowfallEnabled !== true) return null

  return (
    <div className="snowfall-overlay" aria-hidden="true">
      <Snowfall
        images={images}
        snowflakeCount={90}
        speed={[0.4, 2.2]}
        wind={[-0.8, 1.2]}
        radius={[8, 22]}
        rotationSpeed={[-1, 1]}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 40,
        }}
      />
      <SantaSleighParade />
    </div>
  )
}
