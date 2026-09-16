import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Tap to climb, and nothing else.
 *
 * pointerdown rather than click, because a click waits for the release and the
 * whole game is in the timing. The default is prevented so a tap cannot scroll
 * the page or start a double-tap zoom mid-climb, and a held key is ignored so
 * leaning on the space bar is not a hundred taps.
 */
export default function useTapInput({ targetRef, active, onTap }) {
  const tapRef = useRef(onTap)

  useLayoutEffect(() => {
    tapRef.current = onTap
  })

  useEffect(() => {
    const element = targetRef.current
    if (!active || !element) return undefined

    const onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return
      event.preventDefault()
      tapRef.current?.()
    }

    const onKeyDown = (event) => {
      if (event.repeat) return
      if (event.code !== 'Space' && event.code !== 'ArrowUp' && event.key !== ' ') return
      event.preventDefault()
      tapRef.current?.()
    }

    element.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [targetRef, active])
}
