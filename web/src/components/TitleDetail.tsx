import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { ProviderInfo, RatingRow } from '../api'
import { useAuth } from '../auth'
import { ProviderDictContext } from '../lib/providers'
import { blankRow, patchEntry } from '../lib/ratings'
import RecommendModal from './RecommendModal'
import TitleModal from './TitleModal'
import type { CardMovie, PendingFn, SaveFn } from './TitleCard'

/** What the opening card keeps up to date while it is mounted. */
export interface DetailLive { r: RatingRow | undefined; onSave: SaveFn; onPending: PendingFn }
export interface DetailRequest extends DetailLive {
  movie: CardMovie
  studioName?: string
  sectionName?: string
  /** The opening page's provider dictionary (the studio page ships its own). */
  dict: Map<number, ProviderInfo> | null
  /** Called when the detail closes (or another one replaces it). */
  onClosed: () => void
}
interface DetailApi {
  /** Opens the detail; returns the token the card uses to push updates. */
  open: (d: DetailRequest) => number
  update: (token: number, live: DetailLive) => void
}

const DetailContext = createContext<DetailApi | null>(null)

export function useTitleDetail(): DetailApi {
  const ctx = useContext(DetailContext)
  if (!ctx) throw new Error('useTitleDetail needs a TitleDetailProvider')
  return ctx
}

/**
 * Hosts the title detail modal above the pages, so it stays open when its card leaves the list behind it (a filter,
 * a refetch). The card hands over a snapshot and keeps `r`/handlers fresh while it is mounted; once it is gone, the
 * modal applies its own edits optimistically so it still shows the new state. A navigation closes it.
 */
export function TitleDetailProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const me = user?.tag ?? ''
  const [cur, setCur] = useState<(DetailRequest & { token: number }) | null>(null)
  const [own, setOwn] = useState<RatingRow | null>(null)
  const [recommending, setRecommending] = useState(false)
  const seq = useRef(0)
  const curRef = useRef(cur)
  curRef.current = cur

  const api = useMemo<DetailApi>(() => ({
    open: (d) => {
      curRef.current?.onClosed()
      const token = ++seq.current
      setOwn(null)
      setRecommending(false)
      setCur({ ...d, token })
      return token
    },
    update: (token, live) => setCur((c) => (c && c.token === token ? { ...c, ...live } : c)),
  }), [])

  const close = useCallback(() => {
    const c = curRef.current
    setCur(null)
    setRecommending(false)
    c?.onClosed()
  }, [])

  const { key } = useLocation()
  useEffect(() => {
    if (curRef.current) close()
  }, [key, close])

  // Fresh state from the card wins over the modal's own optimistic copy.
  const live = cur?.r
  useEffect(() => setOwn(null), [live])

  const r = own ?? live
  const rRef = useRef(r)
  rRef.current = r
  const onSave = useCallback<SaveFn>(async (id, watched, score) => {
    const c = curRef.current
    if (!c) return false
    setOwn(patchEntry(rRef.current ?? blankRow(id), me, watched, score))
    const ok = await c.onSave(id, watched, score)
    if (!ok) setOwn(null)
    return ok
  }, [me])
  const onPending = useCallback<PendingFn>(async (id, pending) => {
    const c = curRef.current
    if (!c) return false
    setOwn({ ...(rRef.current ?? blankRow(id)), pending })
    const ok = await c.onPending(id, pending)
    if (!ok) setOwn(null)
    return ok
  }, [])

  return (
    <DetailContext.Provider value={api}>
      {children}
      {cur && (
        <ProviderDictContext.Provider value={cur.dict}>
          <TitleModal
            key={cur.token}
            movie={cur.movie} r={r} me={me} onSave={onSave} onPending={onPending}
            studioName={cur.studioName} sectionName={cur.sectionName}
            paused={recommending} onRecommend={() => setRecommending(true)} onClose={close}
          />
          {recommending && <RecommendModal movieId={cur.movie.id} title={cur.movie.title} onClose={() => setRecommending(false)} />}
        </ProviderDictContext.Provider>
      )}
    </DetailContext.Provider>
  )
}
