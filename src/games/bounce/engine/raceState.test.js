import { describe, it, expect } from 'vitest'
import {
  EVENTS,
  applyFinish,
  applyProgress,
  createRace,
  isMatchInProgress,
  markConnected,
  removeLobbySeat,
  resetToLobby,
  snapshotFor,
  standings,
  startRace,
} from './raceState'
import {
  MIN_CHECKPOINT_SPAN,
  COURSE_HEIGHT,
  MAX_CLIMB_RATE,
  MIN_FINISH_MS,
  STALE_REPORT_MS,
} from '../constants/bounceConstants'

const T0 = 1_000_000

const race = (names = ['Ada', 'Bo']) =>
  createRace({
    roomCode: 'AB12',
    maxPlayers: 4,
    players: names.map((name, i) => ({
      name,
      avatar: '😎',
      isHost: i === 0,
      peerId: i === 0 ? null : `peer-${i}`,
      sessionId: `sid-${i}`,
    })),
  })

const started = (names) => {
  const r = race(names)
  startRace(r, { seed: 99, nowMs: T0 })
  return r
}

/** The honest time to climb `units`, plus a beat so the ceiling clears it. */
const msFor = (units) => Math.ceil((units / MAX_CLIMB_RATE) * 1000) + 50

describe('createRace', () => {
  it('seats players in the lobby with ids matching their index', () => {
    const r = race(['Ada', 'Bo', 'Cy'])
    expect(r.phase).toBe('lobby')
    expect(r.players.map((p) => p.id)).toEqual([0, 1, 2])
    expect(r.players[0].isHost).toBe(true)
    expect(r.players.every((p) => p.progress === 0 && !p.finished)).toBe(true)
    expect(isMatchInProgress(r)).toBe(false)
  })
})

describe('startRace', () => {
  it('starts the race and locks the names on the start line', () => {
    const r = race()
    const out = startRace(r, { seed: 4242, nowMs: T0 })
    expect(out.ok).toBe(true)
    expect(out.events).toEqual([{ type: EVENTS.RACE_STARTED, seed: 4242 }])
    expect(r.phase).toBe('racing')
    expect(r.seed).toBe(4242)
    expect(isMatchInProgress(r)).toBe(true)
    expect([...r.lockedLobbyPlayerNames]).toEqual(['ada', 'bo'])
  })

  it('refuses a race with nobody to race', () => {
    expect(startRace(race(['Ada']), { seed: 1, nowMs: T0 }).ok).toBe(false)
  })

  it('refuses to start twice', () => {
    const r = started()
    expect(startRace(r, { seed: 2, nowMs: T0 }).ok).toBe(false)
  })

  it('clears every run, so a rematch starts from the floor', () => {
    const r = started()
    applyProgress(r, 1, { y: 400 }, T0 + msFor(400))
    resetToLobby(r)
    startRace(r, { seed: 7, nowMs: T0 })
    expect(r.players.every((p) => p.progress === 0 && p.rank === null)).toBe(true)
  })
})

