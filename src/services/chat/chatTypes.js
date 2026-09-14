/**
 * Chat Types & Domain Models
 *
 * Generic and reusable across all games in Party Arcade.
 */

export const MAX_CHAT_MESSAGE_LENGTH = 150
export const MAX_CHAT_HISTORY = 50

/**
 * Generate a unique message ID.
 */
export function generateMessageId() {
  return 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7)
}

/**
 * Sanitize and validate incoming message text.
 * Trims whitespace and enforces maximum length.
 */
export function sanitizeChatMessage(text) {
  if (typeof text !== 'string') return ''
  return text.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH)
}

/**
 * Factory for chat message envelopes.
 */
export function createChatMessage({ senderId, senderName, avatar = '👤', text }) {
  const cleanText = sanitizeChatMessage(text)
  if (!cleanText) return null

  return {
    id: generateMessageId(),
    type: 'TEXT',
    senderId,
    senderName: senderName || 'Player',
    avatar,
    text: cleanText,
    timestamp: Date.now(),
  }
}
