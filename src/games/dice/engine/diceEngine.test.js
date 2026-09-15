import { describe, it, expect } from 'vitest'
import {
  createGame,
  startMatch,
  placeBid,
  callLiar,
  callExact,
  nextRound,
  applyIntent,
  actForAbsentPlayer,
  awardByForfeit,
  markConnected,
  removeLobbySeat,
  resetToLobby,
  snapshotFor,
  isMatchInProgress,
  diceInPlay,
  activeSeatIds,
  rankingsOf,
} from './diceEngine'
import { smallestLegalBid } from './bidRules'
import { createSeededRng } from '../utils/rng'

// --- harness ----------------------------------------------------------------

const names = (n) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, avatar: '🙂' }))

/** A started match with `n` players, dealt from a fixed seed. */
function table(n = 3, seed = 1) {
  const game = createGame({ roomCode: 'AB12', players: names(n) })
  startMatch(game, createSeededRng(seed))
  return game
}

/** Overwrite the dealt dice (and the counts that go with them). */
function setDice(game, byId) {
  for (const [id, dice] of Object.entries(byId)) {
    game.dice[id] = dice
    game.counts[id] = dice.length
  }
}

const bid = (quantity, face) => ({ quantity, face })
const types = (result) => result.events.map((e) => e.type)

// --- setup ------------------------------------------------------------------

describe('createGame / startMatch', () => {
  it('seats players by index, host at seat 0, in the lobby', () => {
    const game = createGame({ players: names(3) })
    expect(game.players.map((p) => p.id)).toEqual([0, 1, 2])
    expect(game.players[0].isHost).toBe(true)
    expect(game.players[1].isHost).toBe(false)
    expect(game.phase).toBe('lobby')
    expect(isMatchInProgress(game)).toBe(false)
  })

  it('refuses to start with one player', () => {
    const game = createGame({ players: names(1) })
    expect(startMatch(game, createSeededRng(1)).ok).toBe(false)
  })

  it('deals five dice each, seat 0 opens, and names are locked for rejoining', () => {
    const game = createGame({ players: names(3) })
    const result = startMatch(game, createSeededRng(1))

    expect(result.ok).toBe(true)
    expect(types(result)).toEqual(['ROLLED'])
    expect(game.phase).toBe('bidding')
    expect(game.turn).toBe(0)
    expect(game.players.every((p) => game.dice[p.id].length === 5)).toBe(true)
    expect(diceInPlay(game)).toBe(15)
    expect(game.lockedLobbyPlayerNames.has('p1')).toBe(true)
    expect(isMatchInProgress(game)).toBe(true)
  })

  it('refuses to start again mid-round', () => {
    expect(startMatch(table(), createSeededRng(2)).ok).toBe(false)
  })

  it('rolls the same dice for the same seed', () => {
    expect(table(3, 99).dice).toEqual(table(3, 99).dice)
  })
})

// --- bidding ----------------------------------------------------------------

describe('bidding', () => {
  it('only the seat whose turn it is may act, and the turn passes clockwise', () => {
    const game = table()
    expect(placeBid(game, 1, bid(2, 3)).reason).toMatch(/isn't your turn/)
    expect(placeBid(game, 0, bid(2, 3)).ok).toBe(true)
    expect(game.turn).toBe(1)
    expect(game.currentBid).toEqual({ quantity: 2, face: 3, seatId: 0 })
  })

  it('rejects an illegal raise with a reason and leaves the state alone', () => {
    const game = table()
    placeBid(game, 0, bid(3, 4))
    const result = placeBid(game, 1, bid(2, 6))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/does not raise/)
    expect(game.turn).toBe(1)
    expect(game.bidHistory).toHaveLength(1)
  })

  it('passes the turn over players who are out', () => {
    const game = table(3)
    setDice(game, { 1: [] })
    placeBid(game, 0, bid(1, 2))
    expect(game.turn).toBe(2)
  })

  it('Liar and Exact need a bid on the table', () => {
    const game = table()
    expect(callLiar(game, 0).reason).toMatch(/no bid/)
    expect(callExact(game, 0).reason).toMatch(/no bid/)
  })

  it('applyIntent dispatches bid / liar / exact and rejects anything else', () => {
    const game = table()
    expect(applyIntent(game, 0, { type: 'bid', bid: bid(2, 5) }).ok).toBe(true)
    expect(applyIntent(game, 1, { type: 'shout' }).ok).toBe(false)
    expect(applyIntent(game, 1, { type: 'liar' }).ok).toBe(true)
  })
})

