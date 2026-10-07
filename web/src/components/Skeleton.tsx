import type { CSSProperties, ReactNode } from 'react'

/** Shimmering placeholder block. Size it with className (CSS) or the style prop. */
export function Sk({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`sk ${className}`} style={style} aria-hidden="true" />
}

function SkCard() {
  return (
    <div className="card" aria-hidden="true">
      <Sk className="sk-poster" />
      <Sk className="sk-line" style={{ width: '80%', marginTop: 6 }} />
      <Sk className="sk-line sm" style={{ width: '45%' }} />
      <Sk className="sk-line lg" style={{ width: '55%' }} />
      <Sk className="sk-scores" />
    </div>
  )
}

function SkSection({ cards }: { cards: number }) {
  return (
    <section className="era" aria-hidden="true">
      <Sk className="sk-h2" />
      <div className="grid">
        {Array.from({ length: cards }, (_, i) => <SkCard key={i} />)}
      </div>
    </section>
  )
}

function Busy({ label, children }: { label: string; children: ReactNode }) {
  return <div role="status" aria-busy="true" aria-label={label}>{children}</div>
}

export function CatalogSkeleton() {
  return (
    <Busy label="Cargando catálogo">
      <div className="toolbar" aria-hidden="true">
        <div className="progress">
          <Sk className="sk-title" />
          <Sk className="sk-meter" />
        </div>
        <Sk className="sk-input" />
        <Sk className="sk-seg" />
      </div>
      <SkSection cards={8} />
      <SkSection cards={6} />
    </Busy>
  )
}

export function RankingSkeleton() {
  return (
    <Busy label="Cargando ranking">
      <Sk className="sk-title" />
      <Sk className="sk-line" style={{ width: 180, marginTop: 10 }} />
      <div className="podium" aria-hidden="true">
        {[2, 1, 3].map((p) => (
          <div key={p} className={`pod pod-${p}`}>
            <Sk className="sk-line" style={{ width: '70%' }} />
            <Sk className="sk-line sm" style={{ width: '50%' }} />
            <Sk className="pod-step" />
          </div>
        ))}
      </div>
      <div className="ranking" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => <Sk key={i} className="sk-row" />)}
      </div>
    </Busy>
  )
}

export function ProfileSkeleton() {
  return (
    <Busy label="Cargando lista">
      <Sk className="sk-title" style={{ maxWidth: 360 }} />
      <section className="stats" aria-hidden="true">
        <Sk className="sk-stat" />
        <Sk className="sk-stat" />
        <Sk className="sk-stat dist-sk" />
      </section>
      <div className="list" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => <Sk key={i} className="sk-row" />)}
      </div>
    </Busy>
  )
}

/** Initial session check: nav bar + catalog layout, before we know whether the user is logged in. */
export function AppSkeleton() {
  return (
    <>
      <header className="nav" aria-hidden="true">
        <Sk className="sk-brand" />
        <nav>
          <Sk className="sk-pill" />
          <Sk className="sk-pill" />
          <Sk className="sk-pill" />
        </nav>
        <Sk className="sk-pill" />
      </header>
      <main className="page"><CatalogSkeleton /></main>
    </>
  )
}

export function HomeSkeleton() {
  return (
    <Busy label="Cargando estudios">
      <Sk className="sk-title" />
      <Sk className="sk-line" style={{ width: 240, marginTop: 10 }} />
      <div className="studios" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="studio-card">
            <Sk className="sk-logo" />
            <Sk className="sk-line lg" style={{ width: '60%' }} />
            <Sk className="sk-line sm" style={{ width: '40%' }} />
            <Sk className="sk-meter" />
          </div>
        ))}
      </div>
    </Busy>
  )
}
