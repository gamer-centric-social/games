/** Climb times, wherever they are shown: HUD, rail tooltip, results. */
export function formatSeconds(seconds) {
  if (!Number.isFinite(seconds)) return '0:00.0'
  const whole = Math.max(0, seconds)
  const minutes = Math.floor(whole / 60)
  const rest = (whole % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${rest}`
}

export const formatMs = (ms) => (Number.isFinite(ms) ? formatSeconds(ms / 1000) : '—')