// --- challenges -------------------------------------------------------------

describe('Liar', () => {
  it('when the bid is met, the challenger loses a die and starts the next round', () => {
    const game = table(3)
    setDice(game, { 0: [4, 4, 1, 2, 3], 1: [4, 5, 5, 5, 5], 2: [6, 6, 6, 6, 6] })
    placeBid(game, 0, bid(3, 4)) // there are four: 4, 4, 1 (wild), 4
    const result = callLiar(game, 1)

    expect(types(result)).toEqual(['REVEAL', 'DIE_LOST'])
    expect(game.reveal).toMatchObject({ kind: 'liar', callerId: 1, count: 4, loserId: 1, wild: true })
    expect(game.counts[1]).toBe(4)
    expect(game.phase).toBe('reveal')
    expect(game.nextStarter).toBe(1)
  })

  it('when the bid is not met, the bidder loses a die', () => {
    const game = table(3)
    setDice(game, { 0: [4, 4, 1, 2, 3], 1: [4, 5, 5, 5, 5], 2: [6, 6, 6, 6, 6] })
    placeBid(game, 0, bid(5, 4))
    callLiar(game, 1)
    expect(game.reveal.loserId).toBe(0)
    expect(game.counts[0]).toBe(4)
    expect(game.nextStarter).toBe(0)
  })
})

describe('Exact', () => {
  it('an exact call gains the caller a die below five, and the caller starts', () => {
    const game = table(3)
    setDice(game, { 0: [4, 4, 1, 2], 1: [4, 5, 5, 5], 2: [6, 6, 6, 6, 6] })
    placeBid(game, 0, bid(4, 4))
    const result = callExact(game, 1)

    expect(types(result)).toEqual(['REVEAL', 'DIE_GAINED'])
    expect(game.reveal).toMatchObject({ kind: 'exact', exactHit: true, gainerId: 1, loserId: null })
    expect(game.counts[1]).toBe(5)
    expect(game.nextStarter).toBe(1)
  })

  it('an exact call at five dice gains nothing and changes no totals', () => {
    const game = table(3)
    setDice(game, { 0: [4, 4, 1, 2, 3], 1: [4, 5, 5, 5, 5], 2: [6, 6, 6, 6, 6] })
    placeBid(game, 0, bid(4, 4))
    const result = callExact(game, 1)

    expect(types(result)).toEqual(['REVEAL'])
    expect(game.reveal).toMatchObject({ exactHit: true, gainerId: null })
    expect(diceInPlay(game)).toBe(15)
  })

  it('a wrong exact call costs the caller a die', () => {
    const game = table(3)
    setDice(game, { 0: [4, 4, 1, 2, 3], 1: [4, 5, 5, 5, 5], 2: [6, 6, 6, 6, 6] })
    placeBid(game, 0, bid(3, 4))
    callExact(game, 1)
    expect(game.reveal).toMatchObject({ exactHit: false, loserId: 1 })
    expect(game.counts[1]).toBe(4)
  })

  it('is refused with fewer than three players still in', () => {
    const game = table(2)
    placeBid(game, 0, bid(1, 2))
    expect(callExact(game, 1).reason).toMatch(/three players/)
  })
})

describe('knockouts and who starts', () => {
  it('a knocked-out loser hands the start to the next seat still in', () => {
    const game = table(3)
    setDice(game, { 0: [4, 4, 4, 4, 4], 1: [5], 2: [6, 6] })
    placeBid(game, 0, bid(1, 2))
    placeBid(game, 1, bid(8, 3))
    const result = callLiar(game, 2)

    expect(types(result)).toEqual(['REVEAL', 'DIE_LOST', 'ELIMINATED'])
    expect(game.eliminated).toEqual([1])
    expect(game.nextStarter).toBe(2)
  })
})

// --- palifico ---------------------------------------------------------------

