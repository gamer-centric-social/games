import React from 'react'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import { COLOR_CONFIG, COURSE_HEIGHT } from '../constants/bounceConstants'
import BounceGlyph from './BounceGlyph'
import IconButton from '../../../components/ui/IconButton'
import Label from '../../../components/ui/Label'
import ChatUnreadBadge from '../../../components/chat/ChatUnreadBadge'
import { cx } from '../../../components/ui/tokens'
import { formatMs, formatSeconds } from '../utils/formatTime'

/**
 * What the canvas cannot say.
 *
 * The colour you are holding is named in words as well as drawn, and every change
 * to it goes through an aria-live region -- an ambient colour and a shape reach
 * everyone except a screen reader, which is what this is for. The same reasoning
 * as UNO's status line, for a harsher rule: here a misread costs the race.
 */

export default function BounceHud({
  hud,
  seats = [],
  yourId = 0,
  bestMs = null,
  onLeave,
  onOpenChat,
  unreadChatCount = 0,
}) {
  const color = hud?.color ?? 'blue'
  const config = COLOR_CONFIG[color]
  const climbed = Math.round(Math.max(0, hud?.maxY ?? 0))
  const percent = Math.min(100, Math.round((climbed / COURSE_HEIGHT) * 100))

  return (
    <div className="shrink-0 space-y-2 px-3 pt-2">
      <div className="flex items-center gap-2">
        <IconButton label="Leave the climb" size="sm" onClick={onLeave}>
          <ArrowLeft className="w-4 h-4" />
        </IconButton>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-object bg-felt border border-edge shadow-lift-1">
          <BounceGlyph color={color} size={16} />
          <span className="font-display text-sm leading-none text-ink">{config.name}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="text-right">
            <Label>Climbed</Label>
            <p className="font-mono text-sm leading-none text-ink tabular-nums">{percent}%</p>
          </div>
          <div className="text-right">
            <Label>Time</Label>
            <p className="font-mono text-sm leading-none text-ink tabular-nums">
              {formatSeconds(hud?.finishT ?? hud?.t ?? 0)}
            </p>
          </div>
          {onOpenChat && (
            <div className="relative">
              <IconButton label="Open chat" size="sm" onClick={onOpenChat}>
                <MessageCircle className="w-4 h-4" />
              </IconButton>
              <ChatUnreadBadge count={unreadChatCount} />
            </div>
          )}
        </div>
      </div>

      <BounceRail seats={seats} yourId={yourId} localProgress={hud?.maxY ?? 0} bestMs={bestMs} />

      {/* The only channel that reaches a screen reader. */}
      <p aria-live="polite" className="sr-only">
        {`Holding ${config.name}. Checkpoint ${hud?.checkpointIndex ?? 0}. ${percent} percent climbed.`}
      </p>
    </div>
  )
}

/** Everyone's height on one bar: who is ahead, without looking away from your ball. */
function BounceRail({ seats, yourId, localProgress, bestMs }) {
  const runners = seats.length > 0 ? seats : [{ id: yourId, avatar: '🔵', name: 'You', progress: localProgress }]

  return (
    <div className="relative h-7 rounded-well bg-well shadow-sink overflow-hidden">
      <div className="absolute inset-y-0 right-0 w-px bg-lamp/40" />
      {runners.map((seat) => {
        const isYou = seat.id === yourId
        const progress = isYou ? Math.max(seat.progress ?? 0, localProgress) : seat.progress ?? 0
        const percent = Math.min(100, (progress / COURSE_HEIGHT) * 100)
        return (
          <div
            key={seat.id}
            title={`${seat.name}${seat.finished ? ` — finished ${formatMs(seat.finishMs)}` : ''}`}
            className={cx(
              'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-mini leading-none transition-[left] duration-200',
              isYou ? 'z-10' : 'opacity-70'
            )}
            style={{ left: `${Math.max(3, Math.min(97, percent))}%` }}
          >
            <span className={cx(isYou && 'drop-shadow-[0_0_6px_rgba(195,232,79,0.8)]')}>{seat.avatar}</span>
          </div>
        )
      })}
      {bestMs != null && seats.length === 0 && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-nano text-ink-faint">
          best {formatMs(bestMs)}
        </span>
      )}
    </div>
  )
}
