import React from 'react'
import { Bot, Users, BookOpen, ShieldCheck } from 'lucide-react'
import { playClickSound } from '../../../utils/sound'
import Screen, { ScreenHeader } from '../../../components/ui/Screen'
import Button from '../../../components/ui/Button'
import Pill from '../../../components/ui/Pill'
import { Badge } from '../../../components/ui/PlayerRow'
import { FOCUS, cx } from '../../../components/ui/tokens'

const MODES = [
  {
    id: 'online',
    icon: Users,
    tone: 'dice',
    title: 'Play with friends',
    badge: 'Online',
    body: 'Open a room and read out the code. Everyone keeps their cup on their own phone.',
  },
  {
    id: 'solo',
    icon: Bot,
    tone: 'neutral',
    title: 'Solo against bots',
    badge: 'Offline',
    body: 'One to five bots who play the odds, and sometimes bluff.',
  },
]

export default function DiceModeSelect({ onSelectMode, onOpenRules }) {
  return (
    <Screen>
      <ScreenHeader
        eyebrow={<Pill tone="dice">Bluffing</Pill>}
        title="Liar's Dice"
        subtitle="Two ways to play."
        className="pb-6"
      />

      <div className="space-y-3">
        {MODES.map(({ id, icon: Icon, tone, title, badge, body }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              playClickSound()
              onSelectMode(id)
            }}
            className={cx(
              'w-full text-left flex items-start gap-4 p-4 rounded-slab',
              'bg-felt border border-edge shadow-lift-1 transition duration-200 cursor-pointer',
              'hover:-translate-y-0.5 hover:bg-felt-high hover:shadow-lift-2 hover:border-edge-lit',
              'active:translate-y-0 active:scale-[0.99] active:shadow-lift-0',
              FOCUS
            )}
          >
            <span className="shrink-0 w-11 h-11 rounded-object bg-well shadow-sink flex items-center justify-center text-ink-muted">
              <Icon className="w-5 h-5" />
            </span>
            <span className="block min-w-0 flex-1 space-y-1">
              <span className="flex items-center gap-2">
                <span className="font-display text-lg leading-none text-ink">{title}</span>
                <Badge tone={tone}>{badge}</Badge>
              </span>
              <span className="block text-mini text-ink-muted leading-relaxed">{body}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="pt-6 space-y-3">
        <Button
          variant="secondary"
          size="md"
          fullWidth
          onClick={() => {
            playClickSound()
            onOpenRules()
          }}
        >
          <BookOpen className="w-4 h-4" />
          How to play
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-micro text-ink-faint">
          <ShieldCheck className="w-3.5 h-3.5 text-ok" />
          Your dice never leave the host until the cups lift.
        </p>
      </div>
    </Screen>
  )
}
