import { describe, it, expect } from 'vitest'
import { buildCourse, bandAt, roomAt } from './courseGen'
import { windowSeconds } from './gates'
import { ringOmegaAt, obstacleGapAt, pendulumAmpAt } from './segments'
import {
  BALL_RADIUS,
  BAND_COUNT,
  COLORS,
  CORE_RADIUS,
  COURSE_HEIGHT,
  FINISH_RUN_IN,
  MAX_CLIMB_RATE,
  MIN_ARC_SPAN,
  MIN_CHAMBER_TRAVEL,
  MIN_CHECKPOINT_SPAN,
  MIN_GATE_WINDOW_SECONDS,
  OBSTACLE_GAP,
  RING_OMEGA,
  TAP_APEX,
} from '../constants/bounceConstants'

const SEEDS = [1, 7, 42, 1337, 2024, 909090, 999983, 20260915]

const GATE_TYPES = new Set(['ring', 'pendulum', 'ratchet', 'slider', 'shutter'])
const gatesOf = (course) => course.elements.filter((e) => GATE_TYPES.has(e.kind))
const chambersOf = (course) => course.elements.filter((e) => e.kind === 'chamber')

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

  it('ends with the finish, once', () => {
    for (const seed of SEEDS) {
      const { crossings } = buildCourse(seed)
      expect(crossings.at(-1)).toMatchObject({ type: 'finish', y: COURSE_HEIGHT })
      expect(crossings.filter((c) => c.type === 'finish')).toHaveLength(1)
    }
  })
})

describe('the course is a stack of rooms', () => {
  it('tiles them with no gap and no overlap', () => {
    for (const seed of SEEDS) {
      const { segments } = buildCourse(seed)
      expect(segments.length).toBeGreaterThan(4)
      for (let i = 1; i < segments.length; i++) {
        expect(segments[i].y).toBe(segments[i - 1].y + segments[i - 1].height)
      }
    }
  })

  it('opens with the approach and leaves the finish a clear run-in', () => {
    for (const seed of SEEDS) {
      const { segments, elements } = buildCourse(seed)
      expect(segments[0].name).toBe('The Approach')
      const top = segments.at(-1).y + segments.at(-1).height
      expect(top).toBeLessThanOrEqual(COURSE_HEIGHT - FINISH_RUN_IN)
      for (const element of elements) {
        expect(element.crossY).toBeLessThan(COURSE_HEIGHT - FINISH_RUN_IN)
      }
    }
  })

  it('never runs the same room three times over, and never two breathers or two chambers together', () => {
    // Two of a room reads as a theme. Three reads as a generator out of ideas --
    // which is the whole complaint the old sprinkle-as-you-go course earned.
    for (const seed of SEEDS) {
      const names = buildCourse(seed).segments.map((s) => s.name)
      for (let i = 2; i < names.length; i++) {
        expect(names[i] === names[i - 1] && names[i] === names[i - 2]).toBe(false)
      }
      for (let i = 1; i < names.length; i++) {
        if (names[i] === 'Breather') expect(names[i - 1]).not.toBe('Breather')
        if (names[i] === 'The Chamber') expect(names[i - 1]).not.toBe('The Chamber')
      }
    }
  })

  it('never asks for three demanding rooms in a row', () => {
    const intense = new Set(['Gauntlet', 'Carousel', 'Ratchet Run', 'The Chamber'])
    for (const seed of SEEDS) {
      const names = buildCourse(seed).segments.map((s) => s.name)
      for (let i = 2; i < names.length; i++) {
        const three = [names[i - 2], names[i - 1], names[i]]
        expect(three.every((n) => intense.has(n))).toBe(false)
      }
    }
  })

  it('shows a chamber on every seed, because it is what the course is built around', () => {
    for (const seed of SEEDS) {
      expect(chambersOf(buildCourse(seed)).length).toBeGreaterThan(0)
    }
  })

  it('names the room you are standing in', () => {
    const course = buildCourse(42)
    expect(roomAt(course, 0)).toBe('The Approach')
    for (const segment of course.segments) {
      expect(roomAt(course, segment.y + 10)).toBe(segment.name)
      expect(roomAt(course, segment.y + segment.height - 10)).toBe(segment.name)
    }
  })
})

