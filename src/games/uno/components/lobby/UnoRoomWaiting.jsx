import React from 'react'
import { Users, Check, Play, Share2, Crown, MessageSquare } from 'lucide-react'
import { playClickSound } from '../../../../utils/sound'
import useCopyFeedback from '../../../../hooks/useCopyFeedback'
import { buildRoomLink } from '../../../../services/peerConfig'
import Screen, { ScreenHeader } from '../../../../components/ui/Screen'
import Surface from '../../../../components/ui/Surface'
import Button from '../../../../components/ui/Button'
import Label from '../../../../components/ui/Label'
import Pill from '../../../../components/ui/Pill'
import PlayerRow, { Badge, Dot } from '../../../../components/ui/PlayerRow'
import ChatUnreadBadge from '../../../../components/chat/ChatUnreadBadge'

/** The waiting room, once you are connected and before the host deals. */
export default function UnoRoomWaiting({
  roomState,
  connectionStatus = 'connected',
  onStartGame,
  onLeaveRoom,
  onOpenChat,
  unreadChatCount = 0,
}) {
  const isHost = roomState.isHost
  const players = roomState.players || []
  const maxCap = roomState.maxPlayers || 4
  const connectedCount = players.filter((p) => p.connected !== false).length
  const canStart = isHost && connectedCount >= 2
  const stacking = roomState.stackingEnabled !== false

  const { copied, copy: copyCode } = useCopyFeedback()
  const { copied: copiedLink, copy: copyLink } = useCopyFeedback()

  const handleCopyCode = () => copyCode(roomState?.roomCode)
  const handleCopyLink = () => {
    if (!roomState?.roomCode) return
    copyLink(buildRoomLink('uno', roomState.roomCode))
  }

  const emptySlots = Math.max(0, maxCap - players.length)

  return (
    <Screen>
      <ScreenHeader
        eyebrow={<Pill tone="uno">Room open</Pill>}
        title="Waiting for players"
        subtitle="Read out the code, or send the link."
        className="pb-5"
      />

      {connectionStatus === 'reconnecting' && (
        <div className="mb-3 w-full py-2.5 px-3.5 rounded-object bg-well border border-edge shadow-sink text-center text-mini text-turn flex items-center justify-center gap-2">
          <Dot tone="turn" className="w-2 h-2 animate-pulse" />
          Connection interrupted. Reconnecting to host…
        </div>
      )}

      {/* The code is the thing you say out loud, so it is the largest thing here. */}
      <Surface level={2} className="p-5 text-center space-y-4">
        <div className="space-y-1">
          <Label>Room code</Label>
          <div className="font-mono text-5xl font-medium tracking-[0.2em] indent-[0.2em] text-uno select-all">
            {roomState.roomCode}
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleCopyCode}>
            {copied ? <Check className="w-3.5 h-3.5 text-ok" /> : null}
            {copied ? 'Code copied' : 'Copy code'}
          </Button>

          <Button variant="secondary" size="sm" onClick={handleCopyLink}>
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-ok" />
            ) : (
              <Share2 className="w-3.5 h-3.5" />
            )}
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

        <div className="flex justify-center">
          <Pill tone={stacking ? 'uno' : 'neutral'}>
            <span aria-hidden="true">{stacking ? '🔥' : '🚫'}</span>
            {stacking ? 'Stacking on' : 'Stacking off'}
          </Pill>
        </div>
      </Surface>

      <div className="space-y-2.5 my-4">
        <div className="flex items-center justify-between px-0.5">
          <Label className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            In the room · {players.length}/{maxCap}
          </Label>
          {players.length < 2 && <span className="text-nano text-turn">Two to start</span>}
        </div>

        <div className="space-y-2 max-h-56 sm:max-h-64 overflow-y-auto pr-1">
          {players.map((p, idx) => (
            <PlayerRow
              key={p.id || idx}
              avatar={p.avatar || '😎'}
              name={p.name}
              badges={
                <>
                  {p.isHost && <Crown className="w-3.5 h-3.5 text-turn" aria-label="Host" />}
                  {p.isYou && <Badge>You</Badge>}
                </>
              }
              trailing={
                p.connected === false ? (
                  <span className="flex items-center gap-1.5 text-nano font-semibold text-turn">
                    <Dot tone="turn" className="w-1.5 h-1.5 animate-pulse" />
                    Reconnecting
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-nano font-semibold text-ok">
                    <Dot tone="ok" className="w-1.5 h-1.5" />
                    Ready
                  </span>
                )
              }
            />
          ))}

          {emptySlots > 0 && (
            <div className="border border-dashed border-edge rounded-object p-3 flex items-center justify-center gap-2 text-mini text-ink-faint">
              <Users className="w-3.5 h-3.5" />
              <span>
                {emptySlots === 1 ? 'Room for one more' : `Room for ${emptySlots} more`}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2 pt-1">
        {isHost ? (
          <Button
            tone="uno"
            fullWidth
            disabled={!canStart}
            onClick={() => {
              playClickSound()
              onStartGame()
            }}
          >
            <Play className="w-4 h-4 fill-current" />
            {canStart
              ? 'Deal the cards'
              : connectedCount < 2
                ? 'Waiting for one more player'
                : 'Waiting for players to reconnect'}
          </Button>
        ) : (
          <div className="w-full py-3.5 px-4 rounded-object bg-well border border-edge shadow-sink text-center text-mini text-ink-muted flex items-center justify-center gap-2">
            <Dot tone="turn" className="w-2 h-2 animate-pulse" />
            Waiting for the host to deal…
          </div>
        )}

        <Button
          variant="ghost"
          size="md"
          fullWidth
          onClick={() => {
            playClickSound()
            onLeaveRoom()
          }}
        >
          Leave this room
        </Button>
      </div>
    </Screen>
  )
}
