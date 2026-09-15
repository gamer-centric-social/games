import { createProjection } from './camera'
import { drawShaft } from './drawShaft'
import { drawObstacles } from './drawObstacles'
import { drawBall } from './drawBall'

/**
 * One frame, bottom to top: the shaft, then the gates, then the ball.
 *
 * Everything is drawn from the run's own clock rather than the wall clock, so a
 * paused or replayed run draws exactly what it would have drawn live -- the rings
 * are where the engine says they are, not where the frame happened to arrive.
 */
export function drawScene(ctx, { run, course, pixelWidth, pixelHeight }) {
  if (!course || !run || pixelWidth <= 0 || pixelHeight <= 0) return

  const view = createProjection({ pixelWidth, pixelHeight, worldY: run.y })

  ctx.save()
  ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0)
  drawShaft(ctx, { view, course })
  drawObstacles(ctx, { view, course, t: run.t })
  drawBall(ctx, { view, run })
  ctx.restore()
}
