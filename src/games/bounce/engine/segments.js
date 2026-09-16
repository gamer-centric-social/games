import {
  BALL_RADIUS,
  BAND_COUNT,
  CHAMBER_OMEGA,
  CHAMBER_RADIUS,
  COLORS,
  CORE_OFFSET,
  CORE_PERIOD,
  FIRST_OBSTACLE_Y,
  MIN_ARC_SPAN,
  MIN_CHECKPOINT_SPAN,
  OBSTACLE_GAP,
  PENDULUM_AMP,
  PENDULUM_OMEGA,
  RATCHET_PERIOD,
  RING_OMEGA,
  RING_RADIUS,
  RING_STROKE,
  SHUTTER_AMP,
  SHUTTER_OMEGA,
  SLIDER_SEGMENT,
  SLIDER_SPEED,
} from '../constants/bounceConstants'
import { TAU } from './gates'

/**
 * The rooms a course is built out of.
 *
 * The old generator walked upward sprinkling obstacles at pseudo-random gaps,
 * which is why every part of the climb felt like every other part. This is the
 * fix: a segment is a room with a character -- a gauntlet of rings, a sweep of
 * sliders, one chamber, a breather -- and a course is a stack of them.
 *
 * Every builder is `(rng, { baseY, band }) => { name, height, elements }` with
 * absolute world heights, and pure: the same rng sequence and the same base
 * always lays down the same room. `height` is derived from what was actually
 * placed rather than declared alongside it, so the two cannot disagree.
 *
 * Checkpoints land on the seams between rooms, which is why you never respawn
 * inside a gauntlet and never inside a chamber.
 */

// --- difficulty, quantised to the band so a step up is something you feel -----

const at = (band, range) =>
  range.start + (range.end - range.start) * (BAND_COUNT > 1 ? band / (BAND_COUNT - 1) : 0)

export const ringOmegaAt = (band) => at(band, RING_OMEGA)
export const sliderSpeedAt = (band) => at(band, SLIDER_SPEED)
export const obstacleGapAt = (band) => at(band, OBSTACLE_GAP)
export const pendulumAmpAt = (band) => at(band, PENDULUM_AMP)
export const pendulumOmegaAt = (band) => at(band, PENDULUM_OMEGA)
export const ratchetPeriodAt = (band) => at(band, RATCHET_PERIOD)
export const shutterAmpAt = (band) => at(band, SHUTTER_AMP)
export const shutterOmegaAt = (band) => at(band, SHUTTER_OMEGA)
export const chamberOmegaAt = (band) => at(band, CHAMBER_OMEGA)
export const corePeriodAt = (band) => at(band, CORE_PERIOD)

// --- element builders --------------------------------------------------------

const sign = (rng) => (rng() < 0.5 ? -1 : 1)
const between = (rng, range) => range.min + rng() * (range.max - range.min)

