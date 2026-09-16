import React, { useEffect, useRef } from 'react'
import { MAX_DICE } from '../../constants/diceConstants'
import { Badge, Dot } from '../../../../components/ui/PlayerRow'
import { cx } from '../../../../components/ui/tokens'

/**
 * Everyone at the table, and how many dice each still has.
 *
 * Whose turn it is is said with light, as on the UNO board: the active seat is
 * raised and under the lamp (.seat-spot), everyone else is in shadow. Two
 * states, never three. The dice are pips so a glance counts them.
 */
function Seat({ seat, isActive, isMine }) {
  return (
    <div
      aria-current={isActive ? 'true' : undefined}
      className={cx(
        'relative w-[74px] shrink-0 px-1.5 py-2 rounded-object border flex flex-col items-center gap-1.5',
        'transition-colors duration-200',
        isActive ? 'bg-felt border-turn/60 shadow-lift-2' : 'bg-transparent border-transparent'
      )}
    >
      {isActive && <span className="seat-spot" aria-hidden="true" />}

      <span
        className={cx(
          'relative w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0',
          isActive ? 'bg-felt-high shadow-lift-1' : 'bg-well shadow-sink'
        )}
      >
        {seat.avatar || '👤'}
        {!seat.connected && (
          <Dot tone="danger" className="absolute -bottom-0.5 -right-0.5 ring-2 ring-table" />
        )}
      </span>

      <span
        className={cx(
          'relative block w-full text-center text-nano font-bold truncate',
          isActive ? 'text-ink' : 'text-ink-faint'
        )}
      >
        {isMine ? 'You' : seat.name}
      </span>

      {seat.out ? (
        <Badge className="relative">Out</Badge>
      ) : (
        <span className="relative flex items-center gap-0.5" aria-label={`${seat.diceCount} dice`}>
          {Array.from({ length: MAX_DICE }, (_, i) => (
            <span
              key={i}
              className={cx(
                'w-1.5 h-1.5 rounded-full',
                i < seat.diceCount ? (isActive ? 'bg-ink' : 'bg-ink-muted') : 'bg-well shadow-sink'
              )}
            />
          ))}
        </span>
      )}

      {!seat.connected && <span className="sr-only">disconnected</span>}
    </div>
  )
}

const MemoSeat = React.memo(Seat)

function DiceSeats({ seats, turnSeat, yourId }) {
  const railRef = useRef(null)
  const activeRef = useRef(null)

  // Keep the lit seat in view by scrolling the rail -- never the page.
  useEffect(() => {
    const rail = railRef.current
    const node = activeRef.current
    if (!rail || !node || rail.scrollWidth <= rail.clientWidth) return
    rail.scrollTo({
      left: node.offsetLeft - (rail.clientWidth - node.offsetWidth) / 2,
      behavior: 'smooth',
    })
    // turnSeat is the trigger, not a value read: scroll whenever the turn moves.
    // eslint-disable-next-line react/exhaustive-effect-dependencies
  }, [turnSeat])

  return (
    <div ref={railRef} className="w-full overflow-x-auto scrollbar-none">
      <div className="flex items-stretch justify-center gap-1 min-w-max mx-auto px-1">
        {seats.map((seat) => (
          <div key={seat.id} ref={seat.id === turnSeat ? activeRef : null} className="flex">
            <MemoSeat seat={seat} isActive={seat.id === turnSeat} isMine={seat.id === yourId} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default React.memo(DiceSeats)
