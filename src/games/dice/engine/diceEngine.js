import {
  MAX_DICE,
  MIN_PLAYERS,
  MAX_PLAYERS,
  EXACT_MIN_PLAYERS,
  PALIFICO_MIN_PLAYERS,
} from '../constants/diceConstants'
import { bidRejection, countMatches, onesAreWild, smallestLegalBid } from './bidRules'
import { rollDie } from '../../../utils/rng'

/**
 * Liar's Dice, host-authoritative and pure.
 *
 * Every action mutates `game` in place and returns { ok, reason?, events }.
 * The caller -- services/diceTable.js -- turns events into sound, timers and
 * broadcasts. Nothing here touches React, the network, or the clock, and
 * randomness is always passed in.
 *
 * Seat ids are the index into `players`. That is what the room handshake
 * assigns, and it is why removing a lobby seat renumbers.
 */

const done = (events = []) => ({ ok: true, events })
const fail = (reason) => ({ ok: false, reason, events: [] })

const cloneDice = (dice) => Object.fromEntries(Object.entries(dice).map(([id, d]) => [id, [...d]]))

const emptyRound = () => ({
  counts: {},
  dice: {},
  turn: null,
  currentBid: null,
  bidHistory: [],
  palifico: null,
  pendingPalifico: null,
  palificoUsed: [],
  reveal: null,
  nextStarter: null,
  eliminated: [],
  winnerId: null,
  round: 0,
  lockedLobbyPlayerNames: null,
})

export function createGame({ roomCode = '', maxPlayers = MAX_PLAYERS, players }) {
  return {
    roomCode,
    maxPlayers: Math.min(Math.max(maxPlayers, MIN_PLAYERS), MAX_PLAYERS),
    phase: 'lobby',
    players: players.map((p, index) => ({
      connected: true,
      isHost: index === 0,
      isBot: false,
      ...p,
      id: index,
    })),
    ...emptyRound(),
  }
}

// --- accessors ---------------------------------------------------------------

export const isMatchInProgress = (game) => game.phase !== 'lobby'

const countOf = (game, id) => game.counts[id] ?? 0

export const diceInPlay = (game) => game.players.reduce((sum, p) => sum + countOf(game, p.id), 0)

export const activeSeatIds = (game) =>
  game.players.filter((p) => countOf(game, p.id) > 0).map((p) => p.id)

/** The next seat clockwise from `fromId` that still has dice. */
export function nextActiveSeat(game, fromId) {
  const n = game.players.length
  for (let step = 1; step <= n; step++) {
    const id = (fromId + step) % n
    if (countOf(game, id) > 0) return id
  }
  return null
}

/** Winner first, then everyone else, most recently knocked out first. */
export function rankingsOf(game) {
  if (game.winnerId === null) return []
  return [game.winnerId, ...game.eliminated.toReversed()]
}

const ruleContext = (game) => ({ diceInPlay: diceInPlay(game), palifico: game.palifico })

const countOnTable = (game, bid) =>
  countMatches(Object.values(game.dice).flat(), bid, game.palifico)

function turnError(game, seatId) {
  if (game.phase !== 'bidding') return 'Wait for the next round.'
  if (seatId !== game.turn) return "It isn't your turn."
  return null
}

// --- rounds ------------------------------------------------------------------

function beginRound(game, starterId, rng) {
  game.round += 1
  game.palifico = game.pendingPalifico
  game.pendingPalifico = null
  game.dice = {}
  for (const p of game.players) {
    game.dice[p.id] = Array.from({ length: countOf(game, p.id) }, () => rollDie(rng))
  }
  game.turn = starterId
  game.currentBid = null
  game.bidHistory = []
  game.reveal = null
  game.nextStarter = null
  game.phase = 'bidding'
  return { type: 'ROLLED', round: game.round, starterId, palifico: game.palifico }
}

export function startMatch(game, rng) {
  if (game.phase !== 'lobby' && game.phase !== 'over') return fail('A round is already under way.')
  if (game.players.length < MIN_PLAYERS) {
    return fail(`Liar's Dice needs at least ${MIN_PLAYERS} players.`)
  }
  if (game.players.length > MAX_PLAYERS) {
    return fail(`Liar's Dice seats at most ${MAX_PLAYERS} players.`)
  }

  Object.assign(game, emptyRound())
  game.counts = Object.fromEntries(game.players.map((p) => [p.id, MAX_DICE]))
  game.lockedLobbyPlayerNames = new Set(game.players.map((p) => p.name.trim().toLowerCase()))
  return done([beginRound(game, game.players[0].id, rng)])
}

