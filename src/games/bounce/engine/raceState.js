import {
  CHECKPOINT_SPAN,
  CLIMB_ALLOWANCE,
  CLIMB_TOLERANCE,
  COURSE_HEIGHT,
  MAX_CLIMB_RATE,
  MIN_FINISH_MS,
  MIN_PLAYERS,
  STALE_REPORT_MS,
} from '../constants/bounceConstants'

/**
 * The race the host owns.
 *
 * Every device simulates its own ball, so this never runs the physics. What it
 * does is decide what it is willing to believe: the host holds the seed, the
 * standings and the result, and a reported height is checked against the physics
 * before it is accepted.
 *
 * That bounds cheating rather than eliminating it -- a client could still climb
 * at exactly the legal maximum. Closing that gap means simulating every ball
 * host-side, which puts a network round trip between a tap and the ball rising
 * and makes the game feel broken for everyone. For a party game the bound is the
 * right trade, and it is written down here so nobody mistakes it for an oversight.
 *
 * Mutates `race` in place and reports what happened, the shape UNO and Liar's
 * Dice use: (race, ...args) => { ok, reason?, events }.
 */

export const EVENTS = {
  RACE_STARTED: 'RACE_STARTED',
  RACER_FINISHED: 'RACER_FINISHED',
  RACE_OVER: 'RACE_OVER',
}

const ok = (events = []) => ({ ok: true, events })
const refuse = (reason) => ({ ok: false, reason, events: [] })

const blankRun = () => ({
  y: 0,
  progress: 0,
  checkpointIndex: 0,
  finished: false,
  finishMs: null,
  rank: null,
  suspect: false,
  lastReportMs: null,
})

export function createRace({ roomCode = '', maxPlayers = 4, players = [] } = {}) {
  return {
    roomCode,
    maxPlayers,
    phase: 'lobby',
    seed: 0,
    height: COURSE_HEIGHT,
    startedAtMs: null,
    winnerId: null,
    lockedLobbyPlayerNames: null,
    players: players.map((p, id) => ({
      id,
      peerId: p.peerId ?? null,
      sessionId: p.sessionId ?? '',
      name: p.name,
      avatar: p.avatar || '😎',
      isHost: Boolean(p.isHost),
      isYou: false,
      connected: true,
      ...blankRun(),
    })),
  }
}

export const isMatchInProgress = (race) => race?.phase === 'racing'

const seatOf = (race, seatId) => race.players.find((p) => p.id === seatId)

const activeRacers = (race) => race.players.filter((p) => p.connected !== false)

export function startRace(race, { seed, nowMs }) {
  if (race.phase === 'racing') return refuse('The race is already under way.')
  if (race.players.length < MIN_PLAYERS) return refuse(`Bounce needs at least ${MIN_PLAYERS} players.`)

  race.phase = 'racing'
  race.seed = seed >>> 0
  race.startedAtMs = nowMs
  race.winnerId = null
  // Only names on the start line may come back after a drop.
  race.lockedLobbyPlayerNames = new Set(race.players.map((p) => String(p.name || '').trim().toLowerCase()))
  for (const p of race.players) Object.assign(p, blankRun())

  return ok([{ type: EVENTS.RACE_STARTED, seed: race.seed }])
}

/**
 * The highest a racer could honestly be by now. Two bounds, and the lower wins.
 *
 * The first runs from their last accepted height, with slack for jitter and a
 * late packet so honest play is never flagged. The second runs from the start of
 * the race with no multiplicative slack at all -- nobody can have climbed more
 * than the tap impulse times the time elapsed, and without this hard bound the
 * per-interval tolerance would compound into 20% of the whole course.
 */
function climbCeiling(seat, race, nowMs) {
  const sinceReport = Math.max(0, nowMs - (seat.lastReportMs ?? race.startedAtMs ?? nowMs))
  const sinceStart = Math.max(0, nowMs - (race.startedAtMs ?? nowMs))
  const fromLast = seat.progress + ((MAX_CLIMB_RATE * sinceReport) / 1000) * CLIMB_TOLERANCE + CLIMB_ALLOWANCE
  const fromStart = (MAX_CLIMB_RATE * sinceStart) / 1000 + CLIMB_ALLOWANCE
  return Math.min(fromLast, fromStart)
}

