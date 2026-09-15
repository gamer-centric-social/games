import { describe, it, expect } from 'vitest'
import {
  arcColorAt,
  arcIndexAt,
  arcsAt,
  angleAt,
  BOTTOM,
  colorAtCrossing,
  coreColorAt,
  offsetAt,
  TAU,
  touchingCore,
  windowSeconds,
} from './gates'
import { BALL_RADIUS, COLORS, MIN_GATE_WINDOW_SECONDS, SLIDER_SEGMENT } from '../constants/bounceConstants'

const FOUR = ['blue', 'pink', 'turq', 'gold']

/** One of every kind, at roughly the hardest the generator is allowed to make it. */
const SAMPLES = {
  ring: { kind: 'ring', colors: FOUR, omega: 1.5, phase: 0.4, radius: 130 },
  iris: { kind: 'ring', colors: FOUR, omega: 1.5, phase: 0.4, radius: 130, spans: [0.13, 0.13, 0.61, 0.13] },
  pendulum: { kind: 'pendulum', colors: FOUR, omega: 0.8, amp: 3.9, phase: 1.1, radius: 130 },
  ratchet: { kind: 'ratchet', colors: FOUR, period: 0.8, dir: 1, phase: 0.2, radius: 130 },
  slider: { kind: 'slider', colors: FOUR, speed: 250, offset: 90 },
  shutter: { kind: 'shutter', colors: FOUR, amp: 560, omega: 0.72, offset: 120 },
  chamber: { kind: 'chamber', colors: FOUR, omega: 1.0, phase: 2.2, radius: 240 },
}

const KINDS = Object.entries(SAMPLES)

/**
 * Sample a gate finely for long enough to see several cycles, and report how long
 * each colour was continuously available at the crossing point.
 */
function windowsOf(element, { until = 40, dt = 0.002 } = {}) {
  const runs = Object.fromEntries(COLORS.map((c) => [c, []]))
  let current = null
  let since = 0
  for (let t = 0; t <= until; t += dt) {
    const colour = colorAtCrossing(element, t)
    if (colour !== current) {
      if (current !== null) runs[current].push(t - since)
      current = colour
      since = t
    }
  }
  return runs
}

describe('every kind is a pure function of the element and the time', () => {
  for (const [name, element] of KINDS) {
    it(name, () => {
      for (const t of [0, 0.37, 2.5, 13.75]) {
        expect(colorAtCrossing(element, t)).toBe(colorAtCrossing(element, t))
      }
    })
  }
})

describe('every kind brings all four colours to the crossing point', () => {
  // The load-bearing promise of the whole game: whatever colour you are holding,
  // waiting for it always works. An oscillating gate that does not sweep far
  // enough would break it silently -- you would simply stand there forever.
  for (const [name, element] of KINDS) {
    it(name, () => {
      const seen = new Set()
      for (let t = 0; t < 40; t += 0.01) seen.add(colorAtCrossing(element, t))
      expect(seen).toEqual(new Set(COLORS))
    })
  }
})

describe('no colour is ever offered for less time than a person can react to', () => {
  for (const [name, element] of KINDS) {
    it(name, () => {
      const runs = windowsOf(element)
      for (const colour of COLORS) {
        // Ignore a clipped run at the very end of the sample.
        const best = Math.max(...runs[colour])
        expect(best).toBeGreaterThan(MIN_GATE_WINDOW_SECONDS)
      }
    })
  }

  it('windowSeconds never claims more room than a gate really gives', () => {
    // The analytical bound the generator reasons with must not be optimistic:
    // where it cannot be exact it has to under-report, never over-report.
    for (const [, element] of KINDS) {
      const runs = windowsOf(element)
      const widest = Math.max(...COLORS.map((c) => Math.max(...runs[c])))
      expect(windowSeconds(element)).toBeLessThanOrEqual(widest + 1e-6)
    }
  })
})

describe('the renderer and the engine cannot drift apart', () => {
  it('arcsAt puts every arc exactly where arcColorAt says it is', () => {
    // These are the two halves of the same fact: one is drawn, one is enforced.
    // If they ever disagreed you would lose a race to a ring that was somewhere
    // else on your screen than in the rules, so they are tested against each
    // other rather than against a hand-written expectation.
    for (const [, element] of KINDS) {
      if (!element.radius) continue
      for (let t = 0; t < 6; t += 0.13) {
        for (const arc of arcsAt(element, t)) {
          const middle = (arc.from + arc.to) / 2
          expect(arcColorAt(element, t, middle)).toBe(arc.color)
        }
      }
    }
  })

  it('walks the arcs once round the circle in order', () => {
    const arcs = arcsAt(SAMPLES.iris, 0)
    expect(arcs.map((a) => a.color)).toEqual(FOUR)
    expect(arcs.at(-1).to - arcs[0].from).toBeCloseTo(TAU, 9)
    for (let i = 1; i < arcs.length; i++) expect(arcs[i].from).toBeCloseTo(arcs[i - 1].to, 9)
  })
})

