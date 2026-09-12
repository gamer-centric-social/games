/**
 * UNO host-authoritative rules engine.
 *
 * Pure in the sense that matters: no React, no network, no audio, no timers. Every
 * function takes the mutable `game` object (see `createHostGame`), mutates it in place,
 * and returns a result describing what happened:
 *
 *   { ok: boolean, reason?: string, events: Event[] }
 *
 * `ok: false` means nothing changed and the caller should not broadcast. `ok: true`
 * means `game` was mutated and the caller should broadcast the new state and act on
 * `events` (play a sound, open a modal, start a timer).
 *
 * The game object is deliberately a plain mutable object rather than React state: the
 * host reads and writes it from network callbacks and timers, where a stale closure
 * over a useState value would silently corrupt the match.
 */

import { CARD_COLORS, CARD_TYPES, getRankBadge } from '../constants/unoConstants'
import { createUnoDeck, dealHands, canPlayCard, shuffleDeck, getNextActivePlayerIndex } from '../utils/deck'

/** Seconds before an AFK giver's penalty card is auto-picked for them. */
export const PENALTY_TIMEOUT_MS = 20000

/** Player count at which the game switches to a double deck. */
const DOUBLE_DECK_THRESHOLD = 6

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const SOUNDS = {
  CARD_PLAY: 'cardPlay',
  CARD_DRAW: 'cardDraw',
  ACTION_PENALTY: 'actionPenalty',
  ACTION_NEUTRAL: 'actionNeutral',
  UNO_CALL: 'unoCall',
}

const sound = (name) => ({ type: 'SOUND', sound: name })
const broadcast = (message) => ({ type: 'BROADCAST', message })

/** Sound that matches the card being played. */
function soundForCard(card) {
  if (card.type === CARD_TYPES.DRAW_TWO || card.type === CARD_TYPES.WILD_DRAW_FOUR) {
    return sound(SOUNDS.ACTION_PENALTY)
  }
  if (card.type === CARD_TYPES.SKIP || card.type === CARD_TYPES.REVERSE) {
    return sound(SOUNDS.ACTION_NEUTRAL)
  }
  return sound(SOUNDS.CARD_PLAY)
}

const fail = (reason) => ({ ok: false, reason, events: [] })
const done = (events = []) => ({ ok: true, events })

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Create an empty host game for a freshly opened room. */
export function createHostGame({ roomCode, hostPlayer, maxPlayers = 4, stackingEnabled = true }) {
  return {
    roomCode,
    players: [hostPlayer],
    maxPlayers,
    drawPile: [],
    discardPile: [],
    hands: new Map(),
    topCard: null,
    activeColor: null,
    currentPlayerIndex: 0,
    direction: 1,
    unoCalledPlayers: new Set(),
    unoPreCalledPlayers: new Set(),
    hasDrawnThisTurn: false,
    winner: null,
    rankings: [],
    actionMessage: '',
    skippedInfo: null,
    stackingEnabled,
    pendingDrawCount: 0,
    pendingStackType: null,
    pendingCatchPenalty: null,
    gameStarted: false,
    lockedLobbyPlayerNames: null,
  }
}

/**
 * Deal a new match. The host always takes the first turn.
 *
 * Also locks the roster: once a match is under way, only names present here may
 * (re)connect, which is what keeps strangers out of a game in progress.
 */
export function startMatch(game) {
  const deckCount = game.players.length >= DOUBLE_DECK_THRESHOLD ? 2 : 1
  const { hands, drawPile, discardPile, initialColor } = dealHands(
    createUnoDeck(deckCount),
    game.players.length
  )

  const handsMap = new Map()
  game.players.forEach((p, idx) => {
    handsMap.set(p.id, hands[idx])
    p.rank = null
  })

  game.drawPile = drawPile
  game.discardPile = discardPile
  game.hands = handsMap
  game.topCard = discardPile[discardPile.length - 1]
  game.activeColor = initialColor
  game.currentPlayerIndex = 0
  game.direction = 1
  game.hasDrawnThisTurn = false
  game.unoCalledPlayers = new Set()
  game.unoPreCalledPlayers = new Set()
  game.winner = null
  game.rankings = []
  game.actionMessage = 'Game started! Host has the first move.'
  game.skippedInfo = null
  game.pendingDrawCount = 0
  game.pendingStackType = null
  game.pendingCatchPenalty = null
  game.gameStarted = true
  game.lockedLobbyPlayerNames = new Set(game.players.map((p) => p.name.trim().toLowerCase()))

  return done()
}

