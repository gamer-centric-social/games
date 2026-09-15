import { createSeededRng } from '../../../utils/rng'
import {
  BAND_COUNT,
  CHECKPOINT_SPAN,
  COLORS,
  COURSE_HEIGHT,
  OBSTACLE_GAP,
  RING_OMEGA,
  RING_RADIUS,
  SLIDER_SPEED,
  START_COLOR,
} from '../constants/bounceConstants'

/**
 * The course, built from nothing but a seed.
 *
 * This is why the race can run without the host simulating anyone: every device
 * calls buildCourse with the host's seed and gets a byte-identical climb. Pure,
 * no clock, no randomness of its own -- feed it the same number and it returns
 * the same course forever.
 *
 * Two products come out of one pass. `elements` is what the renderer draws.
 * `crossings` is the flattened, y-sorted list of everything the ball can trip
 * over, which is all the engine ever walks.
 */

/** Keep obstacles clear of a checkpoint line, so a respawn never lands on a gate. */
const CHECKPOINT_MARGIN = 300
const FIRST_OBSTACLE_Y = 700
/** Leave the last stretch clear so the finish is a run-in, not a gate. */
const FINISH_RUN_IN = 900

const BAND_HEIGHT = COURSE_HEIGHT / BAND_COUNT

export const bandAt = (y) => Math.min(BAND_COUNT - 1, Math.max(0, Math.floor(y / BAND_HEIGHT)))

/** Difficulty is quantised to the band, so a step up is something you can feel. */
const ramp = (y, { start, end }) => {
  const t = BAND_COUNT > 1 ? bandAt(y) / (BAND_COUNT - 1) : 0
  return start + (end - start) * t
}

export const ringOmegaAt = (y) => ramp(y, RING_OMEGA)
export const sliderSpeedAt = (y) => ramp(y, SLIDER_SPEED)
export const obstacleGapAt = (y) => ramp(y, OBSTACLE_GAP)
/** Sliders only start appearing once the rings have been taught. */
export const sliderChanceAt = (y) => (bandAt(y) === 0 ? 0 : 0.2 + 0.06 * bandAt(y))

const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length]

/** A fresh order for a ring's four arcs: every ring carries all four colours. */
function shuffledColors(rng) {
  const out = [...COLORS]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const nearCheckpoint = (y) => {
  const offset = y % CHECKPOINT_SPAN
  return offset < CHECKPOINT_MARGIN || offset > CHECKPOINT_SPAN - CHECKPOINT_MARGIN
}

/** Nudge a crossing off a checkpoint line rather than rejecting the whole slot. */
const clearOfCheckpoint = (y) => (nearCheckpoint(y) ? Math.ceil(y / CHECKPOINT_SPAN) * CHECKPOINT_SPAN + CHECKPOINT_MARGIN : y)

export function buildCourse(seed) {
  const rng = createSeededRng(seed)
  const elements = []
  /** The colour the ball is holding at this height, tracked as we walk up. */
  let color = START_COLOR
  const colorByY = [{ y: 0, color }]

  let y = FIRST_OBSTACLE_Y
  const lastY = COURSE_HEIGHT - FINISH_RUN_IN

  while (y < lastY) {
    const at = clearOfCheckpoint(y)
    if (at >= lastY) break

    // A swatch now and then, so the colour you are holding keeps changing.
    if (elements.length > 0 && rng() < 0.28) {
      const next = pick(rng, COLORS.filter((c) => c !== color))
      elements.push({ kind: 'swatch', y: at, crossY: at, color: next })
      color = next
      colorByY.push({ y: at, color })
      y = at + 260
      continue
    }

    if (rng() < sliderChanceAt(at)) {
      const speed = sliderSpeedAt(at) * (rng() < 0.5 ? -1 : 1)
      elements.push({
        kind: 'slider',
        y: at,
        crossY: at,
        speed,
        offset: rng() * 880,
        colors: shuffledColors(rng),
      })
    } else {
      const radius = RING_RADIUS.min + rng() * (RING_RADIUS.max - RING_RADIUS.min)
      elements.push({
        kind: 'ring',
        // The crossing is the bottom of the circle: you enter through your colour.
        y: at + radius,
        crossY: at,
        radius,
        omega: ringOmegaAt(at) * (rng() < 0.5 ? -1 : 1),
        phase: rng() * Math.PI * 2,
        colors: shuffledColors(rng),
      })
    }

    y = at + obstacleGapAt(at) * (0.85 + rng() * 0.3)
  }

  const colorAt = (target) => {
    let found = START_COLOR
    for (const mark of colorByY) {
      if (mark.y > target) break
      found = mark.color
    }
    return found
  }

  const checkpoints = []
  for (let i = 0, cy = 0; cy < COURSE_HEIGHT; i++, cy = i * CHECKPOINT_SPAN) {
    checkpoints.push({ index: i, y: cy, color: colorAt(cy), crossingIndex: 0 })
  }

  const crossings = [
    ...elements.map((el, elementIndex) => ({ y: el.crossY, type: el.kind, elementIndex })),
    ...checkpoints.map((cp) => ({ y: cp.y, type: 'checkpoint', elementIndex: cp.index })),
    { y: COURSE_HEIGHT, type: 'finish', elementIndex: -1 },
  ].sort((a, b) => a.y - b.y || (a.type === 'checkpoint' ? -1 : 1))

  // Where a respawn resumes reading the course from.
  for (const cp of checkpoints) {
    cp.crossingIndex = crossings.findIndex((c) => c.type === 'checkpoint' && c.elementIndex === cp.index) + 1
  }

  return { seed, height: COURSE_HEIGHT, startColor: START_COLOR, elements, checkpoints, crossings }
}
