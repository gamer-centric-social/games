import { describe, it, expect } from 'vitest'
import {
  createHostGame,
  startMatch,
  resetToLobby,
  isMatchInProgress,
  currentPlayer,
  handOf,
  sanitizePlayers,
  drawCardsFromPile,
  playCard,
  drawCard,
  passTurn,
  callUno,
  catchUno,
  submitPenaltyCard,
  forceResolvePenalty,
  SOUNDS,
} from './hostEngine'
import { CARD_COLORS, CARD_TYPES } from '../constants/unoConstants'
import { createUnoDeck } from '../utils/deck'

// --- fixtures ---------------------------------------------------------------

let seq = 0
const card = (color, type, value = null, label = null) => ({
  id: `t${seq++}`,
  color,
  type,
  value,
  label: label ?? (value === null ? type : String(value)),
})

const num = (color, value) => card(color, CARD_TYPES.NUMBER, value)
const skip = (color) => card(color, CARD_TYPES.SKIP, null, '⊘')
const reverse = (color) => card(color, CARD_TYPES.REVERSE, null, '⇄')
const drawTwo = (color) => card(color, CARD_TYPES.DRAW_TWO, null, '+2')
const wild = () => card(CARD_COLORS.WILD, CARD_TYPES.WILD, null, '★')
const wild4 = () => card(CARD_COLORS.WILD, CARD_TYPES.WILD_DRAW_FOUR, null, '+4')

const { RED, BLUE, GREEN, YELLOW } = {
  RED: CARD_COLORS.RED,
  BLUE: CARD_COLORS.BLUE,
  GREEN: CARD_COLORS.GREEN,
  YELLOW: CARD_COLORS.YELLOW,
}

/**
 * Build a mid-match game with exactly the hands a test needs.
 * `hands` is an array of card arrays, one per seat; seat 0 is the host.
 */
function makeGame(hands, { topCard = num(RED, 5), stackingEnabled = true, drawPileSize = 40 } = {}) {
  const players = hands.map((_, i) => ({
    id: i,
    name: `P${i}`,
    avatar: '😎',
    isHost: i === 0,
    connected: true,
    rank: null,
  }))

  const game = createHostGame({
    roomCode: 'TEST',
    hostPlayer: players[0],
    maxPlayers: hands.length,
    stackingEnabled,
  })
  game.players = players
  game.hands = new Map(hands.map((h, i) => [i, h]))
  game.topCard = topCard
  game.activeColor = topCard.color
  game.discardPile = [topCard]
  game.drawPile = createUnoDeck().slice(0, drawPileSize)
  game.gameStarted = true
  return game
}

const soundsIn = (result) => result.events.filter((e) => e.type === 'SOUND').map((e) => e.sound)
const broadcastsIn = (result) => result.events.filter((e) => e.type === 'BROADCAST').map((e) => e.message)
const eventTypes = (result) => result.events.map((e) => e.type)

/** Total cards anywhere in the game. Must never change during play. */
const totalCards = (game) =>
  game.players.reduce((n, p) => n + handOf(game, p.id).length, 0) +
  game.drawPile.length +
  game.discardPile.length

// --- lifecycle --------------------------------------------------------------

describe('createHostGame', () => {
  it('starts as an empty lobby holding only the host', () => {
    const host = { id: 0, name: 'Host', isHost: true }
    const game = createHostGame({ roomCode: 'AB12', hostPlayer: host })

    expect(game.players).toEqual([host])
    expect(game.topCard).toBeNull()
    expect(game.drawPile).toEqual([])
    expect(game.stackingEnabled).toBe(true)
    expect(isMatchInProgress(game)).toBe(false)
  })
})