export function nextRound(game, rng) {
  if (game.phase !== 'reveal') return fail('There is no round to move on from.')
  if (game.winnerId !== null) {
    game.phase = 'over'
    game.reveal = null
    game.pendingPalifico = null
    return done([{ type: 'GAME_OVER', winnerId: game.winnerId }])
  }
  return done([beginRound(game, game.nextStarter, rng)])
}

// --- the three things you can do on your turn --------------------------------

export function placeBid(game, seatId, bid) {
  const notYours = turnError(game, seatId)
  if (notYours) return fail(notYours)

  const clean = { quantity: bid?.quantity, face: bid?.face }
  const reason = bidRejection(clean, game.currentBid, ruleContext(game))
  if (reason) return fail(reason)

  const placed = { ...clean, seatId }
  game.currentBid = placed
  game.bidHistory = [...game.bidHistory, placed]
  game.turn = nextActiveSeat(game, seatId)
  return done([{ type: 'BID', seatId, bid: placed }])
}

export function callLiar(game, seatId) {
  const notYours = turnError(game, seatId)
  if (notYours) return fail(notYours)
  const bid = game.currentBid
  if (!bid) return fail('There is no bid to challenge yet.')

  const count = countOnTable(game, bid)
  const loserId = count >= bid.quantity ? seatId : bid.seatId
  return resolveChallenge(game, { kind: 'liar', callerId: seatId, bid, count, loserId, gainerId: null })
}

export function callExact(game, seatId) {
  const notYours = turnError(game, seatId)
  if (notYours) return fail(notYours)
  const bid = game.currentBid
  if (!bid) return fail('There is no bid to call exact on yet.')
  if (activeSeatIds(game).length < EXACT_MIN_PLAYERS) {
    return fail('Exact needs at least three players still in.')
  }

  const count = countOnTable(game, bid)
  const hit = count === bid.quantity
  return resolveChallenge(game, {
    kind: 'exact',
    callerId: seatId,
    bid,
    count,
    loserId: hit ? null : seatId,
    gainerId: hit ? seatId : null,
  })
}

function resolveChallenge(game, { kind, callerId, bid, count, loserId, gainerId }) {
  const events = []

  if (loserId !== null) {
    game.counts[loserId] -= 1
    events.push({ type: 'DIE_LOST', seatId: loserId })
    if (game.counts[loserId] === 0) {
      game.eliminated = [...game.eliminated, loserId]
      events.push({ type: 'ELIMINATED', seatId: loserId })
    }
  }

  let gained = false
  if (gainerId !== null && game.counts[gainerId] < MAX_DICE) {
    game.counts[gainerId] += 1
    gained = true
    events.push({ type: 'DIE_GAINED', seatId: gainerId })
  }

  const stillIn = activeSeatIds(game)
  if (stillIn.length === 1) game.winnerId = stillIn[0]

  // The loser starts; after a successful Exact nobody lost, so the caller does.
  const starter = loserId ?? callerId
  game.nextStarter = countOf(game, starter) > 0 ? starter : nextActiveSeat(game, starter)

  if (
    loserId !== null &&
    game.counts[loserId] === 1 &&
    !game.palificoUsed.includes(loserId) &&
    stillIn.length >= PALIFICO_MIN_PLAYERS
  ) {
    game.pendingPalifico = { seatId: loserId }
    game.palificoUsed = [...game.palificoUsed, loserId]
    events.push({ type: 'PALIFICO', seatId: loserId })
  }

  game.reveal = {
    kind,
    callerId,
    bid: { ...bid },
    count,
    wild: onesAreWild(bid, game.palifico),
    loserId,
    gainerId: gained ? gainerId : null,
    exactHit: kind === 'exact' && loserId === null,
    dice: cloneDice(game.dice),
  }
  game.phase = 'reveal'
  game.turn = null

  events.unshift({ type: 'REVEAL', kind, callerId, count, loserId })
  return done(events)
}

