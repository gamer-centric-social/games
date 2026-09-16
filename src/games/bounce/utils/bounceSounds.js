import {
  playBounceCheckpointSound,
  playBounceColorSound,
  playBounceEscapeSound,
  playBounceFaultSound,
  playBounceGateSound,
  playBounceIrisSound,
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
  [EVENTS.ENTERED_CHAMBER]: playBounceIrisSound,
}

/**
 * Leaving a chamber is not the same event as clearing a ring, even though the
 * engine reports both as a gate cleared: one is a beat in a rhythm, the other is
 * the end of a room you may have spent ten seconds reading. It gets its own
 * sound, chosen from the event's `kind`.
 */
const pick = (event) =>
  event.type === EVENTS.GATE_CLEARED && event.kind === 'chamber-exit'
    ? playBounceEscapeSound
    : SOUND[event.type]

/**
 * A step can clear several gates at once when the frame was long. Play each kind
 * once, or a stutter arrives as a chord.
 */
export function playBounceEvents(events) {
  const played = new Set()
  for (const event of events) {
    const sound = pick(event)
    if (!sound || played.has(sound)) continue
    played.add(sound)
    sound()
  }
}