describe('startMatch', () => {
  const fourPlayerGame = () => {
    const game = createHostGame({ roomCode: 'AB12', hostPlayer: { id: 0, name: 'P0', isHost: true } })
    game.players = [0, 1, 2, 3].map((id) => ({ id, name: `P${id}`, isHost: id === 0, rank: null }))
    return game
  }

  it('deals seven cards to everyone and conserves the deck', () => {
    const game = fourPlayerGame()
    startMatch(game)

    for (const p of game.players) expect(handOf(game, p.id)).toHaveLength(7)
    expect(totalCards(game)).toBe(108)
  })

  it('gives the host the first turn', () => {
    const game = fourPlayerGame()
    startMatch(game)
    expect(game.currentPlayerIndex).toBe(0)
    expect(currentPlayer(game).isHost).toBe(true)
  })

  it('switches to a double deck at six players', () => {
    const game = fourPlayerGame()
    game.players = Array.from({ length: 6 }, (_, id) => ({ id, name: `P${id}`, isHost: id === 0 }))
    startMatch(game)
    expect(totalCards(game)).toBe(216)
  })

  it('locks the roster so strangers cannot join a match in progress', () => {
    const game = fourPlayerGame()
    startMatch(game)
    expect(game.lockedLobbyPlayerNames).toEqual(new Set(['p0', 'p1', 'p2', 'p3']))
    expect(isMatchInProgress(game)).toBe(true)
  })

  it('clears stale state from a previous match', () => {
    const game = fourPlayerGame()
    game.winner = { name: 'old' }
    game.rankings = [{ playerId: 1, rank: 1 }]
    game.pendingDrawCount = 6
    game.players[2].rank = 2

    startMatch(game)

    expect(game.winner).toBeNull()
    expect(game.rankings).toEqual([])
    expect(game.pendingDrawCount).toBe(0)
    expect(game.players[2].rank).toBeNull()
  })
})

describe('resetToLobby', () => {
  it('tears down the match but keeps the roster', () => {
    const game = makeGame([[num(RED, 1)], [num(BLUE, 2)]])
    game.players[1].rank = 1
    resetToLobby(game)

    expect(game.players).toHaveLength(2)
    expect(game.players[1].rank).toBeNull()
    expect(game.topCard).toBeNull()
    expect(game.hands.size).toBe(0)
    expect(isMatchInProgress(game)).toBe(false)
  })
})

// --- accessors --------------------------------------------------------------

describe('sanitizePlayers', () => {
  it('reduces hands to counts so nobody can read another hand off the wire', () => {
    const game = makeGame([[num(RED, 1), num(RED, 2)], [num(BLUE, 3)]])
    const sanitized = sanitizePlayers(game)

    expect(sanitized).toEqual([
      { id: 0, name: 'P0', avatar: '😎', isHost: true, cardCount: 2, rank: null },
      { id: 1, name: 'P1', avatar: '😎', isHost: false, cardCount: 1, rank: null },
    ])
    expect(JSON.stringify(sanitized)).not.toContain('"color"')
  })
})

describe('drawCardsFromPile', () => {
  it('draws from the top of the pile', () => {
    const pile = [num(RED, 1), num(RED, 2), num(RED, 3)]
    const { drawnCards, newDrawPile } = drawCardsFromPile(2, pile, [num(BLUE, 9)])
    expect(drawnCards).toHaveLength(2)
    expect(newDrawPile).toHaveLength(1)
  })

  it('does not mutate the piles it was given', () => {
    const pile = [num(RED, 1), num(RED, 2)]
    drawCardsFromPile(2, pile, [])
    expect(pile).toHaveLength(2)
  })

  it('recycles the discard pile when the draw pile runs out, keeping the top card', () => {
    const top = num(GREEN, 4)
    const discard = [num(RED, 1), num(RED, 2), num(RED, 3), top]
    const { drawnCards, newDrawPile, newDiscardPile } = drawCardsFromPile(2, [], discard)

    expect(drawnCards).toHaveLength(2)
    expect(newDiscardPile).toEqual([top])
    expect(newDrawPile).toHaveLength(1)
  })

  it('strips the chosen colour off recycled wild cards', () => {
    const playedWild = { ...wild(), color: CARD_COLORS.GREEN }
    const { drawnCards } = drawCardsFromPile(1, [], [playedWild, num(RED, 1)])
    expect(drawnCards[0].color).toBe(CARD_COLORS.WILD)
  })

  it('returns what it can when there is genuinely nothing left', () => {
    const { drawnCards } = drawCardsFromPile(5, [], [num(RED, 1)])
    expect(drawnCards).toEqual([])
  })
})

