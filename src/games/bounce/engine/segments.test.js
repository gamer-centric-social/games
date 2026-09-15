import { describe, it, expect } from 'vitest'
import { createSeededRng } from '../../../utils/rng'
import { chamber, INTENSE, pickRoom, poolFor, ROOMS } from './segments'
import { windowSeconds } from './gates'
import {
  BALL_RADIUS,
  BAND_COUNT,
  COLORS,
  MIN_ARC_SPAN,
  MIN_CHAMBER_TRAVEL,
  MIN_CHECKPOINT_SPAN,
  MIN_GATE_WINDOW_SECONDS,
  RING_STROKE,
} from '../constants/bounceConstants'

const BANDS = Array.from({ length: BAND_COUNT }, (_, i) => i)
const NAMES = Object.keys(ROOMS)
const BASE = 4000

const build = (name, band, seed = 99) => ROOMS[name](createSeededRng(seed), { baseY: BASE, band })

/** Where a room actually ends, as against where it says it does. */
const topOf = (element) => (element.radius ? element.y + element.radius : element.crossY)

describe('every room', () => {
  for (const name of NAMES) {
    describe(name, () => {
      it('lays something down, above its own base', () => {
        for (const band of BANDS) {
          const built = build(name, band)
          expect(built.elements.length).toBeGreaterThan(0)
          for (const element of built.elements) expect(element.crossY).toBeGreaterThan(BASE)
        }
      })

      it('declares a height that actually covers what it placed', () => {
        // The height is derived from the elements rather than written beside
        // them, so a room can never quietly overlap the one above it.
        for (const band of BANDS) {
          const built = build(name, band)
          const top = Math.max(...built.elements.map(topOf))
          expect(built.height).toBeGreaterThanOrEqual(top - BASE)
          expect(built.height).toBeGreaterThanOrEqual(MIN_CHECKPOINT_SPAN)
        }
      })

      it('leaves clear shaft above the seam, so a respawn is never on top of a gate', () => {
        for (const band of BANDS) {
          for (const element of build(name, band).elements) {
            expect(element.crossY - BASE).toBeGreaterThan(100)
          }
        }
      })

      it('is the same room every time from the same seed', () => {
        for (const band of BANDS) {
          expect(build(name, band, 7)).toEqual(build(name, band, 7))
        }
      })

      it('gives every gate it builds all four colours and a readable window', () => {
        for (const band of BANDS) {
          for (const element of build(name, band).elements) {
            if (element.kind === 'swatch') continue
            expect([...element.colors].sort()).toEqual([...COLORS].sort())
            expect(windowSeconds(element)).toBeGreaterThan(MIN_GATE_WINDOW_SECONDS)
          }
        }
      })

      it('keeps its obstacles far enough apart to read the next one', () => {
        for (const band of BANDS) {
          const ys = build(name, band)
            .elements.map((e) => e.crossY)
            .sort((a, b) => a - b)
          for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThan(200)
        }
      })
    })
  }
})

