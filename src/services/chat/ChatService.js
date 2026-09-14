import {
  MAX_CHAT_HISTORY,
  createChatMessage,
  sanitizeChatMessage,
} from './chatTypes'

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
  constructor({ transport, maxHistory = MAX_CHAT_HISTORY }) {
    this.transport = transport
    this.maxHistory = maxHistory
    this.messages = []
    this.seenIds = new Set()
    this.subscribers = new Set()

    if (this.transport && typeof this.transport.onMessage === 'function') {
      this.unsubscribeTransport = this.transport.onMessage((packet) => {
        this.handleNetworkPacket(packet)
      })
    }
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

    this.addMessageToBuffer(envelope)

    if (this.transport && typeof this.transport.send === 'function') {
      this.transport.send(envelope)
    }

    this.notifySubscribers(null) // null newMsg because it's locally originated
    return envelope
  }

  /**
   * Handle an incoming network packet from the transport.
   * @param {Object} packet
   */
  handleNetworkPacket(packet) {
    if (!packet || typeof packet !== 'object') return

    if (packet.type === 'CHAT_MESSAGE' && packet.payload) {
      const msg = packet.payload
      if (!msg.id || this.seenIds.has(msg.id)) return

      const cleanText = sanitizeChatMessage(msg.text)
      if (!cleanText) return

      const safeEnvelope = {
        ...msg,
        text: cleanText,
      }

      this.addMessageToBuffer(safeEnvelope)
      this.notifySubscribers(safeEnvelope)
    } else if (packet.type === 'SYNC_CHAT' && Array.isArray(packet.payload)) {
      let addedAny = false
      for (const msg of packet.payload) {
        if (msg && msg.id && !this.seenIds.has(msg.id)) {
          const cleanText = sanitizeChatMessage(msg.text)
          if (cleanText) {
            this.addMessageToBuffer({ ...msg, text: cleanText })
            addedAny = true
          }
        }
      }
      if (addedAny) {
        this.notifySubscribers(null)
      }
    }
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
    if (this.unsubscribeTransport) {
      this.unsubscribeTransport()
      this.unsubscribeTransport = null
    }
    if (this.transport && typeof this.transport.destroy === 'function') {
      this.transport.destroy()
    }
    this.subscribers.clear()
    this.messages = []
    this.seenIds.clear()
  }
}