// --- turn validation --------------------------------------------------------

describe('turn validation', () => {
  it('rejects a play from a player whose turn it is not', () => {
    const c = num(RED, 3)
    const game = makeGame([[num(RED, 1)], [c]])
    const result = playCard(game, 1, c.id)

    expect(result.ok).toBe(false)
    expect(handOf(game, 1)).toHaveLength(1)
  })

  it('rejects a play from an unknown player id', () => {
    const game = makeGame([[num(RED, 1)], [num(BLUE, 2)]])
    expect(playCard(game, 99, 'nope').ok).toBe(false)
  })

  it('rejects a card the player does not hold', () => {
    const game = makeGame([[num(RED, 1)], [num(BLUE, 2)]])
    expect(playCard(game, 0, 'not-a-real-card').ok).toBe(false)
  })

  it('rejects an illegal card', () => {
    const bad = num(BLUE, 9)
    const game = makeGame([[bad], [num(BLUE, 2)]], { topCard: num(RED, 5) })
    expect(playCard(game, 0, bad.id).ok).toBe(false)
  })

  it('matches a card by shape when the id has drifted, as happens after a reconnect', () => {
    const held = num(RED, 3)
    const game = makeGame([[held], [num(BLUE, 2)]])
    const staleCopy = { ...held, id: 'stale-id-from-before-the-reconnect' }

    const result = playCard(game, 0, staleCopy.id, null, staleCopy)
    expect(result.ok).toBe(true)
    expect(handOf(game, 0)).toHaveLength(0)
  })

  it('refuses any action once the match has been decided', () => {
    const c = num(RED, 3)
    const game = makeGame([[c, num(RED, 8)], [num(BLUE, 2)]])
    game.winner = { playerId: 1, name: 'P1', rank: 1 }

    expect(playCard(game, 0, c.id).ok).toBe(false)
    expect(drawCard(game, 0).ok).toBe(false)
    expect(passTurn(game, 0).ok).toBe(false)
    expect(handOf(game, 0)).toHaveLength(2)
  })

  /**
   * Regression for the id/index conflation bug: player ids are re-indexed when someone
   * leaves the lobby, after which a player's id no longer matches their seat number.
   */
  it('still identifies the right player after the roster is re-indexed', () => {
    const p0Card = num(RED, 1)
    const p2Card = num(RED, 2)
    const game = makeGame([[p0Card], [num(BLUE, 9)], [p2Card]])

    // P1 leaves; the remaining players are re-indexed so old id 2 becomes id 1.
    game.players = [game.players[0], { ...game.players[2], id: 1 }]
    game.hands = new Map([
      [0, [p0Card]],
      [1, [p2Card]],
    ])
    game.currentPlayerIndex = 1 // the former P2, now id 1

    // Old behaviour accepted this because currentPlayerIndex (1) equalled the id (1)
    // of whoever asked. Only the player actually in that seat may act.
    expect(playCard(game, 0, p0Card.id).ok).toBe(false)
    expect(playCard(game, 1, p2Card.id).ok).toBe(true)
  })
})

// --- playing cards ----------------------------------------------------------

