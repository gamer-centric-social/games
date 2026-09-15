import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDiceTable } from './diceTable'
import { createGame, activeSeatIds, markConnected } from '../engine/diceEngine'
import { createSeededRng } from '../../../utils/rng'

const TIMING = { revealMs: 4000, botThinkMs: 1000, disconnectTurnMs: 12000, lastPlayerMs: 15000 }
const people = (spec) => spec.map((kind, i) => ({ name: `P${i}`, avatar: '🙂', isBot: kind === 'bot' }))
const bid = (quantity, face) => ({ type: 'bid', bid: { quantity, face } })

function makeTable(spec, seed = 1) {
  const onChange = vi.fn()
  const onEvents = vi.fn()
  const table = createDiceTable({ rng: createSeededRng(seed), timing: TIMING, onChange, onEvents })
  table.load(createGame({ players: people(spec) }), 0)
  return { table, onChange, onEvents }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('diceTable', () => {
  it('publishes on load and after every accepted action, never after a refused one', () => {
    const { table, onChange } = makeTable(['human', 'human'])
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith(table.game, 0)

    table.start()
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(table.act(1, bid(1, 2)).ok).toBe(false)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(table.act(0, bid(1, 2)).ok).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('reports engine events', () => {
    const { table, onEvents } = makeTable(['human', 'human'])
    table.start()
    expect(onEvents.mock.calls[0][0].map((e) => e.type)).toEqual(['ROLLED'])
  })

  it('a bot takes its turn after thinking', () => {
    const { table } = makeTable(['human', 'bot'])
    table.start()
    table.act(0, bid(1, 2))

    vi.advanceTimersByTime(999)
    expect(table.game.bidHistory).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(table.game.phase === 'reveal' || table.game.bidHistory.length === 2).toBe(true)
  })

  it('waits on a person for as long as it takes', () => {
    const { table } = makeTable(['human', 'human'])
    table.start()
    vi.advanceTimersByTime(60000)
    expect(table.game.phase).toBe('bidding')
    expect(table.game.bidHistory).toHaveLength(0)
  })

  it('holds the reveal, then rolls the next round', () => {
    const { table } = makeTable(['human', 'human'])
    table.start()
    table.act(0, bid(1, 2))
    table.act(1, { type: 'liar' })
    expect(table.game.phase).toBe('reveal')

    vi.advanceTimersByTime(3999)
    expect(table.game.phase).toBe('reveal')
    vi.advanceTimersByTime(1)
    expect(table.game.phase).toBe('bidding')
    expect(table.game.round).toBe(2)
  })

  it('covers for a disconnected player when their turn comes', () => {
    const { table } = makeTable(['human', 'human', 'human'])
    table.start()
    table.run((g) => markConnected(g, 1, false))
    table.act(0, bid(1, 2))

    vi.advanceTimersByTime(11999)
    expect(table.game.phase).toBe('bidding')
    vi.advanceTimersByTime(1)
    expect(table.game.reveal).toMatchObject({ kind: 'liar', callerId: 1 })
  })

  it('an unrelated update does not restart a bot that is already thinking', () => {
    const { table } = makeTable(['human', 'bot', 'human'])
    table.start()
    table.act(0, bid(1, 2))
    vi.advanceTimersByTime(600)
    table.refresh()
    vi.advanceTimersByTime(400)
    expect(table.game.phase === 'reveal' || table.game.bidHistory.length === 2).toBe(true)
  })

  it('the last connected player wins by forfeit if nobody comes back', () => {
    const { table } = makeTable(['human', 'human', 'human'])
    table.start()
    table.run((g) => markConnected(g, 1, false))
    table.run((g) => markConnected(g, 2, false))

    vi.advanceTimersByTime(15000)
    expect(table.game.phase).toBe('over')
    expect(table.game.winnerId).toBe(0)
  })

  it('a returning player cancels the forfeit', () => {
    const { table } = makeTable(['human', 'human', 'human'])
    table.start()
    table.run((g) => markConnected(g, 1, false))
    table.run((g) => markConnected(g, 2, false))
    vi.advanceTimersByTime(10000)
    table.run((g) => markConnected(g, 1, true))
    vi.advanceTimersByTime(10000)
    expect(table.game.phase).toBe('bidding')
  })

  it('an all-bot table plays itself to a winner, keeping every seat within 0..5 dice', () => {
    for (const seed of [1, 2, 3]) {
      const { table } = makeTable(['bot', 'bot', 'bot', 'bot'], seed)
      table.start()

      let guard = 0
      while (table.game.phase !== 'over' && guard++ < 3000) {
        vi.advanceTimersByTime(TIMING.botThinkMs)
        for (const p of table.game.players) {
          expect(table.game.counts[p.id]).toBeGreaterThanOrEqual(0)
          expect(table.game.counts[p.id]).toBeLessThanOrEqual(5)
        }
      }

      expect(table.game.phase).toBe('over')
      expect(activeSeatIds(table.game)).toEqual([table.game.winnerId])
      table.destroy()
    }
  })

  it('destroy stops every timer', () => {
    const { table, onChange } = makeTable(['human', 'bot'])
    table.start()
    table.act(0, bid(1, 2))
    const calls = onChange.mock.calls.length
    table.destroy()
    vi.advanceTimersByTime(60000)
    expect(onChange.mock.calls.length).toBe(calls)
    expect(table.game).toBeNull()
  })
})
