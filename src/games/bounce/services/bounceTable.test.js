import { describe, it, expect, vi } from 'vitest'
import { createBounceTable } from './bounceTable'
import { EVENTS, stepRun } from '../engine/bounceEngine'
import { FIXED_DT, GRAVITY, MAX_FRAME_SECONDS, PROGRESS_INTERVAL_MS } from '../constants/bounceConstants'

/**
 * No fake timers anywhere in this file: the table is driven by advance(nowMs), so
 * a whole race runs in a plain loop with fabricated timestamps.
 */

const SEED = 20260915

function harness(opts = {}) {
  const events = []
  const reports = []
  const finishes = []
  const changes = []
  const table = createBounceTable({
    onEvents: (list) => events.push(...list),
    onReport: (r) => reports.push(r),
    onFinish: (run) => finishes.push(run),
    onChange: (run) => changes.push(run),
    ...opts,
  })
  return { table, events, reports, finishes, changes }
}

/** Run `seconds` of wall clock at `fps`, tapping every `tapEveryMs`. */
function play(table, { seconds, fps = 60, tapEveryMs = 0, startAt = 1000 }) {
  const frame = 1000 / fps
  let now = startAt
  let nextTap = tapEveryMs
  table.advance(now)
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += frame) {
    if (tapEveryMs > 0 && elapsed >= nextTap) {
      table.tap()
      nextTap += tapEveryMs
    }
    now += frame
    table.advance(now)
    if (table.run?.status !== 'climbing') break
  }
  return now
}

// --- an autopilot, so a test can actually finish the climb --------------------
//
// Hammering the screen does not work -- that is what the gates are for -- so a
// test that wants to reach the line has to play. This one climbs freely while
// nothing is close, and near a gate it looks ahead: if tapping now would run it
// into the wrong arc it holds off and lets the ring turn. That it always gets
// home is itself the point, and the check that the course is never a dead end.

const GATE_TYPES = new Set(['ring', 'slider'])
/** Close enough that a single tap could carry the ball into the gate. */
const LOOKAHEAD_RANGE = 420
const LOOKAHEAD_STEPS = 150

function nextGate(run, course) {
  for (let i = run.cursor; i < course.crossings.length; i++) {
    if (GATE_TYPES.has(course.crossings[i].type)) return course.crossings[i]
  }
  return null
}

function wouldFault(run, course) {
  let probe = stepRun(run, course, { dt: FIXED_DT, tapped: true })
  if (probe.events.some((e) => e.type === EVENTS.WRONG_COLOR)) return true
  let next = probe.run
  for (let i = 0; i < LOOKAHEAD_STEPS && next.status === 'climbing'; i++) {
    const out = stepRun(next, course, { dt: FIXED_DT })
    if (out.events.some((e) => e.type === EVENTS.WRONG_COLOR)) return true
    next = out.run
  }
  return false
}

function shouldTap(run, course) {
  if (!run || run.status !== 'climbing') return false
  const gate = nextGate(run, course)
  if (!gate || gate.y - run.y > LOOKAHEAD_RANGE) return true
  return !wouldFault(run, course)
}

/** Play properly until the line, or until `seconds` of wall clock run out. */
function climb(table, { seconds = 600, fps = 60, startAt = 1000 } = {}) {
  const frame = 1000 / fps
  let now = startAt
  table.advance(now)
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += frame) {
    if (shouldTap(table.run, table.course)) table.tap()
    now += frame
    table.advance(now)
    if (table.run?.status !== 'climbing') break
  }
  return now
}

describe('load', () => {
  it('builds the course from the seed and puts a ball on the floor', () => {
    const { table, changes } = harness()
    table.load(SEED)
    expect(table.course.seed).toBe(SEED)
    expect(table.run).toMatchObject({ y: 0, vy: 0, status: 'climbing' })
    expect(changes.at(-1)).toBe(table.run)
  })

  it('builds the same course on every device given the same seed', () => {
    const a = harness().table
    const b = harness().table
    a.load(SEED)
    b.load(SEED)
    expect(a.course).toEqual(b.course)
  })

  it('does nothing before a course is loaded', () => {
    const { table, changes } = harness()
    table.advance(1000)
    table.tap()
    expect(table.run).toBeNull()
    expect(changes).toHaveLength(0)
  })
})