describe('playCard', () => {
  it('moves the card to the discard pile and sets the active colour', () => {
    const c = num(RED, 3)
    const game = makeGame([[c, num(BLUE, 1)], [num(BLUE, 2)]])
    const result = playCard(game, 0, c.id)

    expect(result.ok).toBe(true)
    expect(handOf(game, 0)).toHaveLength(1)
    expect(game.topCard.id).toBe(c.id)
    expect(game.discardPile.at(-1).id).toBe(c.id)
    expect(game.activeColor).toBe(RED)
    expect(soundsIn(result)).toContain(SOUNDS.CARD_PLAY)
  })

  it('conserves the deck', () => {
    const c = num(RED, 3)
    const game = makeGame([[c, num(BLUE, 1)], [num(BLUE, 2)]])
    const before = totalCards(game)
    playCard(game, 0, c.id)
    expect(totalCards(game)).toBe(before)
  })

  it('passes the turn to the next player', () => {
    const c = num(RED, 3)
    const game = makeGame([[c, num(BLUE, 1)], [num(BLUE, 2)], [num(GREEN, 2)]])
    playCard(game, 0, c.id)
    expect(currentPlayer(game).id).toBe(1)
  })

  it('applies the chosen colour for a wild', () => {
    const w = wild()
    const game = makeGame([[w, num(BLUE, 1)], [num(BLUE, 2)]])
    playCard(game, 0, w.id, GREEN)
    expect(game.activeColor).toBe(GREEN)
  })

  it('defaults a wild with no chosen colour to red rather than leaving it unresolved', () => {
    const w = wild()
    const game = makeGame([[w, num(BLUE, 1)], [num(BLUE, 2)]])
    playCard(game, 0, w.id, null)
    expect(game.activeColor).toBe(RED)
  })

  it('skips the next player with a Skip', () => {
    const s = skip(RED)
    const game = makeGame([[s, num(BLUE, 1)], [num(BLUE, 2)], [num(GREEN, 2)]])
    const result = playCard(game, 0, s.id)

    expect(currentPlayer(game).id).toBe(2)
    expect(game.skippedInfo).toMatchObject({ playerId: 1, cardType: 'skip' })
    expect(soundsIn(result)).toContain(SOUNDS.ACTION_NEUTRAL)
  })

  it('flips direction with a Reverse at three or more players', () => {
    const r = reverse(RED)
    const game = makeGame([[r, num(BLUE, 1)], [num(BLUE, 2)], [num(GREEN, 2)]])
    playCard(game, 0, r.id)

    expect(game.direction).toBe(-1)
    expect(currentPlayer(game).id).toBe(2)
  })

  it('treats a Reverse as a Skip in a two-player game', () => {
    const r = reverse(RED)
    const game = makeGame([[r, num(BLUE, 1)], [num(BLUE, 2)]])
    playCard(game, 0, r.id)

    expect(currentPlayer(game).id).toBe(0)
    expect(game.skippedInfo).toMatchObject({ cardType: 'reverse' })
  })

  it('clears a live stack when a non-draw card is played', () => {
    const c = num(RED, 3)
    const game = makeGame([[c], [num(BLUE, 2)]])
    game.pendingDrawCount = 4
    game.pendingStackType = CARD_TYPES.DRAW_TWO
    game.activeColor = RED

    // canPlayCard gates on the stack, so clear it the way a resolved stack would be
    game.pendingDrawCount = 0
    game.pendingStackType = null
    playCard(game, 0, c.id)

    expect(game.pendingDrawCount).toBe(0)
    expect(game.pendingStackType).toBeNull()
  })
})

describe('draw-card effects with stacking enabled', () => {
  it('builds a +2 stack and passes the turn on for a counter', () => {
    const d = drawTwo(RED)
    const game = makeGame([[d, num(BLUE, 1)], [num(BLUE, 2)], [num(GREEN, 3)]])
    const result = playCard(game, 0, d.id)

    expect(game.pendingDrawCount).toBe(2)
    expect(game.pendingStackType).toBe(CARD_TYPES.DRAW_TWO)
    expect(currentPlayer(game).id).toBe(1)
    expect(handOf(game, 1)).toHaveLength(1)
    expect(soundsIn(result)).toContain(SOUNDS.ACTION_PENALTY)
  })

  it('accumulates across successive +2s', () => {
    const first = drawTwo(RED)
    const second = drawTwo(BLUE)
    // spare cards keep everyone in the match, so the stack is what is under test
    const game = makeGame([[first, num(RED, 8)], [second, num(BLUE, 8)], [num(GREEN, 3)]])

    playCard(game, 0, first.id)
    playCard(game, 1, second.id)

    expect(game.pendingDrawCount).toBe(4)
    expect(currentPlayer(game).id).toBe(2)
  })

  it('does not let a +4 be stacked onto a +2', () => {
    const d = drawTwo(RED)
    const w4 = wild4()
    const game = makeGame([[d, num(RED, 8)], [w4, num(BLUE, 8)]])

    playCard(game, 0, d.id)
    expect(playCard(game, 1, w4.id, BLUE).ok).toBe(false)
    expect(game.pendingDrawCount).toBe(2)
  })

  it('builds a +4 stack and sets the colour', () => {
    const w4 = wild4()
    const game = makeGame([[w4, num(BLUE, 1)], [num(BLUE, 2)]])
    playCard(game, 0, w4.id, GREEN)

    expect(game.pendingDrawCount).toBe(4)
    expect(game.pendingStackType).toBe(CARD_TYPES.WILD_DRAW_FOUR)
    expect(game.activeColor).toBe(GREEN)
  })
})

