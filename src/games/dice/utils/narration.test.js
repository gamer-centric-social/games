import { describe, it, expect } from 'vitest'
import { bidWords, ruleLine, describeTable, eventsBetween } from './narration'

const seats = [
  { id: 0, name: 'Ana', out: false, connected: true },
  { id: 1, name: 'Ben', out: false, connected: true },
  { id: 2, name: 'Cy', out: false, connected: true },
]

const view = (over = {}) => ({
  phase: 'bidding',
  round: 1,
  yourId: 1,
  seats,
  diceInPlay: 15,
  playersIn: 3,
  currentBid: null,
  bidHistory: [],
  turnSeat: 1,
  palifico: null,
  reveal: null,
  winnerId: null,
  ...over,
})

describe('bidWords / ruleLine', () => {
  it('says a bid the way you would say it at a table', () => {
    expect(bidWords({ quantity: 1, face: 4 })).toBe('one 4')
    expect(bidWords({ quantity: 5, face: 4 })).toBe('five 4s')
    expect(bidWords({ quantity: 14, face: 6 })).toBe('14 6s')
  })

  it('names the live rule and the dice count', () => {
    expect(ruleLine(view())).toBe('1s are wild · 15 dice on the table')
    expect(ruleLine(view({ diceInPlay: 1 }))).toBe('1s are wild · 1 die on the table')
    expect(ruleLine(view({ palifico: { seatId: 0, face: 4 } }))).toBe(
      "Palifico: 1s aren't wild, 4s locked · 15 dice on the table"
    )
    expect(ruleLine(view({ palifico: { seatId: 0, face: null } }))).toBe(
      "Palifico: 1s aren't wild, the opening bid locks the face · 15 dice on the table"
    )
  })
})

describe('describeTable', () => {
  it('prompts you to open, or to answer the bid in front of you', () => {
    expect(describeTable(view())).toEqual({ text: 'Your turn. Open the bidding.', tone: 'turn' })
    expect(describeTable(view({ currentBid: { quantity: 3, face: 5, seatId: 0 } }))).toEqual({
      text: 'Ana bid three 5s. Raise it, or call it.',
      tone: 'turn',
    })
  })

  it('says who is deciding, and when a dropped player is being covered for', () => {
    expect(describeTable(view({ turnSeat: 2 })).text).toBe('Cy is deciding…')
    const away = seats.map((s) => (s.id === 2 ? { ...s, connected: false } : s))
    expect(describeTable(view({ turnSeat: 2, seats: away })).text).toBe(
      'Cy dropped out. Their turn plays itself shortly.'
    )
  })

  it('tells a knocked-out player how many are left', () => {
    const out = seats.map((s) => (s.id === 1 ? { ...s, out: true } : s))
    expect(describeTable(view({ seats: out, playersIn: 2, turnSeat: 0 })).text).toBe(
      "You're out. Two still in."
    )
  })

  it('narrates a Liar call, with you as the loser', () => {
    const reveal = {
      kind: 'liar',
      callerId: 1,
      bid: { quantity: 4, face: 3, seatId: 0 },
      count: 5,
      loserId: 1,
      gainerId: null,
    }
    expect(describeTable(view({ phase: 'reveal', reveal, turnSeat: null }))).toEqual({
      text: 'You called Liar on four 3s. There were five. You lose a die.',
      tone: 'bad',
    })
  })

  it('narrates an exact call that wins a die back', () => {
    const reveal = {
      kind: 'exact',
      callerId: 2,
      bid: { quantity: 1, face: 6, seatId: 0 },
      count: 1,
      loserId: null,
      gainerId: 2,
    }
    expect(describeTable(view({ phase: 'reveal', reveal, turnSeat: null })).text).toBe(
      'Cy called Exact on one 6. There was one. Cy gets a die back.'
    )
  })

  it('announces the winner', () => {
    expect(describeTable(view({ phase: 'over', winnerId: 1 }))).toEqual({
      text: 'You win the table.',
      tone: 'good',
    })
    expect(describeTable(view({ phase: 'over', winnerId: 0 })).text).toBe('Ana wins the table.')
  })
})

describe('eventsBetween (what a client hears)', () => {
  const types = (events) => events.map((e) => e.type)

  it('a new round is a roll, a longer bid history is a bid', () => {
    expect(types(eventsBetween(null, view()))).toEqual(['ROLLED'])
    const bidOne = view({ bidHistory: [{ quantity: 1, face: 2, seatId: 1 }] })
    expect(types(eventsBetween(view(), bidOne))).toEqual(['BID'])
    expect(types(eventsBetween(bidOne, bidOne))).toEqual([])
  })

  it('entering the reveal lifts the cups, and names a lost die', () => {
    const reveal = { kind: 'liar', callerId: 1, loserId: 0, gainerId: null }
    expect(eventsBetween(view(), view({ phase: 'reveal', reveal }))).toEqual([
      { type: 'REVEAL' },
      { type: 'DIE_LOST', seatId: 0 },
    ])
  })

  it('the end of the match is announced once', () => {
    const over = view({ phase: 'over', winnerId: 0 })
    expect(types(eventsBetween(view(), over))).toEqual(['GAME_OVER'])
    expect(types(eventsBetween(over, over))).toEqual([])
  })
})
