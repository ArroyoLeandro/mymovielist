import { createContext, useContext } from 'react'
import type { ProviderInfo, ProviderRef, ProviderStat, ProviderType } from '../api'
import { useProviders } from '../queries'

/** Filter value for the offer type: '' = any type. "flatrate" also matches free and ads (same as the API). */
export type PType = '' | 'flatrate' | 'rent' | 'buy'
export const PTYPES: [PType, string][] = [
  ['', 'Cualquiera'],
  ['flatrate', 'Suscripción'],
  ['rent', 'Alquiler'],
  ['buy', 'Compra'],
]
export const parsePType = (v: string | null): PType => (v === 'flatrate' || v === 'rent' || v === 'buy' ? v : '')

export const TYPE_LABEL: Record<ProviderType, string> = {
  flatrate: 'Suscripción',
  free: 'Gratis',
  ads: 'Gratis con anuncios',
  rent: 'Alquiler',
  buy: 'Compra',
}
export const isSubscription = (t: ProviderType) => t === 'flatrate' || t === 'free' || t === 'ads'
export const isFree = (t: ProviderType) => t === 'free' || t === 'ads'

/** Whether one offer type satisfies the type filter. */
export const matchesType = (t: ProviderType, want: PType) =>
  want === '' || (want === 'flatrate' ? isSubscription(t) : t === want)

/** Title passes the platform filter: any selected provider offers it with the wanted type. */
export const matchesProviders = (refs: ProviderRef[] | undefined, ids: ReadonlySet<number>, want: PType) =>
  ids.size === 0 || (refs ?? []).some((p) => ids.has(p.id) && matchesType(p.type, want))

/** Comma list in the URL (provider=8,337) to ids, dropping junk. */
export const parseIds = (v: string | null): number[] =>
  [...new Set((v ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))]

/** Per-page dictionary (the studio catalog ships its own); falls back to the global /api/providers list. */
export const ProviderDictContext = createContext<Map<number, ProviderInfo> | null>(null)

const globalMaps = new WeakMap<ProviderStat[], Map<number, ProviderInfo>>()
const toMap = (list: ProviderStat[]) => {
  let m = globalMaps.get(list)
  if (!m) {
    m = new Map(list.map((p) => [p.id, { name: p.name, logoUrl: p.logoUrl }]))
    globalMaps.set(list, m)
  }
  return m
}

/** Name and logo lookup by provider id. */
export function useProviderLookup(): (id: number) => ProviderInfo | undefined {
  const local = useContext(ProviderDictContext)
  const { data } = useProviders()
  const global = data ? toMap(data) : undefined
  return (id) => local?.get(id) ?? global?.get(id)
}
