import { describe, it, expect } from 'vitest'
import { EVENTS, colorAtCrossing, createRun, runProgress, stepRun } from './bounceEngine'
import { buildCourse } from './courseGen'
import { FIXED_DT, GRAVITY, TAP_IMPULSE, TERMINAL_FALL } from '../constants/bounceConstants'

/** A course fabricated by hand, shaped exactly like buildCourse's output. */
function makeCourse({ elements = [], checkpointYs = [0], height = 6000, startColor = 'blue' } = {}) {
  const checkpoints = checkpointYs.map((y, index) => ({ index, y, color: startColor, crossingIndex: 0 }))
  const crossings = [
    ...elements.map((el, elementIndex) => ({ y: el.crossY ?? el.y, type: el.kind, elementIndex })),
    ...checkpoints.map((cp) => ({ y: cp.y, type: 'checkpoint', elementIndex: cp.index })),
    { y: height, type: 'finish', elementIndex: -1 },
  ].sort((a, b) => a.y - b.y || (a.type === 'checkpoint' ? -1 : 1))
  for (const cp of checkpoints) {
    cp.crossingIndex = crossings.findIndex((c) => c.type === 'checkpoint' && c.elementIndex === cp.index) + 1
  }
  return { seed: 0, height, startColor, elements, checkpoints, crossings }
}

/** A still ring is entered on its fourth arc: world angle -pi/2 lands in quadrant 3. */
const ring = (y, colors, extra = {}) => ({
  kind: 'ring',
  y: y + 120,
  crossY: y,
  radius: 120,
  omega: 0,
  phase: 0,
  colors,
  ...extra,
})

const swatch = (y, color) => ({ kind: 'swatch', y, crossY: y, color })

const step = (run, course, opts) => stepRun(run, course, { dt: FIXED_DT, ...opts })

/** Drive a run upward, collecting every event. `stopOn` freezes it the moment
 *  that event fires, so a test can look at the state right then. */
function drive(run, course, { steps, tapEvery = 1, dt = FIXED_DT, stopOn = null }) {
  const events = []
  for (let i = 0; i < steps; i++) {
    const out = stepRun(run, course, { dt, tapped: tapEvery > 0 && i % tapEvery === 0 })
    run = out.run
    events.push(...out.events)
    if (run.status !== 'climbing') break
    if (stopOn && out.events.some((e) => e.type === stopOn)) break
  }
  return { run, events }
}

const typesOf = (events) => events.map((e) => e.type)

describe('createRun', () => {
  it('starts on the floor holding the course colour', () => {
    const course = makeCourse()
    const run = createRun(course)
    expect(run).toMatchObject({ y: 0, vy: 0, t: 0, color: 'blue', checkpointIndex: 0, status: 'climbing' })
    expect(run.cursor).toBe(course.checkpoints[0].crossingIndex)
  })
})

describe('colorAtCrossing', () => {
  it('reads a still ring at the bottom of its circle', () => {
    expect(colorAtCrossing(ring(0, ['blue', 'pink', 'turq', 'gold']), 0)).toBe('gold')
    expect(colorAtCrossing(ring(0, ['gold', 'blue', 'pink', 'turq']), 0)).toBe('turq')
  })

  it('turns the arcs under the crossing point over time', () => {
    const el = ring(0, ['blue', 'pink', 'turq', 'gold'], { omega: 1 })
    const seen = new Set()
    for (let t = 0; t < 7; t += 0.05) seen.add(colorAtCrossing(el, t))
    expect(seen).toEqual(new Set(['blue', 'pink', 'turq', 'gold']))
  })

  it('sweeps a slider past the centre line', () => {
    const el = { kind: 'slider', y: 0, crossY: 0, speed: 200, offset: 0, colors: ['blue', 'pink', 'turq', 'gold'] }
    const seen = new Set()
    for (let t = 0; t < 6; t += 0.05) seen.add(colorAtCrossing(el, t))
    expect(seen).toEqual(new Set(['blue', 'pink', 'turq', 'gold']))
  })

  it('is a pure function of the element and the time', () => {
    const el = ring(0, ['blue', 'pink', 'turq', 'gold'], { omega: 1.4, phase: 0.3 })
    expect(colorAtCrossing(el, 2.5)).toBe(colorAtCrossing(el, 2.5))
  })

  it('has no colour for a swatch', () => {
    expect(colorAtCrossing(swatch(100, 'pink'), 0)).toBeNull()
  })
})

