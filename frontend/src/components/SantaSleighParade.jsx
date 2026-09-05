/**
 * Compact realistic Santa + reindeer parade (left → right).
 * Two-frame gallop swaps so reindeer feet appear to move.
 * Shown only while Settings → Snowfall is enabled.
 */
export function SantaSleighParade() {
  return (
    <div className="santa-sleigh-parade" aria-hidden="true">
      <div className="santa-sleigh-stage">
        <div className="santa-sleigh-track">
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
  )
}
