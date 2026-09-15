import {
  COLOR_CONFIG,
  RING_STROKE,
  SHAFT_WIDTH,
  SLIDER_HEIGHT,
  SLIDER_SEGMENT,
  SWATCH_RADIUS,
} from '../constants/bounceConstants'
import { drawGlyph } from '../utils/colorGlyphs'

/**
 * The gates.
 *
 * Every arc carries its colour's glyph as well as its colour, because the colour
 * on its own is a rule you cannot see if you are colour blind. A small notch marks
 * where the ball will cross, so timing is about the turn of the ring rather than
 * about guessing the geometry.
 */

const QUADRANT = Math.PI / 2
const SLIDER_WIDTH = SLIDER_SEGMENT * 4
const hex = (color) => COLOR_CONFIG[color].hex
const glyphOf = (color) => COLOR_CONFIG[color].glyph

export function drawObstacles(ctx, { course, view, t }) {
  for (const element of course.elements) {
    if (element.y < view.bottom || element.y > view.top) continue
    if (element.kind === 'ring') drawRing(ctx, element, view, t)
    else if (element.kind === 'slider') drawSlider(ctx, element, view, t)
    else drawSwatch(ctx, element, view)
  }
}

function drawRing(ctx, ring, view, t) {
  const cx = view.x(0)
  const cy = view.y(ring.y)
  const theta = ring.phase + ring.omega * t

  ctx.save()
  ctx.lineWidth = RING_STROKE
  ctx.lineCap = 'butt'

  for (let i = 0; i < 4; i++) {
    const from = theta + i * QUADRANT
    const to = from + QUADRANT
    ctx.strokeStyle = hex(ring.colors[i])
    ctx.beginPath()
    // Canvas angles run backwards, so the arc is walked from its far edge.
    ctx.arc(cx, cy, ring.radius, view.angle(to), view.angle(from))
    ctx.stroke()

    const mid = from + QUADRANT / 2
    ctx.fillStyle = 'rgba(22,18,15,0.82)'
    drawGlyph(
      ctx,
      glyphOf(ring.colors[i]),
      cx + ring.radius * Math.cos(view.angle(mid)),
      cy + ring.radius * Math.sin(view.angle(mid)),
      RING_STROKE * 0.78
    )
  }
  ctx.restore()

  drawNotch(ctx, cx, cy + ring.radius + RING_STROKE / 2 + 6)
}

function drawSlider(ctx, slider, view, t) {
  const sy = view.y(slider.y)
  const left = view.x(-SHAFT_WIDTH / 2) + 16
  const right = view.x(SHAFT_WIDTH / 2) - 16
  const offset = (((slider.offset + slider.speed * t) % SLIDER_WIDTH) + SLIDER_WIDTH) % SLIDER_WIDTH

  ctx.save()
  ctx.beginPath()
  ctx.rect(left, sy - SLIDER_HEIGHT / 2, right - left, SLIDER_HEIGHT)
  ctx.clip()

  // Two passes of the strip, so it reads as continuous as it wraps.
  for (let pass = -1; pass <= 1; pass++) {
    for (let i = 0; i < 4; i++) {
      const segLeft = view.x(-SHAFT_WIDTH / 2) + offset + i * SLIDER_SEGMENT + pass * SLIDER_WIDTH
      ctx.fillStyle = hex(slider.colors[i])
      ctx.fillRect(segLeft, sy - SLIDER_HEIGHT / 2, SLIDER_SEGMENT, SLIDER_HEIGHT)
      ctx.fillStyle = 'rgba(22,18,15,0.82)'
      drawGlyph(ctx, glyphOf(slider.colors[i]), segLeft + SLIDER_SEGMENT / 2, sy, SLIDER_HEIGHT * 0.8)
    }
  }
  ctx.restore()

  drawNotch(ctx, view.x(0), sy + SLIDER_HEIGHT / 2 + 6)
}

function drawSwatch(ctx, swatch, view) {
  const cx = view.x(0)
  const cy = view.y(swatch.y)

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, SWATCH_RADIUS + 9, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,231,190,0.12)'
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx, cy, SWATCH_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = hex(swatch.color)
  ctx.fill()

  ctx.fillStyle = 'rgba(22,18,15,0.85)'
  drawGlyph(ctx, glyphOf(swatch.color), cx, cy, SWATCH_RADIUS * 1.15)
  ctx.restore()
}

/** A small mark under a gate, so where you will cross it is never a guess. */
function drawNotch(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(255,231,190,0.55)'
  ctx.fillRect(cx - 18, cy, 36, 3)
}
