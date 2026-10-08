import type { CSSProperties, ReactNode } from 'react'

/** Shimmering placeholder block. Size it with className (CSS) or the style prop. */
export function Sk({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`sk ${className}`} style={style} aria-hidden="true" />
}

/** Same boxes as TitleCard: poster, two-line title slot, year, two-line summary. */
function SkCard() {
  return (
    <div className="card" aria-hidden="true">
      <Sk className="sk-poster" />
      <div className="sk-card-title">
        <Sk className="sk-line" style={{ width: '85%' }} />
        <Sk className="sk-line" style={{ width: '55%' }} />
      </div>
      <Sk className="sk-line sm" style={{ width: '40%', margin: '4px 0' }} />
      <Sk className="sk-line sm" style={{ width: '70%' }} />
      <Sk className="sk-line sm" style={{ width: '45%', marginTop: 4 }} />
    </div>
  )
}

function SkGrid({ cards, capped = false }: { cards: number; capped?: boolean }) {
  return (
    <div className={`grid ${capped ? 'capped' : ''}`} aria-hidden="true">
      {Array.from({ length: cards }, (_, i) => <SkCard key={i} />)}
    </div>
  )
}

function SkSection({ cards, capped }: { cards: number; capped?: boolean }) {
  return (
    <section className="section" aria-hidden="true">
      <Sk className="sk-h2" />
      <SkGrid cards={cards} capped={capped} />
    </section>
  )
}

function SkPageHead() {
  return (
    <div className="page-head" aria-hidden="true">
      <Sk className="sk-title" />
      <Sk className="sk-line" style={{ width: 240, marginTop: 12 }} />
    </div>
  )
}

function Busy({ label, children }: { label: string; children: ReactNode }) {
  return <div role="status" aria-busy="true" aria-label={label}>{children}</div>
}

/** Studio page: title + progress, toolbar, first section. */
export function CatalogSkeleton() {
  return (
    <Busy label="Cargando catálogo">
      <div className="studio-head" aria-hidden="true">
        <Sk className="sk-title" />
        <Sk className="sk-meter" />
      </div>
      <div className="sticky-bar" aria-hidden="true">
        <div className="bar">
          <Sk className="sk-seg" />
          <Sk className="sk-search" />
        </div>
      </div>
      <SkSection cards={10} />
    </Busy>
  )
}

/** Ranking: same podium (avatars, lifted steps) and leaderboard rows, without medal colors. */
export function RankingSkeleton() {
  return (
    <Busy label="Cargando ranking">
      <div className="podium is-sk" style={{ '--lines': 2 } as CSSProperties} aria-hidden="true">
        {[1, 2, 3].map((p) => (
          <div key={p} className={`pod pod-${p}`}>
            <div className="pod-figure"><Sk className="sk-av pod-av" /></div>
            <div className="pod-step">
              <Sk className="sk-line" style={{ width: '60%', margin: '2px auto 10px' }} />
              <Sk className="sk-line" style={{ width: '40%', height: 22, margin: '0 auto 10px' }} />
              <Sk className="sk-line sm" style={{ width: '70%', margin: '0 auto' }} />
              <span className="pod-place">&nbsp;</span>
            </div>
          </div>
        ))}
      </div>
      <div className="lb" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="lb-row">
            <Sk className="sk-line lb-pos" style={{ width: 16 }} />
            <Sk className="sk-av lb-av" />
            <Sk className="sk-line lb-who" style={{ width: '50%' }} />
          </div>
        ))}
      </div>
    </Busy>
  )
}

export function ProfileSkeleton() {
  return (
    <Busy label="Cargando perfil">
      <div className="page-head profile-head" aria-hidden="true">
        <Sk className="sk-av profile-av" />
        <div className="profile-who" style={{ flex: 1 }}>
          <Sk className="sk-title" />
          <Sk className="sk-line" style={{ width: 'min(360px, 90%)', marginTop: 12 }} />
        </div>
      </div>
      <Sk className="sk-overview" />
      <Sk className="sk-panel" />
      <div className="list" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => <Sk key={i} className="sk-row" />)}
      </div>
    </Busy>
  )
}

/** Initial session check: header + home layout, before we know whether the user is logged in. */
export function AppSkeleton() {
  return (
    <>
      <header className="nav" aria-hidden="true">
        <div className="nav-inner">
          <Sk className="sk-brand" />
          <div className="nav-links">
            <Sk className="sk-pill" />
            <Sk className="sk-pill" />
            <Sk className="sk-pill" />
          </div>
        </div>
      </header>
      <main className="page">
        <SkPageHead />
        <RowsSkeleton />
      </main>
    </>
  )
}

/** /estudios: logo tiles. */
export function StudiosSkeleton() {
  return (
    <Busy label="Cargando estudios">
      <SkPageHead />
      <div className="studios" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="studio-card">
            <Sk className="sk-logo" />
            <Sk className="sk-line" style={{ width: '60%', height: 20, marginTop: 6 }} />
            <Sk className="sk-line sm" style={{ width: '40%' }} />
            <Sk className="sk-meter" style={{ marginTop: 4 }} />
          </div>
        ))}
      </div>
    </Busy>
  )
}

/** Home: capped sections. */
export function RowsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <Busy label="Cargando inicio">
      {Array.from({ length: rows }, (_, r) => <SkSection key={r} cards={10} capped />)}
    </Busy>
  )
}

/** Plain grid of title placeholders (catalog grid, next page). */
export function GridSkeleton({ cards = 12 }: { cards?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando títulos">
      <SkGrid cards={cards} />
    </div>
  )
}