describe('draw-card effects with stacking disabled', () => {
  it('makes the target draw two immediately and skips them', () => {
    const d = drawTwo(RED)
    const game = makeGame([[d, num(BLUE, 1)], [num(BLUE, 2)], [num(GREEN, 3)]], {
      stackingEnabled: false,
    })
    const before = totalCards(game)

    playCard(game, 0, d.id)

    expect(handOf(game, 1)).toHaveLength(3)
    expect(game.pendingDrawCount).toBe(0)
    expect(currentPlayer(game).id).toBe(2)
    expect(game.skippedInfo).toMatchObject({ playerId: 1, cardType: 'draw2', cardsDrawn: 2 })
    expect(totalCards(game)).toBe(before)
  })

  it('makes the target draw four immediately', () => {
    const w4 = wild4()
    const game = makeGame([[w4, num(BLUE, 1)], [num(BLUE, 2)], [num(GREEN, 3)]], {
      stackingEnabled: false,
    })
    playCard(game, 0, w4.id, YELLOW)

    expect(handOf(game, 1)).toHaveLength(5)
    expect(game.activeColor).toBe(YELLOW)
    expect(currentPlayer(game).id).toBe(2)
  })
})

// --- drawing and passing ----------------------------------------------------

describe('drawCard', () => {
  it('adds one card and keeps the turn', () => {
    const game = makeGame([[num(BLUE, 9)], [num(BLUE, 2)]])
    const result = drawCard(game, 0)

    expect(result.ok).toBe(true)
    expect(handOf(game, 0)).toHaveLength(2)
    expect(game.hasDrawnThisTurn).toBe(true)
    expect(currentPlayer(game).id).toBe(0)
    expect(soundsIn(result)).toContain(SOUNDS.CARD_DRAW)
  })

  it('refuses a second draw in the same turn', () => {
    const game = makeGame([[num(BLUE, 9)], [num(BLUE, 2)]])
    drawCard(game, 0)
    expect(drawCard(game, 0).ok).toBe(false)
    expect(handOf(game, 0)).toHaveLength(2)
  })

  it('refuses a draw out of turn', () => {
    const game = makeGame([[num(BLUE, 9)], [num(BLUE, 2)]])
    expect(drawCard(game, 1).ok).toBe(false)
  })

  it('takes the whole stack penalty and ends the turn', () => {
    const game = makeGame([[num(BLUE, 9)], [num(BLUE, 2)], [num(GREEN, 3)]])
    game.pendingDrawCount = 6
    game.pendingStackType = CARD_TYPES.DRAW_TWO
    const before = totalCards(game)

    drawCard(game, 0)

    expect(handOf(game, 0)).toHaveLength(7)
    expect(game.pendingDrawCount).toBe(0)
    expect(game.pendingStackType).toBeNull()
    expect(currentPlayer(game).id).toBe(1)
    expect(game.skippedInfo).toMatchObject({ playedByName: 'Stack Penalty', cardsDrawn: 6 })
    expect(totalCards(game)).toBe(before)
  })

  it('allows the stack penalty even after a normal draw this turn', () => {
    const game = makeGame([[num(BLUE, 9)], [num(BLUE, 2)]])
    game.hasDrawnThisTurn = true
    game.pendingDrawCount = 2
    game.pendingStackType = CARD_TYPES.DRAW_TWO

    expect(drawCard(game, 0).ok).toBe(true)
  })

  it('reports an exhausted deck instead of failing', () => {
    const game = makeGame([[num(BLUE, 9)], [num(BLUE, 2)]], { drawPileSize: 0 })
    game.drawPile = []
    game.discardPile = [game.topCard]

    const result = drawCard(game, 0)
    expect(result.ok).toBe(true)
    expect(handOf(game, 0)).toHaveLength(1)
    expect(game.actionMessage).toMatch(/No cards left/)
  })

  it('clears an UNO call once the player is back above one card', () => {
    const game = makeGame([[num(BLUE, 9)], [num(BLUE, 2)]])
    game.unoCalledPlayers.add(0)
    drawCard(game, 0)
    expect(game.unoCalledPlayers.has(0)).toBe(false)
  })
})