describe('applyProgress', () => {
  it('accepts an honest climb', () => {
    const r = started()
    const out = applyProgress(r, 1, { y: 600, checkpointIndex: 0 }, T0 + msFor(600))
    expect(out.ok).toBe(true)
    expect(r.players[1].y).toBe(600)
    expect(r.players[1].progress).toBe(600)
    expect(r.players[1].suspect).toBe(false)
  })

  it('refuses a climb faster than the tap impulse allows, and flags the racer', () => {
    // Nobody can rise faster than TAP_IMPULSE; a report above that is clamped.
    const r = started()
    const out = applyProgress(r, 1, { y: 20000 }, T0 + 1000)
    expect(out.ok).toBe(true)
    expect(r.players[1].suspect).toBe(true)
    expect(r.players[1].progress).toBeLessThan(20000)
    expect(r.players[1].progress).toBeLessThanOrEqual(MAX_CLIMB_RATE * 1.5 + 400)
  })

  it('lets a racer fall back without flagging them or losing their progress', () => {
    const r = started()
    applyProgress(r, 1, { y: 5000 }, T0 + msFor(5000))
    applyProgress(r, 1, { y: 3000 }, T0 + msFor(5000) + 200)
    expect(r.players[1].y).toBe(3000)
    expect(r.players[1].progress).toBe(5000)
    expect(r.players[1].suspect).toBe(false)
  })

  it('re-climbing ground already covered is never suspect', () => {
    const r = started()
    applyProgress(r, 1, { y: 5000 }, T0 + msFor(5000))
    applyProgress(r, 1, { y: 3000 }, T0 + msFor(5000) + 200)
    applyProgress(r, 1, { y: 4900 }, T0 + msFor(5000) + 400)
    expect(r.players[1].suspect).toBe(false)
  })

  it('refuses a checkpoint the racer has not climbed to', () => {
    const r = started()
    applyProgress(r, 1, { y: 600, checkpointIndex: 7 }, T0 + msFor(600))
    expect(r.players[1].checkpointIndex).toBe(0)
  })

  it('never lets a checkpoint go backwards', () => {
    const r = started()
    applyProgress(r, 1, { y: MIN_CHECKPOINT_SPAN * 2 }, T0 + msFor(MIN_CHECKPOINT_SPAN * 2))
    applyProgress(r, 1, { y: MIN_CHECKPOINT_SPAN * 2, checkpointIndex: 2 }, T0 + msFor(MIN_CHECKPOINT_SPAN * 2) + 200)
    expect(r.players[1].checkpointIndex).toBe(2)
    applyProgress(r, 1, { y: 10, checkpointIndex: 0 }, T0 + msFor(MIN_CHECKPOINT_SPAN * 2) + 400)
    expect(r.players[1].checkpointIndex).toBe(2)
  })

  it('clamps a negative or absurd height', () => {
    const r = started()
    applyProgress(r, 1, { y: -9999 }, T0 + 500)
    expect(r.players[1].y).toBe(0)
  })

  it('refuses malformed progress', () => {
    const r = started()
    expect(applyProgress(r, 1, { y: 'up' }, T0 + 500).ok).toBe(false)
    expect(applyProgress(r, 1, {}, T0 + 500).ok).toBe(false)
  })

  it('refuses a report for a seat that does not exist, or before the flag drops', () => {
    expect(applyProgress(started(), 9, { y: 10 }, T0).ok).toBe(false)
    expect(applyProgress(race(), 1, { y: 10 }, T0).ok).toBe(false)
  })
})

describe('applyFinish', () => {
  const legitFinish = (r, seatId) => {
    const at = T0 + MIN_FINISH_MS + 5000
    applyProgress(r, seatId, { y: COURSE_HEIGHT }, at - 100)
    return applyFinish(r, seatId, at)
  }

  it('accepts a finish that the reported climb supports', () => {
    const r = started()
    const out = legitFinish(r, 1)
    expect(out.ok).toBe(true)
    expect(out.events[0]).toMatchObject({ type: EVENTS.RACER_FINISHED, id: 1, rank: 1 })
    expect(r.players[1].finished).toBe(true)
    expect(r.players[1].finishMs).toBeGreaterThanOrEqual(MIN_FINISH_MS)
    expect(r.winnerId).toBe(1)
  })

  it('refuses a finish sooner than the course can be climbed', () => {
    const r = started()
    const out = applyFinish(r, 1, T0 + MIN_FINISH_MS - 1000)
    expect(out.ok).toBe(false)
    expect(r.players[1].finished).toBe(false)
    expect(r.players[1].suspect).toBe(true)
  })

  it('refuses a finish from a client that never reported a climb', () => {
    // Silence then a claim on the line must not work, however long the wait.
    const r = started()
    expect(applyFinish(r, 1, T0 + MIN_FINISH_MS + 10).ok).toBe(false)
    expect(applyFinish(r, 1, T0 + MIN_FINISH_MS + 600_000).ok).toBe(false)
    expect(r.players[1].finished).toBe(false)
  })

  it('refuses a finish when the reported climb is nowhere near the line', () => {
    // Reporting honestly a third of the way up and then claiming the finish is
    // caught by the same rate bound, chained through to the line.
    const r = started()
    const at = T0 + MIN_FINISH_MS + 30_000
    applyProgress(r, 1, { y: COURSE_HEIGHT / 3 }, at - 200)
    const out = applyFinish(r, 1, at)
    expect(out.ok).toBe(false)
    expect(r.players[1].suspect).toBe(true)
  })

  it('refuses a finish once the climber has gone quiet', () => {
    const r = started()
    const last = T0 + MIN_FINISH_MS + 1000
    applyProgress(r, 1, { y: COURSE_HEIGHT }, last)
    expect(applyFinish(r, 1, last + STALE_REPORT_MS + 1).ok).toBe(false)
    expect(applyFinish(r, 1, last + STALE_REPORT_MS - 1).ok).toBe(true)
  })

  it('bounds the whole climb by elapsed time, not just each interval', () => {
    // Per-interval slack must not compound: a burst of small over-reports cannot
    // add up to a course the racer has not had time to climb.
    const r = started()
    for (let i = 1; i <= 100; i++) {
      applyProgress(r, 1, { y: i * 400 }, T0 + i * 200)
    }
    const elapsedSeconds = (100 * 200) / 1000
    expect(r.players[1].progress).toBeLessThanOrEqual(MAX_CLIMB_RATE * elapsedSeconds + 400)
  })

  it('ranks finishers in the order the host received them', () => {
    const r = started(['Ada', 'Bo', 'Cy'])
    legitFinish(r, 2)
    legitFinish(r, 0)
    expect(r.players[2].rank).toBe(1)
    expect(r.players[0].rank).toBe(2)
    expect(r.winnerId).toBe(2)
  })

  it('ends the race when everyone still connected is home', () => {
    const r = started()
    legitFinish(r, 0)
    const out = legitFinish(r, 1)
    expect(r.phase).toBe('over')
    expect(out.events.at(-1)).toMatchObject({ type: EVENTS.RACE_OVER, winnerId: 0 })
  })

  it('is idempotent, so a repeated finish cannot take a second rank', () => {
    const r = started(['Ada', 'Bo', 'Cy'])
    legitFinish(r, 1)
    const again = applyFinish(r, 1, T0 + MIN_FINISH_MS + 9000)
    expect(again.ok).toBe(true)
    expect(again.events).toEqual([])
    expect(r.players.filter((p) => p.rank === 1)).toHaveLength(1)
  })
})

