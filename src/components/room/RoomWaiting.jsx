import React from 'react'
import { Users, Check, Play, Share2, Crown, MessageSquare } from 'lucide-react'
import { playClickSound } from '../../utils/sound'
import useCopyFeedback from '../../hooks/useCopyFeedback'
import { buildRoomLink } from '../../services/peerConfig'
import Screen, { ScreenHeader } from '../ui/Screen'
import Surface from '../ui/Surface'
import Button from '../ui/Button'
import Label from '../ui/Label'
import Pill from '../ui/Pill'
import PlayerRow, { Badge, Dot } from '../ui/PlayerRow'
import ChatUnreadBadge from '../chat/ChatUnreadBadge'
import { TONE_TEXT, cx } from '../ui/tokens'

/**
 * The waiting room, once connected and before the host starts.
 * Generalized from UNO's UnoRoomWaiting (which UNO still uses until it migrates).
 */
export default function RoomWaiting({
  tone,
  gameId,
  roomCode,
  isHost,
  yourId,
  seats = [],
  maxPlayers,
  minPlayers = 2,
  startLabel,
  waitingLabel,
  onStart,
  onLeave,
  onOpenChat,
  unreadChatCount = 0,
}) {
  const canStart = isHost && seats.length >= minPlayers
  const emptySlots = Math.max(0, maxPlayers - seats.length)
  const { copied, copy: copyCode } = useCopyFeedback()
  const { copied: copiedLink, copy: copyLink } = useCopyFeedback()

  return (
    <Screen>
      <ScreenHeader
        eyebrow={<Pill tone={tone}>Room open</Pill>}
        title="Waiting for players"
        subtitle="Read out the code, or send the link."
        className="pb-5"
      />

      {/* The code is the thing you say out loud, so it is the largest thing here. */}
      <Surface level={2} className="p-5 text-center space-y-4">
        <div className="space-y-1">
          <Label>Room code</Label>
          <div
            className={cx(
              'font-mono text-5xl font-medium tracking-[0.2em] indent-[0.2em] select-all',
              TONE_TEXT[tone]
            )}
          >
            {roomCode}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => copyCode(roomCode)}>
            {copied ? <Check className="w-3.5 h-3.5 text-ok" /> : null}
            {copied ? 'Code copied' : 'Copy code'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => roomCode && copyLink(buildRoomLink(gameId, roomCode))}
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-ok" /> : <Share2 className="w-3.5 h-3.5" />}
            {copiedLink ? 'Link copied' : 'Copy join link'}
          </Button>
          {onOpenChat && (
            <Button variant="secondary" size="sm" onClick={onOpenChat}>
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
              <ChatUnreadBadge count={unreadChatCount} className="ml-1" />
            </Button>
          )}
        </div>
      </Surface>

      <div className="space-y-2.5 my-4">
        <div className="flex items-center justify-between px-0.5">
          <Label className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            In the room · {seats.length}/{maxPlayers}
          </Label>
          {seats.length < minPlayers && <span className="text-nano text-turn">Two to start</span>}
        </div>

        <div className="space-y-2 max-h-56 sm:max-h-64 overflow-y-auto pr-1">
          {seats.map((seat) => (
            <PlayerRow
              key={seat.id}
              avatar={seat.avatar || '😎'}
              name={seat.name}
              badges={
                <>
                  {seat.isHost && <Crown className="w-3.5 h-3.5 text-turn" aria-label="Host" />}
                  {seat.id === yourId && <Badge>You</Badge>}
                </>
              }
              trailing={
                <span className="flex items-center gap-1.5 text-nano font-semibold text-ok">
                  <Dot tone="ok" className="w-1.5 h-1.5" />
                  Ready
                </span>
              }
            />
          ))}
          {emptySlots > 0 && (
            <div className="border border-dashed border-edge rounded-object p-3 flex items-center justify-center gap-2 text-mini text-ink-faint">
              <Users className="w-3.5 h-3.5" />
              <span>{emptySlots === 1 ? 'Room for one more' : `Room for ${emptySlots} more`}</span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2 pt-1">
        {isHost ? (
          <Button
            tone={tone}
            fullWidth
            disabled={!canStart}
            onClick={() => {
              playClickSound()
              onStart()
            }}
          >
            <Play className="w-4 h-4 fill-current" />
            {canStart ? startLabel : 'Waiting for one more player'}
          </Button>
        ) : (
          <div className="w-full py-3.5 px-4 rounded-object bg-well border border-edge shadow-sink text-center text-mini text-ink-muted flex items-center justify-center gap-2">
            <Dot tone="turn" className="w-2 h-2" />
            {waitingLabel}
          </div>
        )}
        <Button
          variant="ghost"
          size="md"
          fullWidth
          onClick={() => {
            playClickSound()
            onLeave()
          }}
        >
          Leave this room
        </Button>
      </div>
    </Screen>
  )
}
