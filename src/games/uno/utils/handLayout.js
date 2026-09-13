/**
 * Where each card in your hand sits, and how much of it you can see.
 *
 * Pure arithmetic, kept out of the tray so it can be tested without a DOM --
 * the same reason drawFlightGeometry.js and turnOrder.js live here.
 *
 * The rule: a card's slot is decided by what you can do with it. On your turn
 * a playable card gets a wide slot -- its colour band, its index and most of
 * its numeral -- and an unplayable one compresses to a rib showing only its
 * edge and corner index. The hand opens around your options.
 *
 * That matters most in exactly the case it was written for: ten or more cards
 * with many of them playable. An even shingle gives every card the same 33px
 * sliver, so the cards you are choosing between are unreadable and their tap
 * targets are below a thumb. Weighting the slots by role means every card you
 * can actually tap is, by construction, one of the wide ones.
 *
 * When it is not your turn every card has the same role, and the layout is the
 * even shingle it has always been.
 */

/** Card box at size="lg": w-20 h-30. */
export const CARD_WIDTH = 80
export const CARD_HEIGHT = 120
/** Breathing room at each end of the rail. */
export const EDGE_PADDING = 16

/**
 * How far apart consecutive cards want to sit, and the least they will accept
 * once the hand stops fitting. `even` wants full separation and settles for a
 * sliver; `open` insists on enough width to read and still be tapped.
 */
const IDEAL = { open: 58, rib: 30, even: CARD_WIDTH + 6 }
const FLOOR = { open: 42, rib: 26, even: 30 }

const EMPTY_LAYOUT = {
  positions: [],
  rowWidth: 0,
  railWidth: 0,
  overflows: false,
  flightSpacing: IDEAL.even,
}

/**
 * @param {object}   p
 * @param {number}   p.width        measured width of the tray
 * @param {object[]} p.cards        the hand, in display order
 * @param {Set}     [p.playableIds] ids that can be played right now
 * @param {boolean} [p.isMyTurn]
 * @returns {{
 *   positions: {id: string, x: number, slot: number, playable: boolean}[],
 *   rowWidth: number, railWidth: number, overflows: boolean, flightSpacing: number
 * }}
 */
export function computeHandLayout({ width = 0, cards = [], playableIds = null, isMyTurn = false }) {
  const count = cards.length
  if (count === 0) return EMPTY_LAYOUT

  // Ribs only earn their compression by making room for something. With nothing
  // playable there is nothing to make room for, so the hand stays evenly spread
  // -- that is the moment you are scanning it hardest to decide whether to draw.
  const opens = isMyTurn ? cards.filter((card) => playableIds?.has?.(card.id)).length : 0
  const roles = cards.map((card) =>
    opens === 0 ? 'even' : playableIds?.has?.(card.id) ? 'open' : 'rib'
  )

  // The last card needs its whole width; every other card only needs its step.
  const available = Math.max(width - EDGE_PADDING * 2 - CARD_WIDTH, 0)
  const gaps = count - 1

  const steps = []
  if (gaps > 0) {
    let idealTotal = 0
    for (let i = 0; i < gaps; i++) idealTotal += IDEAL[roles[i]]

    // Before the first measurement there is no width to fit into, so the hand
    // lays out at its ideal rather than collapsing to the floor and jumping.
    const scale = width > 0 && idealTotal > available ? available / idealTotal : 1

    for (let i = 0; i < gaps; i++) {
      const role = roles[i]
      steps.push(Math.max(FLOOR[role], IDEAL[role] * scale))
    }
  }

  const rowWidth = steps.reduce((sum, step) => sum + step, 0) + CARD_WIDTH
  const railWidth = Math.max(Math.round(rowWidth) + EDGE_PADDING * 2, width)
  // Centred while the hand fits; pinned to the left edge once it scrolls.
  const offsetX = Math.max((railWidth - rowWidth) / 2, EDGE_PADDING)

  const positions = []
  let x = offsetX
  for (let i = 0; i < count; i++) {
    positions.push({
      id: cards[i].id,
      x: Math.round(x),
      slot: i < gaps ? steps[i] : CARD_WIDTH,
      playable: roles[i] === 'open',
    })
    x += i < gaps ? steps[i] : 0
  }

  return {
    positions,
    rowWidth,
    railWidth,
    overflows: railWidth > width,
    flightSpacing: steps.length > 0 ? steps[0] : CARD_WIDTH,
  }
}

/**
 * How many playable cards are off each edge of the rail, and where the nearest
 * one on each side starts.
 *
 * A card counts as visible while any of its own slice is on screen -- partly
 * covered is still findable, so this deliberately under-reports rather than
 * nagging about a card you can already see.
 */
export function hiddenPlayable({ positions = [], scrollLeft = 0, viewportWidth = 0 }) {
  let left = 0
  let right = 0
  let leftTarget = null
  let rightTarget = null

  for (const position of positions) {
    if (!position.playable) continue

    if (position.x + position.slot <= scrollLeft) {
      left += 1
      leftTarget = position.x // the nearest one is the last we pass
    } else if (position.x >= scrollLeft + viewportWidth) {
      right += 1
      if (rightTarget === null) rightTarget = position.x
    }
  }

  return { left, right, leftTarget, rightTarget }
}
