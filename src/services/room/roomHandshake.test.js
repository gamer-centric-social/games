import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { admitPlayer, ADMIT } from './roomHandshake'

// --- harness ----------------------------------------------------------------

/**
 * A room with a host plus any extra seats, either in the lobby or mid-match.
 * A plain object, not any game's engine: admission must not need one.
 */
function makeRoom({ extras = [], started = false, maxPlayers = 4 } = {}) {
  const host = {
    id: 0,
    name: 'Host',
    avatar: '😎',
    isHost: true,
    connected: true,
    sessionId: 'host-session',
    peerId: null,
  }
  const game = { players: [host, ...extras], maxPlayers, lockedLobbyPlayerNames: null, started }
  if (started) {
    game.lockedLobbyPlayerNames = new Set(game.players.map((p) => p.name.toLowerCase()))
    game.counts = Object.fromEntries(game.players.map((p) => [p.id, 5]))
  }
  return game
}

const isMatchInProgress = (game) => game.started

const seat = (id, overrides = {}) => ({
  id,
  name: `P${id}`,
  avatar: '🙂',
  isHost: false,
  connected: true,
  sessionId: `session-${id}`,
  peerId: `peer-${id}`,
  ...overrides,
})

/** Records what the host sent, and whether a probe was answered. */
function makeNet({ peerAlive = false } = {}) {
  return {
    removed: [],
    probed: [],
    removeConnection: vi.fn(function (peerId) {
      this.removed.push(peerId)
    }),
    checkPeerResponsive: vi.fn(function (peerId) {
      this.probed.push(peerId)
      return Promise.resolve(peerAlive)
    }),
  }
}

function makeConn() {
  const sent = []
  return { sent, send: vi.fn((msg) => sent.push(msg)) }
}

const join = (game, net, conn, player, peerId = 'peer-new') =>
  admitPlayer({ game, clientPeerId: peerId, clientPlayer: player, conn, net, isMatchInProgress })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

// --- name validation --------------------------------------------------------

describe('name validation', () => {
  it('turns away an empty name', async () => {
    const game = makeRoom()
    const conn = makeConn()
    const result = await join(game, makeNet(), conn, { name: '' })

    expect(result.status).toBe(ADMIT.REJECTED)
    expect(conn.sent[0]).toMatchObject({ type: 'ROOM_ERROR' })
    expect(game.players).toHaveLength(1)
  })

  it('treats whitespace as empty', async () => {
    const result = await join(makeRoom(), makeNet(), makeConn(), { name: '   ' })
    expect(result.status).toBe(ADMIT.REJECTED)
  })

  it('closes a rejected connection shortly after sending the reason', async () => {
    const net = makeNet()
    await join(makeRoom(), net, makeConn(), { name: '' })

    expect(net.removeConnection).not.toHaveBeenCalled() // error goes out first
    vi.advanceTimersByTime(400)
    expect(net.removed).toEqual(['peer-new'])
  })

  it('refuses a name the host is already using, case-insensitively', async () => {
    const conn = makeConn()
    const result = await join(makeRoom(), makeNet(), conn, { name: '  hOsT ' })

    expect(result.status).toBe(ADMIT.REJECTED)
    expect(conn.sent[0].error).toMatch(/taken by the room host/)
  })
})

// --- joining a lobby --------------------------------------------------------

