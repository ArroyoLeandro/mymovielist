import { useTrailers } from '../queries'

/** YouTube's play-button logo (decorative: the link text names the trailer). */
function YouTubeIcon() {
  return (
    <svg className="yt-icon" viewBox="0 0 24 17" aria-hidden="true" focusable="false">
      <path fill="#ff0033" d="M23.5 2.65A3 3 0 0 0 21.4.53C19.5 0 12 0 12 0S4.5 0 2.6.53A3 3 0 0 0 .5 2.65 31.4 31.4 0 0 0 0 8.5a31.4 31.4 0 0 0 .5 5.85 3 3 0 0 0 2.1 2.12C4.5 17 12 17 12 17s7.5 0 9.4-.53a3 3 0 0 0 2.1-2.12A31.4 31.4 0 0 0 24 8.5a31.4 31.4 0 0 0-.5-5.85Z" />
      <path fill="#fff" d="m9.6 12.14 6.27-3.64L9.6 4.86v7.28Z" />
    </svg>
  )
}

/**
 * Trailer links (YouTube, new tab): the original-language one first ("Tráiler", or "Tráiler (inglés)" when TMDB only
 * has an English one), then the Latin-American Spanish dub. Renders nothing while loading, on errors and without
 * trailers, so the modal never waits for TMDB.
 */
export default function Trailers({ id }: { id: number }) {
  const { data } = useTrailers(id)
  const links: { label: string; key: string; name: string }[] = []
  if (data?.original) links.push({ label: data.original.fallback ? 'Tráiler (inglés)' : 'Tráiler', key: data.original.key, name: data.original.name })
  if (data?.latino) links.push({ label: 'Tráiler latino', key: data.latino.key, name: data.latino.name })
  if (links.length === 0) return null
  return (
    <section className="td-trailers" aria-label="Tráileres">
      <ul>
        {links.map((l) => (
          <li key={l.label}>
            <a
              className="btn btn-ghost td-trailer" href={`https://www.youtube.com/watch?v=${encodeURIComponent(l.key)}`}
              target="_blank" rel="noopener noreferrer" title={l.name || undefined}
            >
              <YouTubeIcon />
              <span>{l.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
