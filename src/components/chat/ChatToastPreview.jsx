import React from 'react'
import { X } from 'lucide-react'
import { cx } from '../ui/tokens'

/**
 * 2-Second Floating Chat Toast Notification
 *
 * Appears briefly when a new message arrives from another player
 * while the chat modal is closed. Clicking it opens the full chat modal.
 */
export default function ChatToastPreview({ toast, onClick, onDismiss }) {
  if (!toast) return null

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onClick}
      className={cx(
        'fixed top-12 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-xs sm:max-w-sm',
        'flex items-center gap-2.5 p-2 px-3 rounded-slab',
        'bg-felt border border-edge shadow-lift-3 cursor-pointer',
        'animate-fadeIn transition active:scale-[0.98] select-none hover:border-edge-lit'
      )}
    >
      {/* Avatar */}
      <span className="w-7 h-7 rounded-full bg-well shadow-sink flex items-center justify-center text-sm shrink-0">
        {toast.avatar || '👤'}
      </span>

      {/* Message content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-display text-nano font-semibold text-ink-muted truncate">
            {toast.senderName}
          </span>
          <span className="text-nano text-ink-faint">just now</span>
        </div>
        <p className="text-mini text-ink truncate leading-tight mt-0.5">
          {toast.text}
        </p>
      </div>

      {/* Dismiss button */}
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          className="p-1 text-ink-faint hover:text-ink transition cursor-pointer"
          aria-label="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
