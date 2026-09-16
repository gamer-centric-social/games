import React from 'react'
import Die from '../Die'
import Label from '../../../../components/ui/Label'
import { countMatches, onesAreWild } from '../../engine/bidRules'

/**
 * Your dice, under the lamp.
 *
 * The cup opens around the bid on the table, the way an UNO hand opens around
 * what you can play: dice that count toward it are lifted, the rest are laid in
 * shadow -- so "how many of these do I hold" is answered before you read a word.
 */
function DiceCup({ dice, bid, palifico }) {
  if (dice.length === 0) {
    return <p className="text-center text-mini text-ink-faint py-6">You're out. Watching the table.</p>
  }

  const sorted = dice.toSorted((a, b) => a - b)
  const wild = bid ? onesAreWild(bid, palifico) : false
  const counts = (die) => !bid || die === bid.face || (wild && die === 1)
  const held = bid ? countMatches(dice, bid, palifico) : null

  return (
    <div className="relative z-10 space-y-2 text-center">
      <Label>{bid ? `You hold ${held} toward the bid` : 'Your cup'}</Label>
      <div className="flex items-center justify-center gap-2 pt-1">
        {sorted.map((die, i) => (
          <Die key={i} face={die} size="lg" lit={Boolean(bid) && counts(die)} dim={!counts(die)} />
        ))}
      </div>
    </div>
  )
}

export default React.memo(DiceCup)
