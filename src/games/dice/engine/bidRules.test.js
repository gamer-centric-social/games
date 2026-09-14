import { describe, it, expect } from 'vitest'
import {
  onesAreWild,
  countMatches,
  bidRejection,
  isLegalBid,
  minimumQuantityFor,
  smallestLegalBid,
} from './bidRules'

const b = (quantity, face) => ({ quantity, face })
const ctx = (diceInPlay = 20, palifico = null) => ({ diceInPlay, palifico })
const PALIFICO = { seatId: 2 }

describe('well-formed bids', () => {
  it('rejects non-integers, impossible faces and zero', () => {
    for (const bad of [b(1.5, 3), b(2, 0), b(2, 7), b(0, 3), b('2', 3), null, {}]) {
      expect(isLegalBid(bad, null, ctx())).toBe(false)
    }
  })

  it('rejects a quantity above the dice on the table, and says how many there are', () => {
    expect(bidRejection(b(11, 3), null, ctx(10))).toMatch(/only 10 dice/)
    expect(isLegalBid(b(10, 3), null, ctx(10))).toBe(true)
  })
})

describe('opening bids', () => {
  it('opens on any face but 1s', () => {
    expect(isLegalBid(b(1, 2), null, ctx())).toBe(true)
    expect(isLegalBid(b(3, 6), null, ctx())).toBe(true)
    expect(bidRejection(b(2, 1), null, ctx())).toMatch(/cannot open/)
  })

  it('the palifico player may open on 1s', () => {
    expect(isLegalBid(b(1, 1), null, ctx(20, PALIFICO))).toBe(true)
  })
})

describe('raising a non-1 face', () => {
  const prev = b(5, 4)

  it('allows a higher quantity on any non-1 face', () => {
    expect(isLegalBid(b(6, 2), prev, ctx())).toBe(true)
    expect(isLegalBid(b(6, 4), prev, ctx())).toBe(true)
  })

  it('allows the same quantity on a higher face only', () => {
    expect(isLegalBid(b(5, 5), prev, ctx())).toBe(true)
    expect(isLegalBid(b(5, 4), prev, ctx())).toBe(false)
    expect(isLegalBid(b(5, 3), prev, ctx())).toBe(false)
  })

  it('refuses a lower quantity', () => {
    expect(bidRejection(b(4, 6), prev, ctx())).toMatch(/does not raise/)
  })

  it('switches to 1s at half the quantity, rounded up', () => {
    expect(isLegalBid(b(3, 1), prev, ctx())).toBe(true)
    expect(bidRejection(b(2, 1), prev, ctx())).toMatch(/at least 3/)
    expect(isLegalBid(b(2, 1), b(4, 6), ctx())).toBe(true)
    expect(isLegalBid(b(1, 1), b(1, 3), ctx())).toBe(true)
  })
})

describe('raising 1s', () => {
  const prev = b(3, 1)

  it('more 1s needs a higher quantity', () => {
    expect(isLegalBid(b(4, 1), prev, ctx())).toBe(true)
    expect(isLegalBid(b(3, 1), prev, ctx())).toBe(false)
  })

  it('leaving 1s needs double plus one', () => {
    expect(isLegalBid(b(7, 5), prev, ctx())).toBe(true)
    expect(bidRejection(b(6, 6), prev, ctx())).toMatch(/at least 7/)
  })
})

describe('palifico', () => {
  const prev = b(2, 5)

  it('locks the face and only lets the quantity rise', () => {
    expect(isLegalBid(b(3, 5), prev, ctx(20, PALIFICO))).toBe(true)
    expect(bidRejection(b(3, 6), prev, ctx(20, PALIFICO))).toMatch(/locked to 5s/)
    expect(isLegalBid(b(2, 5), prev, ctx(20, PALIFICO))).toBe(false)
  })

  it('the 1s conversion does not apply', () => {
    expect(isLegalBid(b(1, 1), prev, ctx(20, PALIFICO))).toBe(false)
  })
})

describe('counting', () => {
  const dice = [1, 1, 4, 4, 6]

  it('1s are wild for any other face', () => {
    expect(onesAreWild(b(3, 4), null)).toBe(true)
    expect(countMatches(dice, b(3, 4), null)).toBe(4)
    expect(countMatches(dice, b(3, 6), null)).toBe(3)
  })

  it('a bid on 1s counts only 1s', () => {
    expect(onesAreWild(b(2, 1), null)).toBe(false)
    expect(countMatches(dice, b(2, 1), null)).toBe(2)
  })

  it('palifico counts faces only', () => {
    expect(onesAreWild(b(3, 4), PALIFICO)).toBe(false)
    expect(countMatches(dice, b(3, 4), PALIFICO)).toBe(2)
  })
})

describe('picker helpers', () => {
  it('minimumQuantityFor gives the smallest legal quantity per face', () => {
    const prev = b(5, 4)
    expect(minimumQuantityFor(4, prev, ctx())).toBe(6)
    expect(minimumQuantityFor(5, prev, ctx())).toBe(5)
    expect(minimumQuantityFor(3, prev, ctx())).toBe(6)
    expect(minimumQuantityFor(1, prev, ctx())).toBe(3)
  })

  it('minimumQuantityFor is null when a face cannot be bid at all', () => {
    expect(minimumQuantityFor(2, b(10, 1), ctx(10))).toBeNull()
  })

  it('smallestLegalBid opens low and on a non-1 face', () => {
    expect(smallestLegalBid(null, ctx())).toEqual(b(1, 2))
  })

  it('smallestLegalBid finds the 1s escape at the top of the table', () => {
    expect(smallestLegalBid(b(10, 6), ctx(10))).toEqual(b(5, 1))
  })

  it('smallestLegalBid is null when nothing can be bid', () => {
    expect(smallestLegalBid(b(10, 1), ctx(10))).toBeNull()
  })
})
