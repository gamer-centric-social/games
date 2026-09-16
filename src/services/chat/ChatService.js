import {
  MAX_CHAT_HISTORY,
  createChatMessage,
  sanitizeChatMessage,
} from './chatTypes'
import { toWireMessage } from './chatRelay'

/**
 * ChatService
 *
 * Core game-agnostic chat orchestrator. Handles message history,
 * deduplication, subscriber notification, and network dispatching.
 */
export class ChatService {
  /**
   * @param {Object} options
   * @param {import('./transports/IChatTransport').IChatTransport} options.transport
   * @param {number} [options.maxHistory]
   */
  constructor({ transport = null, maxHistory = MAX_CHAT_HISTORY } = {}) {
    this.transport = null
    this.maxHistory = maxHistory
    this.messages = []
    this.seenIds = new Set()
    this.subscribers = new Set()
    this.unsubscribeTransport = null

    if (transport) {
      this.attachTransport(transport)
    }
  }

  /**
   * Attach or re-attach a transport instance.
   * @param {import('./transports/IChatTransport').IChatTransport} transport
   */
  attachTransport(transport) {
    if (this.transport === transport && this.unsubscribeTransport) {
      return
    }
    this.detachTransport()
    this.transport = transport
    if (this.transport && typeof this.transport.onMessage === 'function') {
      this.unsubscribeTransport = this.transport.onMessage((packet) => {
        this.handleNetworkPacket(packet)
      })
    }
  }

  /**
   * Detach the current transport and clean up listeners.
   */
  detachTransport() {
    if (this.unsubscribeTransport) {
      this.unsubscribeTransport()
      this.unsubscribeTransport = null
    }
    this.transport = null
  }

  /**
   * Subscribe to chat updates.
   * Listener is invoked as: callback(messages, newIncomingMessage)
   * @param {(messages: Array, newMsg: Object|null) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback)
    // Initial emit
    callback([...this.messages], null)
    return () => this.subscribers.delete(callback)
  }

  /**
   * Notify all registered subscribers.
   */
  notifySubscribers(newMsg = null) {
    const snapshot = [...this.messages]
    for (const sub of this.subscribers) {
      try {
        sub(snapshot, newMsg)
      } catch (err) {
        console.error('[ChatService] Subscriber error:', err)
      }
    }
  }

  /**
   * Send a new message from the local user.
   * @param {Object} params
   * @param {string} params.text
   * @param {string|number} params.senderId
   * @param {string} params.senderName
   * @param {string} [params.avatar]
   * @returns {Object|null} The sent message envelope or null if invalid
   */
  sendMessage({ text, senderId, senderName, avatar }) {
    const envelope = createChatMessage({ senderId, senderName, avatar, text })
    if (!envelope) return null

    // "Is this mine?" is answered here, where the message was typed -- not by
    // comparing senderId, because seat ids are renumbered when someone leaves
    // the lobby and a departed player's messages would start rendering as yours.
    this.addMessageToBuffer({ ...envelope, isOwn: true })

    if (this.transport && typeof this.transport.send === 'function') {
      try {
        this.transport.send(toWireMessage(envelope))
      } catch (err) {
        console.error('[ChatService] Error sending envelope via transport:', err)
      }
    }

    this.notifySubscribers(null) // null newMsg because it's locally originated
    return envelope
  }

  /**
   * Handle an incoming network packet from the transport.
   *
   * Returns true when it added at least one new message. The host relies on
   * this: it only rebroadcasts what it accepted, so a replayed id goes nowhere.
   *
   * @param {Object} packet
   * @returns {boolean}
   */
  handleNetworkPacket(packet) {
    if (!packet || typeof packet !== 'object') return false

    if (packet.type === 'CHAT_MESSAGE' && packet.payload) {
      const safeEnvelope = this.acceptFromNetwork(packet.payload)
      if (!safeEnvelope) return false

      this.addMessageToBuffer(safeEnvelope)
      this.notifySubscribers(safeEnvelope)
      return true
    }

    if (packet.type === 'SYNC_CHAT' && Array.isArray(packet.payload)) {
      let addedAny = false
      for (const msg of packet.payload) {
        const safeEnvelope = this.acceptFromNetwork(msg)
        if (safeEnvelope) {
          this.addMessageToBuffer(safeEnvelope)
          addedAny = true
        }
      }
      if (addedAny) {
        this.notifySubscribers(null)
      }
      return addedAny
    }

    return false
  }

  /**
   * A network message as it should be stored, or null if it is a duplicate or
   * has no text. Nothing that arrived over the wire is ever this device's own.
   * @private
   */
  acceptFromNetwork(msg) {
    if (!msg || typeof msg !== 'object' || !msg.id || this.seenIds.has(msg.id)) return null
    const cleanText = sanitizeChatMessage(msg.text)
    if (!cleanText) return null
    return { ...msg, text: cleanText, isOwn: false }
  }

  /**
   * Add a message to the internal ring buffer, enforcing max history limit.
   * @private
   */
  addMessageToBuffer(msg) {
    this.seenIds.add(msg.id)
    this.messages.push(msg)

    if (this.messages.length > this.maxHistory) {
      const removed = this.messages.shift()
      if (removed) {
        this.seenIds.delete(removed.id)
      }
    }
  }

  /**
   * Get a snapshot copy of current message history.
   * @returns {Array}
   */
  getHistory() {
    return [...this.messages]
  }

  /**
   * Clear all message history in-memory.
   */
  clear() {
    this.messages = []
    this.seenIds.clear()
    this.notifySubscribers(null)
  }

  /**
   * Destroy the service, unbind listeners, and free memory.
   */
  destroy() {
    this.detachTransport()
    this.subscribers.clear()
    this.messages = []
    this.seenIds.clear()
  }
}
