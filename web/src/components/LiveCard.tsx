import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, type RatingRow, type StateTitle } from '../api'
import { patchEntry } from '../lib/ratings'
import { patchTitle, settleAfterAction } from '../lib/titleCache'
import TitleCard from './TitleCard'

/**
 * Card for global pages (home, catalog grid, search) where the server returns each title with its state.
 * Edits apply optimistically on top of the server state; once saved, the title's state is patched in place in every
 * cached list (no refetch now: the lists keep their order and membership until the next visit).
 */
export default function LiveCard({ item, me, showStudio = false }: { item: StateTitle; me: string; showStudio?: boolean }) {
  const qc = useQueryClient()
  const [local, setLocal] = useState<RatingRow | null>(null)
  useEffect(() => setLocal(null), [item.state]) // fresh server data (or the in-place patch) wins
  const slug = item.studio.slug

  const onSave = useCallback(async (id: number, watched: boolean, score: number | null) => {
    setLocal((prev) => patchEntry(prev ?? item.state, me, watched, score))
    try {
      const entry = await api.saveEntry(id, watched, score)
      patchTitle(qc, id, (row) => patchEntry(row, me, entry.watched, entry.score), slug)
      settleAfterAction(qc)
      return true
    } catch {
      setLocal(null)
      return false
    }
  }, [item.state, me, qc, slug])

  const onPending = useCallback(async (id: number, pending: boolean) => {
    setLocal((prev) => ({ ...(prev ?? item.state), pending }))
    try {
      await api.setPending(id, pending)
      patchTitle(qc, id, (row) => ({ ...row, pending }), slug)
      settleAfterAction(qc)
      return true
    } catch {
      setLocal(null)
      return false
    }
  }, [item.state, qc, slug])

  return <TitleCard movie={item} r={local ?? item.state} onSave={onSave} onPending={onPending} label={showStudio ? item.studio.name : undefined} studioName={item.studio.name} sectionName={item.section.name} />
}
