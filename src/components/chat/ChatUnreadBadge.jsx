import React from 'react'
import { cx } from '../ui/tokens'

/**
 * The unread count on a chat control. One spelling for the icon trigger and the
 * lobby's labelled button -- the lobby used to hand-roll its own copy.
 *
 * Dark ink on the colour, the same as every TONE_FILL: the table is lit from above.
 */
export default function ChatUnreadBadge({ count = 0, className = '' }) {
  if (count <= 0) return null

  return (
    <span
      className={cx(
        'inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full',
        'bg-turn text-table text-nano font-mono font-bold',
        className
      )}
      aria-label={`${count} unread messages`}
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}
