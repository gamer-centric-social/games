import React from 'react'
import DiceTopBar from './DiceTopBar'
import DiceSeats from './DiceSeats'
import BidDisplay from './BidDisplay'
import DiceStatusLine from './DiceStatusLine'
import DiceCup from './DiceCup'
import BidPicker from './BidPicker'
import RevealPanel from './RevealPanel'

/**
 * The table, top to bottom: where you are, who is at it, the bid (or the
 * reveal), one line of what is happening, your cup, and -- on your turn -- the
 * picker. Composition only; every piece renders from the same view.
 */
export default function DiceBoard({
  view,
  notice,
  isOnline = false,
  isHost = true,
  roomCode,
  connectionStatus,
  onIntent,
  onLeave,
  onOpenChat,
  unreadChatCount = 0,
}) {
  const inReveal = view.phase === 'reveal' && view.reveal
  const myTurn = view.phase === 'bidding' && view.turnSeat === view.yourId

  return (
    <div className="relative z-10 w-full max-w-md mx-auto px-4 pt-1 pb-4 flex-1 min-h-0 flex flex-col select-none">
      <DiceTopBar
        isOnline={isOnline}
        isHost={isHost}
        roomCode={roomCode}
        connectionStatus={connectionStatus}
        onOpenChat={onOpenChat}
        unreadChatCount={unreadChatCount}
        onLeave={onLeave}
      />

      <DiceSeats seats={view.seats} turnSeat={view.turnSeat} yourId={view.yourId} />

      <div className="flex-1 min-h-0 flex flex-col justify-center py-3 overflow-y-auto scrollbar-none">
        {inReveal ? <RevealPanel key={view.round} view={view} /> : <BidDisplay view={view} />}
      </div>

      <DiceStatusLine view={view} notice={notice} />

      {!inReveal && (
        <div className="space-y-3">
          <DiceCup dice={view.yourDice} bid={view.currentBid} palifico={view.palifico} />
          {myTurn && (
            <BidPicker
              key={`${view.round}-${view.bidHistory.length}`}
              view={view}
              onIntent={onIntent}
            />
          )}
        </div>
      )}
    </div>
  )
}