/** Tear the match down and return the room to its lobby state. */
export function resetToLobby(game) {
  game.drawPile = []
  game.discardPile = []
  game.hands = new Map()
  game.topCard = null
  game.activeColor = null
  game.winner = null
  game.rankings = []
  game.players.forEach((p) => {
    p.rank = null
  })
  game.skippedInfo = null
  game.pendingDrawCount = 0
  game.pendingStackType = null
  game.pendingCatchPenalty = null
  game.unoCalledPlayers = new Set()
  game.unoPreCalledPlayers = new Set()
  game.gameStarted = false
  game.lockedLobbyPlayerNames = null
  return done()
}

/** True once cards are on the table. */
export function isMatchInProgress(game) {
  return Boolean(game.gameStarted || game.drawPile.length > 0 || game.topCard !== null)
}

// ---------------------------------------------------------------------------
// Accessors
//
// `currentPlayerIndex` is an INDEX into players[], while `hands` is keyed by player
// `id`. Those two coincide right up until a player leaves the lobby and the remaining
// ids are re-indexed. Always go through these helpers rather than comparing an index
// to an id.
// ---------------------------------------------------------------------------

/** The player whose turn it is, or undefined for an empty table. */
export function currentPlayer(game) {
  return game.players[game.currentPlayerIndex]
}

export function handOf(game, playerId) {
  return game.hands.get(playerId) || []
}

function isFinished(game) {
  return (p) => handOf(game, p.id).length === 0 || p.rank != null
}

/** Players still holding cards and not yet ranked. */
function activePlayers(game) {
  return game.players.filter((p) => handOf(game, p.id).length > 0 && p.rank == null)
}

function advanceTurn(game, step) {
  game.currentPlayerIndex = getNextActivePlayerIndex(
    game.currentPlayerIndex,
    step,
    game.players,
    game.direction,
    isFinished(game)
  )
}

function peekNextPlayer(game) {
  const idx = getNextActivePlayerIndex(
    game.currentPlayerIndex,
    1,
    game.players,
    game.direction,
    isFinished(game)
  )
  return game.players[idx]
}

/** Roster safe to send to everyone: hands are reduced to a count. */
export function sanitizePlayers(game) {
  return game.players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isHost: p.isHost,
    cardCount: handOf(game, p.id).length,
    rank: p.rank || game.rankings.find((r) => r.playerId === p.id)?.rank || null,
  }))
}

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

/**
 * Draw `count` cards, reshuffling the discard pile back in when the draw pile runs dry.
 * The current top card stays on the discard pile; wilds lose their chosen colour on the
 * way back in. Returns fewer cards than asked for if there are genuinely none left.
 */
export function drawCardsFromPile(count, currentDrawPile, currentDiscardPile) {
  let dPile = [...currentDrawPile]
  let discPile = [...currentDiscardPile]
  const drawnCards = []

  for (let i = 0; i < count; i++) {
    if (dPile.length === 0) {
      if (discPile.length <= 1) break
      const top = discPile[discPile.length - 1]
      const recycled = discPile.slice(0, -1).map((c) => ({
        ...c,
        color:
          c.type === CARD_TYPES.WILD || c.type === CARD_TYPES.WILD_DRAW_FOUR
            ? CARD_COLORS.WILD
            : c.color,
      }))
      dPile = shuffleDeck(recycled)
      discPile = [top]
    }

    if (dPile.length > 0) {
      drawnCards.push(dPile.pop())
    }
  }

  return { drawnCards, newDrawPile: dPile, newDiscardPile: discPile }
}

/** Move `count` cards from the piles into a player's hand. */
function dealPenaltyTo(game, playerId, count) {
  const { drawnCards, newDrawPile, newDiscardPile } = drawCardsFromPile(
    count,
    game.drawPile,
    game.discardPile
  )
  game.drawPile = newDrawPile
  game.discardPile = newDiscardPile
  game.hands.set(playerId, [...drawnCards, ...handOf(game, playerId)])
  return drawnCards
}

// ---------------------------------------------------------------------------
// Rankings
// ---------------------------------------------------------------------------

/** Record a placement for a player who has just emptied their hand. */
function recordPlacement(game, player) {
  const rank = game.rankings.length + 1
  player.rank = rank
  game.rankings.push({
    playerId: player.id,
    name: player.name,
    avatar: player.avatar,
    isHost: player.isHost,
    rank,
    remainingCards: handOf(game, player.id).length,
  })
  return rank
}

