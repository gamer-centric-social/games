import { describe, it, expect } from 'vitest'
import { chooseBotMove, binomialAtLeast, binomialExactly } from './diceAi'
import { isLegalBid } from '../engine/bidRules'
import { createSeededRng } from '../../../utils/rng'

const never = () => 0.99 // no bluffing, no exact
const always = () => 0

describe('binomial helpers', () => {
  it('compute simple cases exactly', () => {
    expect(binomialAtLeast(5, 0, 0.3)).toBe(1)
    expect(binomialAtLeast(3, 4, 0.5)).toBe(0)
    expect(binomialAtLeast(2, 1, 0.5)).toBeCloseTo(0.75)
    expect(binomialExactly(2, 1, 0.5)).toBeCloseTo(0.5)
    expect(binomialExactly(2, 3, 0.5)).toBe(0)
  })
})

describe('chooseBotMove', () => {
  it('opens on the face it holds most of, as high as is still likely', () => {
    const move = chooseBotMove({
      ownDice: [4, 4, 4, 1, 1],
      diceInPlay: 10,
      currentBid: null,
      palifico: null,
      playersIn: 2,
      rng: never,
    })
    expect(move).toEqual({ type: 'bid', bid: { quantity: 4, face: 4 } })
  })

  it('calls Liar on an impossible bid', () => {
    const move = chooseBotMove({
      ownDice: [2, 2, 3, 3, 4],
      diceInPlay: 10,
      currentBid: { quantity: 10, face: 6, seatId: 1 },
      palifico: null,
      playersIn: 2,
      rng: never,
    })
    expect(move).toEqual({ type: 'liar' })
  })

  it('calls Exact when the bid sits right on what it can see', () => {
    const move = chooseBotMove({
      ownDice: [5, 5, 5, 5, 5],
      diceInPlay: 6,
      currentBid: { quantity: 5, face: 5, seatId: 1 },
      palifico: null,
      playersIn: 3,
      rng: always,
    })
    expect(move).toEqual({ type: 'exact' })
  })

  it('never makes an illegal move, across many random tables', () => {
    const tableRng = createSeededRng(2026)
    const pick = (lo, hi) => lo + Math.floor(tableRng() * (hi - lo + 1))

    for (let seed = 0; seed < 400; seed++) {
      const ownDice = Array.from({ length: pick(1, 5) }, () => pick(1, 6))
      const diceInPlay = ownDice.length + pick(0, 20)
      const palifico = tableRng() < 0.2 ? { seatId: 0 } : null
      const playersIn = pick(2, 6)
      const ctx = { diceInPlay, palifico }

      let currentBid = null
      if (tableRng() < 0.6) {
        for (let tries = 0; tries < 30 && !currentBid; tries++) {
          const candidate = { quantity: pick(1, diceInPlay), face: pick(1, 6) }
          if (isLegalBid(candidate, null, { diceInPlay, palifico: null })) {
            currentBid = { ...candidate, seatId: 1 }
          }
        }
      }

      const move = chooseBotMove({
        ownDice,
        diceInPlay,
        currentBid,
        palifico,
        playersIn,
        rng: createSeededRng(seed),
      })

      if (move.type === 'bid') {
        expect(isLegalBid(move.bid, currentBid, ctx)).toBe(true)
      } else {
        expect(currentBid).not.toBeNull()
        if (move.type === 'exact') expect(playersIn).toBeGreaterThanOrEqual(3)
      }
    }
  })
})
