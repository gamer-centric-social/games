import { BALL_RADIUS, COLOR_CONFIG } from '../constants/bounceConstants'
import { drawGlyph } from '../utils/colorGlyphs'

/**
 * The ball, and the only saturated thing on screen that moves.
 *
 * It wears the glyph of the colour it is holding, which is the same glyph as on
 * the arcs it can pass through -- so matching is a shape match, not only a colour
 * one.
 */
export function drawBall(ctx, { run, view }) {
  const cx = view.x(0)
  const cy = view.y(run.y)
  const { hex, glyph } = COLOR_CONFIG[run.color]

  // A short tail against the direction of travel, so speed reads at a glance.
  const tail = Math.max(-70, Math.min(70, run.vy * 0.05))
  if (Math.abs(tail) > 6) {
    ctx.save()
    ctx.globalAlpha = 0.28
    ctx.fillStyle = hex
    ctx.beginPath()
    ctx.ellipse(cx, cy + tail / 2, BALL_RADIUS * 0.72, BALL_RADIUS + Math.abs(tail) / 2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, BALL_RADIUS + 7, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx, cy, BALL_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = hex
  ctx.fill()

  ctx.fillStyle = 'rgba(22,18,15,0.88)'
  drawGlyph(ctx, glyph, cx, cy, BALL_RADIUS * 1.25)
  ctx.restore()
}
