import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * The one requestAnimationFrame in Bounce. It steps the table and then draws.
 *
 * The callback is held in a ref that a dep-free layout effect refreshes, so the
 * loop is created once per mount and never rebuilt. Listing the run or the course
 * as dependencies would tear the loop down and start a new one on every frame,
 * which is the bug Tank's useArenaRenderer documents at length -- there it froze
 * every elapsed-time animation on frame one; here it would reset the accumulator
 * sixty times a second and the ball would never move.
 */
export default function useBounceLoop({ active, onFrame }) {
  const frameRef = useRef(onFrame)

  useLayoutEffect(() => {
    frameRef.current = onFrame
  })

  useEffect(() => {
    if (!active) return undefined
    let handle = requestAnimationFrame(function tick(now) {
      frameRef.current?.(now)
      handle = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(handle)
  }, [active])
}