describe('joining a lobby', () => {
  it('seats a new player at the next index', async () => {
    const game = makeRoom({ extras: [seat(1)] })
    const result = await join(game, makeNet(), makeConn(), { name: 'Newbie', avatar: '🦊' })

    expect(result.status).toBe(ADMIT.JOINED)
    expect(result.player).toMatchObject({
      id: 2,
      name: 'Newbie',
      avatar: '🦊',
      isHost: false,
      connected: true,
      peerId: 'peer-new',
    })
    expect(game.players).toHaveLength(3)
  })

  it('trims the name and defaults the avatar', async () => {
    const game = makeRoom()
    const { player } = await join(game, makeNet(), makeConn(), { name: '  Bob  ' })
    expect(player.name).toBe('Bob')
    expect(player.avatar).toBe('😎')
  })

  it('refuses to overfill the room', async () => {
    const game = makeRoom({ extras: [seat(1)], maxPlayers: 2 })
    const conn = makeConn()
    const result = await join(game, makeNet(), conn, { name: 'Third' })

    expect(result.status).toBe(ADMIT.REJECTED)
    expect(conn.sent[0].error).toMatch(/Room is full \(maximum 2/)
    expect(game.players).toHaveLength(2)
  })
})

// --- reclaiming a lobby seat -------------------------------------------------

describe('reclaiming a lobby seat', () => {
  it('gives the seat straight back to the same browser tab', async () => {
    const game = makeRoom({ extras: [seat(1, { sessionId: 'tab-a' })] })
    const net = makeNet({ peerAlive: true })
    const result = await join(game, net, makeConn(), { name: 'P1', sessionId: 'tab-a' })

    expect(result.status).toBe(ADMIT.RECLAIMED)
    expect(result.player.id).toBe(1)
    expect(result.player.peerId).toBe('peer-new')
    // no need to probe: the session id already proves identity
    expect(net.checkPeerResponsive).not.toHaveBeenCalled()
    expect(net.removed).toEqual(['peer-1'])
    expect(game.players).toHaveLength(2)
  })

  it('gives the seat back when it was already marked disconnected', async () => {
    const game = makeRoom({ extras: [seat(1, { connected: false })] })
    const result = await join(game, makeNet({ peerAlive: true }), makeConn(), { name: 'P1' })
    expect(result.status).toBe(ADMIT.RECLAIMED)
  })

  it('gives the seat back on a name match when the old connection is a ghost', async () => {
    const game = makeRoom({ extras: [seat(1)] })
    const net = makeNet({ peerAlive: false })
    const result = await join(game, net, makeConn(), { name: 'p1', sessionId: 'different-tab' })

    expect(result.status).toBe(ADMIT.RECLAIMED)
    expect(net.probed).toEqual(['peer-1'])
  })

  it('refuses a name match when someone is genuinely still using it', async () => {
    const game = makeRoom({ extras: [seat(1)] })
    const net = makeNet({ peerAlive: true })
    const conn = makeConn()
    const result = await join(game, net, conn, { name: 'P1', sessionId: 'different-tab' })

    expect(result.status).toBe(ADMIT.REJECTED)
    expect(conn.sent[0].error).toMatch(/already taken in this room/)
    expect(game.players[1].peerId).toBe('peer-1') // untouched
  })

  it('does not create a duplicate seat on reclaim', async () => {
    const game = makeRoom({ extras: [seat(1, { sessionId: 'tab-a' })] })
    await join(game, makeNet(), makeConn(), { name: 'P1', sessionId: 'tab-a' })
    expect(game.players.map((p) => p.id)).toEqual([0, 1])
  })

  it('adopts an updated avatar on reclaim', async () => {
    const game = makeRoom({ extras: [seat(1, { sessionId: 'tab-a', avatar: '🙂' })] })
    const { player } = await join(game, makeNet(), makeConn(), {
      name: 'P1',
      sessionId: 'tab-a',
      avatar: '🐙',
    })
    expect(player.avatar).toBe('🐙')
  })
})

// --- a match already under way ----------------------------------------------

describe('a match already under way', () => {
  const startedRoom = (extras) => makeRoom({ extras, started: true })

  it('keeps strangers out', async () => {
    const game = startedRoom([seat(1)])
    const conn = makeConn()
    const result = await join(game, makeNet(), conn, { name: 'Gatecrasher' })

    expect(result.status).toBe(ADMIT.REJECTED)
    expect(conn.sent[0].error).toMatch(/already started/)
    expect(game.players).toHaveLength(2)
  })

  it('lets a registered player back into their seat', async () => {
    const game = startedRoom([seat(1, { connected: false, peerId: null })])
    const result = await join(game, makeNet(), makeConn(), { name: 'P1' })

    expect(result.status).toBe(ADMIT.RECONNECTED)
    expect(result.player.id).toBe(1)
    expect(result.player.connected).toBe(true)
    expect(result.player.peerId).toBe('peer-new')
  })

  it('recognises a refreshed tab by session id', async () => {
    const game = startedRoom([seat(1, { sessionId: 'tab-a' })])
    const net = makeNet({ peerAlive: true })
    const result = await join(game, net, makeConn(), { name: 'P1', sessionId: 'tab-a' })

    expect(result.status).toBe(ADMIT.RECONNECTED)
    expect(net.checkPeerResponsive).not.toHaveBeenCalled()
  })

  it('blocks a second person using a connected player\'s name', async () => {
    const game = startedRoom([seat(1)])
    const conn = makeConn()
    const result = await join(game, makeNet({ peerAlive: true }), conn, {
      name: 'P1',
      sessionId: 'someone-else',
    })

    expect(result.status).toBe(ADMIT.REJECTED)
    expect(conn.sent[0].error).toMatch(/already actively connected/)
  })

  it('hands the seat over when the holder has gone silent', async () => {
    const game = startedRoom([seat(1)])
    const net = makeNet({ peerAlive: false })
    const result = await join(game, net, makeConn(), { name: 'P1', sessionId: 'new-tab' })

    expect(result.status).toBe(ADMIT.RECONNECTED)
    expect(net.probed).toEqual(['peer-1'])
    expect(net.removed).toEqual(['peer-1'])
  })

  it('does not disturb the game state held for that seat', async () => {
    const game = startedRoom([seat(1, { connected: false, peerId: null })])
    const countsBefore = game.counts

    await join(game, makeNet(), makeConn(), { name: 'P1' })
    expect(game.counts).toBe(countsBefore)
    expect(game.counts[1]).toBe(5)
  })

  it('refuses a name that was never in the lobby, even if a seat looks free', async () => {
    const game = startedRoom([seat(1)])
    game.lockedLobbyPlayerNames = new Set(['host', 'p1'])

    const result = await join(game, makeNet(), makeConn(), { name: 'Ghost' })
    expect(result.status).toBe(ADMIT.REJECTED)
  })
})

// --- one seat per connection ------------------------------------------------

describe('a connection that already holds a seat', () => {
  it("cannot take a dropped player's seat mid-match with a second JOIN", async () => {
    const game = makeRoom({ extras: [seat(1, { connected: false, peerId: null }), seat(2)], started: true })
    const conn = makeConn()
    const result = await join(game, makeNet(), conn, { name: 'P1' }, 'peer-2')

    expect(result.status).toBe(ADMIT.REJECTED)
    expect(conn.sent[0].error).toMatch(/already holds a seat/)
    expect(game.players[1]).toMatchObject({ peerId: null, connected: false })
  })

  it('cannot take another lobby seat', async () => {
    const game = makeRoom({ extras: [seat(1), seat(2)] })
    const result = await join(game, makeNet(), makeConn(), { name: 'P1' }, 'peer-2')

    expect(result.status).toBe(ADMIT.REJECTED)
    expect(game.players[1]).toMatchObject({ name: 'P1', peerId: 'peer-1' })
    expect(game.players[2]).toMatchObject({ name: 'P2', peerId: 'peer-2' })
  })

  it('may repeat its own JOIN in the lobby, changing nothing', async () => {
    const game = makeRoom({ extras: [seat(1)] })
    const net = makeNet()
    const result = await join(game, net, makeConn(), { name: ' p1 ', avatar: '🐙' }, 'peer-1')

    expect(result.status).toBe(ADMIT.RECLAIMED)
    expect(result.player).toBe(game.players[1])
    expect(game.players).toHaveLength(2)
    expect(game.players[1].avatar).toBe('🙂')
    expect(net.removed).toEqual([])
  })

  it('may repeat its own JOIN mid-match', async () => {
    const game = makeRoom({ extras: [seat(1)], started: true })
    const net = makeNet()
    const result = await join(game, net, makeConn(), { name: 'P1' }, 'peer-1')

    expect(result.status).toBe(ADMIT.RECONNECTED)
    expect(result.player).toBe(game.players[1])
    expect(net.checkPeerResponsive).not.toHaveBeenCalled()
    expect(net.removed).toEqual([])
  })
})
