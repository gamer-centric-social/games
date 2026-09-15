import React, { useState } from 'react'
import { Play, Bot, BookOpen } from 'lucide-react'
import { playClickSound } from '../../../utils/sound'
import Screen, { ScreenHeader, BackLink } from '../../../components/ui/Screen'
import Surface from '../../../components/ui/Surface'
import Button from '../../../components/ui/Button'
import Choice from '../../../components/ui/Choice'
import Label from '../../../components/ui/Label'
import Pill from '../../../components/ui/Pill'
import TextInput from '../../../components/ui/TextInput'
import { BOT_PRESETS, STORAGE_PREFIX } from '../constants/diceConstants'

const NAME_KEY = `${STORAGE_PREFIX}_player_name`

const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) || 'Player 1'
  } catch {
    return 'Player 1'
  }
}

export default function DiceSoloSetup({ onStart, onBack, onOpenRules }) {
  const [name, setName] = useState(savedName)
  const [botCount, setBotCount] = useState(3)

  const handleStart = (e) => {
    e.preventDefault()
    playClickSound()
    const clean = name.trim() || 'Player 1'
    try {
      localStorage.setItem(NAME_KEY, clean)
    } catch {
      // ignore
    }
    onStart({ name: clean, botCount })
  }

  return (
    <Screen>
      <div className="pb-2">
        <BackLink
          onClick={() => {
            playClickSound()
            onBack()
          }}
        >
          Modes
        </BackLink>
      </div>

      <ScreenHeader
        eyebrow={<Pill tone="dice">Solo</Pill>}
        title="Play the bots"
        subtitle="Five dice each. Last cup standing wins."
        className="pb-6"
      />

      <form onSubmit={handleStart} className="space-y-5">
        <div className="space-y-2">
          <Label as="label" htmlFor="dice-solo-name">
            Your name
          </Label>
          <TextInput
            id="dice-solo-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={12}
            placeholder="What should we call you?"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Opponents</Label>
            <span className="font-mono text-nano text-ink-faint">{botCount + 1} at the table</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {BOT_PRESETS.map((_, i) => (
              <Choice
                key={i}
                tone="dice"
                radius="object"
                selected={botCount === i + 1}
                onClick={() => {
                  playClickSound()
                  setBotCount(i + 1)
                }}
                className="py-3 font-mono"
              >
                <Bot className="w-3.5 h-3.5" />
                {i + 1}
              </Choice>
            ))}
          </div>
        </div>

        <Surface inset radius="object" className="p-3 flex flex-wrap gap-2">
          {BOT_PRESETS.slice(0, botCount).map((bot) => (
            <span
              key={bot.name}
              className="flex items-center gap-1.5 px-2 py-1 rounded-well bg-felt border border-edge shadow-lift-1 text-mini text-ink"
            >
              <span aria-hidden="true">{bot.avatar}</span>
              {bot.name}
            </span>
          ))}
        </Surface>

        <div className="space-y-2 pt-2">
          <Button type="submit" tone="dice" fullWidth>
            <Play className="w-4 h-4 fill-current" />
            Roll the dice
          </Button>
          <Button
            variant="ghost"
            size="md"
            fullWidth
            onClick={() => {
              playClickSound()
              onOpenRules()
            }}
          >
            <BookOpen className="w-3.5 h-3.5" />
            How to play
          </Button>
        </div>
      </form>
    </Screen>
  )
}
