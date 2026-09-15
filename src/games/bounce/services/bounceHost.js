import { admitPlayer, ADMIT } from '../../../services/room/roomHandshake'
import { broadcastToSeats, relayClientChat, sendChatHistory } from '../../../services/room/roomChat'
import {
  applyFinish,
  applyProgress,
  isMatchInProgress,
  markConnected,
  removeLobbySeat,
  snapshotFor,
} from '../engine/raceState'
import { MSG, PROTOCOL_VERSION } from '../constants/bounceConstants'

/**
 * What the host does with everything a client sends.
 *
 * Lifted out of useBounceRoom so it is plain JS: admission, the message dispatch
 * and the leave path are the security-shaped parts of a networked game, and
 * inside a hook they could not be tested at all.
 *
 * The race and the network arrive as getters because both are created after the
 * handlers are handed to PeerJS.
 */
export function createHostHandlers({
  getRace,
  getNet,
  chatService,
  publish,
  roomCode,
  now = () => Date.now(),
}) {
  /** Seated players only: broadcast would also reach connections that never joined. */
  const toSeats = (race, net, message) => broadcastToSeats(race.players, net.sendTo, message)

  function handleLeave(peerId) {
    const race = getRace()
    const seat = race?.players.find((p) => p.peerId === peerId)
    if (!seat || seat.isHost) return
    if (race.phase === 'lobby') removeLobbySeat(race, seat.id)
    else markConnected(race, seat.id, false)
    publish(true)
  }

  return {
    async onClientJoin(peerId, player, conn, join) {
      const net = getNet()
      if (join?.v !== PROTOCOL_VERSION) {
        // A stale client is told why, rather than left to desync silently.
        try {
          conn.send({
            type: MSG.ROOM_ERROR,
            error: 'This room is running a different version. Refresh the page and try again.',
          })
        } catch {
          // ignore
        }
        setTimeout(() => net.removeConnection(peerId), 300)
        return
      }

      const race = getRace()
      if (!race) return

      const result = await admitPlayer({
        game: race,
        clientPeerId: peerId,
        clientPlayer: player,
        conn,
        net,
        isMatchInProgress,
      })
      if (result.status === ADMIT.REJECTED) return

      try {
        conn.send({ type: MSG.WELCOME, roomCode })
      } catch {
        // ignore
      }
      sendChatHistory({ chatService, send: (message) => conn.send(message) })
      publish(true)
    },

    onClientData(peerId, data) {
      const race = getRace()
      const net = getNet()
      if (!race || !net) return

      // Who a client is comes only from its connection, never from the packet.
      const seat = race.players.find((p) => p.peerId === peerId)
      if (relayClientChat({ data, seat, chatService, broadcast: (m) => toSeats(race, net, m) })) return
      // A connection with no seat can do nothing.
      if (!seat) return

      switch (data?.type) {
        case MSG.ACTION_PROGRESS:
          // The packet says how high, and the engine decides whether to believe it.
          applyProgress(race, seat.id, data, now())
          publish()
          break

        case MSG.ACTION_FINISH: {
          const result = applyFinish(race, seat.id, now())
          if (!result.ok) {
            net.sendTo(peerId, { type: MSG.ACTION_REJECTED, reason: result.reason })
          }
          publish(true)
          break
        }

        case MSG.ACTION_REQUEST_SYNC:
          net.sendTo(peerId, { type: MSG.SYNC_RACE_STATE, state: snapshotFor(race, seat.id) })
          break

        case MSG.ACTION_LEAVE:
          handleLeave(peerId)
          break

        default:
      }
    },

    onClientLeave: handleLeave,
  }
}
