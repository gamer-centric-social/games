import React, { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import Die from '../Die'
import Button from '../../../../components/ui/Button'
import IconButton from '../../../../components/ui/IconButton'
import { EXACT_MIN_PLAYERS } from '../../constants/diceConstants'
import { minimumQuantityFor, smallestLegalBid } from '../../engine/bidRules'
import { bidWords } from '../../utils/narration'
import { FOCUS, cx } from '../../../../components/ui/tokens'

const FACES = [1, 2, 3, 4, 5, 6]

/** How long the controls stay locked after a tap, so a double tap sends one action. */
const SEND_LOCK_MS = 1500

/**
 * Your turn: a quantity stepper, six faces, and one button that reads the bid
 * back in words. Legality comes from bidRules, never from here -- a face you
 * cannot bid at all is disabled; picking one that needs more dice raises the
 * quantity to its minimum.
 *
 * The parent keys this on the bid history, so it remounts for every new bid
 * and starts at the lowest legal raise.
 */
export default function BidPicker({ view, onIntent }) {
  const prev = view.currentBid
  const ctx = {
    diceInPlay: view.diceInPlay,
    palifico: view.palifico ? { seatId: view.palifico.seatId } : null,
  }
  const minimums = FACES.map((face) => minimumQuantityFor(face, prev, ctx))
  const start = smallestLegalBid(prev, ctx)
  const floor = start?.quantity ?? view.diceInPlay

  const [quantity, setQuantity] = useState(start?.quantity ?? 1)
  const [face, setFace] = useState(start?.face ?? 2)
  const [locked, setLocked] = useState(false)
  const lockTimer = useRef(null)

  useEffect(() => () => clearTimeout(lockTimer.current), [])

  const send = (intent) => {
    if (locked) return
    setLocked(true)
    lockTimer.current = setTimeout(() => setLocked(false), SEND_LOCK_MS)
    onIntent(intent)
  }

  const faceMinimum = minimums[face - 1]
  const legal = start !== null && faceMinimum !== null && quantity >= faceMinimum
  const exactAllowed = Boolean(prev) && view.playersIn >= EXACT_MIN_PLAYERS

  const pickFace = (next) => {
    setFace(next)
    const min = minimums[next - 1]
    if (min !== null && quantity < min) setQuantity(min)
  }

  return (
    <div className="relative z-10 space-y-3 p-3 rounded-slab bg-felt border border-edge shadow-lift-2">
      {start ? (
        <>
          <div className="flex items-center justify-center gap-4">
            <IconButton
              label="One fewer"
              disabled={quantity <= floor}
              onClick={() => setQuantity((q) => q - 1)}
              className="disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Minus className="w-4 h-4" />
            </IconButton>
            <span className="w-14 text-center font-mono text-4xl text-ink leading-none" aria-live="polite">
              {quantity}
            </span>
            <IconButton
              label="One more"
              disabled={quantity >= view.diceInPlay}
              onClick={() => setQuantity((q) => q + 1)}
              className="disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
            </IconButton>
          </div>

          <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Face">
            {FACES.map((f) => {
              const min = minimums[f - 1]
              const reachable = min !== null
              const fitsNow = reachable && quantity >= min
              return (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={face === f}
                  aria-label={reachable ? `${f}s, from ${min}` : `${f}s, not allowed`}
                  disabled={!reachable}
                  onClick={() => pickFace(f)}
                  className={cx(
                    'flex items-center justify-center py-2 rounded-well border transition cursor-pointer',
                    'disabled:cursor-not-allowed',
                    face === f ? 'bg-felt-high border-dice shadow-lift-1' : 'bg-well border-edge shadow-sink',
                    FOCUS
                  )}
                >
                  <Die face={f} size="sm" dim={!fitsNow} />
                </button>
              )
            })}
          </div>

          <Button
            tone="dice"
            fullWidth
            disabled={!legal || locked}
            onClick={() => send({ type: 'bid', bid: { quantity, face } })}
          >
            Bid {bidWords({ quantity, face })}
          </Button>
        </>
      ) : (
        <p className="text-center text-mini text-ink-muted py-2">
          There is no higher bid. Call it.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="danger"
          size="md"
          disabled={!prev || locked}
          onClick={() => send({ type: 'liar' })}
        >
          Liar!
        </Button>
        <Button
          variant="secondary"
          size="md"
          disabled={!exactAllowed || locked}
          onClick={() => send({ type: 'exact' })}
        >
          Exact
        </Button>
      </div>
      {prev && !exactAllowed && (
        <p className="text-center text-nano text-ink-faint">Exact needs three players still in.</p>
      )}
    </div>
  )
}
