/**
 * The shape that rides with each colour.
 *
 * Colour-gated collision is the worst possible mechanic for colour blindness --
 * misreading an arc does not merely confuse you, it costs you the race -- so
 * every colour also carries a glyph, on the ball and on the arc it belongs to.
 * The climb is playable in greyscale.
 *
 * One set of paths, drawn in a 24x24 box, used by both the canvas (through
 * Path2D) and the DOM (as an <svg><path>). Two copies would drift.
 */
export const GLYPH_PATH = {
  disc: 'M12 4.5A7.5 7.5 0 1 0 12 19.5A7.5 7.5 0 1 0 12 4.5Z',
  ring: 'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3ZM12 8A4 4 0 1 1 12 16A4 4 0 1 1 12 8Z',
  chevron: 'M12 4.5L21 13.5H15.75V19.5H8.25V13.5H3Z',
  diamond: 'M12 2.5L21.5 12L12 21.5L2.5 12Z',
}

const cache = new Map()

/** Lazily built, because Path2D does not exist outside a browser. */
function pathFor(glyph) {
  if (!cache.has(glyph)) {
    cache.set(glyph, typeof Path2D === 'undefined' ? null : new Path2D(GLYPH_PATH[glyph]))
  }
  return cache.get(glyph)
}

/** Stamp a glyph centred on (x, y), `size` across, in the current fill style. */
export function drawGlyph(ctx, glyph, x, y, size) {
  const path = pathFor(glyph)
  if (!path) return
  const scale = size / 24
  ctx.save()
  ctx.translate(x - size / 2, y - size / 2)
  ctx.scale(scale, scale)
  ctx.fill(path)
  ctx.restore()
}
