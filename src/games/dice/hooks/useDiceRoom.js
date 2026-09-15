import { useCallback, useEffect, useRef, useState } from 'react'
import { generateRoomCode, preloadIceConfig } from '../../../services/peerConfig'
import { admitPlayer, ADMIT } from '../../../services/room/roomHandshake'
import { relayClientChat, sendChatHistory, routeClientChat } from '../../../services/room/roomChat'
import { diceNetwork } from '../services/diceNetwork'
import useDiceTable from './useDiceTable'
import {
  createGame,
  isMatchInProgress,
  markConnected,
  removeLobbySeat,
  snapshotFor,
} from '../engine/diceEngine'
import { eventsBetween } from '../utils/narration'
import { playDiceEvents } from '../utils/diceSounds'
import { MSG, PROTOCOL_VERSION } from '../constants/diceConstants'

/**
 * Online Liar's Dice.
 *
 * Host: runs the same table controller solo uses, admits peers through the
 * shared handshake, and sends each connected player snapshotFor(them) after
 * every change -- lobby and match alike, so a client has one code path.
 *
 * Client: sends intent (ACTION_BID / LIAR / EXACT) and renders whatever the host
 * last sent. It never runs the engine.
 */

const IDLE = { status: 'idle', isHost: false, roomCode: '', error: '', connection: 'connected' }

const INTENT_MESSAGE = {
  bid: (intent) => ({ type: MSG.ACTION_BID, quantity: intent.bid.quantity, face: intent.bid.face }),
  liar: () => ({ type: MSG.ACTION_LIAR }),
  exact: () => ({ type: MSG.ACTION_EXACT }),
}

function setUrlRoom(code) {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('game', 'dice')
    if (code) url.searchParams.set('room', code)
    else url.searchParams.delete('room')
    window.history.replaceState({}, document.title, url.toString())
  } catch {
    // ignore
  }
}

const describeError = (err) =>
  err?.type === 'unavailable-id'
    ? 'That room code is already in use. Try opening the room again.'
    : err?.message || 'Could not reach the room.'

