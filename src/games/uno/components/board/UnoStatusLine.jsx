import React from 'react'
import { Flame, Ban, Hand } from 'lucide-react'
import { cx } from '../../../../components/ui/tokens'

/**
 * One line, under the table, for what is happening right now.
 *
 * This replaces four separate widgets -- a skip alert, a stack banner, an
 * action toast and a turn prompt -- that each mounted and unmounted on their
 * own, so the board visibly jumped as they came and went, and up to three of
 * them narrated the same moment in three different voices.
 *
 * The height is fixed for the same reason: an empty line holds its space
 * rather than shoving the piles around.
 *
 * Note what is deliberately *not* in the ladder: "your turn". Your seat is lit
 * and your playable cards have lifted out of your hand -- the screen has said
 * it twice already, and saying it a third time in a pulsing banner was the
 * loudest thing on the old board.
 *
 * Every one of those signals is light and geometry, though, so none of them
 * reaches a screen reader. That is what the live region is for: the turn is
 * announced, and nothing is drawn.
 */
function UnoStatusLine({
  isSpectating,
  isCurrentTurnForMe,
  isMyTurnSkipped,
  isWaitingForBot,
  activePlayer,
  activePlayers,
  skippedInfo,
  myCanPlayAnyCard,
  myCanStack,
  pendingDrawCount,
  pendingStackType,
  actionMessage,
}) {
  const owed = pendingDrawCount > 0
  const counter = pendingStackType === 'draw2' ? '+2' : '+4'
  const them = activePlayer?.name

  let tone = 'quiet'
  let icon = null
  let text = null

  if (owed) {
    // The only thing that can happen next, so it outranks everything.
    tone = myCanStack && isCurrentTurnForMe ? 'warn' : 'bad'
    icon = <Flame className="w-3.5 h-3.5 shrink-0" />
    text =
      isCurrentTurnForMe && myCanStack
        ? `+${pendingDrawCount} coming. Play a ${counter} to pass it on, or take them.`
        : isCurrentTurnForMe
        ? `+${pendingDrawCount} coming. Nothing to counter with — take them from the draw pile.`
        : `+${pendingDrawCount} is on ${them}.`
  } else if (isMyTurnSkipped) {
    tone = 'bad'
    icon = <Ban className="w-3.5 h-3.5 shrink-0" />
    text = `You were skipped. ${them} is up.`
  } else if (isCurrentTurnForMe && !myCanPlayAnyCard) {
    tone = 'warn'
    icon = <Hand className="w-3.5 h-3.5 shrink-0" />
    text = 'Nothing to play. Take a card from the draw pile.'
  } else if (isSpectating) {
    text = `${them} is playing. ${activePlayers.length} still in.`
  } else if (skippedInfo && !isCurrentTurnForMe) {
    text = `${skippedInfo.playerName} was skipped. ${them} is up.`
  } else if (isWaitingForBot) {
    text = `${them} is thinking…`
  } else if (!isCurrentTurnForMe && them) {
    text = `${them}'s turn.`
  } else if (actionMessage) {
    text = actionMessage
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative z-10 h-9 flex items-center justify-center px-4"
    >
      <span className="sr-only">
        {isSpectating
          ? `${them} is playing.`
          : isCurrentTurnForMe
          ? 'Your turn.'
          : them
          ? `${them}'s turn.`
          : ''}
      </span>
      {text && (
        <p
          className={cx(
            'flex items-center gap-1.5 text-center text-mini leading-tight',
            tone === 'bad' && 'text-danger font-bold',
            tone === 'warn' && 'text-turn font-bold',
            tone === 'quiet' && 'text-ink-muted'
          )}
        >
          {icon}
          {text}
        </p>
      )}
    </div>
  )
}

export default React.memo(UnoStatusLine)
