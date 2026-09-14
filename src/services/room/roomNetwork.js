import { Peer } from 'peerjs'
import { getIceConfig, createPeerIdFormatter } from '../peerConfig'

/** WebRTC states that mean a connection is gone, whatever `conn.open` still says. */
const DEAD_STATES = new Set(['disconnected', 'failed', 'closed'])

/**
 * PeerJS rooms for one game: a host that admits clients, and clients that send
 * intent.
 *
 * Generalized from UNO's unoNetwork.js (which UNO still uses until it migrates);
 * only the peer-id prefix, the session key and the protocol version differ
 * between games. JOIN carries the protocol version, so a host can refuse a
 * client running different code with a clear message instead of a silent desync.
 */
export function createRoomNetwork({ peerPrefix, sessionKey, protocolVersion }) {
  /** Format a human-readable room code into a global Peer ID */
  const formatPeerId = createPeerIdFormatter(peerPrefix)

  /**
   * Persistent tab session ID, used to reclaim a seat after a refresh.
   * Deliberately sessionStorage: a second tab is a different player.
   */
  function getClientSessionId() {
    if (typeof window === 'undefined') return ''
    try {
      let sid = sessionStorage.getItem(sessionKey)
      if (!sid) {
        sid = 'sid_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36)
        sessionStorage.setItem(sessionKey, sid)
      }
      return sid
    } catch {
      return ''
    }
  }

  /** Host: open the room. `onClientJoin` also receives the whole JOIN message. */
  function initHostPeer({ roomCode, onOpen, onClientJoin, onClientData, onClientLeave, onError }) {
    const peer = new Peer(formatPeerId(roomCode), {
      debug: 1,
      config: getIceConfig(),
    })

    const connections = new Map() // clientPeerId -> DataConnection
    const pendingPings = new Map() // pingId -> resolve function

    peer.on('open', (id) => {
      if (onOpen) onOpen(id, roomCode)
    })

    peer.on('connection', (conn) => {
      connections.set(conn.peer, conn)

      conn.on('open', () => {
        connections.set(conn.peer, conn)
      })

      conn.on('data', (data) => {
        if (data?.type === 'PONG') {
          const resolver = pendingPings.get(data.pingId)
          if (resolver) {
            pendingPings.delete(data.pingId)
            resolver(true)
          }
          return
        }
        if (data?.type === 'JOIN') {
          if (onClientJoin) onClientJoin(conn.peer, data.player, conn, data)
        } else if (onClientData) {
          onClientData(conn.peer, data)
        }
      })

      conn.on('close', () => {
        connections.delete(conn.peer)
        if (onClientLeave) onClientLeave(conn.peer)
      })

      conn.on('error', (err) => {
        console.warn('[Host] Connection error with peer:', conn.peer, err)
      })
    })

    peer.on('error', (err) => {
      console.error('[Host] Peer error:', err)
      if (onError) onError(err)
    })

    peer.on('disconnected', () => {
      console.warn('[Host] Peer disconnected from signaling server. Attempting automatic reconnect...')
      try {
        if (!peer.destroyed) {
          peer.reconnect()
        }
      } catch (e) {
        console.warn('[Host] Peer reconnect failed:', e)
      }
    })

    return {
      peer,
      connections,
      broadcast: (data) => {
        connections.forEach((conn, clientPeerId) => {
          try {
            conn.send(data)
          } catch (e) {
            console.error('[Host] Broadcast failed for client:', clientPeerId, e)
          }
        })
      },
      sendTo: (clientPeerId, data) => {
        const conn = connections.get(clientPeerId)
        if (!conn) return
        try {
          conn.send(data)
        } catch (e) {
          console.error('[Host] sendTo failed for client:', clientPeerId, e)
        }
      },
      checkPeerResponsive: (clientPeerId, timeoutMs = 1200) => {
        const conn = connections.get(clientPeerId)
        if (!conn || !conn.open) return Promise.resolve(false)
        const pc = conn.peerConnection
        if (pc) {
          if (DEAD_STATES.has(pc.connectionState) || DEAD_STATES.has(pc.iceConnectionState)) {
            return Promise.resolve(false)
          }
        }

        const pingId = 'ping_' + Math.random().toString(36).substring(2, 9)
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            pendingPings.delete(pingId)
            resolve(false)
          }, timeoutMs)

          pendingPings.set(pingId, (result) => {
            clearTimeout(timer)
            resolve(result)
          })

          try {
            conn.send({ type: 'PING', pingId })
          } catch {
            clearTimeout(timer)
            pendingPings.delete(pingId)
            resolve(false)
          }
        })
      },
      removeConnection: (clientPeerId) => {
        const conn = connections.get(clientPeerId)
        if (conn) {
          try {
            conn.close()
          } catch {
            // ignore
          }
          connections.delete(clientPeerId)
        }
      },
      destroy: () => {
        pendingPings.forEach((resolve) => resolve(false))
        pendingPings.clear()
        connections.forEach((conn) => {
          try {
            conn.close()
          } catch {
            // ignore
          }
        })
        connections.clear()
        try {
          peer.destroy()
        } catch {
          // ignore
        }
      },
    }
  }

  /** Client: connect to a host's room. */
  function initClientPeer({ roomCode, player, onConnected, onData, onDisconnected, onError }) {
    const peer = new Peer({
      debug: 1,
      config: getIceConfig(),
    })

    let hostConn = null
    let connectTimeout = null

    const clearConnectTimeout = () => {
      if (connectTimeout) {
        clearTimeout(connectTimeout)
        connectTimeout = null
      }
    }

    peer.on('open', () => {
      hostConn = peer.connect(formatPeerId(roomCode), { reliable: true })

      // Give up if WebRTC ICE negotiation does not open within 12 seconds.
      connectTimeout = setTimeout(() => {
        if (!hostConn || !hostConn.open) {
          console.warn('[Client] Connection timeout to host room:', roomCode)
          if (onError) {
            onError(
              new Error(
                'Could not connect to the room. Make sure the room code is correct and the host has the screen open and awake.'
              )
            )
          }
        }
      }, 12000)

      hostConn.on('open', () => {
        clearConnectTimeout()
        try {
          hostConn.send({
            type: 'JOIN',
            v: protocolVersion,
            player: {
              ...player,
              sessionId: player?.sessionId || getClientSessionId(),
            },
          })
        } catch (e) {
          console.error('[Client] Failed to send JOIN payload:', e)
        }
        if (onConnected) onConnected(hostConn)
      })

      hostConn.on('data', (data) => {
        if (data?.type === 'PING') {
          try {
            hostConn.send({ type: 'PONG', pingId: data.pingId })
          } catch {
            // ignore
          }
          return
        }
        if (onData) onData(data)
      })

      hostConn.on('close', () => {
        clearConnectTimeout()
        if (onDisconnected) onDisconnected()
      })

      hostConn.on('error', (err) => {
        clearConnectTimeout()
        console.error('[Client] hostConn error:', err)
        if (onError) onError(err)
      })
    })

    peer.on('error', (err) => {
      clearConnectTimeout()
      console.error('[Client] Peer error:', err)
      if (onError) onError(err)
    })

    return {
      peer,
      isConnected: () => Boolean(hostConn && hostConn.open),
      sendAction: (data) => {
        if (!hostConn || !hostConn.open) {
          console.warn('[Client] sendAction skipped: hostConn is not open. Action:', data?.type)
          return false
        }
        try {
          hostConn.send(data)
          return true
        } catch (e) {
          console.error('[Client] Failed to send action to host:', e)
          return false
        }
      },
      destroy: () => {
        clearConnectTimeout()
        if (hostConn) {
          try {
            hostConn.close()
          } catch {
            // ignore
          }
        }
        try {
          peer.destroy()
        } catch {
          // ignore
        }
      },
    }
  }

  return { formatPeerId, getClientSessionId, initHostPeer, initClientPeer }
}
