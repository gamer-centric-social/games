import {
  playClickSound,
  playDiceShakeSound,
  playCupLiftSound,
  playDieLostSound,
  playVictorySound,
} from '../../../utils/sound'

const SOUND_FOR = {
  ROLLED: playDiceShakeSound,
  BID: playClickSound,
  REVEAL: playCupLiftSound,
  GAME_OVER: playVictorySound,
}

/** How long after the cups lift the lost die is heard, so the two do not collide. */
const DIE_LOST_DELAY_MS = 700

/** Engine events (or events recovered by eventsBetween) -> sound. Each sound plays once per batch. */
export function playDiceEvents(events) {
  const played = new Set()
  for (const event of events) {
    if (event.type === 'DIE_LOST') {
      setTimeout(playDieLostSound, DIE_LOST_DELAY_MS)
      continue
    }
    const play = SOUND_FOR[event.type]
    if (play && !played.has(play)) {
      played.add(play)
      play()
    }
  }
}
