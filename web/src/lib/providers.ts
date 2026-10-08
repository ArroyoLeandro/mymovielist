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

/* ---------- platform homepages ----------
   TMDB gives no homepage, so the providers the catalog uses (GET /providers?used=1) map to their own site,
   Argentine domain when there is one. Store/channel variants open the store that sells them. */
const PRIME = 'https://www.primevideo.com'
const APPLE = 'https://tv.apple.com'
const HOMES: [ids: number[], names: string[], url: string][] = [
  [[8], ['Netflix'], 'https://www.netflix.com'],
  [[337], ['Disney Plus', 'Disney+'], 'https://www.disneyplus.com'],
  [[1899, 384], ['HBO Max', 'Max'], 'https://www.hbomax.com'],
  [[119, 10, 9], ['Amazon Prime Video', 'Amazon Video', 'Prime Video'], PRIME],
  [[2, 350], ['Apple TV Store', 'Apple TV', 'Apple TV Plus', 'Apple TV+'], APPLE],
  [[3], ['Google Play Movies'], 'https://play.google.com/store/movies'],
  [[283], ['Crunchyroll'], 'https://www.crunchyroll.com'],
  [[339], ['MovistarTV', 'Movistar TV', 'Movistar Play'], 'https://www.movistar.com.ar'],
  [[167], ['Claro video'], 'https://www.clarovideo.com'],
  [[531], ['Paramount Plus', 'Paramount+'], 'https://www.paramountplus.com/ar/'],
  [[2302], ['Mercado Play'], 'https://play.mercadolibre.com.ar'],
  [[300], ['Pluto TV'], 'https://pluto.tv'],
  [[457], ['VIX', 'ViX Premium'], 'https://vix.com'],
  [[467], ['DIRECTV GO', 'DGO'], 'https://www.directvgo.com'],
  [[11], ['MUBI'], 'https://mubi.com'],
  [[538], ['Plex'], 'https://www.plex.tv'],
  [[575], ['OnDemandKorea'], 'https://www.ondemandkorea.com'],
  [[1875], ['Runtime'], 'https://www.runtime.tv'],
  [[2285], ['JustWatch TV'], 'https://www.justwatch.com/ar'],
  [[692], ['Cultpix'], 'https://www.cultpix.com'],
  [[1715], ['Shahid VIP'], 'https://shahid.mbc.net'],
  [[2623], ['Artiflix'], 'https://artiflix.com'],
  [[1889, 2161, 2358, 1866, 2356, 1968, 2167, 2106, 582, 201, 683, 2141], [], PRIME],
  [[2142, 2107], [], APPLE],
]
/** Lowercase, no accents, letters and digits only: "Disney+" and "disney plus" stay distinct, "ViX" = "VIX". */
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9+]/g, '')
const HOME_BY_ID = new Map(HOMES.flatMap(([ids, , url]) => ids.map((id) => [id, url] as const)))
const HOME_BY_NAME = new Map(HOMES.flatMap(([, names, url]) => names.map((n) => [norm(n), url] as const)))

/** The platform's own homepage (not the title's page): by TMDB id, then by name; null when unknown. */
export function providerHome(id: number, name?: string): string | null {
  const byId = HOME_BY_ID.get(id)
  if (byId) return byId
  if (!name) return null
  const n = norm(name)
  if (n.endsWith('amazonchannel')) return PRIME
  if (n.endsWith('appletvchannel')) return APPLE
  return HOME_BY_NAME.get(n) ?? null
}
