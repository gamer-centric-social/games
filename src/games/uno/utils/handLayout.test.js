import { describe, it, expect } from 'vitest'
import { computeHandLayout, hiddenPlayable, CARD_WIDTH, EDGE_PADDING } from './handLayout'

/** A phone: 430px viewport less the board's px-3. */
const PHONE = 406

const hand = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}` }))
const ids = (...indexes) => new Set(indexes.map((i) => `c${i}`))
const slots = (layout) => layout.positions.map((p) => Math.round(p.slot))

const layout = (n, playable, isMyTurn = true, width = PHONE) =>
  computeHandLayout({ width, cards: hand(n), playableIds: playable, isMyTurn })

describe('computeHandLayout', () => {
  it('returns nothing for an empty hand', () => {
    const result = computeHandLayout({ width: PHONE, cards: [], isMyTurn: true })
    expect(result.positions).toEqual([])
    expect(result.overflows).toBe(false)
  })

  it('gives a single card the full card width and no scroll', () => {
    const result = layout(1, ids(0))
    expect(result.positions).toHaveLength(1)
    expect(result.positions[0].slot).toBe(CARD_WIDTH)
    expect(result.overflows).toBe(false)
  })

  it('keeps the ideal steps while the hand fits', () => {
    // 7 cards, 3 playable: 3 x 58 + 3 x 30 + 80 = 344, inside 406 - 32.
    expect(slots(layout(7, ids(0, 1, 2)))).toEqual([58, 58, 58, 30, 30, 30, 80])
    expect(layout(7, ids(0, 1, 2)).overflows).toBe(false)
  })

  it('always gives a playable card more room than an unplayable one', () => {
    for (const count of [8, 10, 12, 16, 20]) {
      const result = layout(count, ids(0, 2, 4))
      const open = result.positions.filter((p) => p.playable).map((p) => p.slot)
      const rib = result.positions
        .slice(0, -1)
        .filter((p) => !p.playable)
        .map((p) => p.slot)
      expect(Math.min(...open)).toBeGreaterThan(Math.max(...rib))
    }
  })

  it('never compresses a playable card below a thumb', () => {
    // 20 cards is past anything the rail can hold; the open slots still hold.
    const result = layout(20, ids(0, 5, 10, 15))
    for (const position of result.positions.slice(0, -1)) {
      expect(position.slot).toBeGreaterThanOrEqual(position.playable ? 42 : 26)
    }
  })

  it('spreads the hand evenly when it is not your turn', () => {
    const result = layout(12, ids(0, 2, 4), false)
    expect(new Set(slots(result).slice(0, -1)).size).toBe(1)
    expect(result.positions.every((p) => p.playable === false)).toBe(true)
  })

  it('spreads evenly when it is your turn but nothing is playable', () => {
    // Ribs only earn their compression by making room for something.
    expect(slots(layout(12, new Set()))).toEqual(slots(layout(12, ids(0), false)))
  })

  it('flags the overflow at the point the rail runs out', () => {
    expect(layout(7, ids(0, 1, 2)).overflows).toBe(false)
    expect(layout(12, ids(0, 2, 4, 6, 8)).overflows).toBe(true)
  })

  it('lays the cards left to right without ever going backwards', () => {
    const result = layout(12, ids(1, 3, 5))
    const xs = result.positions.map((p) => p.x)
    expect(xs[0]).toBeGreaterThanOrEqual(EDGE_PADDING)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1])
  })

  it('centres a short hand and pins a scrolling one to the edge', () => {
    expect(layout(3, ids(0)).positions[0].x).toBeGreaterThan(EDGE_PADDING)
    expect(layout(16, ids(0)).positions[0].x).toBe(EDGE_PADDING)
  })

  it('reports the first step as the spacing the draw animation lands on', () => {
    const result = layout(7, ids(0, 1, 2))
    expect(result.flightSpacing).toBe(result.positions[0].slot)
  })

  it('lays out at the ideal before the tray has been measured', () => {
    // width 0 must not collapse every card onto the floor and then jump.
    expect(slots(layout(7, ids(0, 1, 2), true, 0))).toEqual([58, 58, 58, 30, 30, 30, 80])
  })
})

describe('hiddenPlayable', () => {
  const positions = [
    { id: 'a', x: 0, slot: 50, playable: true },
    { id: 'b', x: 50, slot: 50, playable: false },
    { id: 'c', x: 100, slot: 50, playable: true },
    { id: 'd', x: 150, slot: 80, playable: true },
  ]

  it('counts nothing hidden when the whole hand is on screen', () => {
    expect(hiddenPlayable({ positions, scrollLeft: 0, viewportWidth: 300 })).toEqual({
      left: 0,
      right: 0,
      leftTarget: null,
      rightTarget: null,
    })
  })

  it('counts the playable cards off the right edge and points at the nearest', () => {
    const result = hiddenPlayable({ positions, scrollLeft: 0, viewportWidth: 100 })
    expect(result.right).toBe(2)
    expect(result.rightTarget).toBe(100)
  })

  it('counts the playable cards off the left edge and points at the nearest', () => {
    const result = hiddenPlayable({ positions, scrollLeft: 150, viewportWidth: 200 })
    expect(result.left).toBe(2)
    expect(result.leftTarget).toBe(100)
  })

  it('treats a partly visible card as visible rather than nagging about it', () => {
    // Card 'c' starts at 100 and the viewport ends at 120: still findable.
    expect(hiddenPlayable({ positions, scrollLeft: 0, viewportWidth: 120 }).right).toBe(1)
  })

  it('ignores unplayable cards entirely', () => {
    const dead = positions.map((p) => ({ ...p, playable: false }))
    const result = hiddenPlayable({ positions: dead, scrollLeft: 0, viewportWidth: 60 })
    expect(result).toEqual({ left: 0, right: 0, leftTarget: null, rightTarget: null })
  })
})
