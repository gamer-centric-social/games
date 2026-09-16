import { ARC_KINDS, arcsAt, BALL_X, BAND_KINDS, bandsAt, TAU } from '../engine/gates'
import {
  COLOR_CONFIG,
  RING_STROKE,
  SHAFT_WIDTH,
  SLIDER_HEIGHT,
  SWATCH_RADIUS,
} from '../constants/bounceConstants'
import { drawChamber } from './drawChamber'
import { drawGlyph } from '../utils/colorGlyphs'

/**
 * The gates.
 *
 * Every arc carries its colour's glyph as well as its colour, because the colour
 * on its own is a rule you cannot see if you are colour blind. A small notch marks
 * where the ball will cross, so timing is about the turn of the ring rather than
 * about guessing the geometry.
 *
 * Where each arc *is* comes from engine/gates.js, never from a copy of the maths
 * kept over here. A ring drawn a few degrees from where the engine will test it
 * would cost you races you had played correctly, and nothing in a screenshot
 * would show it -- so the two read the same function and cannot drift.
 */

const hex = (color) => COLOR_CONFIG[color].hex
const glyphOf = (color) => COLOR_CONFIG[color].glyph

export function drawObstacles(ctx, { course, view, t, run }) {
  for (let index = 0; index < course.elements.length; index++) {
    const element = course.elements[index]
    // A chamber is far taller than a ring, so it is culled on its own extent.
    const reach = element.radius ?? 0
    if (element.y + reach < view.bottom || element.y - reach > view.top) continue

    if (element.kind === 'chamber') {
      drawChamber(ctx, { element, view, t, inside: run?.inside === index })
    } else if (ARC_KINDS.has(element.kind)) {
      drawArcGate(ctx, element, view, t)
    } else if (BAND_KINDS.has(element.kind)) {
      drawBandGate(ctx, element, view, t)
    } else {
      drawSwatch(ctx, element, view)
    }
  }
}

/** A ring, a pendulum or a ratchet: four arcs on a circle, met at the bottom. */
function drawArcGate(ctx, element, view, t) {
  const cx = view.x(0)
  const cy = view.y(element.y)

  ctx.save()
  ctx.lineWidth = RING_STROKE
  ctx.lineCap = 'butt'

  for (const arc of arcsAt(element, t)) {
    ctx.strokeStyle = hex(arc.color)
    ctx.beginPath()
    // Canvas angles run backwards, so the arc is walked from its far edge.
    ctx.arc(cx, cy, element.radius, view.angle(arc.to), view.angle(arc.from))
    ctx.stroke()

    const mid = (arc.from + arc.to) / 2
    // An iris ring's slivers are narrower than a glyph, so the glyph gives way.
    const room = (arc.to - arc.from) * element.radius
    ctx.fillStyle = 'rgba(22,18,15,0.82)'
    drawGlyph(
      ctx,
      glyphOf(arc.color),
      cx + element.radius * Math.cos(view.angle(mid)),
      cy + element.radius * Math.sin(view.angle(mid)),
      Math.min(RING_STROKE * 0.78, room * 0.62)
    )
  }
  ctx.restore()

  drawRhythmMark(ctx, element, view, cx, cy)
  drawNotch(ctx, cx, cy + element.radius + RING_STROKE / 2 + 6)
}

/**
 * How this gate moves, said in geometry.
 *
 * A ring, a pendulum and a ratchet are all four arcs on a circle, so a still
 * frame of them is identical and you only learn which is which by watching one
 * long enough to be caught out by it. One mark each fixes that: teeth for the
 * ratchet, because it moves in clicks, and a pivot for the pendulum, because it
 * hangs from a point and swings back. A plain ring gets nothing -- it is the
 * default, and marking everything marks nothing.
 */
function drawRhythmMark(ctx, element, view, cx, cy) {
  if (element.kind === 'ring') return

  ctx.save()
  ctx.fillStyle = 'rgba(255,231,190,0.45)'

  if (element.kind === 'ratchet') {
    const r = element.radius + RING_STROKE / 2 + 5
    for (let i = 0; i < 8; i++) {
      const a = view.angle(element.phase + (i / 8) * TAU)
      ctx.beginPath()
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.6, 0, TAU)
      ctx.fill()
    }
  } else {
    ctx.beginPath()
    ctx.arc(cx, cy, 5, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * A slider or a shutter: a band of four colours crossing the shaft.
 *
 * Where each segment sits comes from `bandsAt`, which is also what resolves the
 * crossing. This used to lay the strip out here and the engine read it at the
 * shaft's wall rather than at the centre line where the ball actually is, so the
 * colour under the notch was never the colour being tested.
 */
function drawBandGate(ctx, element, view, t) {
  const sy = view.y(element.y)
  const left = view.x(-SHAFT_WIDTH / 2) + 16
  const right = view.x(SHAFT_WIDTH / 2) - 16

  ctx.save()
  ctx.beginPath()
  ctx.rect(left, sy - SLIDER_HEIGHT / 2, right - left, SLIDER_HEIGHT)
  ctx.clip()

  for (const band of bandsAt(element, t)) {
    const x = view.x(band.from)
    const width = band.to - band.from
    if (x + width < left || x > right) continue
    ctx.fillStyle = hex(band.color)
    ctx.fillRect(x, sy - SLIDER_HEIGHT / 2, width, SLIDER_HEIGHT)
    ctx.fillStyle = 'rgba(22,18,15,0.82)'
    drawGlyph(ctx, glyphOf(band.color), x + width / 2, sy, SLIDER_HEIGHT * 0.8)
  }
  ctx.restore()

  drawNotch(ctx, view.x(BALL_X), sy + SLIDER_HEIGHT / 2 + 6)
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
