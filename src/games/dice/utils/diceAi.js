import { EXACT_MIN_PLAYERS } from '../constants/diceConstants'
import { countMatches, onesAreWild, minimumQuantityFor } from '../engine/bidRules'

/**
 * The bot plays the odds, with a little noise.
 *
 * It knows its own dice and the number of dice on the table. Every other die
 * shows a given face with probability 1/6, or 1/3 when 1s are wild. From that
 * it asks: how likely is the bid in front of me, and how likely is each raise
 * I could make instead?
 *
 * Pure: the only randomness is the `rng` it is handed, so tests can pin it.
 */

/** A raise at least this likely is "safe". */
const SAFE = 0.5
/** Challenge when the current bid is less likely than this (jittered) and no raise is safe. */
const LIAR_BELOW = 0.35
/** Call Exact, sometimes, when landing exactly on the bid is at least this likely. */
const EXACT_ABOVE = 0.3
/** How often a bot bids something it does not believe. */
const BLUFF_CHANCE = 0.15
const BLUFF_FLOOR = 0.25
/** Consider raises up to this many above each face's minimum. */
const WINDOW = 3

export function binomialExactly(n, k, p) {
  if (k < 0 || k > n) return 0
  let choose = 1
  for (let i = 1; i <= k; i++) choose = (choose * (n - k + i)) / i
  return choose * p ** k * (1 - p) ** (n - k)
}

export function binomialAtLeast(n, k, p) {
  if (k <= 0) return 1
  if (k > n) return 0
  let total = 0
  for (let i = k; i <= n; i++) total += binomialExactly(n, i, p)
  return Math.min(1, total)
}

function oddsOf(bid, ownDice, diceInPlay, palifico) {
  const own = countMatches(ownDice, bid, palifico)
  const unknown = Math.max(0, diceInPlay - ownDice.length)
  const p = onesAreWild(bid, palifico) ? 1 / 3 : 1 / 6
  const needed = bid.quantity - own
  return {
    bid,
    own,
    atLeast: binomialAtLeast(unknown, needed, p),
    exactly: binomialExactly(unknown, needed, p),
  }
}

/** Most pressure first: the biggest believable bid, preferring faces it holds. */
const byPressure = (a, b) => b.bid.quantity - a.bid.quantity || b.own - a.own || b.atLeast - a.atLeast
const byOdds = (a, b) => b.atLeast - a.atLeast || a.bid.quantity - b.bid.quantity

export function chooseBotMove({ ownDice, diceInPlay, currentBid, palifico, playersIn, rng }) {
  const ctx = { diceInPlay, palifico }

  const candidates = []
  for (let face = 1; face <= 6; face++) {
    const min = minimumQuantityFor(face, currentBid, ctx)
    if (min === null) continue
    for (let quantity = min; quantity <= Math.min(diceInPlay, min + WINDOW); quantity++) {
      candidates.push(oddsOf({ quantity, face }, ownDice, diceInPlay, palifico))
    }
  }

  if (currentBid) {
    const current = oddsOf(currentBid, ownDice, diceInPlay, palifico)
    if (playersIn >= EXACT_MIN_PLAYERS && current.exactly >= EXACT_ABOVE && rng() < 0.5) {
      return { type: 'exact' }
    }
    if (candidates.length === 0) return { type: 'liar' }

    const bestRaise = Math.max(...candidates.map((c) => c.atLeast))
    const doubt = LIAR_BELOW + (rng() - 0.5) * 0.1
    if (current.atLeast < doubt && bestRaise < SAFE) return { type: 'liar' }
  }

  const bluffing = rng() < BLUFF_CHANCE
  const pool = bluffing
    ? candidates.filter((c) => c.atLeast >= BLUFF_FLOOR)
    : candidates.filter((c) => c.atLeast >= SAFE)
  if (pool.length > 0) return { type: 'bid', bid: pool.toSorted(byPressure)[0].bid }

  return { type: 'bid', bid: candidates.toSorted(byOdds)[0].bid }
}
