import { useCallback, useEffect, useState } from 'react'
import { ChatService } from '../services/chat/ChatService'
import { PeerJsChatTransport } from '../services/chat/transports/PeerJsChatTransport'
import { useChat } from './useChat'

/**
 * Room chat for a game on the shared room layer: one service and transport per
 * mount, plus the modal / unread / toast state. The networking glue is
 * services/room/roomChat.js; this is only the React side.
 */
export default function useRoomChat({ me }) {
  const [chatTransport] = useState(() => new PeerJsChatTransport())
  const [chatService] = useState(() => new ChatService({ transport: chatTransport }))

  // Re-attach across StrictMode / HMR remounts, as UnoGame does.
  useEffect(() => {
    chatService.attachTransport(chatTransport)
  }, [chatService, chatTransport])

  const chat = useChat({
    chatService,
    currentUserId: me.id,
    currentUserName: me.name,
    currentUserAvatar: me.avatar,
  })
  const { closeChat } = chat

  /** Leaving a room: forget its history and stop sending to a dead peer. */
  const reset = useCallback(() => {
    chatService.clear()
    chatTransport.setSendFunction(null)
    closeChat()
  }, [chatService, chatTransport, closeChat])

  return { chatService, chatTransport, ...chat, reset }
}
