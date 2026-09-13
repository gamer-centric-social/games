import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeFlightPath } from '../utils/drawFlightGeometry'
import { playCardDrawSound } from '../../../utils/sound'

const NEW_CARD_HIGHLIGHT_DURATION_MS = 2000
const CARD_STAGGER_MS = 320
const FLIGHT_DURATION_MS = 550
const EMPTY_ID_SET = new Set()

/**
 * Cards flying from the draw pile into the hand, plus the "NEW" badge on them.
 *
 * Watches `handCards` for ids that were not there last render and animates the
 * difference. That is why it has to own prevHandCardIds: the diff is the whole
 * trigger, and there is no draw event to hook instead.
 *
 * Every timer it starts is tracked and cleared on unmount. The per-card stagger
 * and settle timers previously were not, so leaving mid-flight left them firing
 * setState on an unmounted component -- the same class of defect as the
 * round-transition timers in bugs.md #7.
 */
export default function useDrawAnimation({
  handCards,
  drawPileRef,
  handTrayRef,
  handLayoutRef,
  spacing,
}) {
  const [flyingCards, setFlyingCards] = useState([])
  const [newlyDrawnCardIds, setNewlyDrawnCardIds] = useState(new Set())

  const prevHandCardIdsRef = useRef(new Set())
  const hasInitializedHandRef = useRef(false)
  const highlightTimerRef = useRef(null)
  const flightTimersRef = useRef(new Set())

  // How far apart the tray is currently spacing its cards. Held in a ref so a
  // resize cannot re-fire the draw effect -- the effect is triggered by cards
  // appearing in the hand, and nothing else may trigger it.
  const spacingRef = useRef(spacing)
  useEffect(() => {
    spacingRef.current = spacing
  }, [spacing])

  const trackTimer = useCallback((id) => {
    flightTimersRef.current.add(id)
    return id
  }, [])

  useEffect(() => {
    const timers = flightTimersRef.current
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [])

  const clearNewBadges = useCallback(() => setNewlyDrawnCardIds(new Set()), [])

  useEffect(() => {
    const currentIds = new Set(handCards.map((c) => c.id))

    // First hand of a match (7 cards at once): register the ids, do not animate.
    if (!hasInitializedHandRef.current) {
      if (handCards.length > 0) {
        hasInitializedHandRef.current = true
        prevHandCardIdsRef.current = currentIds
      }
      return
    }

    // Hand emptied -- a new round, or this player going out. Reset for next time.
    if (handCards.length === 0) {
      hasInitializedHandRef.current = false
      prevHandCardIdsRef.current = new Set()
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current)
        highlightTimerRef.current = null
      }
      // No setState needed: visibleNewIds is derived from handCards, so an
      // empty hand already shows no badges.
      return
    }

    const addedCards = handCards.filter((c) => !prevHandCardIdsRef.current.has(c.id))
    prevHandCardIdsRef.current = currentIds
    if (addedCards.length === 0) return

    // The sort is deliberately left alone. This used to drop it, so that a drawn
    // card appeared at the left end where the flight was aiming -- which meant the
    // hand you had arranged came apart every time you drew. Instead the tray brings
    // the card's slot into view now, before the flight is aimed at it.
    const handLayout = handLayoutRef?.current
    addedCards.forEach((c) => handLayout?.reveal?.(c.id))

    setNewlyDrawnCardIds(new Set(addedCards.map((c) => c.id)))
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = setTimeout(() => {
      setNewlyDrawnCardIds(new Set())
      highlightTimerRef.current = null
    }, NEW_CARD_HIGHLIGHT_DURATION_MS)

    const { startX, startY, targets } = computeFlightPath({
      drawRect: drawPileRef.current?.getBoundingClientRect() ?? null,
      trayRect: handTrayRef.current?.getBoundingClientRect() ?? null,
      count: addedCards.length,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      spacing: spacingRef.current,
      // Where each of these cards actually ended up. Read after the reveal above, so
      // the target is the card's final position rather than the one it had before
      // the rail scrolled to it.
      landingXs: addedCards.map((c) => handLayout?.viewportX?.(c.id)),
    })

    addedCards.forEach((card, index) => {
      const animId = `draw-${card.id}-${Date.now()}-${index}`
      const target = targets[index]

      trackTimer(
        setTimeout(() => {
          playCardDrawSound()
          setFlyingCards((prev) => [
            ...prev,
            { animId, card, startX, startY, targetX: target.x, targetY: target.y, phase: 'start' },
          ])

          // Two frames, so the element is mounted at its start position before
          // the transform that animates it is applied.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setFlyingCards((prev) =>
                prev.map((fc) => (fc.animId === animId ? { ...fc, phase: 'flying' } : fc))
              )
            })
          })

          trackTimer(
            setTimeout(() => {
              setFlyingCards((prev) => prev.filter((fc) => fc.animId !== animId))
            }, FLIGHT_DURATION_MS)
          )
        }, index * CARD_STAGGER_MS)
      )
    })
  }, [handCards, drawPileRef, handTrayRef, handLayoutRef, trackTimer])

  // Derived rather than stored, so a badge can never outlive the card it is
  // attached to -- playing a highlighted card, or the hand emptying at the end
  // of a round, clears it without an effect writing state back.
  const visibleNewIds = useMemo(() => {
    if (newlyDrawnCardIds.size === 0 || handCards.length === 0) return EMPTY_ID_SET
    const inHand = new Set(handCards.map((c) => c.id))
    return new Set([...newlyDrawnCardIds].filter((id) => inHand.has(id)))
  }, [handCards, newlyDrawnCardIds])

  return { flyingCards, newlyDrawnCardIds: visibleNewIds, clearNewBadges }
}