describe('arcIndexAt', () => {
  it('splits a plain ring into four quarters', () => {
    expect(arcIndexAt(0)).toBe(0)
    expect(arcIndexAt(TAU * 0.3)).toBe(1)
    expect(arcIndexAt(TAU * 0.6)).toBe(2)
    expect(arcIndexAt(TAU * 0.9)).toBe(3)
  })

  it('wraps rather than falling off either end', () => {
    expect(arcIndexAt(-0.01)).toBe(3)
    expect(arcIndexAt(TAU + 0.01)).toBe(0)
  })

  it('honours an iris ring uneven spans', () => {
    const spans = [0.13, 0.13, 0.61, 0.13]
    expect(arcIndexAt(TAU * 0.05, spans)).toBe(0)
    expect(arcIndexAt(TAU * 0.2, spans)).toBe(1)
    expect(arcIndexAt(TAU * 0.5, spans)).toBe(2)
    expect(arcIndexAt(TAU * 0.95, spans)).toBe(3)
  })
})

describe('the rhythms are actually different', () => {
  it('a ring turns at a steady rate', () => {
    const el = SAMPLES.ring
    const first = angleAt(el, 1) - angleAt(el, 0)
    const later = angleAt(el, 6) - angleAt(el, 5)
    expect(first).toBeCloseTo(later, 9)
  })

  it('a pendulum reverses, and sweeps the whole circle doing it', () => {
    const el = SAMPLES.pendulum
    const angles = []
    for (let t = 0; t < 12; t += 0.01) angles.push(angleAt(el, t))
    const swing = Math.max(...angles) - Math.min(...angles)
    expect(swing).toBeGreaterThanOrEqual(TAU)
  })

  it('a ratchet holds still between snaps', () => {
    const el = SAMPLES.ratchet
    // Late in a period it is parked; across the boundary it has moved a quarter.
    const parked = angleAt(el, 0.6) - angleAt(el, 0.5)
    expect(parked).toBeCloseTo(0, 9)
    expect(angleAt(el, 0.8 * 3) - angleAt(el, 0)).toBeCloseTo((Math.PI / 2) * 3, 6)
  })

  it('a shutter sweeps far enough to bring every colour over the centre', () => {
    const el = SAMPLES.shutter
    const offsets = []
    for (let t = 0; t < 20; t += 0.01) offsets.push(offsetAt(el, t))
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThanOrEqual(SLIDER_SEGMENT * 4)
  })

  it('a slider never turns back', () => {
    const el = SAMPLES.slider
    for (let t = 0; t < 5; t += 0.25) expect(offsetAt(el, t + 0.25)).toBeGreaterThan(offsetAt(el, t))
  })
})

describe('a ring is met at the bottom and a chamber escaped at the top', () => {
  it('reads a still ring at the bottom of its circle', () => {
    const still = { kind: 'ring', colors: FOUR, omega: 0, phase: 0, radius: 120 }
    expect(colorAtCrossing(still, 0)).toBe('gold')
    expect(colorAtCrossing(still, 0)).toBe(arcColorAt(still, 0, BOTTOM))
  })

  it('reads a chamber at the top, which is the only part of it that is a gate', () => {
    const box = { kind: 'chamber', colors: FOUR, omega: 0, phase: 0, radius: 240 }
    expect(colorAtCrossing(box, 0)).toBe('pink')
    // Opposite ends of the same circle, so they must not agree.
    expect(colorAtCrossing(box, 0)).not.toBe(arcColorAt(box, 0, BOTTOM))
  })
})

describe('the chamber core', () => {
  const core = { y: 900, period: 0.9, phase: 0, colors: FOUR }

  it('steps through all four colours and comes back round', () => {
    expect(coreColorAt(core, 0)).toBe('blue')
    expect(coreColorAt(core, 1.0)).toBe('pink')
    expect(coreColorAt(core, 1.9)).toBe('turq')
    expect(coreColorAt(core, 2.8)).toBe('gold')
    expect(coreColorAt(core, 3.7)).toBe('blue')
  })

  it('holds each colour for the whole period, so it can be read and aimed for', () => {
    const runs = []
    let current = null
    let since = 0
    for (let t = 0; t < 20; t += 0.001) {
      const colour = coreColorAt(core, t)
      if (colour !== current) {
        if (current !== null) runs.push(t - since)
        current = colour
        since = t
      }
    }
    for (const run of runs) expect(run).toBeCloseTo(core.period, 2)
  })

  it('is touched on overlap rather than on a crossing, and only within reach', () => {
    // Overlap is safe here only because the core is thick: at terminal velocity a
    // substep covers about 12 units and this band is over 100.
    expect(touchingCore(core, 900, BALL_RADIUS)).toBe(true)
    expect(touchingCore(core, 900 + 59, BALL_RADIUS)).toBe(true)
    expect(touchingCore(core, 900 - 59, BALL_RADIUS)).toBe(true)
    expect(touchingCore(core, 900 + 61, BALL_RADIUS)).toBe(false)
  })
})

describe('swatches are not gates', () => {
  it('has no crossing colour and an unbounded window', () => {
    const el = { kind: 'swatch', color: 'pink', y: 10, crossY: 10 }
    expect(colorAtCrossing(el, 3)).toBeNull()
    expect(windowSeconds(el)).toBe(Infinity)
  })
})