describe('advance', () => {
  it('treats the first call as setting the clock, not as elapsed time', () => {
    // A timestamp is not a delta: reading it as one drops a minute of gravity on
    // the ball the moment the loop starts.
    const { table } = harness()
    table.load(SEED)
    table.advance(1_000_000)
    expect(table.run.t).toBe(0)
    expect(table.run.y).toBe(0)
  })

  it('advances the run by the wall clock that passed', () => {
    const { table } = harness()
    table.load(SEED)
    play(table, { seconds: 1, tapEveryMs: 300 })
    expect(table.run.t).toBeGreaterThan(0.9)
    expect(table.run.t).toBeLessThan(1.1)
    expect(table.run.y).toBeGreaterThan(0)
  })

  it('integrates to within one substep whatever the frame rate', () => {
    // One launch then coast, so this measures the integrator alone.
    //
    // An accumulator can only ever agree to within a single substep: the residual
    // left over at the end of the last frame is a fraction of FIXED_DT, and which
    // side of the threshold it falls on depends on the frame length. That is the
    // guarantee -- 8ms of drift, not a different trajectory -- and asserting exact
    // equality would only be asserting that floating point is exact.
    const trajectory = (fps) => {
      const { table } = harness()
      table.load(SEED)
      const frame = 1000 / fps
      // A whole number of frames, so both rates stop at the same wall clock --
      // otherwise the loop overshoots by a different amount at each rate and the
      // comparison measures the harness rather than the integrator.
      const frames = Math.round(600 / frame)
      let now = 1000
      table.advance(now)
      table.tap()
      for (let i = 0; i < frames; i++) {
        now += frame
        table.advance(now)
      }
      expect(now).toBeCloseTo(1600, 6)
      return table.run
    }
    const slow = trajectory(30)
    const fast = trajectory(240)
    const oneStep = FIXED_DT * 1.001

    expect(Math.abs(fast.t - slow.t)).toBeLessThanOrEqual(oneStep)
    expect(Math.abs(fast.vy - slow.vy)).toBeLessThanOrEqual(GRAVITY * oneStep)
    // The gap is exactly the extra substep's travel, so bound it by the faster
    // of the two speeds at that moment.
    const fastest = Math.max(Math.abs(slow.vy), Math.abs(fast.vy))
    expect(Math.abs(fast.y - slow.y)).toBeLessThanOrEqual(fastest * oneStep + 0.001)
    // And nowhere near the drift an un-accumulated dt would produce.
    expect(Math.abs(fast.y - slow.y)).toBeLessThan(5)
  })

  it('plays the same game at 60Hz and at 120Hz', () => {
    // With taps the two diverge a little, because a tap lands on a frame and the
    // frames differ. It must stay small -- a faster phone is not a different game.
    const slow = harness().table
    const fast = harness().table
    slow.load(SEED)
    fast.load(SEED)
    play(slow, { seconds: 6, fps: 60, tapEveryMs: 320 })
    play(fast, { seconds: 6, fps: 120, tapEveryMs: 320 })
    expect(fast.run.t).toBeCloseTo(slow.run.t, 1)
    expect(Math.abs(fast.run.y - slow.run.y)).toBeLessThan(slow.run.y * 0.02)
    expect(fast.run.checkpointIndex).toBe(slow.run.checkpointIndex)
  })

  it('resumes rather than teleports after a backgrounded tab', () => {
    const { table } = harness()
    table.load(SEED)
    const now = play(table, { seconds: 2, tapEveryMs: 300 })
    const before = table.run
    // Two minutes with no frames at all, as a phone locked in a pocket.
    table.advance(now + 120_000)
    expect(table.run.t - before.t).toBeLessThanOrEqual(MAX_FRAME_SECONDS + FIXED_DT)
  })

  it('ignores a clock that runs backwards', () => {
    const { table } = harness()
    table.load(SEED)
    table.advance(5000)
    table.advance(4000)
    expect(table.run.t).toBe(0)
  })
})

describe('tapping', () => {
  it('lifts the ball on a tap', () => {
    const { table, events } = harness()
    table.load(SEED)
    table.advance(1000)
    table.tap()
    table.advance(1000 + 1000 / 60)
    expect(table.run.vy).toBeGreaterThan(0)
    expect(events.map((e) => e.type)).toContain(EVENTS.TAP)
  })

  it('does not bank a stutter into a burst of taps', () => {
    const { table, events } = harness()
    table.load(SEED)
    table.advance(1000)
    for (let i = 0; i < 40; i++) table.tap()
    table.advance(1000 + 1000 / 60)
    expect(events.filter((e) => e.type === EVENTS.TAP).length).toBeLessThanOrEqual(2)
  })

  it('ignores taps once the run is over', () => {
    const { table } = harness()
    table.load(SEED)
    climb(table)
    expect(table.run.status).toBe('finished')
    const settled = table.run
    table.tap()
    table.advance(999_999_999)
    expect(table.run).toBe(settled)
  })
})

