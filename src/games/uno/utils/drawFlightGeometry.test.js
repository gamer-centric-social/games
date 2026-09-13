import { describe, it, expect } from 'vitest'
import { computeFlightPath } from './drawFlightGeometry'

const rect = (left, top, width = 72, height = 96) => ({ left, top, width, height })
const VIEW = { viewportWidth: 1000, viewportHeight: 800 }

describe('computeFlightPath - origin', () => {
  it('starts at the centre of the draw pile, offset by half a card', () => {
    const { startX, startY } = computeFlightPath({
      drawRect: rect(400, 300), trayRect: rect(0, 700), count: 1, ...VIEW,
    })
    expect(startX).toBe(400 + 36 - 36)
    expect(startY).toBe(300 + 48 - 48)
  })

  it('falls back to the viewport centre when the pile has no rect yet', () => {
    const { startX, startY } = computeFlightPath({
      drawRect: null, trayRect: null, count: 1, ...VIEW,
    })
    expect(startX).toBe(500 - 36)
    expect(startY).toBe(400 - 48)
  })
})

describe('computeFlightPath - targets', () => {
  it('produces one target per drawn card', () => {
    const { targets } = computeFlightPath({
      drawRect: rect(400, 300), trayRect: rect(0, 700), count: 4, ...VIEW,
    })
    expect(targets).toHaveLength(4)
  })

  it('spaces cards 48px apart from the tray inset', () => {
    const { targets } = computeFlightPath({
      drawRect: rect(400, 300), trayRect: rect(100, 700), count: 3, ...VIEW,
    })
    expect(targets.map((t) => t.x)).toEqual([112, 160, 208])
  })

  it('lands every card on the tray top', () => {
    const { targets } = computeFlightPath({
      drawRect: rect(400, 300), trayRect: rect(100, 700), count: 3, ...VIEW,
    })
    expect(targets.every((t) => t.y === 704)).toBe(true)
  })

  it('clamps a long draw so late cards stay on screen', () => {
    // A +4 stack against a narrow viewport is the case this exists for.
    const { targets } = computeFlightPath({
      drawRect: rect(100, 100), trayRect: rect(0, 500), count: 10,
      viewportWidth: 400, viewportHeight: 800,
    })
    expect(targets.every((t) => t.x <= 400 - 85)).toBe(true)
    expect(targets[9].x).toBe(315)
  })

  it('uses the fallback tray position when the tray has no rect', () => {
    const { targets } = computeFlightPath({
      drawRect: rect(400, 300), trayRect: null, count: 2, ...VIEW,
    })
    expect(targets.map((t) => t.x)).toEqual([20, 68])
    expect(targets.every((t) => t.y === 800 - 130)).toBe(true)
  })

  it('returns no targets for a zero-card draw', () => {
    const { targets } = computeFlightPath({
      drawRect: rect(400, 300), trayRect: rect(0, 700), count: 0, ...VIEW,
    })
    expect(targets).toEqual([])
  })

  describe('spacing', () => {
    // The tray shingles its cards, so how far apart they land depends on how
    // many are in the hand. It measures that and passes it in.
    it('lands cards on the spacing the tray reports', () => {
      const { targets } = computeFlightPath({
        drawRect: rect(400, 300), trayRect: rect(0, 700), count: 3, ...VIEW, spacing: 30,
      })
      expect(targets.map((t) => t.x)).toEqual([12, 42, 72])
    })

    it('falls back to the default whenever the tray has not measured yet', () => {
      const unmeasured = [undefined, null, 0, -20, NaN]
      for (const spacing of unmeasured) {
        const { targets } = computeFlightPath({
          drawRect: rect(400, 300), trayRect: rect(0, 700), count: 2, ...VIEW, spacing,
        })
        expect(targets.map((t) => t.x)).toEqual([12, 60])
      }
    })

    // A sorted hand puts a drawn card wherever its colour or number belongs, which
    // is not where an even spread from the left edge would have aimed.
    it('lands a card on its real slot when the tray knows where that is', () => {
      const { targets } = computeFlightPath({
        drawRect: rect(400, 300), trayRect: rect(0, 700), count: 2, ...VIEW,
        spacing: 30, landingXs: [180, 240],
      })
      expect(targets.map((t) => t.x)).toEqual([180, 240])
    })

    it('fills in the even spread for any card the tray could not place', () => {
      const { targets } = computeFlightPath({
        drawRect: rect(400, 300), trayRect: rect(0, 700), count: 3, ...VIEW,
        spacing: 30, landingXs: [180, undefined],
      })
      expect(targets.map((t) => t.x)).toEqual([180, 42, 72])
    })

    it('still keeps a known slot inside the viewport', () => {
      const { targets } = computeFlightPath({
        drawRect: rect(400, 300), trayRect: rect(0, 700), count: 1, ...VIEW,
        landingXs: [9999],
      })
      expect(targets[0].x).toBe(VIEW.viewportWidth - 85)
    })
  })
})
