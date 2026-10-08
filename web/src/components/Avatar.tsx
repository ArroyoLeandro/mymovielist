import type { CSSProperties } from 'react'

/** Stable hue (0-359) per tag, so each friend keeps the same color everywhere. */
export function tagHue(tag: string): number {
  let h = 7
  for (const ch of tag.toLowerCase()) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  return Math.round((h * 137.508) % 360) // golden-angle spread keeps similar tags apart
}

/** First letters of the first two words ("ana_paz", "AnaPaz" -> "AP"), else the first letter. */
export function initials(tag: string): string {
  const words = tag.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s._-]+/).filter(Boolean)
  const letters = words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [tag[0] ?? '?']
  return letters.join('').toUpperCase()
}

/** Initials on a per-user gradient. Decorative: the name is always rendered next to it. Size it with CSS (--av). */
export default function Avatar({ tag, className = '' }: { tag: string; className?: string }) {
  return (
    <span className={`av ${className}`} style={{ '--av-h': tagHue(tag) } as CSSProperties} aria-hidden="true">
      {initials(tag)}
    </span>
  )
}
