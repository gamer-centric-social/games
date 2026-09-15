import {
  CORE_RADIUS,
  RATCHET_DWELL,
  SLIDER_SEGMENT,
} from '../constants/bounceConstants'

/**
 * What every gate has in common.
 *
 * A gate is one idea: a height, and a function from time to the colour covering
 * the point where the ball will cross it. A ring turns, a pendulum swings, a
 * ratchet snaps and holds, a slider sweeps, a shutter sweeps and comes back --
 * they are five spellings of that one function, which is why adding a rhythm
 * costs a case here and nothing anywhere else.
 *
 * **The engine and the renderer both read this module, and that is the point.**
 * A gate drawn in a position the engine does not agree with is the worst bug
 * available in this game -- you would lose a race to a ring that was somewhere
 * else on your screen than in the rules. Two implementations would drift, so
 * there is one, exactly as utils/colorGlyphs.js is one set of paths for canvas
 * and DOM both.
 *
 * Pure throughout: no clock, no randomness, no state. Everything takes the run's
 * own `t`, so a replayed run draws and resolves identically.
 */

export const TAU = Math.PI * 2
const QUADRANT = Math.PI / 2
const SLIDER_WIDTH = SLIDER_SEGMENT * 4

/** A ring is met at the bottom of its circle; a chamber is escaped at the top. */
export const BOTTOM = -Math.PI / 2
export const TOP = Math.PI / 2

/** The kinds the ball passes through in one instant, as against a chamber. */
export const GATE_KINDS = new Set(['ring', 'pendulum', 'ratchet', 'slider', 'shutter'])
/** Kinds drawn as a circle of arcs. */
export const ARC_KINDS = new Set(['ring', 'pendulum', 'ratchet', 'chamber'])
/** Kinds drawn as a band sweeping across the shaft. */
export const BAND_KINDS = new Set(['slider', 'shutter'])

const EQUAL_SPANS = [0.25, 0.25, 0.25, 0.25]

const wrap = (value, span) => ((value % span) + span) % span
const smoothstep = (x) => x * x * (3 - 2 * x)

export const spansOf = (element) => element.spans ?? EQUAL_SPANS

/**
 * How far a circular gate has turned by time `t`.
 *
 * Note the ratchet eases across the first slice of each period rather than
 * teleporting a quarter turn. The ease is here, not in the renderer, so what you
 * watch turning is exactly what the engine will test you against.
 */
export function angleAt(element, t) {
  switch (element.kind) {
    case 'pendulum':
      return element.phase + element.amp * Math.sin(element.omega * t)
    case 'ratchet': {
      const u = t / element.period
      const step = Math.floor(u)
      const turned = smoothstep(Math.min(1, (u - step) / RATCHET_DWELL))
      return element.phase + element.dir * QUADRANT * (step + turned)
    }
    default:
      // ring and chamber: steady rotation.
      return element.phase + element.omega * t
  }
}

/** How far a sweeping gate has slid by time `t`. */
export function offsetAt(element, t) {
  return element.kind === 'shutter'
    ? element.offset + element.amp * Math.sin(element.omega * t)
    : element.offset + element.speed * t
}

/** Which arc covers a local angle, honouring an iris ring's uneven spans. */
export function arcIndexAt(local, spans = EQUAL_SPANS) {
  const a = wrap(local, TAU)
  let edge = 0
  for (let i = 0; i < spans.length; i++) {
    edge += spans[i] * TAU
    if (a < edge) return i
  }
  return spans.length - 1
}

/** The colour covering a world angle on a circular gate at time `t`. */
export function arcColorAt(element, t, worldAngle) {
  return element.colors[arcIndexAt(worldAngle - angleAt(element, t), spansOf(element))]
}

/**
 * The arcs of a circular gate at time `t`, as world angles. The renderer walks
 * this so it cannot disagree with arcColorAt about where an arc begins.
 */
export function arcsAt(element, t) {
  const theta = angleAt(element, t)
  const spans = spansOf(element)
  const out = []
  let from = theta
  for (let i = 0; i < spans.length; i++) {
    const to = from + spans[i] * TAU
    out.push({ color: element.colors[i], from, to })
    from = to
  }
  return out
}

/**
 * The colour standing between the ball and the other side, at time `t`.
 *
 * For a chamber this is the ceiling, which is the only part of it that is a gate
 * at all -- the floor irises shut behind you and is never tested.
 */
export function colorAtCrossing(element, t) {
  switch (element.kind) {
    case 'ring':
    case 'pendulum':
    case 'ratchet':
      return arcColorAt(element, t, BOTTOM)
    case 'chamber':
      return arcColorAt(element, t, TOP)
    case 'slider':
    case 'shutter': {
      const local = wrap(-offsetAt(element, t), SLIDER_WIDTH)
      return element.colors[Math.floor(local / SLIDER_SEGMENT) % 4]
    }
    default:
      return null
  }
}

/** Which colour a chamber's core is showing at time `t`. */
export function coreColorAt(core, t) {
  return core.colors[Math.floor(wrap((t + core.phase) / core.period, 4))]
}

/** Whether the ball at height `y` is touching a chamber's core. */
export const touchingCore = (core, y, ballRadius) => Math.abs(y - core.y) <= CORE_RADIUS + ballRadius

/**
 * The narrowest slot this gate ever gives any one colour, in seconds.
 *
 * The generator is held to MIN_GATE_WINDOW_SECONDS by this, and courseGen.test.js
 * checks every gate on every seed against it. A gate with a slot thinner than a
 * person can react to is not difficulty, it is a coin flip -- and a coin flip on
 * a course where the penalty is a checkpoint is just an unfair race.
 *
 * Where a gate's speed varies over its cycle, this reports the worst instant:
 * a pendulum through the middle of its swing, not the long hesitation at the
 * ends. Under-reporting is the safe direction to be wrong in.
 */
export function windowSeconds(element) {
  const narrowest = Math.min(...spansOf(element)) * TAU
  switch (element.kind) {
    case 'ring':
    case 'chamber':
      return narrowest / Math.abs(element.omega)
    case 'pendulum':
      return narrowest / (element.amp * Math.abs(element.omega))
    case 'ratchet':
      return element.period * (1 - RATCHET_DWELL)
    case 'slider':
      return SLIDER_SEGMENT / Math.abs(element.speed)
    case 'shutter':
      return SLIDER_SEGMENT / (element.amp * Math.abs(element.omega))
    default:
      return Infinity
  }
}
