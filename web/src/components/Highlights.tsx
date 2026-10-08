import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Gavel, HeartHandshake, ThumbsUp, Trophy, type LucideIcon } from 'lucide-react'
import { useHighlights } from '../queries'
import Poster from './Poster'
import { Sk } from './Skeleton'

const who = (tag: string) => <Link to={`/u/${tag}`} className="who">{tag}</Link>

function Card({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <article className="hl-card">
      <p className="hl-label"><Icon size={15} aria-hidden="true" /> {label}</p>
      {children}
    </article>
  )
}

export function HighlightsSkeleton() {
  return (
    <section className="highlights" aria-hidden="true">
      <Sk className="sk-h2" style={{ width: 220 }} />
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
      <Card key="gen" icon={ThumbsUp} label="Más generoso">
        <p className="hl-main">{who(h.mostGenerous.tag)}</p>
        <p className="hl-sub">Promedio ★ {h.mostGenerous.average.toFixed(1)} en {h.mostGenerous.count} títulos</p>
      </Card>,
    )
  }
  if (h.mostDemanding) {
    cards.push(
      <Card key="dem" icon={Gavel} label="Más exigente">
        <p className="hl-main">{who(h.mostDemanding.tag)}</p>
        <p className="hl-sub">Promedio ★ {h.mostDemanding.average.toFixed(1)} en {h.mostDemanding.count} títulos</p>
      </Card>,
    )
  }
  if (h.favorite) {
    cards.push(
      <Card key="fav" icon={Trophy} label="La favorita del grupo">
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
      <Card key="con" icon={Flame} label="La más polémica">
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
      <Card key="soul" icon={HeartHandshake} label="Almas gemelas">
        <p className="hl-main">{who(h.soulmates.a)} + {who(h.soulmates.b)}</p>
        <p className="hl-sub"><b className="hl-pct">{h.soulmates.match}%</b> de coincidencia en {h.soulmates.common} títulos</p>
      </Card>,
    )
  }

  return (
    <section className="highlights" aria-labelledby="hl-title">
      <div className="section-head"><h2 id="hl-title">Destacados del grupo</h2></div>
      {cards.length > 0 ? (
        <div className="hl-grid">{cards}</div>
      ) : (
        <p className="muted">Todavía no hay suficientes puntajes. Cuando el grupo puntúe más títulos, aquí van a aparecer los destacados.</p>
      )}
    </section>
  )
}
