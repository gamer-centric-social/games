import React from 'react'
import { MessageSquare } from 'lucide-react'
import IconButton from '../ui/IconButton'
import ChatUnreadBadge from './ChatUnreadBadge'
import { cx } from '../ui/tokens'

/**
 * Trigger button to toggle the in-game chat modal.
 * Shows an unread notification dot / count badge when messages arrive while closed.
 */
export default function ChatTriggerButton({
  unreadCount = 0,
  onClick,
  size = 'sm',
  className = '',
}) {
  const label = unreadCount > 0 ? `Open chat (${unreadCount} unread)` : 'Open chat'

  return (
    <div className={cx('relative inline-flex items-center', className)}>
      <IconButton size={size} label={label} onClick={onClick}>
        <MessageSquare className="w-3.5 h-3.5" />
      </IconButton>

      <ChatUnreadBadge
        count={unreadCount}
        className="absolute -top-1 -right-1 shadow-lift-1 pointer-events-none animate-scaleUp"
      />
    </div>
  )
}
