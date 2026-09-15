import { describe, it, expect } from 'vitest'
import { buildCourse, bandAt, ringOmegaAt, obstacleGapAt } from './courseGen'
import {
  BAND_COUNT,
  CHECKPOINT_SPAN,
  COLORS,
  COURSE_HEIGHT,
  MAX_CLIMB_RATE,
  RING_OMEGA,
  OBSTACLE_GAP,
} from '../constants/bounceConstants'

const SEEDS = [1, 7, 42, 1337, 999983]

describe('buildCourse', () => {
  it('returns an identical course for the same seed', () => {
    // The whole networking model rests on this: every device builds the course
    // from the host's seed and must get the same climb, byte for byte.
    for (const seed of SEEDS) {
      expect(buildCourse(seed)).toEqual(buildCourse(seed))
    }
  })

  it('returns different courses for different seeds', () => {
    const shapes = SEEDS.map((s) => JSON.stringify(buildCourse(s).elements))
    expect(new Set(shapes).size).toBe(SEEDS.length)
  })

  it('sorts crossings by height', () => {
    for (const seed of SEEDS) {
      const { crossings } = buildCourse(seed)
      for (let i = 1; i < crossings.length; i++) {
        expect(crossings[i].y).toBeGreaterThanOrEqual(crossings[i - 1].y)
      }
    }
  })

  it('lays checkpoints on the fixed grid and ends with the finish', () => {
    const { checkpoints, crossings } = buildCourse(42)
    expect(checkpoints[0].y).toBe(0)
    checkpoints.forEach((cp, i) => {
      expect(cp.index).toBe(i)
      expect(cp.y).toBe(i * CHECKPOINT_SPAN)
    })
    expect(crossings.at(-1)).toMatchObject({ type: 'finish', y: COURSE_HEIGHT })
    expect(crossings.filter((c) => c.type === 'finish')).toHaveLength(1)
  })

  it('keeps obstacles clear of the checkpoint lines, so a respawn never lands on a gate', () => {
    for (const seed of SEEDS) {
      for (const c of buildCourse(seed).crossings) {
        if (c.type === 'checkpoint' || c.type === 'finish') continue
        const offset = c.y % CHECKPOINT_SPAN
        expect(Math.min(offset, CHECKPOINT_SPAN - offset)).toBeGreaterThan(0)
      }
    }
  })

  it('records at each checkpoint the colour the ball is holding there', () => {
    const { elements, checkpoints } = buildCourse(1337)
    for (const cp of checkpoints) {
      const lastSwatch = elements.findLast((e) => e.kind === 'swatch' && e.y <= cp.y)
      expect(cp.color).toBe(lastSwatch ? lastSwatch.color : 'blue')
    }
  })

  it('points each checkpoint at the crossing that follows it', () => {
    const { checkpoints, crossings } = buildCourse(7)
    for (const cp of checkpoints) {
      const before = crossings[cp.crossingIndex - 1]
      expect(before).toMatchObject({ type: 'checkpoint', elementIndex: cp.index })
      if (cp.crossingIndex < crossings.length) {
        expect(crossings[cp.crossingIndex].y).toBeGreaterThanOrEqual(cp.y)
      }
    }
  })

  it('gives every ring all four colours, so any colour you hold can get through', () => {
    // A ring missing your colour would be impassable. Waiting for your arc to come
    // round must always work: difficulty is a narrower window, never a dead end.
    for (const seed of SEEDS) {
      for (const el of buildCourse(seed).elements) {
        if (el.kind !== 'ring' && el.kind !== 'slider') continue
        expect([...el.colors].sort()).toEqual([...COLORS].sort())
      }
    }
  })

  it('never puts a swatch on the colour the ball already holds', () => {
    for (const seed of SEEDS) {
      const { elements } = buildCourse(seed)
      let color = 'blue'
      for (const el of elements) {
        if (el.kind !== 'swatch') continue
        expect(el.color).not.toBe(color)
        color = el.color
      }
    }
  })

  it('ramps difficulty upward across the bands', () => {
    const bands = Array.from({ length: BAND_COUNT }, (_, i) => (i + 0.5) * (COURSE_HEIGHT / BAND_COUNT))
    const omegas = bands.map(ringOmegaAt)
    const gaps = bands.map(obstacleGapAt)
    for (let i = 1; i < bands.length; i++) {
      expect(omegas[i]).toBeGreaterThan(omegas[i - 1])
      expect(gaps[i]).toBeLessThan(gaps[i - 1])
    }
    expect(omegas[0]).toBeCloseTo(RING_OMEGA.start)
    expect(omegas.at(-1)).toBeCloseTo(RING_OMEGA.end)
    expect(gaps[0]).toBeCloseTo(OBSTACLE_GAP.start)
    expect(gaps.at(-1)).toBeCloseTo(OBSTACLE_GAP.end)
  })

  it('clamps bandAt to the course', () => {
    expect(bandAt(-500)).toBe(0)
    expect(bandAt(0)).toBe(0)
    expect(bandAt(COURSE_HEIGHT * 2)).toBe(BAND_COUNT - 1)
  })

  it('spaces obstacles far enough apart to read the next one', () => {
    for (const seed of SEEDS) {
      const gates = buildCourse(seed).crossings.filter((c) => c.type === 'ring' || c.type === 'slider')
      for (let i = 1; i < gates.length; i++) {
        expect(gates[i].y - gates[i - 1].y).toBeGreaterThan(200)
      }
    }
  })

  it('cannot be finished faster than the tap impulse allows', () => {
    // The floor the host checks a reported finish time against.
    const { height } = buildCourse(42)
    expect(height / MAX_CLIMB_RATE).toBeGreaterThan(20)
  })
})
