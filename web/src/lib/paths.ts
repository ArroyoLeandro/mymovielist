/** App routes built in more than one place. API paths live in api.ts and are not routes. */

/** Path prefix of a studio's catalog page (`/estudio/:slug`). Old `/studio/:slug` and `/studios/:slug` redirect here. */
export const STUDIO_PREFIX = '/estudio/'

/** A studio's catalog page, with an optional query (`{ t: '12' }` opens and flashes a title, `{ tab: 'sagas', saga }`). */
export const studioPath = (slug: string, query?: Record<string, string>) => {
  const q = query ? new URLSearchParams(query).toString() : ''
  return `${STUDIO_PREFIX}${encodeURIComponent(slug)}${q ? `?${q}` : ''}`
}

/** A title inside its studio's catalog page: the page scrolls to it and flashes it. */
export const titleLink = (studioSlug: string, id: number) => studioPath(studioSlug, { t: String(id) })
