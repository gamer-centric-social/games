import { useCallback, useEffect, useRef, useState } from 'react'
import { generateRoomCode, preloadIceConfig } from '../../../services/peerConfig'
import { broadcastToSeats, routeClientChat } from '../../../services/room/roomChat'
import { cryptoRng } from '../../../utils/rng'
import { bounceNetwork } from '../services/bounceNetwork'
import { createHostHandlers } from '../services/bounceHost'
import useBounceTable from './useBounceTable'
import { applyFinish, applyProgress, createRace, resetToLobby, snapshotFor, startRace } from '../engine/raceState'
import { FINISH_RETRY_MS, MSG } from '../constants/bounceConstants'

/**
 * Online Bounce.
 *
 * Both sides run their own ball locally, which is the whole point: a tap lifts it
 * on the frame it was made rather than a round trip later. What crosses the wire
 * is the host's seed on the way out and each player's height on the way back.
 *
 * Host: owns the race, admits peers through the shared handshake, validates every
 * reported height against the physics, and sends each seated player their own
 * snapshot. Its own ball feeds the same validation path as everyone else's, so
 * there is one code path rather than a privileged one.
 *
 * Client: sends progress and renders the standings the host last sent. It never
 * decides who won.
 *
 * Host state lives in refs, not state, so it is immune to stale closures inside
 * network callbacks.
 */

const IDLE = { status: 'idle', isHost: false, roomCode: '', error: '' }

/** Standings change far more slowly than progress arrives; don't flood the wire. */
const PUBLISH_INTERVAL_MS = 100

const newSeed = () => Math.floor(cryptoRng() * 2 ** 31) >>> 0

