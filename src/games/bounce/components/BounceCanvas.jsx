import React, { useCallback, useEffect, useRef } from 'react'
import { drawScene } from '../render/drawScene'
import useBounceLoop from '../hooks/useBounceLoop'
import useTapInput from '../hooks/useTapInput'

/**
 * The shaft.
 *
 * Portrait by nature -- it is a climb -- so unlike Tank's arena there is no
 * rotation to undo and no landscape variant: on a wide screen the shaft is simply
 * centred with the table either side of it.
 *
 * The canvas fills its box exactly and the fit is done in the drawing transform
 * rather than in CSS. Letting CSS scale a fixed-size canvas costs sharpness and
 * makes the layout fight `aspect-ratio`; here the backing store is real device
 * pixels and the projection decides how much world that is.
 */
export default function BounceCanvas({ table, active }) {
  const frameRef = useRef(null)
  const canvasRef = useRef(null)
  const contextRef = useRef(null)
  const sizeRef = useRef({ width: 0, height: 0 })

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    sizeRef.current = { width, height }
    contextRef.current = canvas.getContext('2d')
  }, [])

  useEffect(() => {
    resize()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resize)
      return () => window.removeEventListener('resize', resize)
    }
    const observer = new ResizeObserver(resize)
    if (canvasRef.current) observer.observe(canvasRef.current)
    return () => observer.disconnect()
  }, [resize])

  useTapInput({ targetRef: frameRef, active, onTap: () => table.tap() })

  useBounceLoop({
    active,
    onFrame: (now) => {
      table.advance(now)
      const ctx = contextRef.current
      if (!ctx) return
      const { width, height } = sizeRef.current
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, width, height)
      drawScene(ctx, { run: table.run, course: table.course, pixelWidth: width, pixelHeight: height })
    },
  })

  return (
    <div
      ref={frameRef}
      // touch-none so a tap is a tap: no scroll, no double-tap zoom mid-climb.
      className="relative flex-1 min-h-0 mx-3 mb-3 mt-2 rounded-slab overflow-hidden shadow-lift-2 touch-none select-none"
    >
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 w-full h-full" />
    </div>
  )
}
