import { Peer } from 'peerjs'
import {
  preloadIceConfig,
  getIceConfig,
  generateRoomCode,
  createPeerIdFormatter,
} from '../../../services/peerConfig'

// Prefix namespaces UNO rooms on the shared public PeerJS broker
const PEER_PREFIX = 'party-arcade-uno-v1-'

/** Format a human-readable room code into a global Peer ID */
export const formatPeerId = createPeerIdFormatter(PEER_PREFIX)

// Re-exported so UnoGame keeps a single import site for its networking needs
export { preloadIceConfig, getIceConfig, generateRoomCode }

/**
 * Persistent tab session ID, used to reclaim a seat after a refresh.
 * Deliberately sessionStorage: a second tab is a different player.
 */
export function getClientSessionId() {
  if (typeof window === 'undefined') return ''
  try {
    let sid = sessionStorage.getItem('uno_session_id')
    if (!sid) {
      // getRandomValues, not randomUUID: the latter is missing on plain-http LAN dev.
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      sid = 'sid_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      sessionStorage.setItem('uno_session_id', sid)
    }
    return sid
  } catch {
    return ''
  }
}

/**
 * Host: Initialize Peer as room host
 */
export function initHostPeer({
  roomCode,
  onOpen,
  onClientJoin,
  onClientData,
  onClientLeave,
  onError,
}) {
  const peerId = formatPeerId(roomCode)
  const peer = new Peer(peerId, {
    debug: 1,
    config: getIceConfig(),
  })

  const connections = new Map() // clientPeerId -> DataConnection
  const pendingPings = new Map() // pingId -> resolve function

  peer.on('open', (id) => {
    if (onOpen) onOpen(id, roomCode)
  })

  peer.on('connection', (conn) => {
    // Immediately register connection instance
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
        if (onClientJoin) onClientJoin(conn.peer, data.player, conn)
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
      if (conn) {
        try {
          conn.send(data)
        } catch (e) {
          console.error('[Host] sendTo failed for client:', clientPeerId, e)
        }
      } else {
        console.warn('[Host] sendTo: no active connection for peer:', clientPeerId)
      }
    },
    checkPeerResponsive: (clientPeerId, timeoutMs = 1200) => {
      const conn = connections.get(clientPeerId)
      if (!conn || !conn.open) return Promise.resolve(false)
      const pc = conn.peerConnection
      if (pc) {
        const state = pc.connectionState
        const iceState = pc.iceConnectionState
        if (
          state === 'disconnected' ||
          state === 'failed' ||
          state === 'closed' ||
          iceState === 'disconnected' ||
          iceState === 'failed' ||
          iceState === 'closed'
        ) {
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

/**
 * Client: Connect to Host's room
 */
export function initClientPeer({
  roomCode,
  player,
  onConnected,
  onData,
  onDisconnected,
  onError,
}) {
  const peer = new Peer({
    debug: 1,
    config: getIceConfig(),
  })

  let hostConn = null
  let connectTimeout = null

  peer.on('open', () => {
    const hostPeerId = formatPeerId(roomCode)
    hostConn = peer.connect(hostPeerId, {
      reliable: true,
    })

    // Timeout if WebRTC ICE negotiation does not open within 12 seconds
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

    const handleOpen = () => {
      if (connectTimeout) {
        clearTimeout(connectTimeout)
        connectTimeout = null
      }
      try {
        hostConn.send({
          type: 'JOIN',
          player: {
            ...player,
            sessionId: player?.sessionId || getClientSessionId(),
          },
        })
      } catch (e) {
        console.error('[Client] Failed to send JOIN payload:', e)
      }

      if (onConnected) onConnected(hostConn)
    }

    hostConn.on('open', handleOpen)

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
      if (connectTimeout) {
        clearTimeout(connectTimeout)
        connectTimeout = null
      }
      if (onDisconnected) onDisconnected()
    })

    hostConn.on('error', (err) => {
      if (connectTimeout) {
        clearTimeout(connectTimeout)
        connectTimeout = null
      }
      console.error('[Client] hostConn error:', err)
      if (onError) onError(err)
    })
  })

  peer.on('error', (err) => {
    if (connectTimeout) {
      clearTimeout(connectTimeout)
      connectTimeout = null
    }
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
      if (connectTimeout) {
        clearTimeout(connectTimeout)
        connectTimeout = null
      }
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
