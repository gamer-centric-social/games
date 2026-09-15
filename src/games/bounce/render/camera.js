import { SHAFT_WIDTH, VIEW_HEIGHT } from '../constants/bounceConstants'

/**
 * World to screen.
 *
 * World y grows upward from the start line; canvas y grows downward. The camera
 * holds the ball low in the frame, so what you are looking at is the climb ahead.
 *
 * The scale is chosen so that **every player sees the same height of course**,
 * whatever their screen: a taller phone must not be a longer view of what is
 * coming. Only when a screen is too narrow to fit the shaft at that scale does the
 * shaft win and the vertical view shrink a little, which is the lesser unfairness.
 *
 * There is no inverse here and none is needed: a tap is a tap, with nothing to
 * aim, so the forward/inverse pair Tank's arenaGeometry exists to keep honest
 * simply does not arise.
 */

/** How far above the bottom edge the ball rides. */
export const BALL_ANCHOR = 300
/** Let the view sit a little below the start line, so the floor is visible. */
const FLOOR_MARGIN = 120

export const cameraFor = (worldY) => Math.max(-FLOOR_MARGIN, worldY - BALL_ANCHOR)

/**
 * Work out how to fit `pixelWidth x pixelHeight` of screen around the shaft, and
 * return everything the renderers need to place a world point.
 */
export function createProjection({ pixelWidth, pixelHeight, worldY }) {
  const scale = Math.min(pixelHeight / VIEW_HEIGHT, pixelWidth / SHAFT_WIDTH)
  const worldWidth = pixelWidth / scale
  const worldHeight = pixelHeight / scale
  const camY = cameraFor(worldY)

  return {
    scale,
    worldWidth,
    worldHeight,
    camY,
    /** Canvas y for a world height. */
    y: (worldY2) => worldHeight - (worldY2 - camY),
    /** Canvas x for a world x, measured from the shaft's centre line. */
    x: (worldX) => worldWidth / 2 + worldX,
    /** Canvas angles run the other way round, because canvas y points down. */
    angle: (worldAngle) => -worldAngle,
    /** The slice of course worth drawing, with room for a ring off each edge. */
    bottom: camY - 280,
    top: camY + worldHeight + 280,
  }
}
