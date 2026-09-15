import { SHAFT_WIDTH } from '../constants/bounceConstants'

/**
 * The signature: the shaft brightens as you climb, and the finish is the lamp.
 *
 * Progress is the light. The gradient is keyed to world height rather than to
 * screen position, so it is continuous as the camera scrolls and never resets --
 * how far you have come reads directly as how lit it is.
 *
 * This keeps the app's one-light-source rule rather than bending it: the lamp is
 * at the top of the course, fixed, and does not animate. Both ends of the ramp are
 * values the palette already has, so no second ground enters the design.
 */

/** --color-table, the one background, at the start line. */
const DARK = [0x16, 0x12, 0x0f]
/** The same warm ground carried up toward --color-lamp, never all the way to it. */
const LIT = [0x6b, 0x59, 0x41]

const mix = (t) => {
  const k = Math.min(1, Math.max(0, t))
  return `rgb(${DARK.map((c, i) => Math.round(c + (LIT[i] - c) * k)).join(',')})`
}

/** Rungs on the walls: without fixed marks to pass, a scrolling gradient reads as still. */
const RUNG_SPAN = 250
const WALL = 16

export function drawShaft(ctx, { view, course }) {
  const { worldWidth, worldHeight, camY } = view
  const height = course.height
  const left = view.x(-SHAFT_WIDTH / 2)
  const right = view.x(SHAFT_WIDTH / 2)

  // Beyond the shaft is the table itself, unlit.
  ctx.fillStyle = '#16120f'
  ctx.fillRect(0, 0, worldWidth, worldHeight)

  const gradient = ctx.createLinearGradient(0, worldHeight, 0, 0)
  gradient.addColorStop(0, mix(camY / height))
  gradient.addColorStop(1, mix((camY + worldHeight) / height))
  ctx.fillStyle = gradient
  ctx.fillRect(left, 0, right - left, worldHeight)

  ctx.fillStyle = 'rgba(0,0,0,0.34)'
  ctx.fillRect(left, 0, WALL, worldHeight)
  ctx.fillRect(right - WALL, 0, WALL, worldHeight)

  ctx.fillStyle = 'rgba(255,231,190,0.15)'
  const firstRung = Math.floor(view.bottom / RUNG_SPAN) * RUNG_SPAN
  for (let y = firstRung; y <= view.top; y += RUNG_SPAN) {
    const sy = view.y(y)
    ctx.fillRect(left, sy, WALL, 3)
    ctx.fillRect(right - WALL, sy, WALL, 3)
  }

  drawSeams(ctx, { course, view, left, right })

  if (view.top >= height - 200) drawFinish(ctx, { view, height, left, right })
}

/**
 * The seams between rooms, which are also the checkpoints.
 *
 * Drawn from the course's own list rather than stepped off a fixed grid: the
 * climb is a stack of rooms of differing heights now, so there is no stride to
 * walk. Each seam gets a lintel as well as the dashed line -- it is a floor you
 * fall back to, and it is the edge of the room you are in, and both of those are
 * worth being able to see coming.
 */
function drawSeams(ctx, { course, view, left, right }) {
  ctx.save()
  for (const checkpoint of course.checkpoints) {
    if (checkpoint.y < view.bottom || checkpoint.y > view.top) continue
    const sy = view.y(checkpoint.y)

    ctx.fillStyle = 'rgba(255,231,190,0.16)'
    ctx.fillRect(left + WALL, sy - 7, right - left - WALL * 2, 7)

    ctx.setLineDash([18, 14])
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(255,231,190,0.36)'
    ctx.beginPath()
    ctx.moveTo(left + WALL, sy)
    ctx.lineTo(right - WALL, sy)
    ctx.stroke()
  }
  ctx.restore()
}

/** The lamp itself, once it comes into view. */
function drawFinish(ctx, { view, height, left, right }) {
  const sy = view.y(height)
  const cx = view.x(0)

  const glow = ctx.createRadialGradient(cx, sy, 0, cx, sy, 640)
  glow.addColorStop(0, 'rgba(255,231,190,0.58)')
  glow.addColorStop(0.45, 'rgba(255,231,190,0.17)')
  glow.addColorStop(1, 'rgba(255,231,190,0)')
  ctx.fillStyle = glow
  ctx.fillRect(left, sy - 640, right - left, 1280)

  ctx.fillStyle = 'rgba(255,231,190,0.94)'
  ctx.fillRect(left + WALL, sy - 4, right - left - WALL * 2, 8)
}
