import { arcsAt, coreColorAt, TAU } from '../engine/gates'
import {
  BALL_RADIUS,
  COLOR_CONFIG,
  CORE_RADIUS,
  RING_STROKE,
} from '../constants/bounceConstants'
import { drawGlyph } from '../utils/colorGlyphs'

/**
 * The chamber, and the one place the shaft's light does not reach.
 *
 * The signature of this game is that the climb brightens as you rise, with the
 * finish as the lamp. A chamber extends that rather than competing with it: the
 * wall occludes the shaft, the interior is a pocket of dark, and the cycling core
 * is the only light source in there. The colour you are about to carry out is
 * literally what you are reading by, and the moment the ceiling opens the shaft
 * floods back in.
 *
 * One light source per space is the app's rule. This obeys it in a second room
 * rather than bending it, which is why the chamber needs no new palette value.
 */

const hex = (color) => COLOR_CONFIG[color].hex
const glyphOf = (color) => COLOR_CONFIG[color].glyph

export function drawChamber(ctx, { element, view, t, inside }) {
  const cx = view.x(0)
  const cy = view.y(element.y)
  const inner = element.radius - RING_STROKE / 2

  // The pocket. Painted opaque rather than shaded, because it has to read as a
  // different room from three hundred units away.
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, inner, 0, TAU)
  ctx.fillStyle = 'rgba(11,9,7,0.94)'
  ctx.fill()
  ctx.restore()

  drawWall(ctx, element, view, t, cx, cy)
  drawIris(ctx, { cx, y: view.y(element.crossY), inner, closed: inside })
  if (element.core) drawCore(ctx, element.core, view, t, cx)
  drawExitMark(ctx, { cx, y: view.y(element.y + element.radius), inside })
}

/** The wall: the same arcs the engine tests, drawn from the same function. */
function drawWall(ctx, element, view, t, cx, cy) {
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
    ctx.fillStyle = 'rgba(22,18,15,0.82)'
    drawGlyph(
      ctx,
      glyphOf(arc.color),
      cx + element.radius * Math.cos(view.angle(mid)),
      cy + element.radius * Math.sin(view.angle(mid)),
      RING_STROKE * 0.78
    )
  }
  ctx.restore()
}

/**
 * The lip you came in through, drawn open below you and shut once you are in.
 *
 * This is the whole fiction of the room in one mark: it is why entering costs no
 * colour and leaving costs everything, and why the floor is somewhere you can
 * stand and read the ceiling instead of somewhere you fall out of.
 */
function drawIris(ctx, { cx, y, inner, closed }) {
  const reach = inner * 0.82
  const gap = closed ? 0 : 52
  ctx.save()
  ctx.fillStyle = closed ? 'rgba(255,231,190,0.6)' : 'rgba(255,231,190,0.28)'
  ctx.fillRect(cx - reach, y - 3, reach - gap / 2, 6)
  ctx.fillRect(cx + gap / 2, y - 3, reach - gap / 2, 6)
  ctx.restore()
}

/** The core: the only lamp in the pocket, and the colour you will leave holding. */
function drawCore(ctx, core, view, t, cx) {
  const cy = view.y(core.y)
  const colour = coreColorAt(core, t)

  ctx.save()
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, CORE_RADIUS * 5.5)
  glow.addColorStop(0, `${hex(colour)}aa`)
  glow.addColorStop(0.35, `${hex(colour)}33`)
  glow.addColorStop(1, `${hex(colour)}00`)
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, cy, CORE_RADIUS * 5.5, 0, TAU)
  ctx.fill()

  // An annulus rather than a disc, so the ball stays visible sitting in it. A
  // filled core is exactly the size and shape of a ball and paints it its own
  // colour, which left the two indistinguishable at the moment you most need to
  // see where you are.
  ctx.beginPath()
  ctx.arc(cx, cy, CORE_RADIUS + 5, 0, TAU)
  ctx.strokeStyle = hex(colour)
  ctx.lineWidth = 9
  ctx.stroke()

  // Centred, so it reads while the core is empty and the ball covers it when not
  // -- and by then the ball is wearing this very glyph, freshly painted.
  ctx.fillStyle = `${hex(colour)}cc`
  drawGlyph(ctx, glyphOf(colour), cx, cy, CORE_RADIUS * 0.95)

  // The band it actually paints you in, so where to hover is not a guess.
  ctx.strokeStyle = `${hex(colour)}44`
  ctx.lineWidth = 2
  ctx.setLineDash([10, 8])
  const reach = CORE_RADIUS + BALL_RADIUS
  ctx.beginPath()
  ctx.moveTo(cx - 90, view.y(core.y + reach))
  ctx.lineTo(cx + 90, view.y(core.y + reach))
  ctx.moveTo(cx - 90, view.y(core.y - reach))
  ctx.lineTo(cx + 90, view.y(core.y - reach))
  ctx.stroke()
  ctx.restore()
}

/** Where you will meet the ceiling, so the timing is about the turn and not the geometry. */
function drawExitMark(ctx, { cx, y, inside }) {
  ctx.save()
  ctx.fillStyle = inside ? 'rgba(255,231,190,0.75)' : 'rgba(255,231,190,0.3)'
  ctx.beginPath()
  ctx.moveTo(cx, y - 16)
  ctx.lineTo(cx - 11, y - 2)
  ctx.lineTo(cx + 11, y - 2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
