import React from 'react'
import { playClickSound } from '../../../utils/sound'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import Pill from '../../../components/ui/Pill'
import Surface from '../../../components/ui/Surface'
import BounceGlyph from './BounceGlyph'
import { COLORS, COLOR_CONFIG } from '../constants/bounceConstants'

export default function BounceRulesModal({ isOpen, onClose }) {
  const close = () => {
    playClickSound()
    onClose()
  }

  return (
    <Modal
      open={isOpen}
      onClose={close}
      title="How to play"
      eyebrow={<Pill tone="bounce">Bounce</Pill>}
      size="md"
      footer={
        <Button tone="bounce" fullWidth onClick={close}>
          Got it
        </Button>
      }
      bodyClassName="space-y-5 text-mini"
    >
      <section className="space-y-1">
        <h3 className="text-sm font-bold text-ink">The goal</h3>
        <p className="text-ink-muted leading-relaxed">
          Climb the shaft to the light at the top. Everyone races the same course at the same time,
          and the first ball over the line wins.
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-bold text-ink">The only control</h3>
        <p className="text-ink-muted leading-relaxed">
          Tap anywhere to bounce. Each tap gives the same lift however hard or often you press, so
          hammering the screen gets you nowhere — gravity does the rest.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-ink">Colours are rules</h3>
        <p className="text-ink-muted leading-relaxed">
          Your ball holds one colour at a time and can only pass through an arc of that colour. Each
          colour carries a shape too, so you can play this by shape alone.
        </p>
        <Surface inset className="p-3">
          <ul className="grid grid-cols-2 gap-2">
            {COLORS.map((color) => (
              <li key={color} className="flex items-center gap-2">
                <BounceGlyph color={color} size={18} />
                <span className="text-mini text-ink-muted">{COLOR_CONFIG[color].name}</span>
              </li>
            ))}
          </ul>
        </Surface>
        <p className="text-ink-muted leading-relaxed">
          Pass through a disc of colour and your ball takes that colour. A small notch under each
          gate marks where you will cross it.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-ink">The chamber</h3>
        <p className="text-ink-muted leading-relaxed">
          Some rooms are one big ring you climb <em>into</em>. The lip closes under you, so there is
          no way back down and no rush: stand on the floor as long as you like and watch the ceiling
          turn. You leave only when it is showing the colour you hold.
        </p>
        <p className="text-ink-muted leading-relaxed">
          The glowing disc inside is the core. Touch it and your ball takes whatever colour it is
          showing, so pick your colour there, rise out of it, and go when the ceiling comes round.
          It takes three taps to reach the top from the floor — you will never hit it by accident.
        </p>
        <p className="text-ink-muted leading-relaxed">
          Hit the ceiling on the wrong colour and it costs you the room.
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-bold text-ink">Getting it wrong</h3>
        <p className="text-ink-muted leading-relaxed">
          Hit the wrong colour and you drop back to the last dashed checkpoint line you passed, with
          the colour you were holding there. Falling costs you nothing but time — only the climb is
          gated, so you can always drop back and wait for your colour to come round.
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-bold text-ink">Reading the shaft</h3>
        <p className="text-ink-muted leading-relaxed">
          The shaft gets lighter the higher you go, so how lit it is tells you how far you have come.
          A chamber is the exception — the light does not reach inside one, and the core is the only
          thing lit in there. The climb is built from rooms with names, and a beam across the shaft
          marks the checkpoint between each one. The bar above your ball shows everyone racing, and
          gates turn faster and cut narrower the nearer you get to the top.
        </p>
      </section>
    </Modal>
  )
}
