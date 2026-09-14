import React from 'react'
import { Settings, RefreshCw, Bot } from 'lucide-react'
import IconButton from '../../../../components/ui/IconButton'
import ChatTriggerButton from '../../../../components/chat/ChatTriggerButton'
import { Dot } from '../../../../components/ui/PlayerRow'
import { cx } from '../../../../components/ui/tokens'

const CONNECTION_TONE = {
  connected: 'ok',
  reconnecting: 'turn',
  disconnected: 'danger',
}

/**
 * Where you are, and the way out.
 *
 * The turn-direction pill that used to sit in the middle is gone, along with
 * the icon inside it that span for the entire match. Direction is a property
 * of the seating, so the arrows between the seats carry it.
 */
function UnoTopBar({
  isMultiplayer,
  isHost,
  roomCode,
  connectionStatus,
  onSyncState,
  isSyncing,
  onSync,
  onOpenMenu,
  onOpenChat,
  unreadChatCount = 0,
}) {
  return (
    <div className="relative z-10 flex items-center justify-between gap-2 pb-2">
      {isMultiplayer ? (
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
        {isMultiplayer && onOpenChat && (
          <ChatTriggerButton
            unreadCount={unreadChatCount}
            onClick={onOpenChat}
            size="sm"
          />
        )}
        {isMultiplayer && onSyncState && (
          <IconButton size="sm" label="Ask the host for the current state" onClick={onSync}>
            <RefreshCw className={cx('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
          </IconButton>
        )}
        <IconButton size="sm" label="Game menu" onClick={onOpenMenu}>
          <Settings className="w-3.5 h-3.5" />
        </IconButton>
      </span>
    </div>
  )
}

export default React.memo(UnoTopBar)
