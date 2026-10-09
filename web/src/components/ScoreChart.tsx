import type { CSSProperties } from 'react'

const titles = (n: number) => `${n} ${n === 1 ? 'título' : 'títulos'}`

/**
 * Score distribution (scores 1..10) as one-hue columns in a plot of definite height, so bar heights are a share of a
 * real box and nothing can leave it. The most common score is full gold and carries the only direct label: when several
 * scores tie for it, all of them stay full gold (equal height and color already say "same count") and only the highest
 * score is labeled, so the plot never shows the same number twice. Every column is a full-height hover/focus target
 * with a tooltip.
 *
 * The columns are also a score filter: each one is a toggle button named for assistive tech ("Puntaje 8: 214 títulos",
 * which makes the columns themselves the accessible table) that calls `onPick` with its score. While a score is
 * `selected`, its bar is the only full-gold one and the rest dim. The counts always describe every watched title; the
 * chart is never recomputed from a filtered list.
 */
export default function ScoreChart({ counts, average, selected, onPick }: {
  counts: number[]; average: number | null; selected: number | null; onPick: (score: number) => void
}) {
  const max = Math.max(0, ...counts)
  const empty = max === 0
  // The one direct label: the highest score among those tied for the most common.
  const labeled = empty ? -1 : counts.lastIndexOf(max)
  // Bucket centers sit at (score - 0.5) / 10 of the axis width.
  const avgAt = average !== null ? Math.min(100, Math.max(0, (average - 0.5) * 10)) : null
  return (
    <figure className="score-chart">
      <figcaption className="sc-title">Puntajes</figcaption>
      <div className={`sc-plot ${selected !== null ? 'has-pick' : ''}`} role="group" aria-label="Filtrar vistas por puntaje">
        {counts.map((n, i) => {
          const score = i + 1
          const top = !empty && n === max
          const edge = i < 3 ? 'start' : i > 6 ? 'end' : 'center'
          return (
            <button
              key={i}
              type="button"
              className={`sc-col ${top ? 'is-top' : ''}`}
              aria-pressed={selected === score}
              aria-label={`Puntaje ${score}: ${titles(n)}`}
              onClick={() => onPick(score)}
            >
              <span className="sc-track">
                <i
                  className={`sc-bar ${n === 0 ? 'is-zero' : ''}`}
                  style={n > 0 ? ({ '--h': `${(n / max) * 100}%` } as CSSProperties) : undefined}
                >
                  {i === labeled && <b className="sc-val">{n}</b>}
                </i>
              </span>
              <span className={`sc-tip ${edge}`} aria-hidden="true"><b>{score}</b> · {titles(n)}</span>
            </button>
          )
        })}
        {empty && <span className="sc-empty">Todavía no hay puntajes</span>}
      </div>
      <div className="sc-axis" aria-hidden="true">
        {counts.map((_, i) => <span key={i} className={selected === i + 1 ? 'is-pick' : undefined}>{i + 1}</span>)}
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
