import { sanitizeChatMessage } from './chatTypes'

/**
 * Host-side chat relay rules.
 *
 * Chat is host-authoritative like everything else: a client's CHAT_MESSAGE is
 * intent, not fact. Who sent it is decided by which admitted seat the packet
 * arrived from -- never by the senderId / senderName / avatar the client wrote
 * into it, which is how anyone could previously post as anyone, host included.
 */

/** Generated ids are ~20 chars; anything much longer is not one of ours. */
export const MAX_CHAT_ID_LENGTH = 64

/**
 * Rebuild a client's CHAT_MESSAGE from the host's own seat record.
 *
 * Returns a new packet built only from whitelisted fields, or null when the
 * packet should be dropped: no admitted seat, wrong shape, a bad id, or no
 * text left after sanitizing. Does not mutate the input.
 *
 * @param {Object} packet - what arrived from the client
 * @param {{ id: number, name?: string, avatar?: string } | null} seat
 */
export function stampChatPacket(packet, seat) {
  if (!seat || !packet || packet.type !== 'CHAT_MESSAGE') return null

  const msg = packet.payload
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return null

  const { id } = msg
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_CHAT_ID_LENGTH) return null

  const text = sanitizeChatMessage(msg.text)
  if (!text) return null

  return {
    type: 'CHAT_MESSAGE',
    payload: {
      id,
      type: 'TEXT',
      senderId: seat.id,
      senderName: seat.name || 'Player',
      avatar: seat.avatar || '👤',
      text,
      timestamp: Date.now(),
    },
  }
}

/** Strip fields that only mean something on this device before a message is sent. */
export function toWireMessage(msg) {
  // eslint-disable-next-line no-unused-vars
  const { isOwn, ...wire } = msg
  return wire
}