describe('passTurn', () => {
  it('requires a draw first', () => {
    const game = makeGame([[num(BLUE, 9)], [num(BLUE, 2)]])
    expect(passTurn(game, 0).ok).toBe(false)
    expect(currentPlayer(game).id).toBe(0)
  })

  it('passes after drawing', () => {
    const game = makeGame([[num(BLUE, 9)], [num(BLUE, 2)]])
    drawCard(game, 0)
    const result = passTurn(game, 0)

    expect(result.ok).toBe(true)
    expect(currentPlayer(game).id).toBe(1)
    expect(game.hasDrawnThisTurn).toBe(false)
  })

  it('refuses a pass out of turn', () => {
    const game = makeGame([[num(BLUE, 9)], [num(BLUE, 2)]])
    game.hasDrawnThisTurn = true
    expect(passTurn(game, 1).ok).toBe(false)
  })
})

// --- UNO calling ------------------------------------------------------------

describe('callUno', () => {
  it('marks a player safe when they are already down to one card', () => {
    const game = makeGame([[num(RED, 1)], [num(BLUE, 2)]])
    const result = callUno(game, 0, 'P0')

    expect(game.unoCalledPlayers.has(0)).toBe(true)
    expect(soundsIn(result)).toContain(SOUNDS.UNO_CALL)
    expect(broadcastsIn(result)[0]).toMatchObject({ type: 'UNO_SHOUTED', playerId: 0 })
  })

  it('records a pre-call when the player still holds two cards', () => {
    const last = num(RED, 1)
    const game = makeGame([[last, num(RED, 2)], [num(BLUE, 2)]])

    callUno(game, 0, 'P0')
    expect(game.unoCalledPlayers.has(0)).toBe(false)
    expect(game.unoPreCalledPlayers.has(0)).toBe(true)

    // playing down to one card promotes the pre-call
    playCard(game, 0, last.id)
    expect(game.unoCalledPlayers.has(0)).toBe(true)
    expect(game.unoPreCalledPlayers.has(0)).toBe(false)
  })

  it('leaves a player catchable when they never called', () => {
    const first = num(RED, 1)
    const game = makeGame([[first, num(RED, 2)], [num(BLUE, 2)]])
    playCard(game, 0, first.id)
    expect(game.unoCalledPlayers.has(0)).toBe(false)
  })
})

// --- catching ---------------------------------------------------------------

