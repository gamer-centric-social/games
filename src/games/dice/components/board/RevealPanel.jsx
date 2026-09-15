import React, { useEffect, useState } from 'react'
import Die from '../Die'
import Label from '../../../../components/ui/Label'
import { bidWords, nameOf } from '../../utils/narration'
import { cx } from '../../../../components/ui/tokens'

/** Time between counted dice while the total ticks up. */
const TICK_MS = 180

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * The cups lift. Every die on the table is shown, the ones that count are lit,
 * and the total ticks up to the verdict. With reduced motion the total simply
 * appears. The parent keys this on the round, so the count restarts per reveal.
 */
export default function RevealPanel({ view }) {
  const { reveal } = view
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? reveal.count : 0))

  useEffect(() => {
    if (shown >= reveal.count) return undefined
    const timer = setTimeout(() => setShown((n) => n + 1), TICK_MS)
    return () => clearTimeout(timer)
  }, [shown, reveal.count])

  const counts = (die) => die === reveal.bid.face || (reveal.wild && die === 1)
  const finished = shown >= reveal.count
  const met = reveal.count >= reveal.bid.quantity

  let verdict
  if (reveal.loserId !== null) verdict = `${nameOf(view, reveal.loserId)} −1 die`
  else if (reveal.gainerId !== null) verdict = `${nameOf(view, reveal.gainerId)} +1 die`
  else verdict = 'Spot on'

  return (
    <div className="relative z-10 space-y-3">
      <div className="text-center space-y-1">
        <div className="font-mono text-5xl text-ink leading-none">{shown}</div>
        <Label>
          {reveal.bid.face}s on the table · bid was {bidWords(reveal.bid)}
        </Label>
        {/* Fixed height, so the dice below do not jump when the verdict lands. */}
        <p
          className={cx(
            'h-5 text-mini font-bold',
            reveal.loserId === view.yourId ? 'text-danger' : met ? 'text-ok' : 'text-turn'
          )}
        >
          {finished ? verdict : ''}
        </p>
      </div>

      <ul className="space-y-1.5">
        {view.seats
          .filter((seat) => (reveal.dice[seat.id] ?? []).length > 0)
          .map((seat) => (
            <li
              key={seat.id}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-object bg-felt border border-edge shadow-lift-1"
            >
              <span className="w-16 shrink-0 truncate text-nano font-bold text-ink-muted">
                {seat.id === view.yourId ? 'You' : seat.name}
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                {reveal.dice[seat.id].map((die, i) => (
                  <Die key={i} face={die} size="sm" lit={counts(die)} dim={!counts(die)} />
                ))}
              </span>
            </li>
          ))}
      </ul>
    </div>
  )
}