export function applyProgress(race, seatId, report, nowMs) {
  if (race.phase !== 'racing') return refuse('The race is not running.')
  const seat = seatOf(race, seatId)
  if (!seat) return refuse('No such seat.')
  if (seat.finished) return ok()

  const reported = Number(report?.y)
  if (!Number.isFinite(reported)) return refuse('Malformed progress.')

  const ceiling = climbCeiling(seat, race, nowMs)
  let y = Math.min(Math.max(reported, 0), race.height)
  if (y > ceiling) {
    y = Math.min(ceiling, race.height)
    seat.suspect = true
  }

  seat.y = y
  seat.progress = Math.max(seat.progress, y)

  // A checkpoint you have not climbed to is not a checkpoint you hold.
  const claimed = Number(report?.checkpointIndex)
  if (Number.isFinite(claimed)) {
    const reachable = Math.floor(seat.progress / CHECKPOINT_SPAN)
    seat.checkpointIndex = Math.max(seat.checkpointIndex, Math.min(Math.max(claimed, 0), reachable))
  }

  seat.lastReportMs = nowMs
  return ok()
}

export function applyFinish(race, seatId, nowMs) {
  if (race.phase !== 'racing') return refuse('The race is not running.')
  const seat = seatOf(race, seatId)
  if (!seat) return refuse('No such seat.')
  if (seat.finished) return ok()

  const elapsed = nowMs - race.startedAtMs
  if (elapsed < MIN_FINISH_MS) {
    seat.suspect = true
    return refuse('That finish came in faster than the course can be climbed.')
  }
  // A finish is only believed on the back of a live climb. Clients report five
  // times a second, so silence this long means they are gone -- and without it a
  // client could skip every report and simply claim the line, since a bound that
  // starts from zero progress has nothing to bite on.
  if (seat.lastReportMs === null || nowMs - seat.lastReportMs > STALE_REPORT_MS) {
    return refuse('No recent progress: keep climbing and the finish will register.')
  }
  // Chain the same rate bound through to the line, so the last stretch has to
  // have been climbed rather than asserted.
  if (climbCeiling(seat, race, nowMs) < race.height) {
    seat.suspect = true
    return refuse('That finish does not match the progress reported.')
  }

  seat.finished = true
  seat.finishMs = elapsed
  seat.y = race.height
  seat.progress = race.height
  seat.checkpointIndex = Math.floor(race.height / CHECKPOINT_SPAN)
  seat.lastReportMs = nowMs
  seat.rank = race.players.filter((p) => p.finished).length

  const events = [{ type: EVENTS.RACER_FINISHED, id: seat.id, rank: seat.rank, ms: elapsed }]
  if (seat.rank === 1) race.winnerId = seat.id

  if (activeRacers(race).every((p) => p.finished)) {
    race.phase = 'over'
    events.push({ type: EVENTS.RACE_OVER, winnerId: race.winnerId })
  }
  return ok(events)
}

export function markConnected(race, seatId, connected) {
  const seat = seatOf(race, seatId)
  if (!seat) return refuse('No such seat.')
  seat.connected = connected
  if (!connected) seat.peerId = null

  // The last climber still going shouldn't be held up by players who left.
  if (race.phase === 'racing' && activeRacers(race).length > 0 && activeRacers(race).every((p) => p.finished)) {
    race.phase = 'over'
    return ok([{ type: EVENTS.RACE_OVER, winnerId: race.winnerId }])
  }
  return ok()
}

/** Ids are the seat index, and the handshake relies on it, so renumber on removal. */
export function removeLobbySeat(race, seatId) {
  if (race.phase !== 'lobby') return refuse('The race has started.')
  race.players = race.players.filter((p) => p.id !== seatId).map((p, id) => ({ ...p, id }))
  return ok()
}

export function resetToLobby(race) {
  race.phase = 'lobby'
  race.seed = 0
  race.startedAtMs = null
  race.winnerId = null
  race.lockedLobbyPlayerNames = null
  race.players = race.players.filter((p) => p.connected !== false).map((p, id) => ({ ...p, id, ...blankRun() }))
  return ok()
}

/** Who is ahead: the highest anyone has actually climbed, finishers first by rank. */
export function standings(race) {
  return [...race.players].sort((a, b) => {
    if (a.finished && b.finished) return a.rank - b.rank
    if (a.finished !== b.finished) return a.finished ? -1 : 1
    return b.progress - a.progress
  })
}

/**
 * What one player is allowed to see.
 *
 * No peerId and no sessionId ever go on the wire: a session id walks straight
 * back into its seat, skipping the liveness probe. Nor does `suspect` -- that is
 * the host's business.
 */
export function snapshotFor(race, seatId) {
  return {
    phase: race.phase,
    roomCode: race.roomCode,
    maxPlayers: race.maxPlayers,
    seed: race.seed,
    height: race.height,
    yourId: seatId,
    winnerId: race.winnerId,
    seats: race.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.isHost,
      connected: p.connected,
      progress: p.progress,
      checkpointIndex: p.checkpointIndex,
      finished: p.finished,
      finishMs: p.finishMs,
      rank: p.rank,
    })),
  }
}
