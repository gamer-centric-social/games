/**
 * Abstract Chat Transport Interface
 *
 * Defines the contract that any communication transport must satisfy
 * (PeerJS, Supabase Realtime, LiveKit, etc.) following the Dependency
 * Inversion and Liskov Substitution principles.
 */
export class IChatTransport {
  /**
   * Send a chat message envelope over the network.
   * @param {Object} message - Chat envelope
   */
  send(_message) {
    throw new Error('IChatTransport.send() must be implemented by subclass')
  }

  /**
   * Register a listener for incoming messages from the network.
   * @param {(message: Object) => void} handler
   */
  onMessage(_handler) {
    throw new Error('IChatTransport.onMessage() must be implemented by subclass')
  }

  /**
   * Tear down network resources and unbind listeners.
   */
  destroy() {
    throw new Error('IChatTransport.destroy() must be implemented by subclass')
  }
}