/**
 * End the match if at most one player is still holding cards, awarding last place to
 * whoever is left. Returns true if the match is now over.
 */
function settleIfMatchOver(game) {
  const remaining = activePlayers(game)
  if (remaining.length > 1) return false

  if (remaining.length === 1) {
    recordPlacement(game, remaining[0])
  }
  game.winner = game.rankings[0]
  game.actionMessage = `🏆 Tournament complete! 1st Place: ${game.rankings[0]?.name ?? 'nobody'}!`
  return true
}

// ---------------------------------------------------------------------------
// Turn validation
// ---------------------------------------------------------------------------

function requireTurn(game, playerId) {
  // A decided match accepts nothing further. The pre-refactor code had no such guard,
  // so a late-arriving message could still mutate a finished game.
  if (game.winner) return 'match is already over'

  const active = currentPlayer(game)
  if (!active || active.id !== playerId) {
    return `not ${playerId}'s turn (active player is ${active?.id})`
  }
  return null
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Play a card.
 *
 * `fallbackCard` lets a client that has drifted on ids still be matched by
 * colour/label/type - a pragmatic concession to reconnects mid-turn.
 */
export function playCard(game, playerId, cardId, chosenColor = null, fallbackCard = null) {
  const turnError = requireTurn(game, playerId)
  if (turnError) return fail(turnError)

  const player = game.players.find((p) => p.id === playerId)
  if (!player) return fail(`unknown player ${playerId}`)

  const hand = handOf(game, playerId)
  let cardIndex = hand.findIndex((c) => c.id === cardId)
  if (cardIndex === -1 && fallbackCard) {
    cardIndex = hand.findIndex(
      (c) =>
        c.color === fallbackCard.color &&
        c.label === fallbackCard.label &&
        c.type === fallbackCard.type
    )
  }
  if (cardIndex === -1) return fail(`card ${cardId} not in player ${playerId}'s hand`)

  const card = hand[cardIndex]
  const isWild = card.color === CARD_COLORS.WILD
  const effectiveColor = isWild ? chosenColor || CARD_COLORS.RED : card.color

  if (!canPlayCard(card, game.topCard, game.activeColor, game.pendingDrawCount, game.pendingStackType)) {
    return fail(`${card.color} ${card.label} is not playable on ${game.topCard?.label}`)
  }

  const nextHand = hand.filter((_, idx) => idx !== cardIndex)
  game.hands.set(playerId, nextHand)
  game.discardPile.push(card)
  game.topCard = card
  game.activeColor = effectiveColor
  game.hasDrawnThisTurn = false

  const events = [soundForCard(card)]

  // UNO bookkeeping. A pre-call made while still holding 2+ cards is promoted here.
  if (nextHand.length === 1) {
    if (game.unoPreCalledPlayers.has(playerId) || game.unoCalledPlayers.has(playerId)) {
      game.unoCalledPlayers.add(playerId)
      game.unoPreCalledPlayers.delete(playerId)
      events.push(sound(SOUNDS.UNO_CALL))
    }
  } else {
    game.unoCalledPlayers.delete(playerId)
    game.unoPreCalledPlayers.delete(playerId)
  }

  const wentOut = nextHand.length === 0
  if (wentOut) {
    const rank = recordPlacement(game, player)
    const remaining = activePlayers(game)

    if (remaining.length <= 1) {
      settleIfMatchOver(game)
      return done(events)
    }

    events.push({
      type: 'CELEBRATE',
      playerId: player.id,
      rank,
      activeRemaining: remaining.length,
    })

    const badge = getRankBadge(rank)
    const effect = applyCardEffect(game, card, player, effectiveColor, {
      // The player who just went out is leaving the rotation, so a Reverse in a
      // two-player endgame passes normally instead of bouncing back.
      reverseActsAsSkip: remaining.length !== 2,
    })
    advanceTurn(game, effect.step)
    game.skippedInfo = effect.skippedInfo
    game.actionMessage = `${badge.medal} ${player.name} finished in ${badge.label}! (${remaining.length} players still battling)`
    return done(events)
  }

  const remaining = activePlayers(game)
  const effect = applyCardEffect(game, card, player, effectiveColor, {
    reverseActsAsSkip: remaining.length === 2,
  })
  advanceTurn(game, effect.step)
  game.skippedInfo = effect.skippedInfo
  game.actionMessage = effect.message
  return done(events)
}

/**
 * Apply an action card's effect: adjust direction, build the stack or deal an immediate
 * penalty, and report how far the turn should advance.
 *
 * Mutates `game`. Does not advance the turn itself - the caller does that, because the
 * "player went out" path needs a different reverse rule.
 */
function applyCardEffect(game, card, player, effectiveColor, { reverseActsAsSkip }) {
  const colorWord = card.color !== CARD_COLORS.WILD ? card.color : ''
  let step = 1
  let skippedInfo = null
  let message = `${player.name} played ${colorWord} ${card.label}`

  const skipRecord = (target, cardType, cardsDrawn = 0) => ({
    playerId: target.id,
    playerName: target.name,
    playedByName: player.name,
    cardType,
    cardsDrawn,
  })

  switch (card.type) {
    case CARD_TYPES.REVERSE: {
      if (reverseActsAsSkip) {
        step = 2
        const target = peekNextPlayer(game)
        skippedInfo = skipRecord(target, 'reverse')
        message = `${player.name} played Reverse! ${target?.name} was skipped.`
      } else {
        game.direction *= -1
        message = `${player.name} reversed direction!`
      }
      break
    }

    case CARD_TYPES.SKIP: {
      step = 2
      const target = peekNextPlayer(game)
      skippedInfo = skipRecord(target, 'skip')
      message = `${player.name} skipped ${target?.name}!`
      break
    }

    case CARD_TYPES.DRAW_TWO:
    case CARD_TYPES.WILD_DRAW_FOUR: {
      const isFour = card.type === CARD_TYPES.WILD_DRAW_FOUR
      const amount = isFour ? 4 : 2
      const label = isFour ? `Wild +4! Color is now ${effectiveColor}.` : '+2!'

      if (game.stackingEnabled) {
        // Pass the growing pile along; the next player must counter or take it all.
        game.pendingDrawCount = (game.pendingDrawCount || 0) + amount
        game.pendingStackType = card.type
        step = 1
        message = `${player.name} played ${label} Stack is +${game.pendingDrawCount} cards!`
      } else {
        step = 2
        const target = peekNextPlayer(game)
        dealPenaltyTo(game, target.id, amount)
        skippedInfo = skipRecord(target, isFour ? 'wild4' : 'draw2', amount)
        message = `${player.name} played ${label} ${target.name} drew ${amount} cards and was skipped!`
      }
      break
    }

    case CARD_TYPES.WILD: {
      message = `${player.name} played Wild! Color is ${effectiveColor}.`
      break
    }

    default:
      break
  }

  // Any card that is not itself a draw card clears a live stack.
  if (card.type !== CARD_TYPES.DRAW_TWO && card.type !== CARD_TYPES.WILD_DRAW_FOUR) {
    game.pendingDrawCount = 0
    game.pendingStackType = null
  }

  return { step, skippedInfo, message }
}

/**
 * Draw. With a live stack this takes the whole penalty and ends the turn; otherwise it
 * draws one card and the player may still play or pass.
 */
export function drawCard(game, playerId) {
  const turnError = requireTurn(game, playerId)
  if (turnError) return fail(turnError)

  const player = game.players.find((p) => p.id === playerId)
  if (!player) return fail(`unknown player ${playerId}`)
  if (game.hasDrawnThisTurn && (game.pendingDrawCount || 0) === 0) {
    return fail('already drawn this turn')
  }

  const events = [sound(SOUNDS.CARD_DRAW)]

  if ((game.pendingDrawCount || 0) > 0) {
    const penaltyCount = game.pendingDrawCount
    const penaltyType = game.pendingStackType
    dealPenaltyTo(game, playerId, penaltyCount)

    game.pendingDrawCount = 0
    game.pendingStackType = null
    game.hasDrawnThisTurn = false
    game.unoCalledPlayers.delete(playerId)
    game.unoPreCalledPlayers.delete(playerId)

    advanceTurn(game, 1)
    game.skippedInfo = {
      playerId: player.id,
      playerName: player.name,
      playedByName: 'Stack Penalty',
      cardType: penaltyType,
      cardsDrawn: penaltyCount,
    }
    game.actionMessage = `${player.name} drew ${penaltyCount} cards from the stack penalty! Turn passed to ${currentPlayer(game)?.name || 'next player'}.`
    return done(events)
  }

  const { drawnCards, newDrawPile, newDiscardPile } = drawCardsFromPile(
    1,
    game.drawPile,
    game.discardPile
  )
  if (drawnCards.length === 0) {
    game.hasDrawnThisTurn = true
    game.actionMessage = 'No cards left in the draw pile! Pass your turn or play a card.'
    return done(events)
  }

  game.drawPile = newDrawPile
  game.discardPile = newDiscardPile
  const updatedHand = [drawnCards[0], ...handOf(game, playerId)]
  game.hands.set(playerId, updatedHand)

  if (updatedHand.length > 1) {
    game.unoCalledPlayers.delete(playerId)
    game.unoPreCalledPlayers.delete(playerId)
  }
  game.hasDrawnThisTurn = true
  game.skippedInfo = null
  game.actionMessage = `${player.name} drew a card.`
  return done(events)
}

/** Pass. Only legal after drawing (a stack penalty passes the turn on its own). */
export function passTurn(game, playerId) {
  const turnError = requireTurn(game, playerId)
  if (turnError) return fail(turnError)
  if (!game.hasDrawnThisTurn && (game.pendingDrawCount || 0) === 0) {
    return fail('must draw before passing')
  }

  const player = game.players.find((p) => p.id === playerId)
  advanceTurn(game, 1)
  game.hasDrawnThisTurn = false
  game.skippedInfo = null
  game.actionMessage = `${player?.name || 'Player'} passed turn.`
  return done()
}

/**
 * Shout UNO. Calling while still holding 2+ cards records a pre-call, which is promoted
 * to a real call the moment the player reaches one card - that is what lets someone tap
 * UNO as they play their second-to-last card.
 */
export function callUno(game, playerId, playerName) {
  if (handOf(game, playerId).length === 1) {
    game.unoCalledPlayers.add(playerId)
  } else {
    game.unoPreCalledPlayers.add(playerId)
  }
  game.actionMessage = `🔔 ${playerName} shouted UNO!`

  return done([
    sound(SOUNDS.UNO_CALL),
    broadcast({ type: 'UNO_SHOUTED', playerId, playerName }),
  ])
}

/**
 * Catch a player who is sitting on one card without having called UNO.
 *
 * The penalty is not a flat draw: the caught player receives one card from every other
 * active player, and each giver picks which. This opens a collection phase; the caller
 * should start a PENALTY_TIMEOUT_MS timer and call `forceResolvePenalty` if it expires.
 */
export function catchUno(game, challengerId, targetPlayerId) {
  // Two people tapping Catch at once is the common case, not an edge case, so the
  // reason has to name who won the race -- it is shown to the person who lost.
  const open = game.pendingCatchPenalty
  if (open) {
    return fail(`${open.challengerName} already caught ${open.targetPlayerName}`)
  }

  const targetHand = handOf(game, targetPlayerId)
  const target = game.players.find((p) => p.id === targetPlayerId)
  const challenger = game.players.find((p) => p.id === challengerId)

  if (!target) return fail(`unknown target ${targetPlayerId}`)
  if (targetHand.length !== 1) return fail(`${target.name} does not have exactly one card`)
  if (target.rank != null) return fail(`${target.name} has already finished`)
  if (game.unoCalledPlayers.has(targetPlayerId)) return fail(`${target.name} called UNO`)

  const givers = activePlayers(game).filter((p) => p.id !== targetPlayerId)
  if (givers.length === 0) return fail('nobody left to give a card')

  const penaltyId = Date.now()
  const challengerName = challenger?.name || 'Player'
  game.pendingCatchPenalty = {
    penaltyId,
    challengerId,
    challengerName,
    targetPlayerId,
    targetPlayerName: target.name,
    giverIds: givers.map((p) => p.id),
    givenCards: new Map(),
    // Givers whose card was chosen for them, and why. Both are reported when the
    // penalty resolves -- a card leaving your hand is never allowed to be silent.
    substitutedGivers: new Set(),
    autoPickedGivers: new Set(),
  }
  game.actionMessage = `🚨 ${challengerName} caught ${target.name}! Active players are choosing a card to give...`

  return done([
    {
      type: 'PENALTY_STARTED',
      penaltyId,
      challengerId,
      challengerName,
      targetPlayerId,
      targetPlayerName: target.name,
      giverIds: givers.map((p) => p.id),
    },
    broadcast({
      type: 'PENALTY_CARD_REQUEST',
      penaltyId,
      targetPlayerId,
      targetPlayerName: target.name,
      challengerId,
      challengerName,
      giverIds: givers.map((p) => p.id),
    }),
  ])
}

/**
 * Record one giver's chosen card, resolving the penalty once everyone has answered.
 *
 * A card that is not in the giver's hand falls back to their first card rather than
 * stalling the match -- but it is recorded as a substitution, because "the card you
 * picked is not the card that left your hand" is exactly the kind of thing that must
 * never happen quietly.
 */
export function submitPenaltyCard(game, giverId, card, penaltyId) {
  const penalty = game.pendingCatchPenalty
  if (!penalty || penalty.penaltyId !== penaltyId) return fail('no matching pending penalty')

  const giverHand = handOf(game, giverId)
  const chosen = giverHand.find((c) => c.id === card?.id)
  const validCard = chosen || giverHand[0]
  if (!validCard) return fail(`giver ${giverId} has no cards`)

  if (!chosen) penalty.substitutedGivers.add(giverId)
  penalty.givenCards.set(giverId, validCard)

  const allSubmitted = penalty.giverIds.every((id) => penalty.givenCards.has(id))
  if (allSubmitted) {
    return finalizeCatchPenalty(game)
  }
  return done()
}

/**
 * Auto-pick a first card for anyone who has not answered, then resolve. One player
 * sitting on the modal must not be able to stall the match -- but whoever had a card
 * taken for them is named in the resolution.
 */
export function forceResolvePenalty(game) {
  const penalty = game.pendingCatchPenalty
  if (!penalty) return fail('no pending penalty')

  penalty.giverIds.forEach((giverId) => {
    if (!penalty.givenCards.has(giverId)) {
      const hand = handOf(game, giverId)
      if (hand.length > 0) {
        penalty.givenCards.set(giverId, hand[0])
        penalty.autoPickedGivers.add(giverId)
      }
    }
  })
  return finalizeCatchPenalty(game)
}

/** Transfer the collected cards to the caught player and settle any placements. */
export function finalizeCatchPenalty(game) {
  const penalty = game.pendingCatchPenalty
  if (!penalty) return fail('no pending penalty')

  const {
    targetPlayerId,
    targetPlayerName,
    challengerName,
    giverIds,
    givenCards,
    substitutedGivers,
    autoPickedGivers,
  } = penalty
  const penaltyCards = []
  const finishedGivers = []

  giverIds.forEach((giverId) => {
    const card = givenCards.get(giverId)
    if (!card) return

    penaltyCards.push(card)
    const nextHand = handOf(game, giverId).filter((c) => c.id !== card.id)
    game.hands.set(giverId, nextHand)

    // Giving away your last card is a legitimate way to go out.
    if (nextHand.length === 0) {
      const giver = game.players.find((p) => p.id === giverId)
      if (giver && giver.rank == null) {
        recordPlacement(game, giver)
        finishedGivers.push(giver)
      }
    }
  })

  game.hands.set(targetPlayerId, [...handOf(game, targetPlayerId), ...penaltyCards])
  game.unoCalledPlayers.delete(targetPlayerId)
  game.unoPreCalledPlayers.delete(targetPlayerId)
  game.pendingCatchPenalty = null

  const matchOver = settleIfMatchOver(game)

  // The player whose turn it is may have just gone out by giving their last card.
  const active = currentPlayer(game)
  if (!matchOver && active && isFinished(game)(active)) {
    advanceTurn(game, 1)
  }

  const nameList = (ids) =>
    [...ids]
      .map((id) => game.players.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .join(', ')

  let message = `🚨 ${challengerName} caught ${targetPlayerName}! Received 1 card from each active player (+${penaltyCards.length} cards)!`
  if (finishedGivers.length > 0) {
    message += ` 🏆 ${finishedGivers.map((p) => p.name).join(', ')} gave away their last card and finished the game!`
  }
  // A card chosen for you always says so.
  if (autoPickedGivers?.size > 0) {
    message += ` ⏱ Time ran out for ${nameList(autoPickedGivers)} — a card was picked for them.`
  }
  if (substitutedGivers?.size > 0) {
    message += ` ${nameList(substitutedGivers)}'s pick never reached the host, so another card went instead.`
  }
  if (!matchOver) {
    game.actionMessage = message
  }

  return done([
    sound(SOUNDS.ACTION_PENALTY),
    broadcast({ type: 'UNO_CAUGHT', targetPlayerId, message }),
    { type: 'PENALTY_RESOLVED' },
  ])
}
