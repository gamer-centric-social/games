/**
 * Perudo bid legality and counting. Pure: no state, no React, no randomness.
 *
 * A bid is { quantity, face }: "at least `quantity` dice on the whole table
 * show `face`". 1s are wild -- they count toward any other face -- except in
 * a palifico round, or when the bid is itself on 1s.
 */

/** Faces in the order a "smallest bid" search prefers them: 1s last. */
const FACES_LOW_FIRST = [2, 3, 4, 5, 6, 1]

export function onesAreWild(bid, palifico) {
  return !palifico && bid.face !== 1
}

export function countMatches(dice, bid, palifico) {
  const wild = onesAreWild(bid, palifico)
  let count = 0
  for (const die of dice) {
    if (die === bid.face || (wild && die === 1)) count++
  }
  return count
}

const plural = (n, one, many) => (n === 1 ? one : many)

/**
 * Why `bid` may not follow `prev`, or null if it may.
 * `prev` is null for the round's opening bid.
 */
export function bidRejection(bid, prev, { diceInPlay, palifico }) {
  const quantity = bid?.quantity
  const face = bid?.face
  if (!Number.isInteger(quantity) || !Number.isInteger(face) || quantity < 1 || face < 1 || face > 6) {
    return 'Pick a quantity and a face.'
  }
  if (quantity > diceInPlay) {
    return `There ${plural(diceInPlay, 'is', 'are')} only ${diceInPlay} ${plural(diceInPlay, 'die', 'dice')} on the table.`
  }

  if (!prev) {
    return !palifico && face === 1 ? 'You cannot open the bidding on 1s.' : null
  }

  if (palifico) {
    if (face !== prev.face) return `Palifico: the face is locked to ${prev.face}s.`
    return quantity > prev.quantity ? null : 'Raise the quantity.'
  }

  if (prev.face === 1) {
    if (face === 1) return quantity > prev.quantity ? null : 'Raise the number of 1s.'
    const need = prev.quantity * 2 + 1
    return quantity >= need ? null : `Leaving 1s needs at least ${need}.`
  }

  if (face === 1) {
    const need = Math.ceil(prev.quantity / 2)
    return quantity >= need ? null : `Switching to 1s needs at least ${need}.`
  }

  if (quantity > prev.quantity || (quantity === prev.quantity && face > prev.face)) return null
  return 'That bid does not raise the last one.'
}

export const isLegalBid = (bid, prev, ctx) => bidRejection(bid, prev, ctx) === null

/**
 * The smallest quantity at which `face` is a legal bid, or null if none is.
 * Legality only ever gets easier as quantity rises, so the first hit is the minimum.
 */
export function minimumQuantityFor(face, prev, ctx) {
  for (let quantity = 1; quantity <= ctx.diceInPlay; quantity++) {
    if (isLegalBid({ quantity, face }, prev, ctx)) return quantity
  }
  return null
}

/** The lowest legal bid (fewest dice, 1s last), or null when nothing can be bid. */
export function smallestLegalBid(prev, ctx) {
  for (let quantity = 1; quantity <= ctx.diceInPlay; quantity++) {
    for (const face of FACES_LOW_FIRST) {
      if (isLegalBid({ quantity, face }, prev, ctx)) return { quantity, face }
    }
  }
  return null
}

/**
 * The bid a picker should start on: the smallest raise on a normal face, and 1s
 * only when that is the only way up (or the palifico lock says so). Switching to
 * 1s often needs fewer dice, which is exactly why it must not be the default --
 * a player who just taps "Bid" should not find they switched to 1s.
 */
export function suggestedBid(prev, ctx) {
  let best = null
  for (const face of [2, 3, 4, 5, 6]) {
    const quantity = minimumQuantityFor(face, prev, ctx)
    if (quantity !== null && (!best || quantity < best.quantity)) best = { quantity, face }
  }
  return best ?? smallestLegalBid(prev, ctx)
}
