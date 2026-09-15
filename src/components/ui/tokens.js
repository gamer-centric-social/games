/**
 * The lookup tables the ui/ primitives share.
 *
 * These exist as objects rather than template strings because Tailwind scans
 * source text for complete class names -- a `bg-${tone}` built at runtime is
 * never generated. Every class the app can render has to appear here literally.
 */

export const LIFT = {
  0: 'shadow-lift-0',
  1: 'shadow-lift-1',
  2: 'shadow-lift-2',
  3: 'shadow-lift-3',
}

export const RADIUS = {
  well: 'rounded-well',
  object: 'rounded-object',
  slab: 'rounded-slab',
  full: 'rounded-full',
}

export const WIDTH = {
  xs: 'max-w-xs',
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
}

/** Solid fills. Always dark ink on the colour -- the table is lit from above. */
export const TONE_FILL = {
  lamp: 'bg-lamp text-table',
  imposter: 'bg-imposter text-table',
  uno: 'bg-uno text-table',
  tank: 'bg-tank text-table',
  dice: 'bg-dice text-table',
  bounce: 'bg-bounce text-table',
  ok: 'bg-ok text-table',
  danger: 'bg-danger text-table',
  turn: 'bg-turn text-table',
  'team-blue': 'bg-team-blue text-table',
  'team-red': 'bg-team-red text-table',
}

/** Tinted washes, for pills and selected states. */
export const TONE_WASH = {
  neutral: 'bg-felt-high border-edge-lit text-ink-muted',
  lamp: 'bg-lamp/10 border-lamp/30 text-lamp',
  imposter: 'bg-imposter/10 border-imposter/30 text-imposter',
  uno: 'bg-uno/10 border-uno/30 text-uno',
  tank: 'bg-tank/10 border-tank/30 text-tank',
  dice: 'bg-dice/10 border-dice/30 text-dice',
  bounce: 'bg-bounce/10 border-bounce/30 text-bounce',
  ok: 'bg-ok/10 border-ok/30 text-ok',
  danger: 'bg-danger/10 border-danger/30 text-danger',
  turn: 'bg-turn/10 border-turn/30 text-turn',
  'team-blue': 'bg-team-blue/10 border-team-blue/30 text-team-blue',
  'team-red': 'bg-team-red/10 border-team-red/30 text-team-red',
}

/** Text-only accents. */
export const TONE_TEXT = {
  neutral: 'text-ink-muted',
  lamp: 'text-lamp',
  imposter: 'text-imposter',
  uno: 'text-uno',
  tank: 'text-tank',
  dice: 'text-dice',
  bounce: 'text-bounce',
  ok: 'text-ok',
  danger: 'text-danger',
  turn: 'text-turn',
  'team-blue': 'text-team-blue',
  'team-red': 'text-team-red',
}

/** An edge lit in the game's ink -- the selected avatar in a lobby. */
export const TONE_BORDER = {
  lamp: 'border-lamp',
  imposter: 'border-imposter',
  uno: 'border-uno',
  tank: 'border-tank',
  dice: 'border-dice',
  bounce: 'border-bounce',
}

/** Focus ring, offset so it clears a lifted surface. */
export const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lamp/70'

/** The one press gesture in the app: the object is pushed into the table. */
export const PRESS = 'active:scale-[0.98] active:shadow-lift-0'

export const cx = (...parts) => parts.filter(Boolean).join(' ')