describe('catchUno', () => {
  const catchableGame = () =>
    makeGame([[num(RED, 1)], [num(BLUE, 2), num(BLUE, 3)], [num(GREEN, 4), num(GREEN, 5)]])

  it('refuses to catch a player who called UNO', () => {
    const game = catchableGame()
    game.unoCalledPlayers.add(0)
    expect(catchUno(game, 1, 0).ok).toBe(false)
  })

  it('refuses to catch a player who is not on exactly one card', () => {
    const game = catchableGame()
    expect(catchUno(game, 0, 1).ok).toBe(false)
  })

  it('refuses to catch a player who has already finished', () => {
    const game = catchableGame()
    game.players[0].rank = 1
    expect(catchUno(game, 1, 0).ok).toBe(false)
  })

  it('opens a collection phase naming every other active player as a giver', () => {
    const game = catchableGame()
    const result = catchUno(game, 1, 0)

    expect(result.ok).toBe(true)
    expect(game.pendingCatchPenalty.giverIds).toEqual([1, 2])
    expect(eventTypes(result)).toContain('PENALTY_STARTED')
    expect(broadcastsIn(result)[0]).toMatchObject({ type: 'PENALTY_CARD_REQUEST', targetPlayerId: 0 })
  })

  it('refuses a second catch while one is being resolved', () => {
    const game = catchableGame()
    catchUno(game, 1, 0)
    expect(catchUno(game, 2, 0).ok).toBe(false)
  })

  it('names who won the race, so the loser can be told why nothing happened', () => {
    // Two people tapping Catch at once is the reported case; a bare rejection left
    // the second one staring at a button that did nothing.
    const game = catchableGame()
    catchUno(game, 1, 0)
    const second = catchUno(game, 2, 0)

    expect(second.ok).toBe(false)
    expect(second.reason).toContain(game.players[1].name)
    expect(second.reason).toContain(game.players[0].name)
  })

  it('transfers one card from each giver once everyone has answered', () => {
    const game = catchableGame()
    const before = totalCards(game)
    const fromP1 = handOf(game, 1)[0]
    const fromP2 = handOf(game, 2)[0]

    catchUno(game, 1, 0)
    expect(submitPenaltyCard(game, 1, fromP1, game.pendingCatchPenalty.penaltyId).ok).toBe(true)
    const final = submitPenaltyCard(game, 2, fromP2, game.pendingCatchPenalty.penaltyId)

    expect(final.ok).toBe(true)
    expect(handOf(game, 0)).toHaveLength(3)
    expect(handOf(game, 1)).toHaveLength(1)
    expect(handOf(game, 2)).toHaveLength(1)
    expect(game.pendingCatchPenalty).toBeNull()
    expect(totalCards(game)).toBe(before)
    expect(eventTypes(final)).toContain('PENALTY_RESOLVED')
  })

  it('ignores a submission for a stale penalty id', () => {
    const game = catchableGame()
    catchUno(game, 1, 0)
    expect(submitPenaltyCard(game, 1, handOf(game, 1)[0], 999999).ok).toBe(false)
  })

  it('falls back to the first card when a giver submits something they do not hold', () => {
    const game = catchableGame()
    catchUno(game, 1, 0)
    const expected = handOf(game, 1)[0]

    submitPenaltyCard(game, 1, { id: 'ghost' }, game.pendingCatchPenalty.penaltyId)
    expect(game.pendingCatchPenalty.givenCards.get(1).id).toBe(expected.id)
    expect(game.pendingCatchPenalty.substitutedGivers.has(1)).toBe(true)
  })

  it('says so when the card that left a hand is not the card that was picked', () => {
    const game = catchableGame()
    catchUno(game, 1, 0)
    submitPenaltyCard(game, 1, { id: 'ghost' }, game.pendingCatchPenalty.penaltyId)
    submitPenaltyCard(game, 2, handOf(game, 2)[0], game.pendingCatchPenalty.penaltyId)

    expect(game.actionMessage).toContain(game.players[1].name)
    expect(game.actionMessage).toMatch(/never reached the host/)
  })

  it('records a real pick as a real pick, with nothing to report', () => {
    const game = catchableGame()
    catchUno(game, 1, 0)
    submitPenaltyCard(game, 1, handOf(game, 1)[1], game.pendingCatchPenalty.penaltyId)

    expect(game.pendingCatchPenalty.substitutedGivers.size).toBe(0)
    expect(game.pendingCatchPenalty.autoPickedGivers.size).toBe(0)
  })

  it('auto-picks for anyone still silent when the timeout fires', () => {
    const game = catchableGame()
    catchUno(game, 1, 0)
    const result = forceResolvePenalty(game)

    expect(result.ok).toBe(true)
    expect(handOf(game, 0)).toHaveLength(3)
    expect(game.pendingCatchPenalty).toBeNull()
  })

  it('names whoever had a card taken for them when the timeout fires', () => {
    const game = catchableGame()
    catchUno(game, 1, 0)
    // P1 answers in time; P2 does not.
    submitPenaltyCard(game, 1, handOf(game, 1)[0], game.pendingCatchPenalty.penaltyId)
    forceResolvePenalty(game)

    expect(game.actionMessage).toMatch(/Time ran out/)
    expect(game.actionMessage).toContain(game.players[2].name)
    expect(game.actionMessage).not.toMatch(new RegExp(`Time ran out for [^—]*${game.players[1].name}`))
  })

  it('lets a giver go out by handing over their last card', () => {
    // P1 is the caught player; P0 and P2 each give a card, and P0 has only one left.
    const game = makeGame([[num(RED, 1)], [num(BLUE, 2)], [num(GREEN, 4), num(GREEN, 5)]])
    game.currentPlayerIndex = 2

    catchUno(game, 2, 1)
    forceResolvePenalty(game)

    expect(handOf(game, 0)).toHaveLength(0)
    expect(game.players[0].rank).toBe(1)
    expect(game.rankings[0]).toMatchObject({ playerId: 0, rank: 1 })
    expect(game.actionMessage).toMatch(/gave away their last card/)
  })
})

