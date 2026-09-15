import { buildCourse } from '../engine/courseGen'
import { createRun, stepRun } from '../engine/bounceEngine'
import { FIXED_DT, MAX_FRAME_SECONDS, PROGRESS_INTERVAL_MS } from '../constants/bounceConstants'

/**
 * The table: the one thing that drives a climb, for solo and online alike.
 *
 * It owns the course, the local ball and the fixed-timestep accumulator, and
 * reports what happened through callbacks -- sound, HUD and the progress packets
 * the host validates.
 *
 * It only ever runs the player's own ball. That is the whole networking model:
 * balls never interact, so nobody needs to simulate anybody else, and a tap moves
 * the ball on the same frame it was made rather than a round trip later.
 *
 * Time arrives through advance(nowMs) rather than a timer of its own, so a test
 * can run an entire race in a plain loop with no fake clock -- the gap UNO's
 * useUnoAiGame.js has, closed rather than worked around.
 */

/** Never step more of a backlog than the accumulator is allowed to hold. */
const MAX_SUBSTEPS = Math.ceil(MAX_FRAME_SECONDS / FIXED_DT)
/** A short queue, so a dropped frame keeps your taps but a stutter cannot bank them. */
const MAX_QUEUED_TAPS = 2

export function createBounceTable({
  onChange,
  onEvents,
  onReport,
  onFinish,
  reportIntervalMs = PROGRESS_INTERVAL_MS,
} = {}) {
  /**
   * Held in one mutable bag rather than captured, so a React caller can refresh
   * them from an effect instead of keeping a ref it would have to read during
   * render.
   */
  const handlers = { onChange, onEvents, onReport, onFinish }
  let course = null
  let run = null
  let accumulator = 0
  let lastNow = null
  let queuedTaps = 0
  let lastReportAt = null
  let finishSent = false

  const publish = () => handlers.onChange?.(run, course)

  function report(nowMs) {
    lastReportAt = nowMs
    handlers.onReport?.({ y: run.y, checkpointIndex: run.checkpointIndex })
  }

  return {
    /** Swap in fresh callbacks without rebuilding the table under a live climb. */
    setHandlers(next) {
      Object.assign(handlers, next)
    },

    get course() {
      return course
    },
    get run() {
      return run
    },

    /** Build the course from the host's seed and put a fresh ball on the floor. */
    load(seed) {
      course = buildCourse(seed)
      run = createRun(course)
      accumulator = 0
      lastNow = null
      queuedTaps = 0
      lastReportAt = null
      finishSent = false
      publish()
    },

    tap() {
      if (run?.status !== 'climbing') return
      queuedTaps = Math.min(queuedTaps + 1, MAX_QUEUED_TAPS)
    },

    /**
     * Step real time forward.
     *
     * The first call only sets the clock: there is no elapsed time yet, and
     * treating the timestamp itself as a delta would launch the ball. Frames are
     * clamped, so a tab that was in the background resumes where it left off
     * instead of teleporting to wherever a minute of gravity would have put it.
     */
    advance(nowMs) {
      if (!course || !run) return
      if (lastNow === null) {
        lastNow = nowMs
        lastReportAt = nowMs
        return
      }

      const frame = Math.min(Math.max((nowMs - lastNow) / 1000, 0), MAX_FRAME_SECONDS)
      lastNow = nowMs
      if (run.status !== 'climbing') return

      accumulator += frame
      const events = []
      let steps = 0

      while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
        const tapped = queuedTaps > 0
        if (tapped) queuedTaps--
        const out = stepRun(run, course, { dt: FIXED_DT, tapped })
        run = out.run
        if (out.events.length > 0) events.push(...out.events)
        accumulator -= FIXED_DT
        steps++
        if (run.status !== 'climbing') break
      }

      // Whatever we could not step is dropped rather than owed: catching up on a
      // long backlog would run the ball through gates the player never saw.
      if (steps >= MAX_SUBSTEPS) accumulator = 0

      if (events.length > 0) handlers.onEvents?.(events, run, course)
      publish()

      if (run.status === 'finished') {
        if (!finishSent) {
          finishSent = true
          // Report before claiming the line: the host only believes a finish that
          // a live climb backs up.
          report(nowMs)
          handlers.onFinish?.(run)
        }
        return
      }

      if (lastReportAt === null || nowMs - lastReportAt >= reportIntervalMs) report(nowMs)
    },

    /** Ask for the finish to be sent again, after the host refused a first try. */
    resendFinish(nowMs) {
      if (run?.status !== 'finished') return false
      report(nowMs)
      handlers.onFinish?.(run)
      return true
    },

    clear() {
      course = null
      run = null
      accumulator = 0
      lastNow = null
      queuedTaps = 0
      lastReportAt = null
      finishSent = false
      publish()
    },
  }
}