describe('palifico', () => {
  /** P1 bids something impossible on 2 dice and is caught: down to 1 die. */
  function dropSeatOneToOneDie(game) {
    setDice(game, { 0: [4, 4, 4, 4, 4], 1: [5, 5], 2: [6, 6, 6, 6, 6] })
    placeBid(game, 0, bid(1, 2))
    placeBid(game, 1, bid(9, 3))
    return callLiar(game, 2)
  }

  it('triggers the first time a player drops to one die with three or more in', () => {
    const game = table(3)
    const result = dropSeatOneToOneDie(game)
    expect(types(result)).toContain('PALIFICO')

    nextRound(game, createSeededRng(5))
    expect(game.palifico).toEqual({ seatId: 1 })
    expect(game.turn).toBe(1)
    expect(game.dice[1]).toHaveLength(1)
  })

  it('the palifico player may open on 1s, then the face is locked', () => {
    const game = table(3)
    dropSeatOneToOneDie(game)
    nextRound(game, createSeededRng(5))

    expect(placeBid(game, 1, bid(1, 1)).ok).toBe(true)
    expect(placeBid(game, 2, bid(2, 6)).reason).toMatch(/locked to 1s/)
    expect(placeBid(game, 2, bid(2, 1)).ok).toBe(true)
  })

  it('1s are not wild in a palifico round', () => {
    const game = table(3)
    dropSeatOneToOneDie(game)
    nextRound(game, createSeededRng(5))
    setDice(game, { 0: [1, 1, 1, 1, 1], 1: [3], 2: [3, 4, 5, 6, 2] })

    placeBid(game, 1, bid(2, 3))
    callLiar(game, 2)
    expect(game.reveal).toMatchObject({ count: 2, wild: false, loserId: 2 })
  })

  it('never triggers twice for the same player', () => {
    const game = table(3)
    game.palificoUsed = [1]
    const result = dropSeatOneToOneDie(game)
    expect(types(result)).not.toContain('PALIFICO')
    expect(game.pendingPalifico).toBeNull()
  })

  it('does not trigger when fewer than three players remain', () => {
    const game = table(2)
    setDice(game, { 0: [4, 4, 4, 4, 4], 1: [5, 5] })
    placeBid(game, 0, bid(1, 4))
    const result = callLiar(game, 1)
    expect(types(result)).not.toContain('PALIFICO')
  })
})

// --- the end ----------------------------------------------------------------

describe('game over', () => {
  it('the last player with dice wins after the reveal; rankings run winner, then last out', () => {
    const game = table(3)
    setDice(game, { 0: [4, 4, 4, 4, 4], 1: [5], 2: [] })
    game.eliminated = [2]
    placeBid(game, 0, bid(1, 4))
    callLiar(game, 1)

    expect(game.phase).toBe('reveal')
    expect(game.winnerId).toBe(0)
    expect(snapshotFor(game, 1).winnerId).toBeNull() // not announced until the reveal ends

    const result = nextRound(game, createSeededRng(3))
    expect(types(result)).toEqual(['GAME_OVER'])
    expect(game.phase).toBe('over')
    expect(rankingsOf(game)).toEqual([0, 1, 2])
  })

  it('awardByForfeit ends the match for the last connected player', () => {
    const game = table(3)
    const result = awardByForfeit(game, 2)
    expect(result.events[0]).toMatchObject({ type: 'GAME_OVER', winnerId: 2, forfeit: true })
    expect(game.phase).toBe('over')
    expect(activeSeatIds(game)).toEqual([2])
  })
})

// --- snapshots --------------------------------------------------------------

describe('snapshotFor', () => {
  it("snapshotFor never leaks another player's dice outside the reveal", () => {
    const game = table(3)
    setDice(game, { 0: [1, 1, 1, 1, 1], 1: [2, 2, 2, 2, 2], 2: [3, 3, 3, 3, 3] })
    game.players[1].peerId = 'peer-secret'
    game.players[1].sessionId = 'session-secret'

    const view = snapshotFor(game, 1)
    expect(view.yourDice).toEqual([2, 2, 2, 2, 2])
    expect(view.reveal).toBeNull()
    const wire = JSON.stringify(view)
    expect(wire).not.toContain('[1,1,1,1,1]')
    expect(wire).not.toContain('[3,3,3,3,3]')
    expect(wire).not.toContain('secret')
    expect(view.seats.map((s) => s.diceCount)).toEqual([5, 5, 5])
  })

  it('shows every cup during the reveal', () => {
    const game = table(3)
    setDice(game, { 0: [1, 1, 1, 1, 1], 1: [2, 2, 2, 2, 2], 2: [3, 3, 3, 3, 3] })
    placeBid(game, 0, bid(3, 2))
    callLiar(game, 1)

    const view = snapshotFor(game, 2)
    expect(view.reveal.dice).toEqual({ 0: [1, 1, 1, 1, 1], 1: [2, 2, 2, 2, 2], 2: [3, 3, 3, 3, 3] })
    expect(view.turnSeat).toBeNull()
  })

  it('names the locked face during palifico', () => {
    const game = table(3)
    game.palifico = { seatId: 0 }
    placeBid(game, 0, bid(2, 5))
    expect(snapshotFor(game, 1).palifico).toEqual({ seatId: 0, face: 5 })
  })
})

