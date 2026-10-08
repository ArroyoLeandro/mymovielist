import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Gavel, HeartHandshake, ThumbsUp, Trophy, type LucideIcon } from 'lucide-react'
import { useHighlights } from '../queries'
import Avatar from './Avatar'
import Poster from './Poster'
import { Sk } from './Skeleton'

const Who = ({ tag }: { tag: string }) => <Link to={`/u/${tag}`} className="hl-who">{tag}</Link>

interface CardProps {
  tone: 'gold' | 'rose' | 'mint' | 'amber' | 'violet'
  icon: LucideIcon
  label: string
  visual: ReactNode
  title: ReactNode
  caption: ReactNode
  value: string
  unit: string
  extra?: ReactNode
}

/** Every highlight has the same anatomy: visual, label, title, caption and one big number. */
function Card({ tone, icon: Icon, label, visual, title, caption, value, unit, extra }: CardProps) {
  return (
    <article className={`hl hl-${tone}`}>
      <div className="hl-in">
        <div className="hl-visual">{visual}</div>
        <div className="hl-body">
          <p className="hl-label"><Icon size={14} aria-hidden="true" /> {label}</p>
          <p className="hl-title">{title}</p>
          <p className="hl-caption">{caption}</p>
          {extra}
        </div>
        <p className="hl-value"><b>{value}</b><span>{unit}</span></p>
      </div>
    </article>
  )
}

const score = (n: number) => n.toFixed(1)

export function HighlightsSkeleton() {
  return (
    <div className="hl-grid" data-count="5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="hl hl-sk">
          <div className="hl-in">
            <Sk className="hl-visual sk-hl-visual" />
            <div className="hl-body">
              <Sk className="sk-line sm" style={{ width: '45%' }} />
              <Sk className="sk-line" style={{ width: '75%', margin: '8px 0' }} />
              <Sk className="sk-line sm" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Cards() {
  const { data: h, error } = useHighlights()
  if (!h) return error ? <p className="muted">No se pudieron cargar los destacados. Se reintenta solo en unos segundos.</p> : <HighlightsSkeleton />

  const cards: ReactNode[] = []
  if (h.favorite) {
    const m = h.favorite.movie
    cards.push(
      <Card
        key="fav" tone="gold" icon={Trophy} label="La favorita"
        visual={<Poster url={m.posterUrl} title={m.title} className="hl-poster" />}
        title={m.title}
        caption={`${h.favorite.votes} ${h.favorite.votes === 1 ? 'puntaje' : 'puntajes'} del grupo`}
        value={score(h.favorite.average)} unit="promedio"
      />,
    )
  }
  if (h.controversial) {
    const m = h.controversial.movie
    const sorted = [...h.controversial.scores].sort((a, b) => a.score - b.score)
    const low = sorted[0]
    const high = sorted[sorted.length - 1]
    cards.push(
      <Card
        key="con" tone="rose" icon={Flame} label="La más polémica"
        visual={<Poster url={m.posterUrl} title={m.title} className="hl-poster" />}
        title={m.title}
        caption={low && high ? <><Who tag={low.tag} /> le puso {low.score} y <Who tag={high.tag} />, {high.score}</> : 'Puntajes muy repartidos'}
        value={low && high ? `${low.score}–${high.score}` : '—'} unit="puntajes"
      />,
    )
  }
  if (h.mostGenerous) {
    const g = h.mostGenerous
    cards.push(
      <Card
        key="gen" tone="mint" icon={ThumbsUp} label="Más generoso"
        visual={<Avatar tag={g.tag} className="hl-av" />}
        title={<Who tag={g.tag} />}
        caption={`Sobre ${g.count} ${g.count === 1 ? 'título puntuado' : 'títulos puntuados'}`}
        value={score(g.average)} unit="promedio"
      />,
    )
  }
  if (h.mostDemanding) {
    const d = h.mostDemanding
    cards.push(
      <Card
        key="dem" tone="amber" icon={Gavel} label="Más exigente"
        visual={<Avatar tag={d.tag} className="hl-av" />}
        title={<Who tag={d.tag} />}
        caption={`Sobre ${d.count} ${d.count === 1 ? 'título puntuado' : 'títulos puntuados'}`}
        value={score(d.average)} unit="promedio"
      />,
    )
  }
  if (h.soulmates) {
    const s = h.soulmates
    cards.push(
      <Card
        key="soul" tone="violet" icon={HeartHandshake} label="Almas gemelas"
        visual={<span className="hl-pair"><Avatar tag={s.a} className="hl-av" /><Avatar tag={s.b} className="hl-av" /></span>}
        title={<><Who tag={s.a} /> y <Who tag={s.b} /></>}
        caption={`Puntajes parecidos en ${s.common} ${s.common === 1 ? 'título' : 'títulos'}`}
        value={`${s.match}%`} unit="coinciden"
        extra={<span className="hl-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, s.match))}%` }} /></span>}
      />,
    )
  }

  if (cards.length === 0) {
    return <p className="muted">Todavía no hay suficientes puntajes. Cuando el grupo puntúe más títulos, aquí aparecen la favorita, la más polémica y las almas gemelas.</p>
  }
  return <div className="hl-grid" data-count={cards.length}>{cards}</div>
}

/** "Destacados del grupo": the same five cards in a wrapping grid (no carousel, no orphan card). */
export default function Highlights() {
  return (
    <section className="hl-section" aria-labelledby="hl-title">
      <h2 id="hl-title" className="rk-h2">Destacados del grupo</h2>
      <Cards />
    </section>
  )
}
