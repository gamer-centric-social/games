import { useCallback, useEffect, useState } from 'react'
import { createBounceTable } from '../services/bounceTable'
import { playBounceEvents } from '../utils/bounceSounds'

/**
 * React glue for one climb, used by solo and by the online player alike.
 *
 * The canvas reads the table directly every frame, so React is deliberately not
 * told about the ball sixty times a second. What it gets is the slow part -- the
 * colour being held, the checkpoint, the height -- pushed when something that
 * matters changes, or ten times a second, whichever comes first.
 *
 * The throttle's own state lives in a closure rather than in refs. Refs would
 * have to be read while rendering to build the table, which is exactly what they
 * are not for.
 */
const HUD_INTERVAL_MS = 100

const hudFrom = (run) => ({
  color: run.color,
  checkpointIndex: run.checkpointIndex,
  status: run.status,
  y: run.y,
  maxY: run.maxY,
  t: run.t,
  cleared: run.cleared,
  faults: run.faults,
  finishT: run.finishT,
})

/** Pushes to React only on a change worth re-rendering for. */
function createHudPump(setHud) {
  let signature = ''
  let lastPush = 0
  return (run) => {
    if (!run) {
      signature = ''
      setHud(null)
      return
    }
    const now = Date.now()
    const next = `${run.color}|${run.checkpointIndex}|${run.status}`
    if (next === signature && now - lastPush < HUD_INTERVAL_MS) return
    signature = next
    lastPush = now
    setHud(hudFrom(run))
  }
}

export default function useBounceTable({ onReport, onFinish } = {}) {
  const [hud, setHud] = useState(null)

  const [table] = useState(() =>
    createBounceTable({
      onEvents: playBounceEvents,
      onChange: createHudPump(setHud),
    })
  )

  // The table keeps one mutable bag of handlers, so the latest callbacks reach it
  // without rebuilding it -- and without a ref read during render.
  useEffect(() => {
    table.setHandlers({ onReport, onFinish })
  }, [table, onReport, onFinish])

  const load = useCallback((seed) => table.load(seed), [table])
  const clear = useCallback(() => table.clear(), [table])
  const tap = useCallback(() => table.tap(), [table])
  const advance = useCallback((now) => table.advance(now), [table])

  return { table, hud, load, clear, tap, advance }
}
