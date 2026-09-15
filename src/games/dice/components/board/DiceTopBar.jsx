import React from 'react'
import { Bot, LogOut } from 'lucide-react'
import IconButton from '../../../../components/ui/IconButton'
import ChatTriggerButton from '../../../../components/chat/ChatTriggerButton'
import { Dot } from '../../../../components/ui/PlayerRow'

const CONNECTION_TONE = {
  connected: 'ok',
  connecting: 'turn',
  disconnected: 'danger',
}

/** Where you are, the chat, and the way out. The rules live on the navbar's help button. */
function DiceTopBar({ isOnline, isHost, roomCode, connectionStatus, onOpenChat, unreadChatCount, onLeave }) {
  return (
    <div className="relative z-10 flex items-center justify-between gap-2 pb-2">
      {isOnline ? (
        <span className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-well shadow-sink">
          <Dot tone={isHost ? 'ok' : CONNECTION_TONE[connectionStatus] || 'danger'} />
          <span className="font-mono text-mini text-ink-muted tracking-[0.15em]">{roomCode}</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-well shadow-sink text-ink-faint">
          <Bot className="w-3 h-3" />
          <span className="text-nano font-bold uppercase">Solo</span>
        </span>
      )}

      <span className="flex items-center gap-1.5">
        {isOnline && onOpenChat && (
          <ChatTriggerButton unreadCount={unreadChatCount} onClick={onOpenChat} size="sm" />
        )}
        <IconButton size="sm" label="Leave the table" onClick={onLeave}>
          <LogOut className="w-3.5 h-3.5" />
        </IconButton>
      </span>
    </div>
  )
}

export default React.memo(DiceTopBar)
