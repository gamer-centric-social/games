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
/**
 * Shorter than it was. A chamber is a deliberate pause in the climb, so the same
 * wall-clock race -- 70 to 90 seconds -- now covers less shaft.
 */
export const COURSE_HEIGHT = 18000
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
/** How far one tap lifts you from rest. Every chamber is measured against it. */
export const TAP_APEX = (TAP_IMPULSE * TAP_IMPULSE) / (2 * GRAVITY)

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

// --- gates -------------------------------------------------------------------

/**
 * Every gate is one idea: a height, and a function from time to the colour
 * covering the crossing point. The kinds below differ only in that function --
 * new rhythms, never new physics. engine/gates.js is where they are written
 * down, once, for the engine and the renderer both.
 *
 * Every gate carries all four colours, so whatever colour you are holding,
 * waiting for it to come round always works. Difficulty is a narrower window,
 * never a dead end.
 */
export const RING_STROKE = 34

/**
 * The narrowest slot any gate may ever give a colour. Below roughly this, timing
 * stops being a skill and becomes a coin flip -- so the generator is held to it,
 * and courseGen.test.js checks every gate on every seed.
 */
export const MIN_GATE_WINDOW_SECONDS = 0.45
/** The thinnest slice an iris ring may cut, as a fraction of the full circle. */
export const MIN_ARC_SPAN = 0.13

/** A plain ring: steady rotation. The metronome that teaches the rule. */
export const RING_RADIUS = { min: 110, max: 150 }
/** Rotation, radians per second, at the first and last band. */
export const RING_OMEGA = { start: 0.55, end: 1.5 }

/**
 * A pendulum swings instead of turning: long windows at the ends of the swing,
 * a fast sweep through the middle.
 *
 * The amplitude is not a taste decision. A swing covers 2 * amp radians, so
 * anything under PI leaves an arc that never reaches the crossing point at all --
 * and a ball holding that colour would wait at that gate forever. Every gate
 * carries all four colours precisely so that waiting always works; an oscillating
 * gate has to actually sweep them all for that to mean anything.
 */
export const PENDULUM_AMP = { start: 3.3, end: 3.9 }
export const PENDULUM_OMEGA = { start: 0.55, end: 0.8 }

/** A ratchet snaps a quarter turn and then holds. You wait for the click. */
export const RATCHET_PERIOD = { start: 1.15, end: 0.8 }
/** Fraction of each period spent turning; the rest of it is the window. */
export const RATCHET_DWELL = 0.22

/** A slider is a band of four colours sweeping sideways, crossed once. */
export const SLIDER_SEGMENT = 220
export const SLIDER_HEIGHT = 30
export const SLIDER_SPEED = { start: 110, end: 250 }

/**
 * A shutter is a slider that eases to a stop and sweeps back the other way.
 *
 * Same trap as the pendulum, in the lateral direction: the colours repeat every
 * SLIDER_SEGMENT * 4, so a sweep narrower than half of that never brings some of
 * them over the centre line, and the ball holding one of those is stuck. The
 * amplitude floor is 440, and every value here clears it.
 */
export const SHUTTER_AMP = { start: 470, end: 560 }
export const SHUTTER_OMEGA = { start: 0.5, end: 0.72 }

export const SWATCH_RADIUS = 30

// --- the chamber -------------------------------------------------------------

/**
 * A chamber is a ring you climb into and are held inside. The floor irises shut
 * behind you; the only way out is up through the ceiling arc, and hitting that on
 * the wrong colour is a fault back to the checkpoint -- the same penalty a ring
 * carries, at a much bigger moment.
 *
 * That penalty is only fair if you can never hit the ceiling by accident, so it
 * is the geometry that is constrained rather than the rule: a chamber's clear
 * interior travel must exceed two tap apexes, which means no single tap, from the
 * floor or from the core, can ever reach the ceiling. The last tap is always a
 * decision.
 *
 *     travel = 2 * (radius - RING_STROKE / 2) - 2 * BALL_RADIUS
 *     at radius 225:  2 * 208 - 52 = 364  >  2 * 168.75 = 337.5
 *
 * courseGen.test.js asserts it for every chamber on every seed.
 */
export const CHAMBER_RADIUS = { min: 225, max: 265 }
export const CHAMBER_OMEGA = { start: 0.5, end: 1.0 }
export const MIN_CHAMBER_TRAVEL = 2 * TAP_APEX

/**
 * The cycling core: a disc inside the chamber that steps through the four colours
 * and paints the ball whatever it is showing, for as long as the ball overlaps
 * it. Hovering in it and waiting is the intended strategy, not an exploit.
 *
 * It sits below the chamber's centre so it is one tap up from the floor and still
 * two taps clear of the ceiling. That leaves a holding zone above it where you
 * can keep a colour while you read the turn.
 */
export const CORE_RADIUS = 34
export const CORE_PERIOD = { start: 1.1, end: 0.8 }
/** Where the core sits, as a fraction of the radius below the chamber's centre. */
export const CORE_OFFSET = -0.4

// --- the course --------------------------------------------------------------

/** A run-in at the bottom, so the first gate is not in your face at the start. */
export const FIRST_OBSTACLE_Y = 700
/** Leave the last stretch clear, so the finish is a run-in and not a gate. */
export const FINISH_RUN_IN = 900
/** Vertical gap between obstacles inside a segment, at the first and last band. */
export const OBSTACLE_GAP = { start: 820, end: 560 }
/**
 * The shortest a segment may be, and so the closest two checkpoints can ever sit.
 * Checkpoints land on segment seams rather than on a fixed grid, so the host can
 * no longer derive an exact index from a height -- but it can still bound one,
 * which is all the validation in raceState.js ever needed.
 */
export const MIN_CHECKPOINT_SPAN = 900

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
/**
 * 2: chambers, the gate family, and courses built from segments. A v1 client fed
 * a v2 seed builds a course nobody else has and then desyncs in silence,
 * reporting heights against geometry that exists for no one but itself. This is
 * exactly the case the version check in services/bounceHost.js is for.
 */
export const PROTOCOL_VERSION = 2
export const PEER_PREFIX = 'party-arcade-bounce-v1-'
export const SESSION_KEY = 'bounce_session_id'
export const STORAGE_PREFIX = 'bounce'
/** v2: a time set on the old, longer course means nothing against this one. */
export const BEST_TIME_KEY = 'bounce_best_ms_v2'

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
