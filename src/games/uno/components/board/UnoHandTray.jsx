import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import UnoCard from '../UnoCard'
import {
  computeHandLayout,
  hiddenPlayable,
  CARD_HEIGHT,
  EDGE_PADDING,
} from '../../utils/handLayout'
import { FOCUS, cx } from '../../../../components/ui/tokens'

/** How far a playable card lifts clear of the shingle. */
const LIFT = 12
/** Headroom above the cards for that lift plus the New badge. */
const HEADROOM = 28

const NOTHING_HIDDEN = { left: 0, right: 0, leftTarget: null, rightTarget: null }

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/**
 * Your hand.
 *
 * An even shingle gives every card the same slot, which is fine at seven and
 * useless at twelve: each card becomes a 33px sliver, so the cards you are
 * choosing between are the ones you cannot read, and their tap targets are
 * below a thumb. So the slot is weighted by role instead -- handLayout.js owns
 * that arithmetic -- and the hand opens around whatever you can play. Every
 * tappable card is, by construction, a wide one.
 *
 * The redistribution is also the turn signal: your hand visibly opens the
 * moment your turn starts and closes again when it ends. Cards are placed with
 * a transform rather than a margin precisely so that motion stays on the
 * compositor instead of relaying out the whole row every frame.
 *
 * The rail deliberately does not scroll-snap: snapping re-runs itself every
 * time the layout changes, so the hand crept sideways under your thumb on its
 * own every time a card was played anywhere at the table.
 *
 * Past what the rail can hold the row scrolls, and a scrolling hand can hide a
 * card you can play -- so the edges carry a count of how many, and take you to
 * them. They appear only when something is genuinely hidden, which is why they
 * are not the scroll chevrons this board deleted a pass ago.
 */
