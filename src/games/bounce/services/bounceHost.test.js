import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHostHandlers } from './bounceHost'
import { applyProgress, createRace, startRace } from '../engine/raceState'
import { COURSE_HEIGHT, MIN_FINISH_MS, MSG, PROTOCOL_VERSION } from '../constants/bounceConstants'

const T0 = 1_000_000

function setup({ racing = false } = {}) {
  const race = createRace({
    roomCode: 'AB12',
    maxPlayers: 4,
    players: [
      { name: 'Ada', avatar: '😎', isHost: true, peerId: null, sessionId: 'sid-host' },
      { name: 'Bo', avatar: '🦊', peerId: 'peer-bo', sessionId: 'sid-bo' },
      { name: 'Cy', avatar: '🐼', peerId: 'peer-cy', sessionId: 'sid-cy' },
    ],
  })
  if (racing) startRace(race, { seed: 5, nowMs: T0 })

  const net = {
    sendTo: vi.fn(),
    removeConnection: vi.fn(),
    checkPeerResponsive: vi.fn(async () => false),
  }
  const chatService = {
    getHistory: vi.fn(() => []),
    handleNetworkPacket: vi.fn(() => true),
  }
  const publish = vi.fn()
  let clock = T0

  const handlers = createHostHandlers({
    getRace: () => race,
    getNet: () => net,
    chatService,
    publish,
    roomCode: 'AB12',
    now: () => clock,
  })

  return { race, net, chatService, publish, handlers, at: (ms) => { clock = ms } }
}

const conn = () => ({ send: vi.fn(), close: vi.fn() })

describe('joining', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('refuses a client running different code, with a message rather than a desync', () => {
    const { handlers, net } = setup()
    const c = conn()
    handlers.onClientJoin('peer-new', { name: 'Dee' }, c, { v: PROTOCOL_VERSION + 1 })

    expect(c.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: MSG.ROOM_ERROR, error: expect.stringContaining('different version') })
    )
    vi.advanceTimersByTime(400)
    expect(net.removeConnection).toHaveBeenCalledWith('peer-new')
  })

  it('seats a new player and welcomes them', async () => {
    const { handlers, race, publish } = setup()
    const c = conn()
    await handlers.onClientJoin('peer-dee', { name: 'Dee', avatar: '🐯' }, c, { v: PROTOCOL_VERSION })

    expect(race.players.map((p) => p.name)).toContain('Dee')
    expect(c.send).toHaveBeenCalledWith({ type: MSG.WELCOME, roomCode: 'AB12' })
    expect(publish).toHaveBeenCalledWith(true)
  })

  it('turns away a stranger once the race is under way', async () => {
    const { handlers, race } = setup({ racing: true })
    const c = conn()
    await handlers.onClientJoin('peer-new', { name: 'Stranger' }, c, { v: PROTOCOL_VERSION })

    expect(race.players.map((p) => p.name)).not.toContain('Stranger')
    expect(c.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: MSG.ROOM_ERROR, error: expect.stringContaining('already started') })
    )
  })
})

describe('the acting seat comes from the connection', () => {
  it('ignores anything from a connection that holds no seat', () => {
    const { handlers, race, publish } = setup({ racing: true })
    handlers.onClientData('peer-nobody', { type: MSG.ACTION_PROGRESS, y: 9000 })

    expect(publish).not.toHaveBeenCalled()
    expect(race.players.every((p) => p.progress === 0)).toBe(true)
  })

  it('credits the seat holding the connection, not a seat named in the packet', () => {
    // Sending someone else's id must move your own ball, never theirs.
    const { handlers, race, at } = setup({ racing: true })
    at(T0 + 1000)
    handlers.onClientData('peer-bo', { type: MSG.ACTION_PROGRESS, y: 600, id: 2, playerId: 2, seatId: 2 })

    expect(race.players[1].progress).toBe(600)
    expect(race.players[2].progress).toBe(0)
  })

  it('will not relay chat from a connection with no seat', () => {
    const { handlers, net, chatService } = setup()
    handlers.onClientData('peer-nobody', { type: 'CHAT_MESSAGE', text: 'let me in' })

    expect(chatService.handleNetworkPacket).not.toHaveBeenCalled()
    expect(net.sendTo).not.toHaveBeenCalled()
  })
})

describe('progress and finishing', () => {
  it('validates a reported height rather than taking it', () => {
    const { handlers, race, at } = setup({ racing: true })
    at(T0 + 1000)
    handlers.onClientData('peer-bo', { type: MSG.ACTION_PROGRESS, y: COURSE_HEIGHT })

    expect(race.players[1].progress).toBeLessThan(COURSE_HEIGHT)
    expect(race.players[1].suspect).toBe(true)
  })

  it('tells a client when its finish was refused', () => {
    const { handlers, net } = setup({ racing: true })
    handlers.onClientData('peer-bo', { type: MSG.ACTION_FINISH })

    expect(net.sendTo).toHaveBeenCalledWith(
      'peer-bo',
      expect.objectContaining({ type: MSG.ACTION_REJECTED, reason: expect.any(String) })
    )
  })

  it('accepts a finish the reported climb supports', () => {
    const { handlers, race, net, at } = setup({ racing: true })
    const arrival = T0 + MIN_FINISH_MS + 5000
    applyProgress(race, 1, { y: COURSE_HEIGHT }, arrival - 100)
    at(arrival)
    handlers.onClientData('peer-bo', { type: MSG.ACTION_FINISH })

    expect(race.players[1].finished).toBe(true)
    expect(race.players[1].rank).toBe(1)
    expect(net.sendTo).not.toHaveBeenCalledWith('peer-bo', expect.objectContaining({ type: MSG.ACTION_REJECTED }))
  })

  it('answers a resync with that seat own view, carrying no peer or session ids', () => {
    const { handlers, net } = setup({ racing: true })
    handlers.onClientData('peer-cy', { type: MSG.ACTION_REQUEST_SYNC })

    const [peerId, message] = net.sendTo.mock.calls.at(-1)
    expect(peerId).toBe('peer-cy')
    expect(message.type).toBe(MSG.SYNC_RACE_STATE)
    expect(message.state.yourId).toBe(2)
    const wire = JSON.stringify(message)
    expect(wire).not.toContain('peer-')
    expect(wire).not.toContain('sid-')
  })
})

describe('leaving', () => {
  it('frees a lobby seat and renumbers the rest', () => {
    const { handlers, race } = setup()
    handlers.onClientLeave('peer-bo')

    expect(race.players.map((p) => p.name)).toEqual(['Ada', 'Cy'])
    expect(race.players.map((p) => p.id)).toEqual([0, 1])
  })

  it('keeps a seat but marks it gone once the race is running', () => {
    const { handlers, race } = setup({ racing: true })
    handlers.onClientLeave('peer-bo')

    expect(race.players).toHaveLength(3)
    expect(race.players[1].connected).toBe(false)
    expect(race.players[1].peerId).toBeNull()
  })

  it('never drops the host on a stray leave', () => {
    const { handlers, race } = setup()
    handlers.onClientLeave(null)
    expect(race.players[0].isHost).toBe(true)
    expect(race.players).toHaveLength(3)
  })
})
