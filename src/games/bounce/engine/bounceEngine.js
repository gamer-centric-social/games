import {
  BALL_RADIUS,
  GRAVITY,
  TAP_IMPULSE,
  TERMINAL_FALL,
} from '../constants/bounceConstants'
import { colorAtCrossing, coreColorAt, touchingCore } from './gates'

/**
 * One player's climb. Pure: no React, no clock, no randomness -- the course is
 * already decided, so the same run stepped with the same taps always lands in the
 * same place. That is what lets a test drive a whole race in a loop.
 *
 * The caller turns the returned events into sound, HUD and network traffic.
 */

export const EVENTS = {
  TAP: 'TAP',
  GATE_CLEARED: 'GATE_CLEARED',
  COLOR_CHANGED: 'COLOR_CHANGED',
  CHECKPOINT: 'CHECKPOINT',
  WRONG_COLOR: 'WRONG_COLOR',
  FELL: 'FELL',
  FINISHED: 'FINISHED',
  ENTERED_CHAMBER: 'ENTERED_CHAMBER',
}

export function createRun(course) {
  return {
    y: 0,
    vy: 0,
    t: 0,
    color: course.startColor,
    checkpointIndex: 0,
    cursor: course.checkpoints[0].crossingIndex,
    /** Which chamber is holding you, or null out in the open shaft. */
    inside: null,
    maxY: 0,
    cleared: 0,
    faults: 0,
    status: 'climbing',
    finishT: null,
  }
}

export const runProgress = (run, course) => Math.min(1, Math.max(0, run.maxY / course.height))

/**
 * Advance one fixed step.
 *
 * Crossings are resolved as plane crossings, not containment tests: at terminal
 * velocity the ball covers more ground in a step than a ring outline is thick, so
 * "is the ball inside the arc right now" would tunnel straight through. Instead we
 * walk every crossing between the old and new height, and evaluate each at the
 * moment the ball actually reached it.
 *
 * A chamber is the one thing on the course you are *inside* rather than *past*,
 * and it bends that rule in a way worth being precise about. Its lip is crossed
 * once and is not a gate at all. Its ceiling is a gate, and is evaluated on every
 * upward approach -- never skipped, never twice in one approach -- because you
 * may rise at it, think better of it, and drop back to the floor as often as you
 * like. Its core is neither: that is an overlap test, which is only safe because
 * the core is thick. A gate outline is not, which is why gates stay plane
 * crossings and this comment exists.
 */
export function stepRun(run, course, { dt, tapped = false } = {}) {
  if (run.status !== 'climbing') return { run, events: [] }

  const events = []
  const { crossings, elements, checkpoints } = course

  let { y, vy, t, color, checkpointIndex, cursor, inside, maxY, cleared, faults } = run
  let status = 'climbing'
  let finishT = run.finishT

  if (tapped) {
    vy = TAP_IMPULSE
    events.push({ type: EVENTS.TAP })
  }

  vy = Math.max(vy - GRAVITY * dt, -TERMINAL_FALL)

  const t0 = t
  const y0 = y
  t = t0 + dt
  let yNext = y0 + vy * dt

  const resetToCheckpoint = () => {
    const cp = checkpoints[checkpointIndex]
    yNext = cp.y
    vy = 0
    color = cp.color
    cursor = cp.crossingIndex
    inside = null
  }

  if (yNext > y0) {
    while (cursor < crossings.length && crossings[cursor].y <= yNext) {
      const crossing = crossings[cursor]
      // When, inside this step, the ball actually reached that height.
      const at = t0 + ((crossing.y - y0) / (yNext - y0)) * dt
      cursor++

      if (crossing.type === 'checkpoint') {
        if (crossing.elementIndex > checkpointIndex) {
          checkpointIndex = crossing.elementIndex
          events.push({ type: EVENTS.CHECKPOINT, index: checkpointIndex })
        }
        continue
      }

      if (crossing.type === 'finish') {
        status = 'finished'
        finishT = at
        events.push({ type: EVENTS.FINISHED, t: at })
        break
      }

      const element = elements[crossing.elementIndex]

      if (crossing.type === 'swatch') {
        if (element.color !== color) {
          color = element.color
          events.push({ type: EVENTS.COLOR_CHANGED, color, from: 'swatch' })
        }
        continue
      }

      if (crossing.type === 'chamber-entry') {
        // The lip is not a gate. You rise through it and it shuts behind you --
        // which is what makes the chamber floor somewhere you can stand and read
        // the ceiling, and so what makes the ceiling a decision rather than an
        // accident.
        inside = crossing.elementIndex
        events.push({ type: EVENTS.ENTERED_CHAMBER, index: crossing.elementIndex })
        continue
      }

      const needed = colorAtCrossing(element, at)
      if (needed === color) {
        cleared++
        if (crossing.type === 'chamber-exit') inside = null
        events.push({ type: EVENTS.GATE_CLEARED, kind: crossing.type })
        continue
      }

      faults++
      events.push({
        type: EVENTS.WRONG_COLOR,
        needed,
        had: color,
        index: checkpointIndex,
        kind: crossing.type,
      })
      resetToCheckpoint()
      break
    }
  } else if (yNext < y0) {
    // Falling passes back through gates freely; only the climb is gated. But a
    // chamber is a room, not a gate, and it is solid in both directions: drop
    // back through the ceiling you just left and you are in it again, standing on
    // the same floor. Anything else would mean a floor you were resting on a
    // moment ago had quietly become air.
    while (cursor > 0 && crossings[cursor - 1].y > yNext) {
      const back = crossings[cursor - 1]
      if (back.type === 'chamber-exit' && inside === null) {
        inside = back.elementIndex
        events.push({ type: EVENTS.ENTERED_CHAMBER, index: inside, fell: true })
      }
      // The floor catches you before you could ever un-cross the lip.
      if (back.type === 'chamber-entry' && inside === back.elementIndex) break
      cursor--
    }
    if (inside !== null) {
      const floorY = elements[inside].crossY
      if (yNext < floorY) {
        yNext = floorY
        if (vy < 0) vy = 0
      }
    }
  }

  if (status === 'climbing' && inside === null) {
    const floor = checkpoints[checkpointIndex].y
    if (yNext < floor) {
      // Resting on the checkpoint is not falling off it: only report a real drop,
      // or the very first step would emit one every frame.
      if (y0 > floor + 1) {
        events.push({ type: EVENTS.FELL, index: checkpointIndex })
        resetToCheckpoint()
      } else {
        yNext = floor
        if (vy < 0) vy = 0
      }
    }
  }

  // The core paints you for as long as you are touching it, so hovering in it and
  // waiting for the colour you want is the intended move rather than an exploit.
  if (status === 'climbing' && inside !== null) {
    const { core } = elements[inside]
    if (core && touchingCore(core, yNext, BALL_RADIUS)) {
      const painted = coreColorAt(core, t)
      if (painted !== color) {
        color = painted
        events.push({ type: EVENTS.COLOR_CHANGED, color, from: 'core' })
      }
    }
  }

  return {
    run: {
      y: yNext,
      vy,
      t,
      color,
      checkpointIndex,
      cursor,
      inside,
      maxY: Math.max(maxY, yNext),
      cleared,
      faults,
      status,
      finishT,
    },
    events,
  }
}
