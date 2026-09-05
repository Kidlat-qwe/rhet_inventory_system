import { useEffect, useState } from 'react'
import {
  CHRISTMAS_COUNTDOWN_TIMEZONE,
  getChristmasCountdown,
} from '../utils/christmasCountdown'

/**
 * Compact realistic Santa + reindeer parade (left → right).
 * A mini landscape banner hitched to Santa’s vehicle shows the Christmas Day
 * countdown (Asia/Manila). Two-frame gallop swaps so reindeer feet appear to move.
 * Shown only while Settings → Snowfall is enabled.
 */
export function SantaSleighParade() {
  const [countdown, setCountdown] = useState(() => getChristmasCountdown())

  useEffect(() => {
    const tick = () => setCountdown(getChristmasCountdown(new Date(), CHRISTMAS_COUNTDOWN_TIMEZONE))
    tick()
    // Refresh at least once a minute so the day flips correctly at midnight PHT.
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="santa-sleigh-parade" aria-hidden="true">
      <div className="santa-sleigh-stage">
        <div className="santa-sleigh-track">
          <div className="santa-sleigh-rig">
            <div
              className={`santa-xmas-banner${countdown.isChristmas ? ' is-christmas' : ''}`}
              title={`${countdown.label} · ${CHRISTMAS_COUNTDOWN_TIMEZONE}`}
            >
              <div className="santa-xmas-banner-panel">
                <span className="santa-xmas-banner-eyebrow">🎄 Christmas</span>
                <strong className="santa-xmas-banner-count">{countdown.shortLabel}</strong>
                {!countdown.isChristmas && (
                  <span className="santa-xmas-banner-sub">until Dec 25</span>
                )}
              </div>
              <span className="santa-xmas-banner-hitch" aria-hidden="true" />
            </div>

            <div className="santa-sleigh-figure">
              <img
                className="santa-sleigh-img santa-frame-a"
                src="/snowflakes/santa-run-a.png"
                alt=""
                draggable={false}
              />
              <img
                className="santa-sleigh-img santa-frame-b"
                src="/snowflakes/santa-run-b.png"
                alt=""
                draggable={false}
              />
              <span className="santa-sleigh-shadow" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
