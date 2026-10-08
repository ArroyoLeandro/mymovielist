import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, type RatingRow, type StateTitle } from '../api'
import { patchEntry } from '../lib/ratings'
import { DYNAMIC_KEYS } from '../queries'
import TitleCard from './TitleCard'

/**
 * Card for global pages (home, catalog grid, search) where the server returns each title with its state.
 * Edits apply optimistically on top of the server state and the page's queries are refetched afterwards.
 */
export default function LiveCard({ item, me, showStudio = false }: { item: StateTitle; me: string; showStudio?: boolean }) {
  const qc = useQueryClient()
  const [local, setLocal] = useState<RatingRow | null>(null)
  useEffect(() => setLocal(null), [item.state]) // fresh server data wins

  const refresh = useCallback(() => {
    DYNAMIC_KEYS.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }))
  }, [qc])

  const onSave = useCallback(async (id: number, watched: boolean, score: number | null) => {
    setLocal((prev) => patchEntry(prev ?? item.state, me, watched, score))
    try {
      await api.saveEntry(id, watched, score)
      refresh()
      return true
    } catch {
      setLocal(null)
      return false
    }
  }, [item.state, me, refresh])

  const onPending = useCallback(async (id: number, pending: boolean) => {
    setLocal((prev) => ({ ...(prev ?? item.state), pending }))
    try {
      await api.setPending(id, pending)
      refresh()
      return true
    } catch {
      setLocal(null)
      return false
    }
  }, [item.state, refresh])

  return <TitleCard movie={item} r={local ?? item.state} me={me} onSave={onSave} onPending={onPending} label={showStudio ? item.studio.name : undefined} />
}