export function applyIntent(game, seatId, intent) {
  switch (intent?.type) {
    case 'bid':
      return placeBid(game, seatId, intent.bid)
    case 'liar':
      return callLiar(game, seatId)
    case 'exact':
      return callExact(game, seatId)
    default:
      return fail('Unknown action.')
  }
}

// --- people coming and going -------------------------------------------------

/** A disconnected player's turn timed out: challenge if there is a bid, otherwise open low. */
export function actForAbsentPlayer(game, seatId) {
  if (game.currentBid) return callLiar(game, seatId)
  return placeBid(game, seatId, smallestLegalBid(null, ruleContext(game)))
}

/** Everyone else has gone: the last connected player still in wins. */
export function awardByForfeit(game, winnerId) {
  if (game.phase !== 'bidding' && game.phase !== 'reveal') return fail('No match to award.')
  if (countOf(game, winnerId) === 0) return fail('That player is already out.')

  const others = activeSeatIds(game).filter((id) => id !== winnerId)
  for (const id of others) game.counts[id] = 0
  game.eliminated = [...game.eliminated, ...others]
  game.winnerId = winnerId
  game.phase = 'over'
  game.turn = null
  game.reveal = null
  return done([{ type: 'GAME_OVER', winnerId, forfeit: true }])
}

export function markConnected(game, seatId, connected) {
  const seat = game.players[seatId]
  if (!seat) return fail('No such seat.')
  if ((seat.connected !== false) === connected) return fail('Nothing changed.')
  seat.connected = connected
  return done([{ type: 'CONNECTION', seatId, connected }])
}

export function removeLobbySeat(game, seatId) {
  if (game.phase !== 'lobby') return fail('Players can only leave a seat in the lobby.')
  if (seatId === 0) return fail('The host cannot be removed.')
  if (!game.players[seatId]) return fail('No such seat.')
  game.players = game.players.filter((p) => p.id !== seatId).map((p, index) => ({ ...p, id: index }))
  return done([{ type: 'ROSTER' }])
}

/** Back to the lobby after a match; anyone who has gone loses their seat. */
export function resetToLobby(game) {
  if (game.phase === 'lobby') return fail('Already in the lobby.')
  game.players = game.players
    .filter((p) => p.isHost || p.connected !== false)
    .map((p, index) => ({ ...p, id: index }))
  Object.assign(game, emptyRound(), { phase: 'lobby' })
  return done([{ type: 'ROSTER' }])
}

// --- what one player is allowed to see ---------------------------------------

/**
 * The state as seen from `viewerId`, and exactly what goes on the wire to them.
 *
 * Other players' dice appear only inside `reveal`, which only exists during the
 * reveal phase. Peer ids, session ids and the name lock never leave the host.
 */
export function snapshotFor(game, viewerId) {
  const inRound = game.phase === 'bidding' || game.phase === 'reveal'
  return {
    phase: game.phase,
    roomCode: game.roomCode,
    maxPlayers: game.maxPlayers,
    round: game.round,
    yourId: viewerId,
    seats: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: Boolean(p.isHost),
      isBot: Boolean(p.isBot),
      connected: p.connected !== false,
      diceCount: countOf(game, p.id),
      out: game.phase !== 'lobby' && countOf(game, p.id) === 0,
    })),
    yourDice: inRound ? [...(game.dice[viewerId] ?? [])] : [],
    diceInPlay: diceInPlay(game),
    playersIn: activeSeatIds(game).length,
    currentBid: game.currentBid ? { ...game.currentBid } : null,
    bidHistory: game.bidHistory.map((b) => ({ ...b })),
    turnSeat: game.phase === 'bidding' ? game.turn : null,
    palifico: game.palifico
      ? { seatId: game.palifico.seatId, face: game.currentBid?.face ?? null }
      : null,
    reveal:
      game.phase === 'reveal' && game.reveal
        ? { ...game.reveal, bid: { ...game.reveal.bid }, dice: cloneDice(game.reveal.dice) }
        : null,
    winnerId: game.phase === 'over' ? game.winnerId : null,
    rankings: game.phase === 'over' ? rankingsOf(game) : [],
  }
}
