import React from 'react'
import { BookOpen } from 'lucide-react'
import { GAMES } from '../data/games'
import { playClickSound } from '../utils/sound'
import IconButton from './ui/IconButton'
import { FOCUS, cx } from './ui/tokens'

/**
 * Three objects on a lit table.
 *
 * One centred column at every width -- the same design on a phone and on a
 * desktop. A phone-first app that rearranges itself into a three-up marketing
 * grid on desktop is describing itself rather than being itself.
 *
 * Each card finally renders the metadata games.js has always carried and the
 * old emoji-and-title tile never showed.
 */
const INK = {
  imposter: {
    badge: 'text-imposter',
    disc: 'ring-imposter/40',
    hover: 'hover:border-imposter/40',
  },
  uno: {
    badge: 'text-uno',
    disc: 'ring-uno/40',
    hover: 'hover:border-uno/40',
  },
  tank: {
    badge: 'text-tank',
    disc: 'ring-tank/40',
    hover: 'hover:border-tank/40',
  },
  dice: {
    badge: 'text-dice',
    disc: 'ring-dice/40',
    hover: 'hover:border-dice/40',
  },
  bounce: {
    badge: 'text-bounce',
    disc: 'ring-bounce/40',
    hover: 'hover:border-bounce/40',
  },
}

export default function GameHub({ onSelectGame, onOpenRulesForGame }) {
  return (
    <div className="relative z-10 w-full max-w-xl mx-auto px-5 pt-3 pb-10 select-none">
      <header className="mb-7 space-y-1.5">
        <h1 className="font-display text-4xl sm:text-5xl leading-[0.95] text-ink">
          What are we playing?
        </h1>
        <p className="text-sm text-ink-muted">
          Four games. Everyone plays on their own phone.
        </p>
      </header>

      <div className="space-y-3.5">
        {GAMES.map((game, index) => {
          const ink = INK[game.ink]

          return (
            // The rules action cannot nest inside the card button, so it sits
            // alongside it rather than within it.
            <div
              key={game.id}
              className="relative animate-rise"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <button
                type="button"
                onClick={() => {
                  playClickSound()
                  onSelectGame(game.id)
                }}
                className={cx(
                  'group w-full text-left flex items-center gap-5 p-5 pr-14',
                  'bg-felt border border-edge rounded-slab shadow-lift-1',
                  'transition duration-200 cursor-pointer',
                  'hover:-translate-y-0.5 hover:bg-felt-high hover:shadow-lift-2',
                  'active:translate-y-0 active:scale-[0.99] active:shadow-lift-0',
                  ink.hover,
                  FOCUS
                )}
              >
                <span
                  className={cx(
                    'shrink-0 w-16 h-16 rounded-object bg-well shadow-sink ring-1',
                    'flex items-center justify-center text-4xl',
                    'transition duration-200 group-hover:scale-105',
                    ink.disc
                  )}
                  aria-hidden="true"
                >
                  {game.emoji}
                </span>

                <span className="min-w-0 flex-1 block space-y-1">
                  <span className={cx('block text-micro font-bold uppercase', ink.badge)}>
                    {game.badge}
                  </span>
                  <span className="block font-display text-2xl leading-none text-ink">
                    {game.title}
                  </span>
                  <span className="block text-mini text-ink-muted truncate">{game.tagline}</span>
                  <span className="block pt-0.5 font-mono text-nano text-ink-faint">
                    {game.playerCount} · {game.duration}
                  </span>
                </span>
              </button>

              {onOpenRulesForGame && (
                <IconButton
                  label={`How to play ${game.title}`}
                  onClick={() => {
                    playClickSound()
                    onOpenRulesForGame(game.id)
                  }}
                  className="absolute top-3 right-3 z-10"
                >
                  <BookOpen className="w-4 h-4" />
                </IconButton>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-7 text-center font-mono text-nano text-ink-faint">
        Peer-to-peer · no app, no account, no sign-in
      </p>
    </div>
  )
}
