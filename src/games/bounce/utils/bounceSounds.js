import {
  playBounceCheckpointSound,
  playBounceColorSound,
  playBounceFaultSound,
  playBounceGateSound,
  playBounceTapSound,
  playVictorySound,
} from '../../../utils/sound'
import { EVENTS } from '../engine/bounceEngine'

/**
 * Engine events to sound. Kept out of the engine so the engine stays pure, and
 * out of the components so a screen never has to know what a climb sounds like.
 */
const SOUND = {
  [EVENTS.TAP]: playBounceTapSound,
  [EVENTS.GATE_CLEARED]: playBounceGateSound,
  [EVENTS.COLOR_CHANGED]: playBounceColorSound,
  [EVENTS.CHECKPOINT]: playBounceCheckpointSound,
  [EVENTS.WRONG_COLOR]: playBounceFaultSound,
  [EVENTS.FINISHED]: playVictorySound,
}

/**
 * A step can clear several gates at once when the frame was long. Play each kind
 * once, or a stutter arrives as a chord.
 */
export function playBounceEvents(events) {
  const played = new Set()
  for (const event of events) {
    if (played.has(event.type)) continue
    played.add(event.type)
    SOUND[event.type]?.()
  }
}
