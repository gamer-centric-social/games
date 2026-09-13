/**
 * Where a drawn card flies from, and where each one lands.
 *
 * Pure geometry, separated from the animation that uses it so the arithmetic
 * can be tested without a DOM. Every fallback matters: a rect is null whenever
 * the pile or tray has not been laid out yet (first paint, or a spectator with
 * no tray), and the card still has to fly from somewhere sensible.
 */

const CARD_HALF_WIDTH = 36
const CARD_HALF_HEIGHT = 48
/**
 * How far apart consecutive cards land. The tray shingles its cards now, so
 * the real gap depends on how many are in the hand -- the tray measures it and
 * passes it in. The constant stays as the default so a caller that has not
 * measured yet (and every existing test) behaves exactly as before.
 */
const CARD_SPACING = 48
const TRAY_INSET = 12
const TRAY_TOP_PADDING = 4
const RIGHT_MARGIN = 85
const FALLBACK_TRAY_INSET = 20
const FALLBACK_TRAY_BOTTOM = 130

/**
 * @param {object}      p
 * @param {DOMRect|null} p.drawRect  the draw pile
 * @param {DOMRect|null} p.trayRect  the hand tray
 * @param {number}      p.count      how many cards were drawn
 * @param {number}      p.viewportWidth
 * @param {number}      p.viewportHeight
 * @param {number}     [p.spacing]   px between landing slots; defaults to 48
 * @param {number[]}   [p.landingXs] viewport x of each drawn card's real slot, when
 *                                   the tray has measured one -- a sorted hand puts a
 *                                   drawn card in the middle of the row, not at the
 *                                   left end where the even spread aims
 * @returns {{ startX: number, startY: number, targets: {x: number, y: number}[] }}
 */
export function computeFlightPath({
  drawRect,
  trayRect,
  count,
  viewportWidth,
  viewportHeight,
  spacing,
  landingXs,
}) {
  const step = Number.isFinite(spacing) && spacing > 0 ? spacing : CARD_SPACING
  const startX = drawRect
    ? drawRect.left + drawRect.width / 2 - CARD_HALF_WIDTH
    : viewportWidth / 2 - CARD_HALF_WIDTH
  const startY = drawRect
    ? drawRect.top + drawRect.height / 2 - CARD_HALF_HEIGHT
    : viewportHeight / 2 - CARD_HALF_HEIGHT

  const targetY = trayRect ? trayRect.top + TRAY_TOP_PADDING : viewportHeight - FALLBACK_TRAY_BOTTOM

  const targets = []
  for (let index = 0; index < count; index++) {
    const known = landingXs?.[index]
    const unclamped = Number.isFinite(known)
      ? known
      : trayRect
      ? trayRect.left + TRAY_INSET + index * step
      : FALLBACK_TRAY_INSET + index * step
    targets.push({
      x: Math.min(unclamped, viewportWidth - RIGHT_MARGIN),
      y: targetY,
    })
  }

  return { startX, startY, targets }
}
