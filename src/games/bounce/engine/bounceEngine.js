import {
  GRAVITY,
  SLIDER_SEGMENT,
  TAP_IMPULSE,
  TERMINAL_FALL,
} from '../constants/bounceConstants'

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
}

const TAU = Math.PI * 2
const QUADRANT = Math.PI / 2
const SLIDER_WIDTH = SLIDER_SEGMENT * 4

const wrap = (value, span) => ((value % span) + span) % span

/**
 * Which colour is covering the crossing point at time `t`.
 *
 * A ring is entered at the bottom of its circle, world angle -pi/2; its four arcs
 * turn under that point. A slider is a band of four colours sweeping sideways past
 * the shaft's centre line at x = 0.
 */
export function colorAtCrossing(element, t) {
  if (element.kind === 'ring') {
    const local = wrap(-Math.PI / 2 - (element.phase + element.omega * t), TAU)
    return element.colors[Math.floor(local / QUADRANT) % 4]
  }
  if (element.kind === 'slider') {
    const local = wrap(-(element.offset + element.speed * t), SLIDER_WIDTH)
    return element.colors[Math.floor(local / SLIDER_SEGMENT) % 4]
  }
  return null
}

export function createRun(course) {
  return {
    y: 0,
    vy: 0,
    t: 0,
    color: course.startColor,
    checkpointIndex: 0,
    cursor: course.checkpoints[0].crossingIndex,
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
 */
export function stepRun(run, course, { dt, tapped = false } = {}) {
  if (run.status !== 'climbing') return { run, events: [] }

  const events = []
  const { crossings, elements, checkpoints } = course

  let { y, vy, t, color, checkpointIndex, cursor, maxY, cleared, faults } = run
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
          events.push({ type: EVENTS.COLOR_CHANGED, color })
        }
        continue
      }

      const needed = colorAtCrossing(element, at)
      if (needed === color) {
        cleared++
        events.push({ type: EVENTS.GATE_CLEARED, kind: crossing.type })
        continue
      }

      faults++
      events.push({ type: EVENTS.WRONG_COLOR, needed, had: color, index: checkpointIndex })
      resetToCheckpoint()
      break
    }
  } else if (yNext < y0) {
    // Falling passes back through gates freely; only the climb is gated.
    while (cursor > 0 && crossings[cursor - 1].y > yNext) cursor--
  }

  if (status === 'climbing') {
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

  return {
    run: {
      y: yNext,
      vy,
      t,
      color,
      checkpointIndex,
      cursor,
      maxY: Math.max(maxY, yNext),
      cleared,
      faults,
      status,
      finishT,
    },
    events,
  }
}
