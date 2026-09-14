/** Liar's Dice constants. Perudo rules; see docs/superpowers/specs/2026-09-14-liars-dice-design.md. */

export const MAX_DICE = 5
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
/** Exact is only allowed while at least this many players still have dice. */
export const EXACT_MIN_PLAYERS = 3
/** Palifico only triggers if at least this many players are still in after the loss. */
export const PALIFICO_MIN_PLAYERS = 3

export const TIMING = {
  revealMs: 4000,
  botThinkMs: 1200,
  disconnectTurnMs: 12000,
  lastPlayerMs: 15000,
}

export const PROTOCOL_VERSION = 1
export const PEER_PREFIX = 'party-arcade-dice-v1-'
export const SESSION_KEY = 'dice_session_id'
export const STORAGE_PREFIX = 'dice'
export const ACTIVE_ROOM_KEY = 'dice_active_room'

/** Every message type Dice puts on the wire (JOIN / PING / PONG live in roomNetwork). */
export const MSG = {
  WELCOME: 'WELCOME',
  ROOM_ERROR: 'ROOM_ERROR',
  SYNC_GAME_STATE: 'SYNC_GAME_STATE',
  ACTION_REJECTED: 'ACTION_REJECTED',
  ACTION_BID: 'ACTION_BID',
  ACTION_LIAR: 'ACTION_LIAR',
  ACTION_EXACT: 'ACTION_EXACT',
  ACTION_REQUEST_SYNC: 'ACTION_REQUEST_SYNC',
  ACTION_LEAVE: 'ACTION_LEAVE',
}

export const BOT_PRESETS = [
  { name: 'Gizmo', avatar: '🤖' },
  { name: 'Blaze', avatar: '🦊' },
  { name: 'Echo', avatar: '🐼' },
  { name: 'Nova', avatar: '🦉' },
  { name: 'Rook', avatar: '🐺' },
]