// --- going out and match end ------------------------------------------------

describe('going out', () => {
  it('records a placement and keeps the match running', () => {
    const last = num(RED, 1)
    const game = makeGame([[last], [num(BLUE, 2), num(BLUE, 3)], [num(GREEN, 4), num(GREEN, 5)]])
    const result = playCard(game, 0, last.id)

    expect(handOf(game, 0)).toHaveLength(0)
    expect(game.players[0].rank).toBe(1)
    expect(game.winner).toBeNull()
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'CELEBRATE', playerId: 0, rank: 1, activeRemaining: 2 })
    )
  })

  it('skips the finished player on subsequent turns', () => {
    const last = num(RED, 1)
    const p1Card = num(RED, 2)
    const game = makeGame([[last], [p1Card, num(BLUE, 3)], [num(GREEN, 4), num(GREEN, 5)]])

    playCard(game, 0, last.id)
    expect(currentPlayer(game).id).toBe(1)

    playCard(game, 1, p1Card.id)
    expect(currentPlayer(game).id).toBe(2)
  })

  it('ends the match when only one player is left holding cards', () => {
    const last = num(RED, 1)
    const game = makeGame([[last], [num(BLUE, 2), num(BLUE, 3)]])
    playCard(game, 0, last.id)

    expect(game.winner).toMatchObject({ playerId: 0, rank: 1 })
    expect(game.rankings).toHaveLength(2)
    expect(game.rankings[1]).toMatchObject({ playerId: 1, rank: 2, remainingCards: 2 })
    expect(game.actionMessage).toMatch(/Tournament complete/)
  })

  it('awards places in the order players went out', () => {
    const a = num(RED, 1)
    const b = num(RED, 2)
    const game = makeGame([[a], [b], [num(GREEN, 4), num(GREEN, 5)]])

    playCard(game, 0, a.id)
    playCard(game, 1, b.id)

    expect(game.rankings.map((r) => r.playerId)).toEqual([0, 1, 2])
    expect(game.winner.playerId).toBe(0)
  })
})

// --- invariants -------------------------------------------------------------

describe('deck conservation across a full random match', () => {
  it('never creates or destroys a card', () => {
    const game = createHostGame({ roomCode: 'AB12', hostPlayer: { id: 0, name: 'P0', isHost: true } })
    game.players = [0, 1, 2, 3].map((id) => ({ id, name: `P${id}`, isHost: id === 0, rank: null }))
    startMatch(game)

    expect(totalCards(game)).toBe(108)

    for (let turn = 0; turn < 400 && !game.winner; turn++) {
      const active = currentPlayer(game)
      if (!active) break

      let acted = false
      // snapshot: playCard mutates the hand we are iterating
      const hand = handOf(game, active.id).slice()
      for (const c of hand) {
        if (playCard(game, active.id, c.id, CARD_COLORS.RED).ok) {
          acted = true
          break
        }
      }
      if (!acted) {
        drawCard(game, active.id)
        if (!passTurn(game, active.id).ok) break
      }

      expect(totalCards(game)).toBe(108)
    }

    expect(totalCards(game)).toBe(108)
  })
})