describe('stepRun physics', () => {
  it('sets vertical speed on a tap rather than adding to it', () => {
    // Spamming must not rocket you: two taps in a row leave the same speed as one.
    const course = makeCourse()
    const once = step(createRun(course), course, { tapped: true })
    const twice = step(once.run, course, { tapped: true })
    expect(once.run.vy).toBeCloseTo(TAP_IMPULSE - GRAVITY * FIXED_DT, 6)
    expect(twice.run.vy).toBeCloseTo(once.run.vy, 6)
    expect(typesOf(once.events)).toContain(EVENTS.TAP)
  })

  it('integrates gravity between taps', () => {
    const course = makeCourse()
    let { run } = step(createRun(course), course, { tapped: true })
    const first = run.vy
    run = step(run, course).run
    expect(run.vy).toBeCloseTo(first - GRAVITY * FIXED_DT, 6)
  })

  it('clamps the fall at terminal velocity', () => {
    const course = makeCourse({ checkpointYs: [0] })
    let run = { ...createRun(course), y: 40000, vy: 0 }
    for (let i = 0; i < 400; i++) run = stepRun(run, course, { dt: FIXED_DT }).run
    expect(run.vy).toBeCloseTo(-TERMINAL_FALL, 6)
  })

  it('never mutates the run it was given', () => {
    const course = makeCourse({ elements: [swatch(200, 'pink')] })
    const run = createRun(course)
    const snapshot = JSON.stringify(run)
    stepRun(run, course, { dt: FIXED_DT, tapped: true })
    expect(JSON.stringify(run)).toBe(snapshot)
  })

  it('rests on the start line without reporting a fall every frame', () => {
    const course = makeCourse()
    const { run, events } = drive(createRun(course), course, { steps: 60, tapEvery: 0 })
    expect(run.y).toBe(0)
    expect(events).toEqual([])
  })

  it('does nothing once the run is over', () => {
    const course = makeCourse()
    const done = { ...createRun(course), status: 'finished' }
    const out = step(done, course, { tapped: true })
    expect(out.run).toBe(done)
    expect(out.events).toEqual([])
  })
})

describe('gates', () => {
  it('clears a gate whose arc matches the ball', () => {
    const course = makeCourse({ elements: [ring(400, ['pink', 'turq', 'gold', 'blue'])] })
    const { events } = drive(createRun(course), course, { steps: 400, tapEvery: 6 })
    expect(typesOf(events)).toContain(EVENTS.GATE_CLEARED)
    expect(typesOf(events)).not.toContain(EVENTS.WRONG_COLOR)
  })

  it('sends the ball back to its checkpoint on the wrong arc', () => {
    const course = makeCourse({
      elements: [ring(4000, ['blue', 'pink', 'turq', 'gold'])],
      checkpointYs: [0, 3000],
    })
    const { run, events } = drive(createRun(course), course, {
      steps: 4000,
      tapEvery: 6,
      stopOn: EVENTS.WRONG_COLOR,
    })
    const fault = events.find((e) => e.type === EVENTS.WRONG_COLOR)
    expect(fault).toMatchObject({ needed: 'gold', had: 'blue' })
    expect(run.checkpointIndex).toBe(1)
    expect(run.y).toBe(3000)
    expect(run.vy).toBe(0)
    expect(run.faults).toBeGreaterThan(0)
  })

  it('restores the checkpoint colour and re-arms the course on a rollback', () => {
    // A swatch above the checkpoint must be un-picked-up, or the retry starts wrong.
    const course = makeCourse({
      elements: [swatch(3400, 'pink'), ring(3800, ['blue', 'pink', 'turq', 'gold'])],
      checkpointYs: [0, 3000],
    })
    const { run } = drive(createRun(course), course, {
      steps: 4000,
      tapEvery: 6,
      stopOn: EVENTS.WRONG_COLOR,
    })
    expect(run.color).toBe('blue')
    expect(run.cursor).toBe(course.checkpoints[1].crossingIndex)
  })

  it('changes colour at a swatch, and only when the colour is new', () => {
    const course = makeCourse({ elements: [swatch(300, 'pink'), swatch(600, 'pink')] })
    const { run, events } = drive(createRun(course), course, { steps: 600, tapEvery: 6 })
    expect(run.color).toBe('pink')
    expect(events.filter((e) => e.type === EVENTS.COLOR_CHANGED)).toHaveLength(1)
  })

  it('re-arms a gate after falling back below it', () => {
    const course = makeCourse({ elements: [swatch(300, 'pink')], checkpointYs: [0] })
    let out = drive(createRun(course), course, { steps: 60, tapEvery: 3 })
    expect(out.run.y).toBeGreaterThan(300)
    const above = out.run.cursor
    out = drive(out.run, course, { steps: 300, tapEvery: 0 })
    expect(out.run.y).toBe(0)
    expect(out.run.cursor).toBeLessThan(above)
  })
})