describe('checkpoints', () => {
  it('lands one on every seam, starting at the line', () => {
    for (const seed of SEEDS) {
      const { checkpoints, segments } = buildCourse(seed)
      expect(checkpoints[0].y).toBe(0)
      checkpoints.forEach((cp, i) => expect(cp.index).toBe(i))
      expect(checkpoints).toHaveLength(segments.length + 1)
      segments.forEach((segment, i) => expect(checkpoints[i].y).toBe(segment.y))
    }
  })

  it('never puts an obstacle on a checkpoint line, so a respawn never lands on a gate', () => {
    // Free now, rather than nudged: rooms open with clear shaft above the seam.
    for (const seed of SEEDS) {
      const course = buildCourse(seed)
      const lines = new Set(course.checkpoints.map((cp) => cp.y))
      for (const c of course.crossings) {
        if (c.type === 'checkpoint' || c.type === 'finish') continue
        for (const line of lines) expect(Math.abs(c.y - line)).toBeGreaterThan(100)
      }
    }
  })

  it('never sits two closer together than the shortest room', () => {
    // raceState.js bounds a claimed checkpoint index by dividing a height by this.
    // The bound is only sound while it really is the minimum.
    for (const seed of SEEDS) {
      const { checkpoints } = buildCourse(seed)
      for (let i = 1; i < checkpoints.length; i++) {
        expect(checkpoints[i].y - checkpoints[i - 1].y).toBeGreaterThanOrEqual(MIN_CHECKPOINT_SPAN)
      }
    }
  })

  it('records at each checkpoint the colour the ball is holding there', () => {
    for (const seed of SEEDS) {
      const { elements, checkpoints } = buildCourse(seed)
      for (const cp of checkpoints) {
        const lastSwatch = elements.findLast((e) => e.kind === 'swatch' && e.crossY <= cp.y)
        expect(cp.color).toBe(lastSwatch ? lastSwatch.color : 'blue')
      }
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
})

describe('no gate is ever a dead end', () => {
  it('gives every gate all four colours, so any colour you hold can get through', () => {
    // A gate missing your colour would be impassable. Waiting for your arc to come
    // round must always work: difficulty is a narrower window, never a dead end.
    for (const seed of SEEDS) {
      for (const el of buildCourse(seed).elements) {
        if (el.kind === 'swatch') continue
        expect([...el.colors].sort()).toEqual([...COLORS].sort())
        if (el.kind === 'chamber') expect([...el.core.colors].sort()).toEqual([...COLORS].sort())
      }
    }
  })

  it('never offers a colour for less time than a person can react to', () => {
    // gates.test.js proves windowSeconds never over-reports what a gate really
    // gives. Holding the generator to it here is therefore a claim about the real
    // windows, not just about the arithmetic.
    for (const seed of SEEDS) {
      const course = buildCourse(seed)
      for (const el of [...gatesOf(course), ...chambersOf(course)]) {
        expect(windowSeconds(el)).toBeGreaterThan(MIN_GATE_WINDOW_SECONDS)
      }
    }
  })

  it('cuts no iris slice thinner than the floor', () => {
    for (const seed of SEEDS) {
      for (const el of buildCourse(seed).elements) {
        if (!el.spans) continue
        expect(Math.min(...el.spans)).toBeGreaterThanOrEqual(MIN_ARC_SPAN - 1e-9)
        expect(el.spans.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
      }
    }
  })

  it('keeps every oscillating gate sweeping its whole cycle', () => {
    // A pendulum that swings less than half a turn, or a shutter that slides less
    // than half a pattern, leaves a colour that never arrives at all.
    for (const seed of SEEDS) {
      for (const el of buildCourse(seed).elements) {
        if (el.kind === 'pendulum') expect(2 * el.amp).toBeGreaterThanOrEqual(Math.PI * 2)
        if (el.kind === 'shutter') expect(2 * el.amp).toBeGreaterThanOrEqual(220 * 4)
      }
    }
  })

  it('never lets a chamber stand still, which would trap you forever', () => {
    for (const seed of SEEDS) {
      for (const box of chambersOf(buildCourse(seed))) expect(Math.abs(box.omega)).toBeGreaterThan(0.1)
    }
  })
})

describe('a chamber ceiling is never reachable by accident', () => {
  it('leaves more clear travel inside than two taps can cover', () => {
    // This is what makes the chosen penalty fair. Faulting at the ceiling is
    // harsh, and it is only honest because you cannot arrive there without having
    // decided to: no single tap, from the floor or from the core, gets you close.
    for (const seed of SEEDS) {
      for (const box of chambersOf(buildCourse(seed))) {
        expect(box.exitY - box.crossY).toBeGreaterThan(MIN_CHAMBER_TRAVEL)
      }
    }
  })

  it('puts the core one tap up from the floor, and two below the ceiling', () => {
    for (const seed of SEEDS) {
      for (const box of chambersOf(buildCourse(seed))) {
        const reach = CORE_RADIUS + BALL_RADIUS
        // Touchable with a single tap off the floor.
        expect(box.core.y - reach - box.crossY).toBeLessThan(TAP_APEX)
        // And still out of reach of the ceiling from the top of the core.
        expect(box.exitY - (box.core.y + reach)).toBeGreaterThan(TAP_APEX)
      }
    }
  })

  it('puts exactly two crossings on the course for each chamber', () => {
    for (const seed of SEEDS) {
      const course = buildCourse(seed)
      const entries = course.crossings.filter((c) => c.type === 'chamber-entry')
      const exits = course.crossings.filter((c) => c.type === 'chamber-exit')
      expect(entries).toHaveLength(chambersOf(course).length)
      expect(exits).toHaveLength(chambersOf(course).length)
      for (const entry of entries) {
        const exit = exits.find((e) => e.elementIndex === entry.elementIndex)
        expect(exit.y).toBeGreaterThan(entry.y)
      }
    }
  })
})

describe('difficulty', () => {
  it('ramps upward across the bands', () => {
    const bands = Array.from({ length: BAND_COUNT }, (_, i) => i)
    const omegas = bands.map(ringOmegaAt)
    const gaps = bands.map(obstacleGapAt)
    const amps = bands.map(pendulumAmpAt)
    for (let i = 1; i < bands.length; i++) {
      expect(omegas[i]).toBeGreaterThan(omegas[i - 1])
      expect(gaps[i]).toBeLessThan(gaps[i - 1])
      expect(amps[i]).toBeGreaterThan(amps[i - 1])
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

  it('teaches the rooms in order, the hardest never in the first band', () => {
    for (const seed of SEEDS) {
      for (const segment of buildCourse(seed).segments) {
        if (bandAt(segment.y) === 0) {
          expect(['The Approach', 'Gauntlet', 'Sweep', 'Breather']).toContain(segment.name)
        }
      }
    }
  })
})

describe('the floor the host checks a finish against', () => {
  it('cannot be beaten by the tap impulse', () => {
    const { height } = buildCourse(42)
    expect(height / MAX_CLIMB_RATE).toBeGreaterThan(19)
  })
})

describe('colour posts', () => {
  it('never hands you the colour you are already holding', () => {
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

  it('puts one after every chamber, so a checkpoint above it knows your colour', () => {
    // Inside a chamber your colour is whatever the core last painted you, which
    // the generator cannot know. The post is what makes the next checkpoint
    // honest rather than a guess.
    for (const seed of SEEDS) {
      const { elements } = buildCourse(seed)
      elements.forEach((el, i) => {
        if (el.kind !== 'chamber') return
        const after = elements.slice(i + 1)
        expect(after[0]?.kind).toBe('swatch')
      })
    }
  })
})
