import { useCallback, useEffect, useState } from 'react'
import { createBounceTable } from '../services/bounceTable'
import { roomAt } from '../engine/courseGen'
import { colorAtCrossing } from '../engine/gates'
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

const hudFrom = (run, course) => {
  const box = run.inside !== null && course ? course.elements[run.inside] : null
  return {
    color: run.color,
    checkpointIndex: run.checkpointIndex,
    status: run.status,
    y: run.y,
    maxY: run.maxY,
    t: run.t,
    cleared: run.cleared,
    faults: run.faults,
    finishT: run.finishT,
    /** Which room you are in, so the climb can be talked about. */
    room: course ? roomAt(course, run.y) : null,
    inside: box !== null,
    /**
     * The colour standing between you and the way out of a chamber. It is on the
     * canvas too, but this is the only copy a screen reader will ever get -- and
     * the chamber is the one place on the course where a misread costs a room
     * rather than a moment.
     */
    ceiling: box ? colorAtCrossing(box, run.t) : null,
  }
}

/** Pushes to React only on a change worth re-rendering for. */
function createHudPump(setHud) {
  let signature = ''
  let lastPush = 0
  return (run, course) => {
    if (!run) {
      signature = ''
      setHud(null)
      return
    }
    const now = Date.now()
    const snapshot = hudFrom(run, course)
    const next = [
      snapshot.color,
      snapshot.checkpointIndex,
      snapshot.status,
      snapshot.room,
      snapshot.ceiling,
    ].join('|')
    if (next === signature && now - lastPush < HUD_INTERVAL_MS) return
    signature = next
    lastPush = now
    setHud(snapshot)
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
