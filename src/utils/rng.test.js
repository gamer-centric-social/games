import { describe, it, expect } from 'vitest'
import { createSeededRng, cryptoRng, rollDie } from './rng'

describe('rng', () => {
  it('a seeded rng repeats exactly for the same seed', () => {
    const a = createSeededRng(42)
    const b = createSeededRng(42)
    const seqA = Array.from({ length: 5 }, a)
    expect(Array.from({ length: 5 }, b)).toEqual(seqA)
    expect(Array.from({ length: 5 }, createSeededRng(43))).not.toEqual(seqA)
  })

  it('rollDie always lands on 1..6, and every face turns up', () => {
    const rng = createSeededRng(7)
    const seen = new Set()
    for (let i = 0; i < 600; i++) {
      const d = rollDie(rng)
      expect(Number.isInteger(d) && d >= 1 && d <= 6).toBe(true)
      seen.add(d)
    }
    expect(seen.size).toBe(6)
  })

  it('cryptoRng returns a number in [0, 1)', () => {
    const x = cryptoRng()
    expect(x >= 0 && x < 1).toBe(true)
  })
})
