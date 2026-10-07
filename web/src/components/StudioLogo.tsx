import { useState } from 'react'

/** Studio logo on a light tile (TMDB logos are often dark on transparent); styled wordmark as fallback. */
export default function StudioLogo({ name, url, className = '' }: { name: string; url: string | null; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!url || failed) {
    return <div className={`logo-tile wordmark ${className}`} aria-label={name}><span>{name}</span></div>
  }
  return (
    <div className={`logo-tile ${className}`}>
      <img src={url} alt={`Logo de ${name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </div>
  )
}