describe('leaving', () => {
  it('does not hold the race open for a player who dropped', () => {
    const r = started()
    applyProgress(r, 0, { y: COURSE_HEIGHT }, T0 + MIN_FINISH_MS + 4900)
    applyFinish(r, 0, T0 + MIN_FINISH_MS + 5000)
    expect(r.phase).toBe('racing')
    const out = markConnected(r, 1, false)
    expect(r.phase).toBe('over')
    expect(out.events.at(-1)).toMatchObject({ type: EVENTS.RACE_OVER })
  })

  it('renumbers seats when someone leaves the lobby, since ids are the index', () => {
    const r = race(['Ada', 'Bo', 'Cy'])
    removeLobbySeat(r, 1)
    expect(r.players.map((p) => p.id)).toEqual([0, 1])
    expect(r.players.map((p) => p.name)).toEqual(['Ada', 'Cy'])
  })

  it('will not renumber seats once the race is running', () => {
    expect(removeLobbySeat(started(), 1).ok).toBe(false)
  })

  it('drops disconnected players on the way back to the lobby', () => {
    const r = started(['Ada', 'Bo', 'Cy'])
    markConnected(r, 2, false)
    resetToLobby(r)
    expect(r.phase).toBe('lobby')
    expect(r.players.map((p) => p.name)).toEqual(['Ada', 'Bo'])
    expect(r.players.map((p) => p.id)).toEqual([0, 1])
    expect(r.lockedLobbyPlayerNames).toBeNull()
  })
})

describe('standings', () => {
  it('puts finishers first by rank, then whoever has climbed highest', () => {
    const r = started(['Ada', 'Bo', 'Cy'])
    applyProgress(r, 1, { y: 9000 }, T0 + msFor(9000))
    applyProgress(r, 2, { y: 4000 }, T0 + msFor(9000))
    applyProgress(r, 0, { y: COURSE_HEIGHT }, T0 + MIN_FINISH_MS + 4900)
    applyFinish(r, 0, T0 + MIN_FINISH_MS + 5000)
    expect(standings(r).map((p) => p.name)).toEqual(['Ada', 'Bo', 'Cy'])
  })
})

describe('snapshotFor', () => {
  it('never puts a peer id or a session id on the wire', () => {
    // A session id walks straight back into its seat, skipping the liveness probe.
    const r = started()
    const snap = snapshotFor(r, 1)
    const wire = JSON.stringify(snap)
    expect(wire).not.toContain('peer-1')
    expect(wire).not.toContain('sid-')
    for (const seat of snap.seats) {
      expect(seat).not.toHaveProperty('peerId')
      expect(seat).not.toHaveProperty('sessionId')
    }
  })

  it('keeps the host suspicion flag to itself', () => {
    const r = started()
    applyProgress(r, 1, { y: 20000 }, T0 + 500)
    expect(r.players[1].suspect).toBe(true)
    expect(snapshotFor(r, 1).seats[1]).not.toHaveProperty('suspect')
  })

  it('tells each player which seat is theirs and hands over the seed', () => {
    const r = started()
    expect(snapshotFor(r, 1)).toMatchObject({ yourId: 1, seed: 99, phase: 'racing', height: COURSE_HEIGHT })
    expect(snapshotFor(r, 0).yourId).toBe(0)
  })

  it('carries what the lobby and the rail need to draw', () => {
    const snap = snapshotFor(started(), 0)
    expect(snap.seats[0]).toMatchObject({ id: 0, name: 'Ada', avatar: '😎', isHost: true, progress: 0 })
  })
})
