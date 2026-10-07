import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useHighlights } from '../queries'
import Poster from './Poster'
import { Sk } from './Skeleton'

const who = (tag: string) => <Link to={`/u/${tag}`} className="who">{tag}</Link>

function Card({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <article className="hl-card">
      <p className="hl-label"><span aria-hidden="true">{icon}</span> {label}</p>
      {children}
    </article>
  )
}

export function HighlightsSkeleton() {
  return (
    <section aria-hidden="true">
      <Sk className="sk-h2" style={{ width: 220, marginBottom: 14 }} />
      <div className="hl-grid">
        {Array.from({ length: 4 }, (_, i) => <Sk key={i} className="sk-hl" />)}
      </div>
    </section>
  )
}

export default function Highlights() {
  const { data: h } = useHighlights()
  if (!h) return <HighlightsSkeleton />
  const cards: ReactNode[] = []

  if (h.mostGenerous) {
    cards.push(
      <Card key="gen" icon="😇" label="Más generoso">
        <p className="hl-main">{who(h.mostGenerous.tag)}</p>
        <p className="hl-sub">Promedio ★ {h.mostGenerous.average.toFixed(1)} en {h.mostGenerous.count} títulos</p>
      </Card>,
    )
  }
  if (h.mostDemanding) {
    cards.push(
      <Card key="dem" icon="🧐" label="Más exigente">
        <p className="hl-main">{who(h.mostDemanding.tag)}</p>
        <p className="hl-sub">Promedio ★ {h.mostDemanding.average.toFixed(1)} en {h.mostDemanding.count} títulos</p>
      </Card>,
    )
  }
  if (h.favorite) {
    cards.push(
      <Card key="fav" icon="🏆" label="La favorita del grupo">
        <div className="hl-movie">
          <Poster url={h.favorite.movie.posterUrl} title={h.favorite.movie.title} className="hl-thumb" />
          <div>
            <p className="hl-main">{h.favorite.movie.title}</p>
            <p className="hl-sub">★ {h.favorite.average.toFixed(1)} · {h.favorite.votes} puntajes</p>
          </div>
        </div>
      </Card>,
    )
  }
  if (h.controversial) {
    cards.push(
      <Card key="con" icon="🔥" label="La más polémica">
        <div className="hl-movie">
          <Poster url={h.controversial.movie.posterUrl} title={h.controversial.movie.title} className="hl-thumb" />
          <div>
            <p className="hl-main">{h.controversial.movie.title}</p>
            <p className="hl-spread">
              {h.controversial.scores.map((s) => <span key={s.tag}>{s.tag} <b>{s.score}</b></span>)}
            </p>
          </div>
        </div>
      </Card>,
    )
  }
  if (h.soulmates) {
    cards.push(
      <Card key="soul" icon="💞" label="Almas gemelas">
        <p className="hl-main">{who(h.soulmates.a)} + {who(h.soulmates.b)}</p>
        <p className="hl-sub"><b className="hl-pct">{h.soulmates.match}%</b> de coincidencia en {h.soulmates.common} títulos</p>
      </Card>,
    )
  }

  return (
    <section className="highlights">
      <h2>Destacados del grupo</h2>
      {cards.length > 0 ? (
        <div className="hl-grid">{cards}</div>
      ) : (
        <p className="muted">Todavía no hay suficientes puntajes. Cuando el grupo puntúe más títulos, aquí aparecerán los destacados.</p>
      )}
    </section>
  )
}
