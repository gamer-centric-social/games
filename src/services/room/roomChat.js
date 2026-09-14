import { stampChatPacket, toWireMessage } from '../chat/chatRelay'

/**
 * The room chat relay, written once for every networked game.
 *
 * UNO wires these steps by hand in UnoGame.jsx; a game on the shared room
 * layer gets them by calling these three functions from its data handlers.
 */

/**
 * Host: handle a client's chat packet. Returns true when `data` was chat --
 * accepted or dropped -- so the caller stops dispatching it.
 */
export function relayClientChat({ data, seat, chatService, broadcast }) {
  if (data?.type !== 'CHAT_MESSAGE') return false
  const stamped = stampChatPacket(data, seat)
  if (stamped && chatService.handleNetworkPacket(stamped)) {
    broadcast(stamped)
  }
  return true
}

/** Host: give a newly admitted player the recent history. */
export function sendChatHistory({ chatService, send }) {
  const history = chatService.getHistory()
  if (history.length === 0) return
  send({ type: 'SYNC_CHAT', payload: history.map(toWireMessage) })
}

/** Client: route chat packets from the host into the transport. */
export function routeClientChat({ data, chatTransport }) {
  if (data?.type !== 'CHAT_MESSAGE' && data?.type !== 'SYNC_CHAT') return false
  chatTransport.handleIncoming(data)
  return true
}
