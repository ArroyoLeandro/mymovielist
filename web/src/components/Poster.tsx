import { useState } from 'react'

export default function Poster({ url, title, className = '' }: { url: string | null; title: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!url || failed) {
    return <div className={`poster poster-empty ${className}`} aria-label={title}><span>{title.slice(0, 1)}</span></div>
  }
  return (
    <img
      className={`poster ${className}`}
      src={url}
      alt={`Póster de ${title}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}