// --- the dice invariant -----------------------------------------------------

describe('the dice invariant', () => {
  it('the dice total moves by -1, +1 or 0 per challenge, and every seat stays within 0..5', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const rng = createSeededRng(seed)
      const game = createGame({ players: names(4) })
      startMatch(game, rng)

      let guard = 0
      while (game.phase !== 'over' && guard++ < 5000) {
        if (game.phase === 'reveal') {
          expect(nextRound(game, rng).ok).toBe(true)
          continue
        }
        const before = diceInPlay(game)
        const seat = game.turn
        const roll = rng()
        let result
        if (game.currentBid && roll < 0.3) {
          result = callLiar(game, seat)
        } else if (game.currentBid && roll < 0.4 && activeSeatIds(game).length >= 3) {
          result = callExact(game, seat)
        } else {
          const next = smallestLegalBid(game.currentBid, { diceInPlay: before, palifico: game.palifico })
          result = next ? placeBid(game, seat, next) : callLiar(game, seat)
        }
        expect(result.ok).toBe(true)

        if (game.phase === 'reveal') {
          const delta = diceInPlay(game) - before
          expect([-1, 0, 1]).toContain(delta)
          if (delta === 0) expect(game.reveal).toMatchObject({ exactHit: true, gainerId: null })
          if (delta === 1) expect(game.reveal.gainerId).not.toBeNull()
        }
        for (const p of game.players) {
          expect(game.counts[p.id]).toBeGreaterThanOrEqual(0)
          expect(game.counts[p.id]).toBeLessThanOrEqual(5)
        }
      }

      expect(game.phase).toBe('over')
      expect(activeSeatIds(game)).toEqual([game.winnerId])
    }
  })
})

// --- absent players, the lobby, connections ---------------------------------

describe('absent players and the lobby', () => {
  it('actForAbsentPlayer opens with the smallest bid, or calls Liar on a bid', () => {
    const game = table(3)
    actForAbsentPlayer(game, 0)
    expect(game.currentBid).toEqual({ quantity: 1, face: 2, seatId: 0 })
    const result = actForAbsentPlayer(game, 1)
    expect(result.events[0]).toMatchObject({ type: 'REVEAL', kind: 'liar', callerId: 1 })
  })

  it('markConnected reports only real changes', () => {
    const game = table(3)
    expect(markConnected(game, 1, false).ok).toBe(true)
    expect(markConnected(game, 1, false).ok).toBe(false)
    expect(game.players[1].connected).toBe(false)
  })

  it('removeLobbySeat renumbers seats, and is refused mid-match or for the host', () => {
    const game = createGame({ players: names(4) })
    expect(removeLobbySeat(game, 0).ok).toBe(false)
    expect(removeLobbySeat(game, 1).ok).toBe(true)
    expect(game.players.map((p) => [p.id, p.name])).toEqual([
      [0, 'P0'],
      [1, 'P2'],
      [2, 'P3'],
    ])
    expect(removeLobbySeat(table(3), 1).ok).toBe(false)
  })

  it('resetToLobby drops disconnected seats and clears the round', () => {
    const game = table(3)
    game.players[1].connected = false
    expect(resetToLobby(game).ok).toBe(true)
    expect(game.phase).toBe('lobby')
    expect(game.players.map((p) => p.name)).toEqual(['P0', 'P2'])
    expect(game.players.map((p) => p.id)).toEqual([0, 1])
    expect(game.currentBid).toBeNull()
    expect(game.lockedLobbyPlayerNames).toBeNull()
  })
})
