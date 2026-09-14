import React from 'react'
import { MessageSquare } from 'lucide-react'
import IconButton from '../ui/IconButton'
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

      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-turn text-ink-bright text-nano font-mono font-bold shadow-lift-1 pointer-events-none animate-scaleUp"
          aria-label={`${unreadCount} unread messages`}
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </div>
  )
}