describe('the rooms are actually different from each other', () => {
  it('builds the kinds each one is named for', () => {
    const kindsOf = (name, band) => new Set(build(name, band).elements.map((e) => e.kind))
    expect(kindsOf('approach', 0)).toEqual(new Set(['ring']))
    expect(kindsOf('gauntlet', 0)).toEqual(new Set(['ring']))
    expect(kindsOf('breather', 0)).toEqual(new Set(['swatch']))
    expect(kindsOf('carousel', 2)).toContain('pendulum')
    expect(kindsOf('ratchetRun', 3)).toContain('ratchet')
    expect(kindsOf('chamber', 3)).toContain('chamber')
    const sweepKinds = new Set([...BANDS].flatMap((b) => [...kindsOf('sweep', b)]))
    expect(sweepKinds).toContain('slider')
    expect(sweepKinds).toContain('shutter')
  })

  it('turns a carousel second ring against its first', () => {
    for (const band of BANDS) {
      const rings = build('carousel', band).elements.filter((e) => e.kind === 'ring')
      expect(Math.sign(rings[0].omega)).toBe(-Math.sign(rings.at(-1).omega))
    }
  })

  it('irises some rings once the plain ones have been taught, and never in band 0', () => {
    const irised = (band) =>
      Array.from({ length: 40 }, (_, s) => build('gauntlet', band, s + 1))
        .flatMap((r) => r.elements)
        .filter((e) => e.spans)
    expect(irised(0)).toHaveLength(0)
    expect(irised(4).length).toBeGreaterThan(0)
    for (const el of irised(4)) {
      expect(Math.min(...el.spans)).toBeGreaterThanOrEqual(MIN_ARC_SPAN - 1e-9)
      expect(el.spans.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
    }
  })

  it('ends a chamber room with a colour post, above the chamber', () => {
    for (const band of BANDS) {
      const built = build('chamber', band)
      const box = built.elements.find((e) => e.kind === 'chamber')
      const post = built.elements.find((e) => e.kind === 'swatch')
      expect(post.crossY).toBeGreaterThan(box.exitY)
    }
  })
})

describe('the chamber builder', () => {
  it('leaves more clear travel than two taps can cover, at every size', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const band of BANDS) {
        const box = chamber(createSeededRng(seed), { bottomY: 1000, band })
        expect(box.exitY - box.crossY).toBeGreaterThan(MIN_CHAMBER_TRAVEL)
      }
    }
  })

  it('sits the floor and ceiling a ball radius inside the wall', () => {
    const box = chamber(createSeededRng(3), { bottomY: 1000, band: 3 })
    const wallInner = box.radius - RING_STROKE / 2
    expect(box.crossY).toBeCloseTo(box.y - wallInner + BALL_RADIUS, 9)
    expect(box.exitY).toBeCloseTo(box.y + wallInner - BALL_RADIUS, 9)
  })

  it('hangs the core below the centre, where it is reachable but not on the way out', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const box = chamber(createSeededRng(seed), { bottomY: 1000, band: 2 })
      expect(box.core.y).toBeLessThan(box.y)
      expect(box.core.y).toBeGreaterThan(box.crossY)
      expect([...box.core.colors].sort()).toEqual([...COLORS].sort())
      expect(box.core.period).toBeGreaterThan(0)
    }
  })
})

describe('pools', () => {
  it('opens narrow and widens as you climb', () => {
    for (let band = 1; band < BAND_COUNT; band++) {
      expect(Object.keys(poolFor(band)).length).toBeGreaterThanOrEqual(3)
    }
    expect(poolFor(0).chamber).toBeUndefined()
    expect(poolFor(0).ratchetRun).toBeUndefined()
    expect(poolFor(2).chamber).toBeGreaterThan(0)
    expect(poolFor(4).breather).toBeUndefined()
  })

  it('clamps a band outside the course', () => {
    expect(poolFor(-3)).toBe(poolFor(0))
    expect(poolFor(99)).toBe(poolFor(BAND_COUNT - 1))
  })

  it('only ever names a room that exists', () => {
    for (const band of BANDS) {
      for (const name of Object.keys(poolFor(band))) expect(ROOMS[name]).toBeTypeOf('function')
    }
  })

  it('never returns a barred room, and still returns something', () => {
    const rng = createSeededRng(5)
    for (let i = 0; i < 300; i++) {
      const picked = pickRoom(rng, 3, ['chamber', 'breather'])
      expect(picked).not.toBe('chamber')
      expect(picked).not.toBe('breather')
      expect(ROOMS[picked]).toBeTypeOf('function')
    }
  })

  it('takes exactly one number from the sequence, barred or not', () => {
    // Otherwise excluding a room would shift every room above it, and two devices
    // that disagreed about one pick would build entirely different courses.
    const a = createSeededRng(11)
    const b = createSeededRng(11)
    pickRoom(a, 3)
    pickRoom(b, 3, ['chamber'])
    expect(a()).toBe(b())
  })

  it('leans on the rooms it should: the chamber is common late, the breather rare', () => {
    const late = poolFor(4)
    expect(late.chamber).toBeGreaterThanOrEqual(3)
    for (const band of [2, 3]) expect(poolFor(band).breather).toBeLessThan(poolFor(band).gauntlet)
  })

  it('agrees with the assembler about which rooms are demanding', () => {
    for (const name of INTENSE) expect(ROOMS[name]).toBeTypeOf('function')
    expect(INTENSE.has('breather')).toBe(false)
    expect(INTENSE.has('approach')).toBe(false)
  })
})
