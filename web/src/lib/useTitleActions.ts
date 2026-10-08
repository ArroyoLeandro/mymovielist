import { useEffect, useRef, useState } from 'react'
import type { RatingRow } from '../api'
import type { PendingFn, SaveFn } from '../components/TitleCard'

/** Shared watched / score / wishlist handlers for a title, used by the card and its detail modal. */
export function useTitleActions(movieId: number, r: RatingRow | undefined, onSave: SaveFn, onPending: PendingFn) {
  const watched = r?.watched ?? false
  const pending = r?.pending ?? false
  const score = r?.score ?? null
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const fail = () => {
    setFailed(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setFailed(false), 3000)
  }
  return {
    watched, pending, score, failed,
    toggleWatched: () => {
      setFailed(false)
      void onSave(movieId, !watched, null).then((ok) => ok || fail())
    },
    /** Sets the score (1-10) or clears it (null); scoring implies watched. */
    setScore: async (n: number | null) => {
      setFailed(false)
      if (!(await onSave(movieId, true, n))) fail()
    },
    wish: async () => {
      setFailed(false)
      if (!(await onPending(movieId, !pending))) fail()
    },
  }
}
