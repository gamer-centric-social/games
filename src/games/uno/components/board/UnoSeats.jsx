import React, { useEffect, useRef } from 'react'
import { ArrowRight, ArrowLeft, Hand } from 'lucide-react'
import { getRankBadge } from '../../constants/unoConstants'
import { isFinishedPlayer } from '../../utils/turnOrder'
import { FOCUS, cx } from '../../../../components/ui/tokens'

/**
 * Everyone at the table.
 *
 * The Table language, applied literally: whose turn it is is shown by who is
 * under the light. The active seat is raised and lit; everyone else is an
 * unlit object. That one idea replaces a TURN badge, a NEXT badge, a scale,
 * two rings, a shadow and a pinging dot -- and it means the answer to "whose
 * go is it" is legible from the corner of your eye.
 *
 * Direction is carried by the arrows between the seats rather than by a pill
 * announcing "Clockwise", so the structure says it instead of the copy.
 *
 * There used to be three states -- lit, next, unlit -- which on a phone is
 * three slightly different 74px chips, and the third tone was what made the
 * first two hard to tell apart. Two states now: under the light, or in shadow.
 * Who is next is already carried by the arrows.
 */

function Seat({ player, isActive, isMine, count, finished, calledUno, skipped, onCatch }) {
  const rank = finished ? getRankBadge(player.rank) : null
  const catchable = Boolean(onCatch)

  const body = (
    <>
      <span
        className={cx(
          'w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 relative',
          isActive ? 'bg-felt-high shadow-lift-1' : 'bg-well shadow-sink opacity-45',
          finished && 'opacity-60'
        )}
      >
        {finished ? rank.medal : player.avatar || '👤'}
        {skipped && (
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-danger text-table text-nano font-bold flex items-center justify-center">
            ×
          </span>
        )}
      </span>

      <span className="block min-w-0 w-full text-center">
        <span
          className={cx(
            'block text-nano font-bold truncate',
            isActive ? 'text-ink' : 'text-ink-faint'
          )}
        >
          {isMine ? 'You' : player.name}
        </span>
        <span
          className={cx(
            'block font-mono leading-none pt-0.5',
            finished ? 'text-micro text-ink-faint' : 'text-mini',
            !finished && (calledUno ? 'text-uno' : isActive ? 'text-ink' : 'text-ink-faint')
          )}
        >
          {finished ? rank.shortLabel : count}
        </span>
      </span>
    </>
  )

  const shell = cx(
    'relative w-[74px] shrink-0 px-1.5 py-2 rounded-object border flex flex-col items-center gap-1.5',
    'transition-colors duration-200',
    isActive ? 'bg-felt border-turn/60 shadow-lift-2' : 'bg-transparent border-transparent'
  )

  // The lamp, falling on whoever is up. Behind the seat's own content, so the
  // avatar and the count stay crisp on top of it.
  const spot = isActive ? <span className="uno-seat-spot" aria-hidden="true" /> : null

  // Catching is an action, so it gets a control. It used to be an undocumented
  // tap on any avatar, validated only after the fact -- so the only way to
  // find it was to tap someone and read the rejection.
  if (catchable) {
    return (
      <button type="button" onClick={onCatch} className={cx(shell, 'cursor-pointer', FOCUS)}>
        {spot}
        {body}
        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-uno text-table text-nano font-bold uppercase">
          <Hand className="w-2.5 h-2.5" />
          Catch
        </span>
      </button>
    )
  }

  return (
    <div className={shell}>
      {spot}
      {body}
      {calledUno && !finished && (
        <span className="px-1.5 py-0.5 rounded-full bg-uno/15 border border-uno/40 text-uno text-nano font-bold uppercase">
          Uno
        </span>
      )}
    </div>
  )
}

const MemoSeat = React.memo(Seat)

function UnoSeats({
  players,
  currentPlayerIndex,
  direction,
  myPlayer,
  handCards,
  rankings,
  unoCalledPlayers,
  skippedInfo,
  onCatchUno,
}) {
  const Arrow = direction === 1 ? ArrowRight : ArrowLeft
  const railRef = useRef(null)
  const activeRef = useRef(null)

  // Keep the lit seat in view, by scrolling the rail -- never the page.
  // scrollIntoView({ inline: 'center' }) walks up to whatever ancestor can
  // scroll, so once the rail stopped overflowing it started dragging the whole
  // document sideways instead.
  useEffect(() => {
    const rail = railRef.current
    const node = activeRef.current
    if (!rail || !node || rail.scrollWidth <= rail.clientWidth) return
    rail.scrollTo({
      left: node.offsetLeft - (rail.clientWidth - node.offsetWidth) / 2,
      behavior: 'smooth',
    })
  }, [currentPlayerIndex])

  return (
    <div ref={railRef} className="w-full overflow-x-auto scrollbar-none">
      <div className="flex items-stretch justify-center gap-0.5 min-w-max mx-auto px-1">
        {players.map((p, index) => {
          const isMine = p.id === myPlayer?.id
          const finished = isFinishedPlayer(p, rankings)
          const count = isMine ? handCards.length : p.cardCount ?? p.hand?.length ?? 0
          const calledUno = unoCalledPlayers?.has?.(p.id)
          const isActive = index === currentPlayerIndex

          return (
            <React.Fragment key={p.id}>
              <div ref={isActive ? activeRef : null} className="flex">
                <MemoSeat
                  player={p}
                  isActive={isActive}
                  isMine={isMine}
                  count={count}
                  finished={finished}
                  calledUno={calledUno}
                  skipped={skippedInfo?.playerId === p.id}
                  onCatch={
                    !isMine && !finished && count === 1 && !calledUno && onCatchUno
                      ? () => onCatchUno(p.id)
                      : null
                  }
                />
              </div>
              {index < players.length - 1 && (
                <span className="flex items-center text-ink-faint shrink-0">
                  <Arrow className="w-3 h-3" />
                </span>
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

export default React.memo(UnoSeats)
