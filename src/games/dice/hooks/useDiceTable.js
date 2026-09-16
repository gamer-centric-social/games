import { useCallback, useEffect, useState } from 'react'
import { createDiceTable } from '../services/diceTable'
import { snapshotFor } from '../engine/diceEngine'
import { playDiceEvents } from '../utils/diceSounds'

/**
 * React around one table controller. Used as-is for solo, and by useDiceRoom for
 * the online host, which passes `onPublish` to fan snapshots out to clients.
 *
 * The game object lives in the controller, never in React state; what React
 * holds is only this device's view of it.
 */
export default function useDiceTable({ onPublish } = {}) {
  const [view, setView] = useState(null)
  const [notice, setNotice] = useState('')
  const [table] = useState(() =>
    createDiceTable({
      onChange: (game, seatId) => {
        setView(snapshotFor(game, seatId))
        setNotice('')
      },
      onEvents: playDiceEvents,
    })
  )

  useEffect(() => {
    table.setPublisher(onPublish ?? null)
  }, [table, onPublish])

  // Timers must not outlive the screen. (StrictMode's mount/unmount/mount runs
  // before any game is loaded, so this cannot destroy a live table.)
  useEffect(() => () => table.destroy(), [table])

  /** This device's own action. A refused one is said on the status line. */
  const act = useCallback(
    (intent) => {
      const result = table.act(table.localSeatId, intent)
      if (!result.ok) setNotice(result.reason)
      return result
    },
    [table]
  )

  const clear = useCallback(() => {
    table.load(null)
    setView(null)
    setNotice('')
  }, [table])

  return { table, view, notice, setNotice, act, clear }
}
