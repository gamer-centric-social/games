// Web Audio API Sound Effects Generator
// Provides tactile, latency-free synthesized sounds for mobile gameplay

let audioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

// Global sound mute state
let soundEnabled = true

export function setSoundEnabled(enabled) {
  soundEnabled = enabled
  try {
    localStorage.setItem('imposter_sound_enabled', enabled ? 'true' : 'false')
  } catch {
    // ignore
  }
}

export function isSoundEnabled() {
  try {
    const saved = localStorage.getItem('imposter_sound_enabled')
    if (saved !== null) {
      soundEnabled = saved === 'true'
    }
  } catch {
    // ignore
  }
  return soundEnabled
}

// Light click sound for buttons
export function playClickSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(600, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.05)

  gain.gain.setValueAtTime(0.15, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start()
  osc.stop(ctx.currentTime + 0.05)
}

// Card flip swoosh
export function playCardFlipSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'triangle'
  osc.frequency.setValueAtTime(220, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(580, ctx.currentTime + 0.12)

  gain.gain.setValueAtTime(0.2, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.14)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start()
  osc.stop(ctx.currentTime + 0.14)
}

// Tension reveal sound when card is viewed
export function playRevealSound(isImposter = false) {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc1 = ctx.createOscillator()
  const osc2 = ctx.createOscillator()
  const gain = ctx.createGain()

  if (isImposter) {
    // Low dramatic drone
    osc1.type = 'sawtooth'
    osc2.type = 'sine'
    osc1.frequency.setValueAtTime(140, now)
    osc1.frequency.exponentialRampToValueAtTime(110, now + 0.3)
    osc2.frequency.setValueAtTime(70, now)

    gain.gain.setValueAtTime(0.25, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4)
  } else {
    // Bright chime
    osc1.type = 'sine'
    osc2.type = 'sine'
    osc1.frequency.setValueAtTime(523.25, now) // C5
    osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.1) // E5
    osc2.frequency.setValueAtTime(783.99, now + 0.1) // G5

    gain.gain.setValueAtTime(0.18, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
  }

  osc1.connect(gain)
  osc2.connect(gain)
  gain.connect(ctx.destination)

  osc1.start(now)
  osc2.start(now)
  osc1.stop(now + 0.4)
  osc2.stop(now + 0.4)
}

// Timer tick sound
export function playTickSound(isUrgent = false) {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = isUrgent ? 'sawtooth' : 'sine'
  osc.frequency.setValueAtTime(isUrgent ? 880 : 440, ctx.currentTime)

  gain.gain.setValueAtTime(isUrgent ? 0.2 : 0.08, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start()
  osc.stop(ctx.currentTime + 0.06)
}

// Victory fanfare
export function playVictorySound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const notes = [440, 554.37, 659.25, 880] // A major arpeggio
  const now = ctx.currentTime

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now + idx * 0.1)

    gain.gain.setValueAtTime(0.2, now + idx * 0.1)
    gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.1 + 0.25)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now + idx * 0.1)
    osc.stop(now + idx * 0.1 + 0.25)
  })
}

// Uno: Card play snap
export function playCardPlaySound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(400, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.07)

  gain.gain.setValueAtTime(0.2, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.07)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start()
  osc.stop(ctx.currentTime + 0.07)
}

// Uno: Card draw swoosh
export function playCardDrawSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'triangle'
  osc.frequency.setValueAtTime(240, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(360, ctx.currentTime + 0.09)

  gain.gain.setValueAtTime(0.12, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.09)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start()
  osc.stop(ctx.currentTime + 0.09)
}

// Uno: Action card effect (Reverse, Skip, +2, +4)
export function playActionCardSound(isPenalty = false) {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = isPenalty ? 'sawtooth' : 'triangle'
  if (isPenalty) {
    osc.frequency.setValueAtTime(350, now)
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.18)
  } else {
    osc.frequency.setValueAtTime(300, now)
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.12)
  }

  gain.gain.setValueAtTime(0.18, now)
  gain.gain.exponentialRampToValueAtTime(0.01, now + (isPenalty ? 0.2 : 0.14))

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + (isPenalty ? 0.2 : 0.14))
}

// Uno: Dramatic UNO shout chime
export function playUnoCallSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const freqs = [523.25, 659.25, 1046.5] // C5, E5, C6
  freqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now + idx * 0.08)

    gain.gain.setValueAtTime(0.22, now + idx * 0.08)
    gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.25)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now + idx * 0.08)
    osc.stop(now + idx * 0.08 + 0.25)
  })
}

