import { IChatTransport } from './IChatTransport'

/**
 * WebRTC PeerJS Implementation of IChatTransport
 *
 * Plugs directly into the game's peer connections with zero external
 * servers, zero database costs, and zero residual storage.
 */
export class PeerJsChatTransport extends IChatTransport {
  /**
   * @param {Object} options
   * @param {(data: Object) => void} [options.send] - Network send function (host broadcast or client sendAction)
   */
  constructor({ send } = {}) {
    super()
    this.sendFn = send || (() => {})
    this.handlers = new Set()
  }

  /**
   * Update the send function dynamically (e.g. when connection reconnects)
   * @param {(data: Object) => void} send
   */
  setSendFunction(send) {
    this.sendFn = send || (() => {})
  }

  /**
   * Send a chat envelope to the peer network.
   * @param {Object} message - Chat message envelope
   */
  send(message) {
    if (typeof this.sendFn === 'function') {
      this.sendFn({
        type: 'CHAT_MESSAGE',
        payload: message,
      })
    }
  }

  /**
   * Register a listener for incoming messages.
   * @param {(packet: Object) => void} handler
   * @returns {() => void} Unsubscribe function
   */
  onMessage(handler) {
    if (typeof handler === 'function') {
      this.handlers.add(handler)
    }
    return () => this.handlers.delete(handler)
  }

  /**
   * Inbound hook: call this when a network packet arrives from a peer.
   * @param {Object} packet
   */
  handleIncoming(packet) {
    if (!packet) return
    for (const handler of this.handlers) {
      try {
        handler(packet)
      } catch (err) {
        console.error('[PeerJsChatTransport] Error in message handler:', err)
      }
    }
  }

  /**
   * Tear down listeners and references.
   */
  destroy() {
    this.handlers.clear()
    this.sendFn = null
  }
}
