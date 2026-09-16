import React from 'react'
import { COLOR_CONFIG } from '../constants/bounceConstants'
import { GLYPH_PATH } from '../utils/colorGlyphs'

/**
 * A colour's shape, for the places the canvas cannot reach: the HUD, the rules,
 * the results. Same paths the canvas stamps on the arcs, so what you learn on
 * one screen reads on the other.
 */
export default function BounceGlyph({ color, size = 18, className = '', title }) {
  const config = COLOR_CONFIG[color]
  if (!config) return null
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      <path d={GLYPH_PATH[config.glyph]} fill={config.hex} />
    </svg>
  )
}