describe('checkpoints and the finish', () => {
  it('records checkpoints in order and never goes backwards', () => {
    const course = makeCourse({ checkpointYs: [0, 500, 1000, 1500], height: 2000 })
    let run = createRun(course)
    let last = 0
    for (let i = 0; i < 2000 && run.status === 'climbing'; i++) {
      run = step(run, course, { tapped: i % 6 === 0 }).run
      expect(run.checkpointIndex).toBeGreaterThanOrEqual(last)
      last = run.checkpointIndex
    }
    expect(last).toBe(3)
  })

  it('finishes exactly once and stops there', () => {
    const course = makeCourse({ height: 1200 })
    const { run, events } = drive(createRun(course), course, { steps: 3000, tapEvery: 6 })
    expect(run.status).toBe('finished')
    expect(events.filter((e) => e.type === EVENTS.FINISHED)).toHaveLength(1)
    expect(run.finishT).toBeGreaterThan(0)
    expect(run.finishT).toBeLessThanOrEqual(run.t)
  })

  it('reports a real fall but not a rest', () => {
    // One tap, then long enough to land again: rising and coming back down is a
    // fall, sitting on the line afterwards is not.
    const course = makeCourse({ checkpointYs: [0] })
    const { run, events } = drive(createRun(course), course, { steps: 140, tapEvery: 150 })
    expect(events.filter((e) => e.type === EVENTS.FELL)).toHaveLength(1)
    expect(run.y).toBe(0)
  })
})

describe('the tunnelling guard', () => {
  it('evaluates every crossing exactly once, even packed tighter than one step', () => {
    // At terminal velocity a step covers TERMINAL_FALL * FIXED_DT units, far more
    // than a gate is thick. A containment test would skip straight past these;
    // a plane-crossing walk must catch all of them, and none of them twice.
    const reach = TERMINAL_FALL * FIXED_DT
    expect(reach).toBeGreaterThan(3)

    const colors = ['blue', 'pink', 'turq', 'gold']
    const elements = Array.from({ length: 60 }, (_, i) => swatch(200 + i * 3, colors[(i + 1) % 4]))
    const course = makeCourse({ elements, height: 900 })

    // Drive upward at the worst speed the accumulator can ever hand the engine.
    let run = createRun(course)
    const events = []
    for (let i = 0; i < 400 && run.status === 'climbing'; i++) {
      const out = stepRun({ ...run, vy: TERMINAL_FALL }, course, { dt: FIXED_DT })
      run = out.run
      events.push(...out.events)
    }

    expect(run.status).toBe('finished')
    expect(events.filter((e) => e.type === EVENTS.COLOR_CHANGED)).toHaveLength(elements.length)
    expect(events.filter((e) => e.type === EVENTS.FINISHED)).toHaveLength(1)
  })

  it('evaluates every gate on a real course, none skipped', () => {
    // Same sweep against generated geometry: shove the ball up at terminal velocity
    // and count gates. A fault rolls back, so track the high-water mark instead.
    const course = buildCourse(2024)
    const gates = course.crossings.filter((c) => c.type === 'ring' || c.type === 'slider')
    expect(gates.length).toBeGreaterThan(10)

    let run = createRun(course)
    let seen = 0
    let guard = 0
    while (run.status === 'climbing' && guard++ < 200000) {
      const from = { ...run, vy: TERMINAL_FALL }
      const out = stepRun(from, course, { dt: FIXED_DT })
      seen += out.events.filter((e) => e.type === EVENTS.GATE_CLEARED || e.type === EVENTS.WRONG_COLOR).length
      // A fault drops us to the checkpoint; step straight back up so the sweep goes on.
      run = out.run.y < from.y ? { ...out.run, cursor: out.run.cursor } : out.run
      if (out.run.y < from.y) run = { ...run, y: from.y, cursor: from.cursor + 1 }
    }
    expect(run.status).toBe('finished')
    expect(seen).toBe(gates.length)
  })
})

describe('runProgress', () => {
  it('reports the fraction climbed, clamped', () => {
    const course = makeCourse({ height: 1000 })
    expect(runProgress({ maxY: 0 }, course)).toBe(0)
    expect(runProgress({ maxY: 500 }, course)).toBe(0.5)
    expect(runProgress({ maxY: 9999 }, course)).toBe(1)
    expect(runProgress({ maxY: -20 }, course)).toBe(0)
  })
})
