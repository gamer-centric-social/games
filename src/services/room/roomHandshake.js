/**
 * Room admission control, shared by every networked game.
 *
 * Deciding whether an incoming peer may take a seat is the most intricate
 * non-rules logic in a networked game, and it is entirely separate from the rules:
 * empty-name checks, late-join refusal, matching a returning player by peer id /
 * session id / name, probing a possibly-dead connection that still holds their seat,
 * and capacity.
 *
 * `admitPlayer` mutates `game.players` on the accepted paths and reports what happened;
 * the caller is responsible for the messages that follow, which need state only it
 * can build.
 *
 * Generalized from UNO's unoHandshake.js (which UNO still uses until it migrates).
 * The only game knowledge it needs -- whether a match is under way -- is passed in
 * as isMatchInProgress(game).
 */

/** Grace period before closing a rejected connection, so the error arrives first. */
const REJECT_CLOSE_DELAY_MS = 300

/** How long to wait for a PONG before deciding a held seat is a ghost. */
const LIVENESS_PROBE_MS = 1200

export const ADMIT = {
  /** Turned away; the caller need do nothing further. */
  REJECTED: 'rejected',
  /** A registered player is back mid-match and needs their hand resent. */
  RECONNECTED: 'reconnected',
  /** A player retook their lobby seat before the match started. */
  RECLAIMED: 'reclaimed',
  /** A brand new player was seated in the lobby. */
  JOINED: 'joined',
}

/** Tell the peer why it cannot join, then hang up. */
function reject(conn, net, clientPeerId, error) {
  try {
    conn.send({ type: 'ROOM_ERROR', error })
  } catch (e) {
    console.error('[Host] Failed to deliver ROOM_ERROR:', e)
  }
  setTimeout(() => net.removeConnection(clientPeerId), REJECT_CLOSE_DELAY_MS)
  return { status: ADMIT.REJECTED, error }
}

const normalizeName = (name) => String(name || '').trim().toLowerCase()

/**
 * Find the seat an incoming peer is plausibly returning to.
 *
 * Two matches, in descending confidence: the same browser tab (sessionId), or the
 * same name. Name alone is weak, which is why a name match still has to survive the
 * liveness probe below. The same peer id is handled before this, in admitPlayer.
 */
function findReturningSeat(players, { sessionId, cleanName }) {
  return players.find(
    (p) =>
      !p.isHost &&
      ((sessionId && p.sessionId && p.sessionId === sessionId) || normalizeName(p.name) === cleanName)
  )
}

/**
 * Is the connection currently holding this seat actually still there?
 *
 * A player who closed their laptop leaves a connection that looks open but answers
 * nothing. Probing distinguishes that ghost - whose seat should be handed over - from
 * a genuine second person trying to use a name that is already taken.
 */
async function seatIsStale(seat, clientPeerId, sessionId, net) {
  // Same tab returning: no ambiguity, it is them.
  if (sessionId && seat.sessionId && seat.sessionId === sessionId) return true
  if (!seat.connected) return true
  if (!seat.peerId || seat.peerId === clientPeerId) return true

  const alive = await net.checkPeerResponsive(seat.peerId, LIVENESS_PROBE_MS)
  return !alive
}

/** Hand a seat over to a new connection, dropping whatever held it before. */
function bindSeat(seat, { clientPeerId, sessionId, avatar, name }, net) {
  if (seat.peerId && seat.peerId !== clientPeerId) {
    net.removeConnection(seat.peerId)
  }
  seat.peerId = clientPeerId
  seat.connected = true
  if (sessionId) seat.sessionId = sessionId
  if (avatar) seat.avatar = avatar
  if (name) seat.name = name
}

/**
 * Decide whether `clientPlayer` may join `game`, seating them if so.
 *
 * `net` needs { removeConnection, checkPeerResponsive }.
 * `isMatchInProgress(game)` decides whether late joiners are refused.
 */
export async function admitPlayer({ game, clientPeerId, clientPlayer, conn, net, isMatchInProgress }) {
  const incomingName = String(clientPlayer?.name || '').trim()
  const cleanName = incomingName.toLowerCase()
  const sessionId = clientPlayer?.sessionId || ''
  const avatar = clientPlayer?.avatar
  const identity = { clientPeerId, sessionId, avatar }

  if (!incomingName) {
    return reject(conn, net, clientPeerId, 'Please enter a valid player name before joining.')
  }

  // ---- One seat per connection -------------------------------------------
  // A connection that already sits somewhere may only repeat its own JOIN. Without
  // this, a seated player could JOIN again under a dropped player's name, hold both
  // seats, and be sent both players' private state.
  const heldSeat = game.players.find((p) => !p.isHost && p.peerId === clientPeerId)
  if (heldSeat) {
    if (normalizeName(heldSeat.name) !== cleanName) {
      return reject(conn, net, clientPeerId, 'This connection already holds a seat.')
    }
    return {
      status: isMatchInProgress(game) ? ADMIT.RECONNECTED : ADMIT.RECLAIMED,
      player: heldSeat,
    }
  }

  // ---- Match already under way ------------------------------------------
  if (isMatchInProgress(game)) {
    // Only names captured when the match started may return. Without this, a stranger
    // with the room code could walk into a game in progress.
    const wasInLobby = game.lockedLobbyPlayerNames
      ? game.lockedLobbyPlayerNames.has(cleanName)
      : game.players.some((p) => normalizeName(p.name) === cleanName)

    const seat = findReturningSeat(game.players, { sessionId, cleanName })

    if (!wasInLobby || !seat) {
      return reject(
        conn,
        net,
        clientPeerId,
        'This game has already started. External players cannot join an active match.'
      )
    }

    if (!(await seatIsStale(seat, clientPeerId, sessionId, net))) {
      return reject(
        conn,
        net,
        clientPeerId,
        `A player named "${incomingName}" is already actively connected in this match.`
      )
    }

    bindSeat(seat, identity, net)
    return { status: ADMIT.RECONNECTED, player: seat }
  }

  // ---- Still in the lobby ------------------------------------------------
  const hostHasName = game.players.some((p) => p.isHost && normalizeName(p.name) === cleanName)
  if (hostHasName) {
    return reject(
      conn,
      net,
      clientPeerId,
      `The name "${incomingName}" is already taken by the room host. Please choose a different name.`
    )
  }

  const seat = findReturningSeat(game.players, { sessionId, cleanName })
  if (seat) {
    if (!(await seatIsStale(seat, clientPeerId, sessionId, net))) {
      return reject(
        conn,
        net,
        clientPeerId,
        `The name "${incomingName}" is already taken in this room. Please choose a different name.`
      )
    }
    bindSeat(seat, { ...identity, name: incomingName }, net)
    return { status: ADMIT.RECLAIMED, player: seat }
  }

  const capacity = game.maxPlayers || 4
  if (game.players.length >= capacity) {
    return reject(conn, net, clientPeerId, `Room is full (maximum ${capacity} players).`)
  }

  // Ids are the seat index; games rely on id === index.
  const player = {
    id: game.players.length,
    peerId: clientPeerId,
    sessionId,
    name: incomingName,
    avatar: avatar || '😎',
    isHost: false,
    isYou: false,
    connected: true,
  }
  game.players = [...game.players, player]
  return { status: ADMIT.JOINED, player }
}
