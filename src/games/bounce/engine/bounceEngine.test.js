import { describe, it, expect } from 'vitest'
import { EVENTS, createRun, runProgress, stepRun } from './bounceEngine'
import { buildCourse } from './courseGen'
import {
  BALL_RADIUS,
  FIXED_DT,
  GRAVITY,
  RING_STROKE,
  TAP_APEX,
  TAP_IMPULSE,
  TERMINAL_FALL,
} from '../constants/bounceConstants'

/** A course fabricated by hand, shaped exactly like buildCourse's output. */
function makeCourse({ elements = [], checkpointYs = [0], height = 6000, startColor = 'blue' } = {}) {
  const checkpoints = checkpointYs.map((y, index) => ({ index, y, color: startColor, crossingIndex: 0 }))
  const crossings = [
    ...elements.flatMap((el, elementIndex) =>
      el.kind === 'chamber'
        ? [
            { y: el.crossY, type: 'chamber-entry', elementIndex },
            { y: el.exitY, type: 'chamber-exit', elementIndex },
          ]
        : [{ y: el.crossY ?? el.y, type: el.kind, elementIndex }]
    ),
    ...checkpoints.map((cp) => ({ y: cp.y, type: 'checkpoint', elementIndex: cp.index })),
    { y: height, type: 'finish', elementIndex: -1 },
  ].sort((a, b) => a.y - b.y || (a.type === 'checkpoint' ? -1 : 1))
  for (const cp of checkpoints) {
    cp.crossingIndex = crossings.findIndex((c) => c.type === 'checkpoint' && c.elementIndex === cp.index) + 1
  }
  return { seed: 0, height, startColor, elements, checkpoints, crossings, segments: [] }
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

/**
 * A still chamber. Its ceiling sits at world angle +pi/2, which on a phase of
 * zero lands on the *second* arc -- the opposite end of the circle from the one a
 * ring is entered through.
 */
const CHAMBER_RADIUS_FIXTURE = 240
function chamber(bottomY, colors, extra = {}) {
  const radius = CHAMBER_RADIUS_FIXTURE
  const wallInner = radius - RING_STROKE / 2
  const centre = bottomY + radius
  return {
    kind: 'chamber',
    y: centre,
    radius,
    crossY: centre - wallInner + BALL_RADIUS,
    exitY: centre + wallInner - BALL_RADIUS,
    omega: 0,
    phase: 0,
    colors,
    core: null,
    ...extra,
  }
}

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
const countOf = (events, type) => events.filter((e) => e.type === type).length

describe('createRun', () => {
  it('starts on the floor holding the course colour, inside nothing', () => {
    const course = makeCourse()
    const run = createRun(course)
    expect(run).toMatchObject({ y: 0, vy: 0, t: 0, color: 'blue', checkpointIndex: 0, status: 'climbing', inside: null })
    expect(run.cursor).toBe(course.checkpoints[0].crossingIndex)
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

  it('lifts a shade under one tap apex from rest, never over it', () => {
    // TAP_APEX is the continuous answer; stepping at a fixed dt lands a little
    // short of it, by about half a step of travel. The direction matters: every
    // chamber is sized against two tap apexes, so a real tap falling *short* of
    // the figure the constant assumes is what keeps "you cannot reach the ceiling
    // by accident" true with room to spare. If this ever overshot, that bound
    // would be the thing that quietly broke.
    const course = makeCourse()
    let run = createRun(course)
    let highest = 0
    for (let i = 0; i < 200; i++) {
      run = step(run, course, { tapped: i === 0 }).run
      highest = Math.max(highest, run.y)
    }
    expect(highest).toBeLessThanOrEqual(TAP_APEX)
    expect(highest).toBeGreaterThan(TAP_APEX - TAP_IMPULSE * FIXED_DT)
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
    expect(fault).toMatchObject({ needed: 'gold', had: 'blue', kind: 'ring' })
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
    expect(run.inside).toBeNull()
  })

  it('changes colour at a swatch, and only when the colour is new', () => {
    const course = makeCourse({ elements: [swatch(300, 'pink'), swatch(600, 'pink')] })
    const { run, events } = drive(createRun(course), course, { steps: 600, tapEvery: 6 })
    expect(run.color).toBe('pink')
    expect(events.filter((e) => e.type === EVENTS.COLOR_CHANGED)).toHaveLength(1)
    expect(events.find((e) => e.type === EVENTS.COLOR_CHANGED).from).toBe('swatch')
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

describe('the chamber', () => {
  const COLOURS = ['blue', 'pink', 'turq', 'gold']
  // A still chamber shows its second arc at the ceiling.
  const box = (extra) => chamber(600, COLOURS, extra)

  it('is entered without a colour check: the lip is not a gate', () => {
    // Holding blue, against a ceiling showing pink. Getting in is still free --
    // the chamber has exactly one fault point, and it is on the way out.
    const course = makeCourse({ elements: [box()] })
    const { run, events } = drive(createRun(course), course, {
      steps: 400,
      tapEvery: 6,
      stopOn: EVENTS.ENTERED_CHAMBER,
    })
    expect(typesOf(events)).toContain(EVENTS.ENTERED_CHAMBER)
    expect(typesOf(events)).not.toContain(EVENTS.WRONG_COLOR)
    expect(run.inside).toBe(0)
  })

  it('shuts the lip behind you: the floor is solid and you cannot drop out', () => {
    // This is what makes the ceiling fault fair. You can stand here and read the
    // turn for as long as you like, so committing is always a decision.
    const course = makeCourse({ elements: [box()] })
    const entered = drive(createRun(course), course, { steps: 400, tapEvery: 6, stopOn: EVENTS.ENTERED_CHAMBER })
    const settled = drive(entered.run, course, { steps: 600, tapEvery: 0 })

    expect(settled.run.inside).toBe(0)
    expect(settled.run.y).toBeCloseTo(course.elements[0].crossY, 6)
    expect(typesOf(settled.events)).not.toContain(EVENTS.FELL)
    expect(settled.run.y).toBeGreaterThan(course.checkpoints[0].y)
  })

  it('reports entering once, however long you bounce around inside', () => {
    const course = makeCourse({ elements: [box()] })
    const entered = drive(createRun(course), course, { steps: 400, tapEvery: 6, stopOn: EVENTS.ENTERED_CHAMBER })
    // One tap per full up-and-down, so the ball hops off the floor and settles
    // back on it over and over without ever climbing toward the ceiling. Each
    // landing must not read as arriving through the lip again.
    const milling = drive(entered.run, course, { steps: 900, tapEvery: 110 })
    expect(countOf(milling.events, EVENTS.ENTERED_CHAMBER)).toBe(0)
    expect(countOf(milling.events, EVENTS.WRONG_COLOR)).toBe(0)
    expect(milling.run.inside).toBe(0)
  })

  it('cannot be escaped on one tap from the floor, whatever the ceiling shows', () => {
    // The fairness invariant, from the inside: a single tap never commits you.
    const course = makeCourse({ elements: [box()] })
    const entered = drive(createRun(course), course, { steps: 400, tapEvery: 6, stopOn: EVENTS.ENTERED_CHAMBER })
    const settled = drive(entered.run, course, { steps: 400, tapEvery: 0 })

    const once = drive(settled.run, course, { steps: 200, tapEvery: 1000 })
    expect(typesOf(once.events)).not.toContain(EVENTS.WRONG_COLOR)
    expect(typesOf(once.events)).not.toContain(EVENTS.GATE_CLEARED)
    expect(once.run.inside).toBe(0)
  })

  it('lets you out through the ceiling on the colour it is showing', () => {
    const course = makeCourse({ elements: [box()] }, { startColor: 'blue' })
    // Start on the ceiling colour so the escape is clean.
    const run = { ...createRun(course), color: 'pink' }
    const { run: out, events } = drive(run, course, { steps: 900, tapEvery: 6 })
    expect(countOf(events, EVENTS.GATE_CLEARED)).toBe(1)
    expect(events.find((e) => e.type === EVENTS.GATE_CLEARED).kind).toBe('chamber-exit')
    expect(out.inside).toBeNull()
    expect(out.y).toBeGreaterThan(course.elements[0].exitY)
  })

  it('faults you back to the checkpoint on the wrong colour, once and not twice', () => {
    const course = makeCourse({ elements: [box()], checkpointYs: [0] })
    const { run, events } = drive(createRun(course), course, {
      steps: 900,
      tapEvery: 6,
      stopOn: EVENTS.WRONG_COLOR,
    })
    const fault = events.find((e) => e.type === EVENTS.WRONG_COLOR)
    expect(fault).toMatchObject({ needed: 'pink', had: 'blue', kind: 'chamber-exit' })
    expect(countOf(events, EVENTS.WRONG_COLOR)).toBe(1)
    expect(run.y).toBe(0)
    expect(run.inside).toBeNull()
  })

  it('catches you again if you drop back in through the ceiling you left by', () => {
    // A chamber is a room, not a gate, and it is solid in both directions. Were
    // it not, a floor you were resting on a moment ago would have become air the
    // instant you left by the top -- and a ball falling from the room above would
    // drop clean through it to the checkpoint, past a solid wall.
    const course = makeCourse({ elements: [box()], checkpointYs: [0] })
    const built = course.elements[0]
    // Start just above the chamber, on its own colour, falling.
    const above = { ...createRun(course), color: 'pink', y: built.exitY + 120, vy: -200, cursor: 3 }
    const { run, events } = drive(above, course, { steps: 400, tapEvery: 0 })

    expect(run.inside).toBe(0)
    expect(run.y).toBeCloseTo(built.crossY, 6)
    expect(events.find((e) => e.type === EVENTS.ENTERED_CHAMBER)).toMatchObject({ fell: true })
    expect(typesOf(events)).not.toContain(EVENTS.FELL)
  })

  it('paints the ball whatever the core is showing, for as long as it is touched', () => {
    const floorY = chamber(600, COLOURS).crossY
    const core = { y: floorY, period: 0.4, phase: 0, colors: COLOURS }
    const course = makeCourse({ elements: [chamber(600, COLOURS, { core })] })

    const entered = drive(createRun(course), course, { steps: 400, tapEvery: 6, stopOn: EVENTS.ENTERED_CHAMBER })
    // Sit on the floor, in the core, and let it cycle underneath us.
    const held = drive(entered.run, course, { steps: 400, tapEvery: 0 })
    const painted = held.events.filter((e) => e.type === EVENTS.COLOR_CHANGED)

    expect(painted.length).toBeGreaterThan(1)
    expect(painted.every((e) => e.from === 'core')).toBe(true)
    expect(new Set(painted.map((e) => e.color)).size).toBeGreaterThan(1)
  })

  it('leaves the colour alone once the ball is clear of the core', () => {
    // The holding zone between the core and the ceiling is where the skill is:
    // take a colour, rise out of the core, and keep it while you read the turn.
    const built = chamber(600, COLOURS)
    const core = { y: built.crossY, period: 0.4, phase: 0, colors: COLOURS }
    const course = makeCourse({ elements: [chamber(600, COLOURS, { core })] })

    const entered = drive(createRun(course), course, { steps: 400, tapEvery: 6, stopOn: EVENTS.ENTERED_CHAMBER })
    const above = { ...entered.run, y: built.exitY - 30, vy: 0 }
    const { events } = drive(above, course, { steps: 30, tapEvery: 0 })
    expect(typesOf(events)).not.toContain(EVENTS.COLOR_CHANGED)
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

  it('never rushes a ball straight through a chamber', () => {
    // A chamber is the one thing you can be inside, so the failure mode here is
    // worse than a skipped ring: you would sail out of the top of a room you were
    // supposed to be solving. Shoved upward at terminal velocity, the lip must
    // still catch and the ceiling must still be tested.
    const colors = ['blue', 'pink', 'turq', 'gold']
    const course = makeCourse({ elements: [chamber(600, colors)], checkpointYs: [0], height: 4000 })

    let run = createRun(course)
    const events = []
    for (let i = 0; i < 300 && run.status === 'climbing'; i++) {
      const out = stepRun({ ...run, vy: TERMINAL_FALL }, course, { dt: FIXED_DT })
      run = out.run
      events.push(...out.events)
      if (out.events.some((e) => e.type === EVENTS.WRONG_COLOR)) break
    }

    expect(countOf(events, EVENTS.ENTERED_CHAMBER)).toBe(1)
    expect(countOf(events, EVENTS.WRONG_COLOR)).toBe(1)
    expect(events.find((e) => e.type === EVENTS.WRONG_COLOR).kind).toBe('chamber-exit')
  })

  it('evaluates every gate on a real course, none skipped', () => {
    // Same sweep against generated geometry: shove the ball up at terminal velocity
    // and count gates. A fault rolls back, so track the high-water mark instead.
    const course = buildCourse(2024)
    const gated = new Set(['ring', 'pendulum', 'ratchet', 'slider', 'shutter', 'chamber-exit'])
    const gates = course.crossings.filter((c) => gated.has(c.type))
    expect(gates.length).toBeGreaterThan(10)

    let run = createRun(course)
    let seen = 0
    let guard = 0
    while (run.status === 'climbing' && guard++ < 200000) {
      const from = { ...run, vy: TERMINAL_FALL }
      const out = stepRun(from, course, { dt: FIXED_DT })
      seen += out.events.filter((e) => e.type === EVENTS.GATE_CLEARED || e.type === EVENTS.WRONG_COLOR).length
      // A fault drops us to the checkpoint; step straight back up so the sweep goes on.
      run = out.run.y < from.y ? { ...out.run, y: from.y, cursor: from.cursor + 1, inside: from.inside } : out.run
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
