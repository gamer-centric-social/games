import { TIMING } from '../constants/diceConstants'
import {
  applyIntent,
  actForAbsentPlayer,
  awardByForfeit,
  nextRound,
  startMatch,
  resetToLobby,
  activeSeatIds,
  diceInPlay,
} from '../engine/diceEngine'
import { chooseBotMove } from '../utils/diceAi'
import { cryptoRng } from '../../../utils/rng'

/**
 * The table: the one thing that drives the engine, for solo and for the online host.
 *
 * It owns the game object and every timer the rules need -- a bot thinking, the
 * reveal holding, a disconnected player's turn running out, the last player
 * standing -- and reports each accepted change through onEvents / onChange.
 *
 * It knows nothing about React or the network. That is the point: UNO's solo
 * mode keeps its state in a hook and cannot be tested without a renderer, while
 * this can be tested with fake timers, a whole bot game included.
 */
export function createDiceTable({
  rng = cryptoRng,
  timing = TIMING,
  botMove = chooseBotMove,
  onChange,
  onEvents,
} = {}) {
  let game = null
  let localSeatId = 0
  const timers = { turn: null, reveal: null, forfeit: null }
  let turnKey = null
  /** A second listener for accepted changes: the online host's fan-out to clients. */
  let publisher = null

  function publish() {
    onChange?.(game, localSeatId)
    publisher?.(game)
  }

  function clear(name) {
    if (timers[name]) {
      clearTimeout(timers[name])
      timers[name] = null
    }
    if (name === 'turn') turnKey = null
  }

  function clearAll() {
    clear('turn')
    clear('reveal')
    clear('forfeit')
  }

  function run(action) {
    if (!game) return { ok: false, reason: 'There is no table.', events: [] }
    const result = action(game)
    if (!result.ok) return result
    schedule()
    if (result.events.length > 0) onEvents?.(result.events, game)
    publish()
    return result
  }

  /** A bot must never stall the table: if its move is refused, it plays safe. */
  function botTurn(g, seatId) {
    const move = botMove({
      ownDice: g.dice[seatId] ?? [],
      diceInPlay: diceInPlay(g),
      currentBid: g.currentBid,
      palifico: g.palifico,
      playersIn: activeSeatIds(g).length,
      rng,
    })
    const result = applyIntent(g, seatId, move)
    return result.ok ? result : actForAbsentPlayer(g, seatId)
  }

  function schedule() {
    // The reveal holds for a beat, then the next round rolls.
    if (game.phase === 'reveal') {
      if (!timers.reveal) {
        timers.reveal = setTimeout(() => {
          timers.reveal = null
          run((g) => nextRound(g, rng))
        }, timing.revealMs)
      }
    } else {
      clear('reveal')
    }

    // Whoever is up: a bot thinks, an absent player is covered for, a person is
    // waited on. Keyed, so an unrelated update does not restart a running timer.
    const seat = game.phase === 'bidding' ? game.players[game.turn] : null
    const kind = !seat ? null : seat.isBot ? 'bot' : seat.connected === false ? 'absent' : null
    const key = kind ? `${game.round}:${game.bidHistory.length}:${seat.id}:${kind}` : null
    if (key !== turnKey) {
      clear('turn')
      if (kind) {
        const seatId = seat.id
        turnKey = key
        timers.turn = setTimeout(
          () => {
            timers.turn = null
            turnKey = null
            const result = run((g) =>
              kind === 'bot' ? botTurn(g, seatId) : actForAbsentPlayer(g, seatId)
            )
            if (!result.ok && game) schedule()
          },
          kind === 'bot' ? timing.botThinkMs : timing.disconnectTurnMs
        )
      }
    }

    // Everyone else still in has gone: the one player left wins if nobody returns.
    const inPlay = game.phase === 'bidding' || game.phase === 'reveal'
    const stillIn = inPlay ? activeSeatIds(game) : []
    const present = stillIn.filter((id) => game.players[id].connected !== false)
    if (present.length === 1 && stillIn.length > 1) {
      if (!timers.forfeit) {
        const winnerId = present[0]
        timers.forfeit = setTimeout(() => {
          timers.forfeit = null
          run((g) => awardByForfeit(g, winnerId))
        }, timing.lastPlayerMs)
      }
    } else {
      clear('forfeit')
    }
  }

  return {
    get game() {
      return game
    },
    get localSeatId() {
      return localSeatId
    },
    rng,
    load(nextGame, seatId = 0) {
      clearAll()
      game = nextGame
      localSeatId = seatId
      if (game) {
        schedule()
        publish()
      }
    },
    run,
    act: (seatId, intent) => run((g) => applyIntent(g, seatId, intent)),
    start: () => run((g) => startMatch(g, rng)),
    backToLobby: () => run(resetToLobby),
    /** Re-arm and publish with no action: after the handshake edits the roster directly. */
    refresh() {
      if (!game) return
      schedule()
      publish()
    },
    setPublisher(fn) {
      publisher = fn
    },
    destroy() {
      clearAll()
      game = null
    },
  }
}
