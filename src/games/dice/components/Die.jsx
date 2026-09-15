import React from 'react'
import { cx } from '../../../components/ui/tokens'

/** Pip centres on a 100x100 face. */
const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
}

const SIZE = {
  sm: 'w-6 h-6',
  md: 'w-9 h-9',
  lg: 'w-11 h-11',
}

/**
 * An ivory die resting on the table.
 *
 * `lit` lifts it toward the lamp and rings it in the dice ink: it counts toward
 * the bid. `dim` lays a shadow over it. It is never faded with opacity -- a
 * translucent die reads as a ghost, not as one that does not count.
 */
function Die({ face, size = 'md', lit = false, dim = false, className = '' }) {
  return (
    <span
      role="img"
      aria-label={String(face)}
      className={cx(
        'relative inline-flex shrink-0 rounded-well bg-ink text-table transition-transform duration-200',
        SIZE[size],
        lit ? 'shadow-lift-2 -translate-y-1 ring-2 ring-dice' : 'shadow-lift-1',
        className
      )}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
        {(PIPS[face] ?? []).map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="9" fill="currentColor" />
        ))}
      </svg>
      {dim && <span className="absolute inset-0 rounded-well bg-table/55" aria-hidden="true" />}
    </span>
  )
}

export default React.memo(Die)