function setUrlRoom(code) {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('game', 'bounce')
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

export default function useBounceRoom({ chat }) {
  const [room, setRoom] = useState(IDLE)
  const [view, setView] = useState(null)
  const [notice, setNotice] = useState('')

  const hostNetRef = useRef(null)
  const clientNetRef = useRef(null)
  const raceRef = useRef(null)
  const lastPublishRef = useRef(0)
  const loadedSeedRef = useRef(null)
  const finishTimerRef = useRef(null)

  const { chatService, chatTransport, reset: resetChat } = chat

  /** Host: everyone seated gets their own view of the race. */
  const publish = useCallback((force = false) => {
    const race = raceRef.current
    const net = hostNetRef.current
    if (!race || !net) return
    const now = Date.now()
    if (!force && now - lastPublishRef.current < PUBLISH_INTERVAL_MS) return
    lastPublishRef.current = now

    for (const player of race.players) {
      if (player.isHost || !player.peerId || player.connected === false) continue
      net.sendTo(player.peerId, { type: MSG.SYNC_RACE_STATE, state: snapshotFor(race, player.id) })
    }
    setView(snapshotFor(race, 0))
  }, [])

  /** The host draws its own standings from the same snapshot a client would get. */
  const publishLocal = useCallback(() => {
    const race = raceRef.current
    if (race) setView(snapshotFor(race, 0))
  }, [])

  const stopFinishRetry = useCallback(() => {
    if (finishTimerRef.current) {
      clearInterval(finishTimerRef.current)
      finishTimerRef.current = null
    }
  }, [])

  // --- the local ball, the same on both sides ---------------------------------
  //
  // Built before the handlers so they can reach it directly. `local.table` keeps
  // one identity for the life of the hook, so every callback below stays stable.

  const local = useBounceTable()
  const { table } = local

  const handleReport = useCallback(
    (report) => {
      const race = raceRef.current
      if (race) {
        applyProgress(race, 0, report, Date.now())
        publish()
        return
      }
      clientNetRef.current?.sendAction({ type: MSG.ACTION_PROGRESS, ...report })
    },
    [publish]
  )

  const handleFinish = useCallback(() => {
    const race = raceRef.current
    if (race) {
      applyFinish(race, 0, Date.now())
      publish(true)
      return
    }
    // The host refuses a finish it cannot square with the climb it was told
    // about, so keep offering it until the standings come back saying we are home.
    clientNetRef.current?.sendAction({ type: MSG.ACTION_FINISH })
    stopFinishRetry()
    finishTimerRef.current = setInterval(() => {
      if (!clientNetRef.current) {
        stopFinishRetry()
        return
      }
      table.resendFinish(performance.now())
    }, FINISH_RETRY_MS)
  }, [publish, stopFinishRetry, table])

  useEffect(() => {
    table.setHandlers({ onReport: handleReport, onFinish: handleFinish })
  }, [table, handleReport, handleFinish])

  const teardown = useCallback(() => {
    const hostNet = hostNetRef.current
    const clientNet = clientNetRef.current
    hostNetRef.current = null
    clientNetRef.current = null
    raceRef.current = null
    loadedSeedRef.current = null
    stopFinishRetry()
    hostNet?.destroy()
    clientNet?.destroy()
  }, [stopFinishRetry])

  // --- host -------------------------------------------------------------------

  const createRoom = useCallback(
    async ({ name, avatar, maxPlayers }) => {
      teardown()
      setRoom({ ...IDLE, status: 'connecting' })
      await preloadIceConfig()

      const roomCode = generateRoomCode()

      let net = null
      const handlers = createHostHandlers({
        getRace: () => raceRef.current,
        getNet: () => net,
        chatService,
        publish,
        roomCode,
      })

      net = bounceNetwork.initHostPeer({
        roomCode,
        onOpen: () => {
          raceRef.current = createRace({
            roomCode,
            maxPlayers,
            players: [
              {
                name,
                avatar,
                isHost: true,
                peerId: null,
                sessionId: bounceNetwork.getClientSessionId(),
              },
            ],
          })
          // Seated players only: net.broadcast would also reach connections that
          // never joined.
          chatTransport.setSendFunction((data) =>
            broadcastToSeats(raceRef.current?.players ?? [], net.sendTo, data)
          )
          setRoom({ ...IDLE, status: 'in_room', isHost: true, roomCode })
          setUrlRoom(roomCode)
          publishLocal()
        },

        onClientJoin: handlers.onClientJoin,
        onClientData: handlers.onClientData,
        onClientLeave: handlers.onClientLeave,

        onError: (err) => {
          if (hostNetRef.current !== net) return
          console.error('[Bounce host]', err)
          if (!raceRef.current) {
            teardown()
            setRoom({ ...IDLE, error: describeError(err) })
          }
        },
      })
      hostNetRef.current = net
    },
    [chatService, chatTransport, publish, publishLocal, teardown]
  )

  // --- client -----------------------------------------------------------------

  const joinRoom = useCallback(
    async ({ name, avatar, roomCode }) => {
      teardown()
      setRoom({ ...IDLE, status: 'connecting', roomCode })
      await preloadIceConfig()

      const dropOut = (error) => {
        teardown()
        setView(null)
        setRoom({ ...IDLE, error })
      }

      const net = bounceNetwork.initClientPeer({
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
            case MSG.SYNC_RACE_STATE: {
              const state = data.state
              setView(state)
              setNotice('')
              // The seed arrives with the standings: build the course the moment
              // the flag drops, and only once.
              if (state.phase === 'racing' && loadedSeedRef.current !== state.seed) {
                loadedSeedRef.current = state.seed
                table.load(state.seed)
              }
              if (state.phase !== 'racing') loadedSeedRef.current = null
              if (state.seats?.find((s) => s.id === state.yourId)?.finished) stopFinishRetry()
              break
            }
            case MSG.ACTION_REJECTED:
              setNotice(data.reason || 'That was refused.')
              break
            default:
          }
        },
        onDisconnected: () => {
          if (clientNetRef.current !== net) return
          dropOut('Lost the room. Rejoin with the same name to take your seat back.')
        },
        onError: (err) => {
          if (clientNetRef.current !== net) return
          console.error('[Bounce client]', err)
          dropOut(describeError(err))
        },
      })
      clientNetRef.current = net
    },
    [chatTransport, stopFinishRetry, table, teardown]
  )

  // --- both --------------------------------------------------------------------

  const start = useCallback(() => {
    const race = raceRef.current
    if (!race) return
    const seed = newSeed()
    const result = startRace(race, { seed, nowMs: Date.now() })
    if (!result.ok) {
      setNotice(result.reason)
      return
    }
    loadedSeedRef.current = seed
    table.load(seed)
    publish(true)
  }, [publish, table])

  const backToLobby = useCallback(() => {
    const race = raceRef.current
    if (!race) return
    resetToLobby(race)
    loadedSeedRef.current = null
    table.clear()
    publish(true)
  }, [publish, table])

  const leave = useCallback(() => {
    try {
      clientNetRef.current?.sendAction({ type: MSG.ACTION_LEAVE })
    } catch {
      // ignore
    }
    teardown()
    table.clear()
    resetChat()
    setView(null)
    setNotice('')
    setRoom(IDLE)
    setUrlRoom('')
  }, [resetChat, table, teardown])

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
    view,
    notice,
    local,
    yourId: view?.yourId ?? 0,
    isHost: room.isHost,
    roomCode: room.roomCode,
    error: room.error,
    isConnecting: room.status === 'connecting',
    inRoom: room.status === 'in_room',
    createRoom,
    joinRoom,
    leave,
    start,
    backToLobby,
  }
}