export default function useDiceRoom({ chat }) {
  const [room, setRoom] = useState(IDLE)
  const [clientView, setClientView] = useState(null)
  const [clientNotice, setClientNotice] = useState('')

  const hostNetRef = useRef(null)
  const clientNetRef = useRef(null)
  const clientViewRef = useRef(null)

  const { chatService, chatTransport, reset: resetChat } = chat

  /** Host: every connected player gets their own view of the table. */
  const publish = useCallback((game) => {
    const net = hostNetRef.current
    if (!net) return
    for (const p of game.players) {
      if (p.isHost || !p.peerId || p.connected === false) continue
      net.sendTo(p.peerId, { type: MSG.SYNC_GAME_STATE, state: snapshotFor(game, p.id) })
    }
  }, [])

  const host = useDiceTable({ onPublish: publish })
  const { table } = host

  /**
   * Close whatever connection is open. Peers close asynchronously, so every
   * network callback below first checks it still belongs to the current
   * connection -- a room you left must not report that it dropped you.
   */
  const teardown = useCallback(() => {
    const hostNet = hostNetRef.current
    const clientNet = clientNetRef.current
    hostNetRef.current = null
    clientNetRef.current = null
    hostNet?.destroy()
    clientNet?.destroy()
  }, [])

  // --- host ------------------------------------------------------------------

  const createRoom = useCallback(
    async ({ name, avatar, maxPlayers }) => {
      teardown()
      setRoom({ ...IDLE, status: 'connecting' })
      await preloadIceConfig()

      const roomCode = generateRoomCode()

      const handleLeave = (peerId) => {
        const game = table.game
        const seat = game?.players.find((p) => p.peerId === peerId)
        if (!seat || seat.isHost) return
        if (game.phase === 'lobby') table.run((g) => removeLobbySeat(g, seat.id))
        else table.run((g) => markConnected(g, seat.id, false))
      }

      const net = diceNetwork.initHostPeer({
        roomCode,
        onOpen: () => {
          table.load(
            createGame({
              roomCode,
              maxPlayers,
              players: [{ name, avatar, isHost: true, peerId: null, sessionId: diceNetwork.getClientSessionId() }],
            }),
            0
          )
          chatTransport.setSendFunction((data) => net.broadcast(data))
          setRoom({ ...IDLE, status: 'in_room', isHost: true, roomCode })
          setUrlRoom(roomCode)
        },

        onClientJoin: async (peerId, player, conn, join) => {
          if (join?.v !== PROTOCOL_VERSION) {
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
          const game = table.game
          if (!game) return

          const result = await admitPlayer({
            game,
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
          sendChatHistory({ chatService, send: (msg) => conn.send(msg) })
          // The handshake edited the roster directly; publish sends everyone,
          // the newcomer included, their snapshot.
          table.refresh()
        },

        onClientData: (peerId, data) => {
          const game = table.game
          if (!game) return
          const seat = game.players.find((p) => p.peerId === peerId)
          if (relayClientChat({ data, seat, chatService, broadcast: net.broadcast })) return
          if (!seat) return

          const reply = (result) => {
            if (!result.ok) net.sendTo(peerId, { type: MSG.ACTION_REJECTED, reason: result.reason })
          }

          // The seat comes from the connection; the payload only says what they want.
          switch (data?.type) {
            case MSG.ACTION_BID:
              reply(table.act(seat.id, { type: 'bid', bid: { quantity: data.quantity, face: data.face } }))
              break
            case MSG.ACTION_LIAR:
              reply(table.act(seat.id, { type: 'liar' }))
              break
            case MSG.ACTION_EXACT:
              reply(table.act(seat.id, { type: 'exact' }))
              break
            case MSG.ACTION_REQUEST_SYNC:
              net.sendTo(peerId, { type: MSG.SYNC_GAME_STATE, state: snapshotFor(game, seat.id) })
              break
            case MSG.ACTION_LEAVE:
              handleLeave(peerId)
              break
            default:
          }
        },

        onClientLeave: handleLeave,

        onError: (err) => {
          if (hostNetRef.current !== net) return
          console.error('[Dice host]', err)
          if (!table.game) {
            teardown()
            setRoom({ ...IDLE, error: describeError(err) })
          }
        },
      })
      hostNetRef.current = net
    },
    [table, chatService, chatTransport, teardown]
  )

  // --- client ----------------------------------------------------------------

  const joinRoom = useCallback(
    async ({ name, avatar, roomCode }) => {
      teardown()
      setRoom({ ...IDLE, status: 'connecting', roomCode })
      await preloadIceConfig()

      const dropOut = (error) => {
        teardown()
        clientViewRef.current = null
        setClientView(null)
        setRoom({ ...IDLE, error })
      }

      const net = diceNetwork.initClientPeer({
        roomCode,
        player: { name, avatar },
        onConnected: () => {
          chatTransport.setSendFunction((data) => net.sendAction(data))
        },
        onData: (data) => {
          if (clientNetRef.current !== net) return
          if (routeClientChat({ data, chatTransport })) return
          switch (data?.type) {
            case MSG.WELCOME:
              setRoom({ ...IDLE, status: 'in_room', roomCode: data.roomCode || roomCode })
              setUrlRoom(data.roomCode || roomCode)
              break
            case MSG.ROOM_ERROR:
              dropOut(data.error || 'Unable to join the room.')
              break
            case MSG.SYNC_GAME_STATE:
              playDiceEvents(eventsBetween(clientViewRef.current, data.state))
              clientViewRef.current = data.state
              setClientView(data.state)
              setClientNotice('')
              break
            case MSG.ACTION_REJECTED:
              setClientNotice(data.reason || 'That move was refused.')
              break
            default:
          }
        },
        onDisconnected: () => {
          if (clientNetRef.current !== net) return
          dropOut('Lost the table. Rejoin with the same name to take your seat back.')
        },
        onError: (err) => {
          if (clientNetRef.current !== net) return
          console.error('[Dice client]', err)
          dropOut(describeError(err))
        },
      })
      clientNetRef.current = net
    },
    [chatTransport, teardown]
  )

  // --- both --------------------------------------------------------------------

  const leave = useCallback(() => {
    try {
      clientNetRef.current?.sendAction({ type: MSG.ACTION_LEAVE })
    } catch {
      // ignore
    }
    teardown()
    host.clear()
    resetChat()
    clientViewRef.current = null
    setClientView(null)
    setClientNotice('')
    setRoom(IDLE)
    setUrlRoom('')
  }, [teardown, host, resetChat])

  const sendIntent = useCallback(
    (intent) => {
      if (room.isHost) {
        host.act(intent)
        return
      }
      const toMessage = INTENT_MESSAGE[intent?.type]
      if (!toMessage || !clientNetRef.current?.sendAction(toMessage(intent))) {
        setClientNotice('Not connected to the host.')
      }
    },
    [room.isHost, host]
  )

  // Tell the host straight away when the tab closes, rather than after ICE times out.
  useEffect(() => {
    const onUnload = () => clientNetRef.current?.sendAction({ type: MSG.ACTION_LEAVE })
    window.addEventListener('pagehide', onUnload)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('pagehide', onUnload)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [])

  // Leaving the game screen closes the room.
  useEffect(() => teardown, [teardown])

  return {
    view: room.isHost ? host.view : clientView,
    notice: room.isHost ? host.notice : clientNotice,
    isHost: room.isHost,
    roomCode: room.roomCode,
    error: room.error,
    isConnecting: room.status === 'connecting',
    inRoom: room.status === 'in_room',
    createRoom,
    joinRoom,
    leave,
    sendIntent,
    start: () => table.start(),
    backToLobby: () => table.backToLobby(),
  }
}
