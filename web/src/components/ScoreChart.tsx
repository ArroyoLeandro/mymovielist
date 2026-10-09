import type { CSSProperties } from 'react'

const titles = (n: number) => `${n} ${n === 1 ? 'título' : 'títulos'}`

/**
 * Score distribution (scores 1..10) as one-hue columns in a plot of definite height, so bar heights are a share of a
 * real box and nothing can leave it. The most common score is full gold and carries the only direct label: when several
 * scores tie for it, all of them stay full gold (equal height and color already say "same count") and only the highest
 * score is labeled, so the plot never shows the same number twice. Every column is a full-height hover/focus target
 * with a tooltip. Each column is named for assistive tech ("Puntaje 8:
 * 214 títulos"), which makes the columns themselves the accessible table: no hidden copy to read twice.
 */
export default function ScoreChart({ counts, average }: { counts: number[]; average: number | null }) {
  const max = Math.max(0, ...counts)
  const empty = max === 0
  // The one direct label: the highest score among those tied for the most common.
  const labeled = empty ? -1 : counts.lastIndexOf(max)
  // Bucket centers sit at (score - 0.5) / 10 of the axis width.
  const avgAt = average !== null ? Math.min(100, Math.max(0, (average - 0.5) * 10)) : null
  return (
    <figure className="score-chart">
      <figcaption className="sc-title">Puntajes</figcaption>
      <div className="sc-plot">
        {counts.map((n, i) => {
          const top = !empty && n === max
          const edge = i < 3 ? 'start' : i > 6 ? 'end' : 'center'
          return (
            <span key={i} className={`sc-col ${top ? 'is-top' : ''}`} role="img" tabIndex={0} aria-label={`Puntaje ${i + 1}: ${titles(n)}`}>
              <span className="sc-track">
                <i
                  className={`sc-bar ${n === 0 ? 'is-zero' : ''}`}
                  style={n > 0 ? ({ '--h': `${(n / max) * 100}%` } as CSSProperties) : undefined}
                >
                  {i === labeled && <b className="sc-val">{n}</b>}
                </i>
              </span>
              <span className={`sc-tip ${edge}`} aria-hidden="true"><b>{i + 1}</b> · {titles(n)}</span>
            </span>
          )
        })}
        {empty && <span className="sc-empty">Todavía no hay puntajes</span>}
      </div>
      <div className="sc-axis" aria-hidden="true">
        {counts.map((_, i) => <span key={i}>{i + 1}</span>)}
      </div>
      {average !== null && avgAt !== null && (
        <div className="sc-avg" style={{ '--at': `${avgAt}%` } as CSSProperties}>
          <i aria-hidden="true" />
          <span>prom. {average.toFixed(1)}</span>
        </div>
      )}
    </figure>
  )
}
