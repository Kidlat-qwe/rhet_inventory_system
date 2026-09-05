import { useEffect, useId, useState } from 'react'
import {
  CHRISTMAS_COUNTDOWN_TIMEZONE,
  getChristmasCountdown,
} from '../utils/christmasCountdown'

const WAVE_A =
  'M8,18 C38,4 58,32 88,18 S138,4 168,18 S218,32 248,18 S278,4 292,16 L292,42 C278,54 258,28 248,42 S198,54 168,42 S118,28 88,42 S38,54 8,40 Z'
const WAVE_B =
  'M8,22 C38,36 58,8 88,22 S138,36 168,22 S218,8 248,22 S278,36 292,20 L292,46 C278,32 258,58 248,46 S198,32 168,46 S118,58 88,46 S38,32 8,44 Z'
const WAVE_C =
  'M8,16 C38,28 58,6 88,20 S138,34 168,16 S218,6 248,24 S278,12 292,18 L292,44 C278,50 258,36 248,48 S198,58 168,40 S118,28 88,44 S38,52 8,38 Z'

const PATH_A = 'M14,30 C44,16 64,44 94,30 S144,16 174,30 S224,44 254,30 S284,16 286,28'
const PATH_B = 'M14,34 C44,48 64,20 94,34 S144,48 174,34 S224,20 254,34 S284,48 286,32'
const PATH_C = 'M14,28 C44,40 64,18 94,32 S144,46 174,28 S224,18 254,36 S284,24 286,30'

/**
 * Compact realistic Santa + reindeer parade (left → right).
 * A wide SVG wave banner is hitched to Santa’s vehicle and shows the
 * Christmas Day countdown (Asia/Manila).
 */
export function SantaSleighParade() {
  const reactId = useId().replace(/:/g, '')
  const gradId = `santa-banner-grad-${reactId}`
  const pathId = `santa-banner-path-${reactId}`
  const [countdown, setCountdown] = useState(() => getChristmasCountdown())

  useEffect(() => {
    const tick = () => setCountdown(getChristmasCountdown(new Date(), CHRISTMAS_COUNTDOWN_TIMEZONE))
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const line = countdown.isChristmas
    ? `Merry Christmas!  ·  Today!  ·  Philippines`
    : `Christmas  ·  ${countdown.shortLabel}  ·  until Dec 25  ·  PHT`

  return (
    <div className="santa-sleigh-parade" aria-hidden="true">
      <div className="santa-sleigh-stage">
        <div className="santa-sleigh-track">
          <div className="santa-sleigh-rig">
            <div
              className={`santa-xmas-banner${countdown.isChristmas ? ' is-christmas' : ''}`}
              title={`${countdown.label} · ${CHRISTMAS_COUNTDOWN_TIMEZONE}`}
            >
              <svg
                className="santa-xmas-banner-svg"
                viewBox="0 0 300 60"
                xmlns="http://www.w3.org/2000/svg"
                role="presentation"
              >
                <defs>
                  <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop className="santa-xmas-banner-stop-a" offset="0%" />
                    <stop className="santa-xmas-banner-stop-b" offset="55%" />
                    <stop className="santa-xmas-banner-stop-c" offset="100%" />
                  </linearGradient>
                  <path id={pathId} d={PATH_A}>
                    <animate
                      attributeName="d"
                      values={`${PATH_A};${PATH_B};${PATH_C};${PATH_A}`}
                      dur="1.15s"
                      repeatCount="indefinite"
                      calcMode="spline"
                      keyTimes="0;0.33;0.66;1"
                      keySplines="0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1"
                    />
                  </path>
                </defs>

                <path className="santa-xmas-banner-shadow" d={WAVE_A}>
                  <animate
                    attributeName="d"
                    values={`${WAVE_A};${WAVE_B};${WAVE_C};${WAVE_A}`}
                    dur="1.15s"
                    repeatCount="indefinite"
                    calcMode="spline"
                    keyTimes="0;0.33;0.66;1"
                    keySplines="0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1"
                  />
                </path>

                <path className="santa-xmas-banner-fill" fill={`url(#${gradId})`} d={WAVE_A}>
                  <animate
                    attributeName="d"
                    values={`${WAVE_A};${WAVE_B};${WAVE_C};${WAVE_A}`}
                    dur="1.15s"
                    repeatCount="indefinite"
                    calcMode="spline"
                    keyTimes="0;0.33;0.66;1"
                    keySplines="0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1"
                  />
                </path>

                <path className="santa-xmas-banner-stroke" fill="none" d={WAVE_A}>
                  <animate
                    attributeName="d"
                    values={`${WAVE_A};${WAVE_B};${WAVE_C};${WAVE_A}`}
                    dur="1.15s"
                    repeatCount="indefinite"
                    calcMode="spline"
                    keyTimes="0;0.33;0.66;1"
                    keySplines="0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1"
                  />
                </path>

                <text className="santa-xmas-banner-text">
                  <textPath href={`#${pathId}`} startOffset="2%">
                    {line}
                  </textPath>
                </text>
              </svg>
              <span className="santa-xmas-banner-hitch" />
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
