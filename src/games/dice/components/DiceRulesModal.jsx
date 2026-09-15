import React from 'react'
import { playClickSound } from '../../../utils/sound'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import Label from '../../../components/ui/Label'
import Pill from '../../../components/ui/Pill'
import Surface from '../../../components/ui/Surface'

const CALLS = [
  { name: 'Raise', body: 'More dice of any face, or the same number of a higher face.' },
  {
    name: 'Liar!',
    body: 'Lift every cup. If the bid was there, you lose a die. If not, the bidder does.',
  },
  {
    name: 'Exact',
    body: 'Claim the bid is spot on. Right: win a die back. Wrong: lose one. Needs three players in.',
  },
]

export default function DiceRulesModal({ isOpen, onClose }) {
  const close = () => {
    playClickSound()
    onClose()
  }

  return (
    <Modal
      open={isOpen}
      onClose={close}
      title="How to play"
      eyebrow={<Pill tone="dice">Liar's Dice</Pill>}
      size="md"
      footer={
        <Button fullWidth onClick={close}>
          Got it
        </Button>
      }
      bodyClassName="space-y-5 text-mini"
    >
      <section className="space-y-1">
        <h3 className="text-sm font-bold text-ink">The goal</h3>
        <p className="text-ink-muted leading-relaxed">
          Everyone rolls five dice in secret. Bid on how many of a face are on the whole table, and be
          the last player with dice.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-ink">On your turn, do one thing</h3>
        <div className="grid grid-cols-1 gap-2">
          {CALLS.map(({ name, body }) => (
            <Surface key={name} inset radius="well" className="p-2.5">
              <span className="block font-bold text-dice mb-0.5">{name}</span>
              <span className="block text-ink-muted">{body}</span>
            </Surface>
          ))}
        </div>
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-bold text-ink">1s are wild</h3>
        <p className="text-ink-muted leading-relaxed">
          A 1 counts as any face. You cannot open on 1s. Switching to 1s needs at least half the
          quantity (eight 4s → four 1s); leaving them needs double plus one (four 1s → nine 4s).
        </p>
      </section>

      <section className="space-y-1.5 p-3 rounded-object bg-dice/10 border border-dice/25">
        <Label className="text-dice">Palifico</Label>
        <p className="text-ink-muted leading-relaxed">
          The first time a player drops to one die, with three or more still in, the next round is
          theirs: they open, 1s are not wild, and after the opening bid the face is locked, so only
          the quantity can rise.
        </p>
      </section>
    </Modal>
  )
}
