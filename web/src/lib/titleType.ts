import type { TitleSummary } from '../api'

export type TitleKind = 'anim' | 'live' | 'series'

/**
 * Type label shown on cards, rows and the detail: "Animada" / "Acción real" for movies, "Serie" / "Serie animada"
 * for series, so a remake and its original (same Spanish title) read as different titles. `animated` is null until
 * the importer has seen the title: a movie then gets no label, a series plain "Serie".
 */
export function titleType(m: Pick<TitleSummary, 'mediaType' | 'animated'>): { kind: TitleKind; label: string } | null {
  if (m.mediaType === 'series') return { kind: 'series', label: m.animated ? 'Serie animada' : 'Serie' }
  if (m.animated == null) return null
  return m.animated ? { kind: 'anim', label: 'Animada' } : { kind: 'live', label: 'Acción real' }
}
