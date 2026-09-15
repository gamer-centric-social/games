/**
 * Bounce constants: the physics, the four colours, and the wire protocol.
 *
 * World units: y grows upward from 0 at the start line to COURSE_HEIGHT at the
 * finish. The ball's x never changes -- it sits on the shaft's centre line, which
 * is what makes one-tap control honest. Speeds are per second, not per tick: the
 * engine is stepped at a fixed dt, so nothing here is coupled to a frame rate.
 */

// --- the shaft ---------------------------------------------------------------

export const SHAFT_WIDTH = 600
/** How much of the shaft the camera shows. The ball rides low in it, looking up. */
export const VIEW_HEIGHT = 1000
export const BALL_RADIUS = 26
export const COURSE_HEIGHT = 24000
export const CHECKPOINT_SPAN = 3000
/** Five difficulty bands; rotation speeds up and gaps tighten as you climb. */
export const BAND_COUNT = 5

// --- physics -----------------------------------------------------------------

export const GRAVITY = 2400
/**
 * A tap SETS vertical speed rather than adding to it, so spamming cannot rocket
 * you. This is also the hard ceiling on how fast anyone can climb, which is what
 * the host validates a reported height against.
 */
export const TAP_IMPULSE = 900
export const TERMINAL_FALL = 1400
/** One physics step. A 120Hz phone and a 60Hz phone must play the same game. */
export const FIXED_DT = 1 / 120
/** Longest real frame the accumulator will honour, so a backgrounded tab resumes
 *  where it left off instead of teleporting. */
export const MAX_FRAME_SECONDS = 0.25

// --- the four colours --------------------------------------------------------

/**
 * Mirrored from the --color-bounce-* tokens in src/index.css. Canvas cannot read a
 * custom property back, so the hex lives here too and the two must stay in step --
 * the same rule UNO's COLOR_CONFIG follows.
 *
 * `glyph` is the shape drawn on the ball and on the matching arc. Colour is never
 * the only signal: a wrong read here costs you the race, so the game has to be
 * playable in greyscale.
 */
export const COLOR_CONFIG = {
  blue: { hex: '#5b6cff', name: 'Blue', glyph: 'disc' },
  pink: { hex: '#ff5ea8', name: 'Pink', glyph: 'ring' },
  turq: { hex: '#22d3a5', name: 'Turquoise', glyph: 'chevron' },
  gold: { hex: '#ffe14d', name: 'Gold', glyph: 'diamond' },
}

export const COLORS = ['blue', 'pink', 'turq', 'gold']
export const START_COLOR = 'blue'

// --- obstacles ---------------------------------------------------------------

/**
 * A ring is crossed once, at the bottom of its circle: enter through the arc that
 * matches your colour and you are through. Every ring carries all four colours, so
 * whatever colour you are holding, waiting for it to come round always works --
 * the course is solvable from any state, and difficulty comes from the window
 * getting narrower, never from luck.
 */
export const RING_RADIUS = { min: 110, max: 150 }
export const RING_STROKE = 34
/** Rotation, radians per second, at the first and last band. */
export const RING_OMEGA = { start: 0.55, end: 1.6 }
/** A slider is a band of four colours sweeping sideways, crossed once. */
export const SLIDER_SEGMENT = 220
export const SLIDER_HEIGHT = 30
export const SLIDER_SPEED = { start: 110, end: 260 }
/** Vertical gap between obstacles at the first and last band. */
export const OBSTACLE_GAP = { start: 820, end: 560 }
export const SWATCH_RADIUS = 30

// --- race validation ---------------------------------------------------------

/** Nobody can rise faster than the tap impulse. Reports above this are refused. */
export const MAX_CLIMB_RATE = TAP_IMPULSE
/** Slack for jitter and a late packet, so honest play is never flagged. */
export const CLIMB_TOLERANCE = 1.2
export const CLIMB_ALLOWANCE = 400
/** The fastest the course can physically be run; a finish sooner is refused. */
export const MIN_FINISH_MS = Math.floor((COURSE_HEIGHT / MAX_CLIMB_RATE) * 1000)
/** How often a client tells the host where it is. */
export const PROGRESS_INTERVAL_MS = 200
/**
 * A finish is only believed on the back of a live climb. Generous next to the
 * 200ms report interval, so a lagging player is never robbed of their finish,
 * but tight enough that a silent client cannot simply claim the line.
 */
export const STALE_REPORT_MS = 5000
/** A refused finish is retried at this interval until the host acknowledges it. */
export const FINISH_RETRY_MS = 600

// --- room --------------------------------------------------------------------

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
export const PROTOCOL_VERSION = 1
export const PEER_PREFIX = 'party-arcade-bounce-v1-'
export const SESSION_KEY = 'bounce_session_id'
export const STORAGE_PREFIX = 'bounce'
export const BEST_TIME_KEY = 'bounce_best_ms'

/** Every message type Bounce puts on the wire (JOIN / PING / PONG live in roomNetwork). */
export const MSG = {
  WELCOME: 'WELCOME',
  ROOM_ERROR: 'ROOM_ERROR',
  SYNC_RACE_STATE: 'SYNC_RACE_STATE',
  ACTION_REJECTED: 'ACTION_REJECTED',
  ACTION_PROGRESS: 'ACTION_PROGRESS',
  ACTION_FINISH: 'ACTION_FINISH',
  ACTION_REQUEST_SYNC: 'ACTION_REQUEST_SYNC',
  ACTION_LEAVE: 'ACTION_LEAVE',
}
