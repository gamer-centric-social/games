import React from 'react'
import { BookOpen, Timer, Users, Zap } from 'lucide-react'
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
    tone: 'bounce',
    title: 'Race your friends',
    badge: 'Online',
    body: 'Everyone climbs the same course on their own phone. First to the top wins.',
  },
  {
    id: 'solo',
    icon: Timer,
    tone: 'neutral',
    title: 'Time trial',
    badge: 'Offline',
    body: 'One shaft, one clock, and your own best run to beat.',
  },
]

export default function BounceModeSelect({ onSelectMode, onOpenRules }) {
  return (
    <Screen>
      <ScreenHeader
        eyebrow={<Pill tone="bounce">Arcade</Pill>}
        title="Bounce"
        subtitle="Tap to climb. Pass only through your colour."
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
          <Zap className="w-3.5 h-3.5 text-bounce" />
          Everyone gets the same course, from the same seed.
        </p>
      </div>
    </Screen>
  )
}