function UnoHandTray({
  handTrayRef,
  displayedHandCards,
  isCurrentTurnForMe,
  playableIds,
  newlyDrawnCardIds,
  flyingCards,
  onPlayCard,
  onWheel,
  onStepChange,
}) {
  const measureRef = useRef(null)
  const [width, setWidth] = useState(0)
  const [hidden, setHidden] = useState(NOTHING_HIDDEN)

  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(
    () =>
      computeHandLayout({
        width,
        cards: displayedHandCards,
        playableIds,
        isMyTurn: isCurrentTurnForMe,
      }),
    [width, displayedHandCards, playableIds, isCurrentTurnForMe]
  )

  // The draw animation lands cards on these same slots.
  const reportedStep = useRef(null)
  useLayoutEffect(() => {
    if (onStepChange && reportedStep.current !== layout.flightSpacing) {
      reportedStep.current = layout.flightSpacing
      onStepChange(layout.flightSpacing)
    }
  }, [layout.flightSpacing, onStepChange])

  // What is off each edge. Derived from the known x values rather than from the
  // DOM, throttled to a frame, and written to state only when a count actually
  // changes -- so a swipe costs a handful of renders, not one per frame.
  useEffect(() => {
    const rail = handTrayRef.current
    if (!rail || !isCurrentTurnForMe || !layout.overflows) {
      setHidden((prev) => (prev === NOTHING_HIDDEN ? prev : NOTHING_HIDDEN))
      return
    }

    let frame = 0
    const update = () => {
      frame = 0
      const next = hiddenPlayable({
        positions: layout.positions,
        scrollLeft: rail.scrollLeft,
        viewportWidth: rail.clientWidth,
      })
      setHidden((prev) =>
        prev.left === next.left &&
        prev.right === next.right &&
        prev.leftTarget === next.leftTarget &&
        prev.rightTarget === next.rightTarget
          ? prev
          : next
      )
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    rail.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      rail.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [handTrayRef, isCurrentTurnForMe, layout])

  const scrollTo = useCallback(
    (x) => {
      const rail = handTrayRef.current
      if (!rail || x === null) return
      rail.scrollTo({
        left: Math.max(x - EDGE_PADDING, 0),
        // The reduced-motion override reaches CSS scroll-behavior, not an
        // explicit behavior argument, so it has to be asked directly.
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      })
    },
    [handTrayRef]
  )

  // You never open a turn looking at nothing you can do.
  const wasMyTurn = useRef(false)
  useEffect(() => {
    const rail = handTrayRef.current
    const entering = isCurrentTurnForMe && !wasMyTurn.current
    wasMyTurn.current = isCurrentTurnForMe
    if (!rail || !entering || !layout.overflows) return

    const playable = layout.positions.filter((p) => p.playable)
    if (playable.length === 0) return
    const off = hiddenPlayable({
      positions: layout.positions,
      scrollLeft: rail.scrollLeft,
      viewportWidth: rail.clientWidth,
    })
    if (off.left + off.right < playable.length) return
    scrollTo(playable[0].x)
  }, [handTrayRef, isCurrentTurnForMe, layout, scrollTo])

  const byId = useMemo(() => {
    const map = new Map()
    for (const position of layout.positions) map.set(position.id, position)
    return map
  }, [layout])

  return (
    <div ref={measureRef} className="relative w-full">
      <div
        ref={handTrayRef}
        onWheel={onWheel}
        className="w-full overflow-x-auto scrollbar-none touch-pan-x overscroll-x-contain select-none pb-1"
        style={{ paddingTop: HEADROOM }}
      >
        <div className="relative" style={{ width: layout.railWidth, height: CARD_HEIGHT }}>
          {displayedHandCards.map((card, index) => {
            const position = byId.get(card.id)
            if (!position) return null
            const isPlayable = position.playable
            const isNewlyDrawn = newlyDrawnCardIds.has(card.id)
            const isFlying = flyingCards.some((fc) => fc.card.id === card.id)

            return (
              <div
                key={card.id}
                className={cx(
                  'absolute top-0 left-0 transition-transform duration-300 ease-out',
                  isFlying && 'opacity-0'
                )}
                style={{
                  transform: 'translate3d(' + position.x + 'px, ' + (isPlayable ? -LIFT : 0) + 'px, 0)',
                  // A lifted card has to sit above the one covering it.
                  zIndex: isPlayable || isNewlyDrawn ? 40 + index : index,
                }}
              >
                {isNewlyDrawn && !isFlying && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 z-50 px-1.5 py-px rounded-full bg-lamp text-table font-bold text-nano uppercase pointer-events-none">
                    New
                  </span>
                )}

                <UnoCard
                  card={card}
                  size="lg"
                  isPlayable={isPlayable}
                  onClick={isPlayable ? onPlayCard : undefined}
                  className={cx(isNewlyDrawn && !isFlying && 'ring-2 ring-lamp', isPlayable && 'shadow-lift-2')}
                />

                {/* A card that is out of play is darkened, not faded. Fading it
                    makes it translucent, and a translucent card in a shingle
                    shows you the one underneath it -- which turned the closed
                    half of a big hand into a muddy stack of bleed-through. */}
                {!isPlayable && (
                  <span
                    className={cx(
                      'absolute inset-0 rounded-object pointer-events-none transition-colors duration-300',
                      isCurrentTurnForMe ? 'bg-table/55' : 'bg-table/20'
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <EdgeMarker side="left" count={hidden.left} onClick={() => scrollTo(hidden.leftTarget)} />
      <EdgeMarker side="right" count={hidden.right} onClick={() => scrollTo(hidden.rightTarget)} />
    </div>
  )
}

/** How many cards you can play are off this edge, and a way to reach them. */
function EdgeMarker({ side, count, onClick }) {
  if (count < 1) return null
  const left = side === 'left'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count + ' card' + (count > 1 ? 's' : '') + ' you can play, off to the ' + side}
      className={cx(
        'absolute top-1/2 -translate-y-1/2 z-50 flex items-center gap-0.5 py-1 rounded-full',
        'bg-turn text-table text-nano font-bold shadow-lift-2 cursor-pointer',
        'active:scale-[0.94] transition-transform duration-150',
        left ? 'left-0 pl-0.5 pr-1.5' : 'right-0 pl-1.5 pr-0.5',
        FOCUS
      )}
    >
      {left && <ChevronLeft className="w-3 h-3" />}
      {count}
      {!left && <ChevronRight className="w-3 h-3" />}
    </button>
  )
}

export default React.memo(UnoHandTray)
