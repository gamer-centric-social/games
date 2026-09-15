import React from 'react'
import { describeTable } from '../../utils/narration'
import { cx } from '../../../../components/ui/tokens'

const TONE = {
  quiet: 'text-ink-muted',
  turn: 'text-turn font-bold',
  bad: 'text-danger font-bold',
  good: 'text-ok font-bold',
}

/**
 * One fixed-height line for what is happening right now. It is also the live
 * region: the light on the active seat and the lifted dice reach no screen
 * reader, so describeTable says all of it in words. A refused action (`notice`)
 * takes the line until the next change.
 */
function DiceStatusLine({ view, notice }) {
  const { text, tone } = notice ? { text: notice, tone: 'bad' } : describeTable(view)

  return (
    <div role="status" aria-live="polite" className="relative z-10 h-9 flex items-center justify-center px-4">
      {text && <p className={cx('text-center text-mini leading-tight', TONE[tone])}>{text}</p>}
    </div>
  )
}

export default React.memo(DiceStatusLine)