describe('progress reports', () => {
  it('reports on the interval, not on every frame', () => {
    const { table, reports } = harness()
    table.load(SEED)
    play(table, { seconds: 4, tapEveryMs: 300 })
    const expected = (4 * 1000) / PROGRESS_INTERVAL_MS
    expect(reports.length).toBeGreaterThan(expected * 0.6)
    expect(reports.length).toBeLessThan(expected * 1.5)
  })

  it('reports where the ball is and which checkpoint it holds, and nothing else', () => {
    const { table, reports } = harness()
    table.load(SEED)
    play(table, { seconds: 4, tapEveryMs: 300 })
    const last = reports.at(-1)
    expect(Object.keys(last).sort()).toEqual(['checkpointIndex', 'y'])
    expect(last.checkpointIndex).toBe(table.run.checkpointIndex)
    // Throttled, so it trails the ball by at most one interval of climbing.
    expect(Math.abs(last.y - table.run.y)).toBeLessThan(400)
  })

  it('honours a custom interval', () => {
    const { table, reports } = harness({ reportIntervalMs: 1000 })
    table.load(SEED)
    play(table, { seconds: 4, tapEveryMs: 300 })
    expect(reports.length).toBeLessThanOrEqual(5)
  })
})

describe('finishing', () => {
  it('carries a player who waits for their colour all the way to the line', () => {
    // Also the proof that a generated course is never a dead end.
    const { table, events, finishes } = harness()
    table.load(SEED)
    climb(table)

    expect(table.run.status).toBe('finished')
    expect(finishes).toHaveLength(1)
    expect(events.filter((e) => e.type === EVENTS.FINISHED)).toHaveLength(1)
    expect(events.filter((e) => e.type === EVENTS.CHECKPOINT).length).toBeGreaterThan(1)
    expect(events.filter((e) => e.type === EVENTS.GATE_CLEARED).length).toBeGreaterThan(10)
    expect(table.run.finishT).toBeGreaterThan(0)
  })

  it('finishes every seed it is given', () => {
    for (const seed of [1, 7, 2024, 909090]) {
      const { table } = harness()
      table.load(seed)
      climb(table)
      expect(table.run.status, `seed ${seed}`).toBe('finished')
    }
  })

  it('is deterministic: the same play on the same seed lands the same time', () => {
    const a = harness().table
    const b = harness().table
    a.load(SEED)
    b.load(SEED)
    climb(a)
    climb(b)
    expect(b.run.finishT).toBe(a.run.finishT)
    expect(b.run.faults).toBe(a.run.faults)
  })

  it('sends a fresh progress report before claiming the line', () => {
    // The host refuses a finish that no live climb backs up, so the order matters.
    const seen = []
    const { table } = harness({
      onReport: () => seen.push('report'),
      onFinish: () => seen.push('finish'),
    })
    table.load(SEED)
    climb(table)
    expect(seen.at(-1)).toBe('finish')
    expect(seen.at(-2)).toBe('report')
  })

  it('announces the finish once, however long the loop keeps running', () => {
    const { table, finishes } = harness()
    table.load(SEED)
    const now = climb(table)
    table.advance(now + 1000)
    table.advance(now + 6000)
    expect(finishes).toHaveLength(1)
  })

  it('can resend a finish the host turned down', () => {
    const { table, reports, finishes } = harness()
    table.load(SEED)
    const now = climb(table)
    const before = reports.length
    expect(table.resendFinish(now + 1000)).toBe(true)
    expect(reports).toHaveLength(before + 1)
    expect(finishes).toHaveLength(2)
  })

  it('will not resend a finish that has not happened', () => {
    const { table } = harness()
    table.load(SEED)
    play(table, { seconds: 2, tapEveryMs: 300 })
    expect(table.resendFinish(5000)).toBe(false)
  })
})

describe('faults', () => {
  it('sends a careless climber back down the shaft', () => {
    // Hammering the screen ignores the gates, which is what the gates are for.
    const { table, events } = harness()
    table.load(SEED)
    play(table, { seconds: 60, tapEveryMs: 1000 / 60 })
    expect(events.filter((e) => e.type === EVENTS.WRONG_COLOR).length).toBeGreaterThan(0)
    expect(table.run.status).toBe('climbing')
  })
})

describe('clear', () => {
  it('forgets the course and the ball', () => {
    const { table } = harness()
    table.load(SEED)
    play(table, { seconds: 2, tapEveryMs: 300 })
    table.clear()
    expect(table.run).toBeNull()
    expect(table.course).toBeNull()
  })

  it('survives a callback-free table', () => {
    const table = createBounceTable()
    table.load(SEED)
    expect(() => play(table, { seconds: 2, tapEveryMs: 300 })).not.toThrow()
  })
})

describe('the loop is not a timer', () => {
  it('never reaches for a clock of its own', () => {
    // Time comes in through advance(). If the table read Date.now or rAF itself
    // it could not be tested like this, and nor could a race be replayed.
    const now = vi.spyOn(Date, 'now')
    const { table } = harness()
    table.load(SEED)
    play(table, { seconds: 5, tapEveryMs: 300 })
    expect(now).not.toHaveBeenCalled()
    now.mockRestore()
  })
})