/** A fresh order for a gate's arcs: every gate carries all four colours. */
function shuffledColors(rng) {
  const out = [...COLORS]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * An iris ring: one wide arc and three narrow ones, instead of four quarters.
 *
 * No slice may fall below MIN_ARC_SPAN, which is what keeps the narrowest window
 * on the meanest ring above a reaction time. This is the difficulty knob the
 * first version of the course did not have -- before it, the only way to make a
 * ring harder was to spin it faster.
 */
function irisSpans(rng) {
  const spans = [MIN_ARC_SPAN, MIN_ARC_SPAN, MIN_ARC_SPAN, MIN_ARC_SPAN]
  const spare = 1 - MIN_ARC_SPAN * 4
  const wide = Math.floor(rng() * 4) % 4
  const toWide = spare * (0.6 + rng() * 0.4)
  spans[wide] += toWide
  const each = (spare - toWide) / 3
  for (let i = 0; i < 4; i++) if (i !== wide) spans[i] += each
  return spans
}

/** Rings, pendulums and ratchets are all met at the bottom of their circle. */
const circular = (rng, { crossY, iris }) => {
  const radius = between(rng, RING_RADIUS)
  return {
    y: crossY + radius,
    crossY,
    radius,
    colors: shuffledColors(rng),
    ...(iris ? { spans: irisSpans(rng) } : {}),
  }
}

export const ring = (rng, { crossY, band, iris = false }) => ({
  kind: 'ring',
  ...circular(rng, { crossY, iris }),
  omega: ringOmegaAt(band) * sign(rng),
  phase: rng() * TAU,
})

export const pendulum = (rng, { crossY, band }) => ({
  kind: 'pendulum',
  ...circular(rng, { crossY, iris: false }),
  omega: pendulumOmegaAt(band),
  amp: pendulumAmpAt(band),
  phase: rng() * TAU,
})

export const ratchet = (rng, { crossY, band }) => ({
  kind: 'ratchet',
  ...circular(rng, { crossY, iris: false }),
  period: ratchetPeriodAt(band),
  dir: sign(rng),
  phase: rng() * TAU,
})

export const slider = (rng, { crossY, band }) => ({
  kind: 'slider',
  y: crossY,
  crossY,
  speed: sliderSpeedAt(band) * sign(rng),
  offset: rng() * SLIDER_SEGMENT * 4,
  colors: shuffledColors(rng),
})

export const shutter = (rng, { crossY, band }) => ({
  kind: 'shutter',
  y: crossY,
  crossY,
  amp: shutterAmpAt(band),
  omega: shutterOmegaAt(band),
  offset: rng() * SLIDER_SEGMENT * 4,
  colors: shuffledColors(rng),
})

export const swatch = (crossY, color) => ({ kind: 'swatch', y: crossY, crossY, color })

/**
 * A colour post at a height, of whatever colour the seed says.
 *
 * The assembler gets the last word on the colour: a post that hands you the one
 * you are already holding is a wasted room, and a builder cannot know what you
 * are holding when you arrive.
 */
const colourPost = (rng, crossY) => swatch(crossY, COLORS[Math.floor(rng() * COLORS.length) % COLORS.length])

/**
 * A chamber: the ball rises into it, the floor irises shut, and the only way out
 * is up through the ceiling arc on the colour it is showing.
 *
 * `crossY` is the ball's resting height on the floor rather than the floor's own
 * surface, so entering does not pop the ball upward by a radius. `exitY` is where
 * the ball's top meets the ceiling -- you are stopped when you touch it, not when
 * your centre reaches it.
 */
export function chamber(rng, { bottomY, band }) {
  const radius = between(rng, CHAMBER_RADIUS)
  const wallInner = radius - RING_STROKE / 2
  const centre = bottomY + radius
  const period = corePeriodAt(band)
  return {
    kind: 'chamber',
    y: centre,
    radius,
    crossY: centre - wallInner + BALL_RADIUS,
    exitY: centre + wallInner - BALL_RADIUS,
    omega: chamberOmegaAt(band) * sign(rng),
    phase: rng() * TAU,
    colors: shuffledColors(rng),
    core: {
      y: centre + CORE_OFFSET * radius,
      period,
      phase: rng() * period * 4,
      colors: shuffledColors(rng),
    },
  }
}

// --- rooms -------------------------------------------------------------------

/** The top of an element, for working out where the room above can start. */
const topOf = (element) => (element.radius ? element.y + element.radius : element.crossY)

const room = (name, baseY, elements, tail) => ({
  name,
  elements,
  height: Math.max(
    MIN_CHECKPOINT_SPAN,
    Math.ceil(Math.max(baseY, ...elements.map(topOf)) - baseY + tail)
  ),
})

/**
 * Band 0, and only ever the first room: two slow rings and space to learn the
 * rule. It carries the course's lead-in rather than the assembler holding a
 * separate run-in below the first room -- that way every seam is a room boundary
 * and every checkpoint is a seam, with no stretch of shaft belonging to nothing.
 */
function approach(rng, { baseY, band }) {
  const elements = [
    ring(rng, { crossY: baseY + FIRST_OBSTACLE_Y, band }),
    ring(rng, { crossY: baseY + FIRST_OBSTACLE_Y + 730, band }),
  ]
  return room('The Approach', baseY, elements, 380)
}

/** Rings back to back, tight, no colour changes. Pure rhythm. */
function gauntlet(rng, { baseY, band }) {
  const count = 3 + (rng() < 0.45 ? 1 : 0)
  const gap = obstacleGapAt(band) * 0.82
  const elements = []
  for (let i = 0; i < count; i++) {
    // Above the middle bands some rings iris: one wide arc, three slivers.
    const iris = band >= 2 && rng() < 0.18 + 0.1 * band
    elements.push(ring(rng, { crossY: baseY + 380 + i * gap, band, iris }))
  }
  return room('Gauntlet', baseY, elements, 340)
}

/** Lateral, which reads completely differently from a ring. */
function sweep(rng, { baseY, band }) {
  const count = 2 + (rng() < 0.5 ? 1 : 0)
  const gap = obstacleGapAt(band)
  const elements = []
  for (let i = 0; i < count; i++) {
    const crossY = baseY + 420 + i * gap
    const build = band >= 2 && rng() < 0.45 ? shutter : slider
    elements.push(build(rng, { crossY, band }))
  }
  if (rng() < 0.55) elements.push(colourPost(rng, baseY + 420 + count * gap))
  return room('Sweep', baseY, elements, 380)
}

/** Rings turning against each other with a pendulum caught in the middle. */
function carousel(rng, { baseY, band }) {
  const gap = obstacleGapAt(band) * 0.9
  const first = ring(rng, { crossY: baseY + 400, band })
  const mid = pendulum(rng, { crossY: baseY + 400 + gap, band })
  const last = ring(rng, { crossY: baseY + 400 + gap * 2, band })
  // Counter-rotation is what makes the room read as one object rather than three.
  last.omega = -Math.sign(first.omega) * Math.abs(last.omega)
  const elements = [first, mid, last]
  if (rng() < 0.45) elements.push(colourPost(rng, baseY + 400 + gap * 3))
  return room('Carousel', baseY, elements, 360)
}

/** Snap, hold, snap. Syncopated against a course that is otherwise smooth. */
function ratchetRun(rng, { baseY, band }) {
  const count = 2 + (rng() < 0.5 ? 1 : 0)
  const gap = obstacleGapAt(band) * 0.88
  const elements = []
  for (let i = 0; i < count; i++) {
    elements.push(ratchet(rng, { crossY: baseY + 400 + i * gap, band }))
  }
  const colour = COLORS[Math.floor(rng() * COLORS.length) % COLORS.length]
  elements.push(swatch(baseY + 400 + count * gap, colour))
  return room('Ratchet Run', baseY, elements, 340)
}

/**
 * One chamber, with a run-in below and a colour post above it.
 *
 * The post is not decoration. Inside the chamber your colour is whatever the core
 * last painted you, which the generator cannot know -- so without it, no
 * checkpoint above a chamber could record the colour a respawn should restore.
 * It costs the chamber nothing: the colour you carry out mattered for getting
 * out, which is the whole puzzle.
 */
function chamberRoom(rng, { baseY, band }) {
  const box = chamber(rng, { bottomY: baseY + 330, band })
  const colour = COLORS[Math.floor(rng() * COLORS.length) % COLORS.length]
  const post = swatch(box.y + box.radius + 300, colour)
  return room('The Chamber', baseY, [box, post], 320)
}

/** Open shaft and a colour post. The room that makes the others land. */
function breather(rng, { baseY }) {
  const colour = COLORS[Math.floor(rng() * COLORS.length) % COLORS.length]
  return room('Breather', baseY, [swatch(baseY + 460, colour)], 460)
}

export const ROOMS = {
  approach,
  gauntlet,
  sweep,
  carousel,
  ratchetRun,
  chamber: chamberRoom,
  breather,
}

/**
 * Rooms that ask something of you. Two of these in a row is plenty; the assembler
 * forces a breather after that, so pacing is designed rather than hoped for.
 */
export const INTENSE = new Set(['gauntlet', 'carousel', 'ratchetRun', 'chamber'])

/**
 * What each band may draw from, and how often.
 *
 * Weighted rather than uniform, which is not a detail: with a flat pick the
 * breather -- the shortest room and the one with nothing in it -- came up as
 * often as anything else and courses ran three of them together. It is a pacing
 * device, so it is rare here and mostly arrives through the forced rule instead.
 * The chamber is weighted up for the opposite reason: it is the thing this course
 * is built around, and a seed that never showed one would be a worse course.
 */
const POOLS = [
  { gauntlet: 4, sweep: 3, breather: 2 },
  { gauntlet: 4, sweep: 3, carousel: 3, breather: 2 },
  { gauntlet: 3, sweep: 3, carousel: 3, chamber: 3, breather: 2 },
  { gauntlet: 3, sweep: 3, carousel: 3, ratchetRun: 3, chamber: 3, breather: 2 },
  { gauntlet: 3, sweep: 2, carousel: 3, ratchetRun: 4, chamber: 3 },
]

export const poolFor = (band) => POOLS[Math.min(POOLS.length - 1, Math.max(0, band))]

/**
 * Choose a room, refusing any name in `exclude`.
 *
 * Consumes exactly one number from the sequence whatever it picks, so an
 * exclusion changes which room you get and never shifts the rest of the course.
 */
export function pickRoom(rng, band, exclude = []) {
  const barred = new Set(exclude)
  const entries = Object.entries(poolFor(band)).filter(([name]) => !barred.has(name))
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = rng() * total
  for (const [name, weight] of entries) {
    roll -= weight
    if (roll < 0) return name
  }
  return entries.at(-1)[0]
}
