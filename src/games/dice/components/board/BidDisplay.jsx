import React from 'react'
import Die from '../Die'
import { bidWords, nameOf, ruleLine } from '../../utils/narration'

/**
 * The bid on the table: the largest thing on the board, because it is the one
 * thing everyone is thinking about. The live rule is always written under it,
 * so wild 1s and palifico are never said only by the dice.
 */
function BidDisplay({ view }) {
  const bid = view.currentBid
  const earlier = view.bidHistory.slice(-3, -1)

  return (
    <div className="relative z-10 text-center space-y-1.5 py-2">
      {bid ? (
        <>
          <div className="flex items-center justify-center gap-3">
            <span className="font-mono text-5xl text-ink leading-none">{bid.quantity}</span>
            <span className="font-mono text-2xl text-ink-faint leading-none" aria-hidden="true">
              ×
            </span>
            <Die face={bid.face} size="lg" />
          </div>
          <p className="text-mini text-ink-muted">
            {nameOf(view, bid.seatId)} bid {bidWords(bid)}
          </p>
        </>
      ) : (
        <p className="font-display text-2xl text-ink-muted leading-none py-3">No bid yet</p>
      )}

      {earlier.length > 0 && (
        <p className="font-mono text-nano text-ink-faint">
          {earlier.map((b) => `${b.quantity}×${b.face}`).join('  ·  ')}
        </p>
      )}

      <p className="text-nano text-ink-faint">{ruleLine(view)}</p>
    </div>
  )
}

export default React.memo(BidDisplay)