// Tank Arena: Cannon fire blast
export function playTankShootSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime

  // Oscillator punch
  const osc = ctx.createOscillator()
  const oscGain = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(220, now)
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.12)
  oscGain.gain.setValueAtTime(0.3, now)
  oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12)
  osc.connect(oscGain)
  oscGain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.12)

  // White noise burst
  const bufferSize = Math.floor(ctx.sampleRate * 0.15)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }

  const noise = ctx.createBufferSource()
  noise.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(800, now)
  filter.frequency.linearRampToValueAtTime(100, now + 0.15)

  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.35, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15)

  noise.connect(filter)
  filter.connect(noiseGain)
  noiseGain.connect(ctx.destination)

  noise.start(now)
  noise.stop(now + 0.15)
}

// Tank Arena: Metallic ricochet clink
export function playTankRicochetSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(1400, now)
  osc.frequency.exponentialRampToValueAtTime(2800, now + 0.04)
  osc.frequency.exponentialRampToValueAtTime(1800, now + 0.1)

  gain.gain.setValueAtTime(0.25, now)
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.12)
}

// Tank Arena: Tank destruction / heavy explosion
export function playTankExplosionSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime

  // Sub bass boom
  const osc = ctx.createOscillator()
  const oscGain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(120, now)
  osc.frequency.exponentialRampToValueAtTime(25, now + 0.45)
  oscGain.gain.setValueAtTime(0.4, now)
  oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5)
  osc.connect(oscGain)
  oscGain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.5)

  // Long rumble noise
  const bufferSize = Math.floor(ctx.sampleRate * 0.4)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }

  const noise = ctx.createBufferSource()
  noise.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(600, now)
  filter.frequency.linearRampToValueAtTime(40, now + 0.4)

  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.4, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4)

  noise.connect(filter)
  filter.connect(noiseGain)
  noiseGain.connect(ctx.destination)

  noise.start(now)
  noise.stop(now + 0.4)
}

// Tank Arena: Fuel barrel explosion
export function playBarrelExplosionSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(300, now)
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.25)

  gain.gain.setValueAtTime(0.35, now)
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.28)
}

// Tank Arena: Crate pickup / Powerup chime
export function playCratePickupSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const freqs = [392, 523.25, 659.25, 783.99] // G4, C5, E5, G5
  freqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now + idx * 0.05)

    gain.gain.setValueAtTime(0.18, now + idx * 0.05)
    gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.05 + 0.15)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now + idx * 0.05)
    osc.stop(now + idx * 0.05 + 0.15)
  })
}

// Tank Arena: Tactical radar ping
export function playRadarPingSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, now)
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08)

  gain.gain.setValueAtTime(0.2, now)
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.2)
}


// Liar's Dice: dice rattling in a cup -- a burst of short, bright clicks
export function playDiceShakeSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  for (let i = 0; i < 6; i++) {
    const t = ctx.currentTime + i * 0.045
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(900 + Math.random() * 700, t)
    gain.gain.setValueAtTime(0.05, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.03)
  }
}

// Liar's Dice: every cup lifts at once
export function playCupLiftSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(180, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.18)
  gain.gain.setValueAtTime(0.18, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.2)
}

// Liar's Dice: a die taken off the table
export function playDieLostSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(330, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.25)
  gain.gain.setValueAtTime(0.2, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.28)
}


// Bounce: the tap that lifts the ball -- short and dry, because you make this
// one several times a second and anything with a tail turns into mud
export function playBounceTapSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(420, now)
  osc.frequency.exponentialRampToValueAtTime(760, now + 0.06)
  gain.gain.setValueAtTime(0.09, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.08)
}

// Bounce: through a gate on the right colour
export function playBounceGateSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(880, now)
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.09)
  gain.gain.setValueAtTime(0.1, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.13)
}

// Bounce: the ball takes a new colour
export function playBounceColorSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  for (let i = 0; i < 2; i++) {
    const t = now + i * 0.06
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(i === 0 ? 660 : 990, t)
    gain.gain.setValueAtTime(0.09, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.1)
  }
}

// Bounce: a checkpoint banked, so the next mistake costs less
export function playBounceCheckpointSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(520, now)
  osc.frequency.exponentialRampToValueAtTime(780, now + 0.14)
  gain.gain.setValueAtTime(0.14, now)
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.23)
}

// Bounce: the wrong arc -- the long way back down
export function playBounceFaultSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(300, now)
  osc.frequency.exponentialRampToValueAtTime(90, now + 0.4)
  gain.gain.setValueAtTime(0.16, now)
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.42)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.43)
}
