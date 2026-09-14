/**
 * Randomness is injected into the engine so tests can roll fixed dice.
 * A real game uses cryptoRng; tests use createSeededRng.
 */

export function cryptoRng() {
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return buf[0] / 4294967296
}

/** mulberry32 -- tiny, fast, good enough for tests and bot noise. */
export function createSeededRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const rollDie = (rng) => 1 + Math.floor(rng() * 6)
