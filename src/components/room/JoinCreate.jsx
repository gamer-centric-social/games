import React, { useState } from 'react'
import { Users, Sparkles, AlertTriangle } from 'lucide-react'
import { playClickSound } from '../../utils/sound'
import Screen, { ScreenHeader, BackLink } from '../ui/Screen'
import Surface from '../ui/Surface'
import Button from '../ui/Button'
import Choice from '../ui/Choice'
import Label from '../ui/Label'
import Pill from '../ui/Pill'
import TextInput, { CodeInput } from '../ui/TextInput'
import { FOCUS, TONE_BORDER, TONE_TEXT, cx } from '../ui/tokens'

const AVATARS = ['😎', '🦊', '🐼', '🐯', '🚀', '⚡', '🌟', '🦄', '👑', '🔥', '👾', '🐱', '🐶', '🍕', '🦁', '⭐']

const read = (store, key, fallback) => {
  try {
    return window[store].getItem(key) || fallback
  } catch {
    return fallback
  }
}

const write = (store, key, value) => {
  try {
    window[store].setItem(key, value)
  } catch {
    // ignore -- storage can be unavailable in private mode
  }
}

/**
 * Before a room exists: name, avatar, then host or join.
 *
 * Generalized from UNO's UnoJoinCreate (which UNO still uses until it migrates).
 * The game's colour is `tone`, its storage keys are `${storagePrefix}_*`, and
 * anything game-specific on the create tab goes in `createOptions`.
 */
export default function JoinCreate({
  tone,
  storagePrefix,
  eyebrow = 'Online',
  sizes,
  defaultSize,
  initialRoomCode = '',
  roomState,
  createOptions = null,
  onCreateRoom,
  onJoinRoom,
  onBack,
}) {
  const [maxPlayers, setMaxPlayers] = useState(defaultSize)
  const [playerName, setPlayerName] = useState(() =>
    read('localStorage', `${storagePrefix}_player_name`, 'Player 1')
  )
  const [avatar, setAvatar] = useState(() =>
    read('localStorage', `${storagePrefix}_player_avatar`, AVATARS[0])
  )
  const [roomCode, setRoomCode] = useState(
    () => initialRoomCode || read('sessionStorage', `${storagePrefix}_last_room`, '')
  )
  const [tab, setTab] = useState(() => (roomCode ? 'join' : 'create'))

  const remember = (name) => {
    write('localStorage', `${storagePrefix}_player_name`, name)
    write('localStorage', `${storagePrefix}_player_avatar`, avatar)
  }

  const handleCreate = (e) => {
    e.preventDefault()
    playClickSound()
    const name = playerName.trim() || 'Host'
    remember(name)
    onCreateRoom({ name, avatar, maxPlayers })
  }

  const handleJoin = (e) => {
    e.preventDefault()
    const code = roomCode.trim().toUpperCase()
    const name = playerName.trim()
    if (!code || !name) return
    playClickSound()
    remember(name)
    write('sessionStorage', `${storagePrefix}_last_room`, code)
    onJoinRoom({ name, avatar, roomCode: code })
  }

  const switchTab = (next) => () => {
    playClickSound()
    setTab(next)
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
        eyebrow={<Pill tone={tone}>{eyebrow}</Pill>}
        title="Play with friends"
        subtitle="Everyone joins from their own phone."
        className="pb-5"
      />

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Choice tone={tone} radius="object" selected={tab === 'create'} onClick={switchTab('create')}>
          Open a room
        </Choice>
        <Choice tone={tone} radius="object" selected={tab === 'join'} onClick={switchTab('join')}>
          Join a room
        </Choice>
      </div>

      {roomState?.error && (
        <p className="mb-4 p-3 rounded-object bg-danger/10 border border-danger/30 text-danger text-mini flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{roomState.error}</span>
        </p>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label as="label" htmlFor={`${storagePrefix}-mp-name`}>
            Your name
          </Label>
          <TextInput
            id={`${storagePrefix}-mp-name`}
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={12}
            placeholder="What should we call you?"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Your avatar</Label>
          <Surface inset radius="object" className="flex items-center gap-1 p-1.5 overflow-x-auto scrollbar-none">
            {AVATARS.map((av) => (
              <button
                key={av}
                type="button"
                onClick={() => {
                  playClickSound()
                  setAvatar(av)
                }}
                aria-label={`Avatar ${av}`}
                aria-pressed={avatar === av}
                className={cx(
                  'w-9 h-9 shrink-0 rounded-well flex items-center justify-center text-lg',
                  'transition active:scale-95 cursor-pointer',
                  avatar === av ? cx('bg-felt-high border shadow-lift-1', TONE_BORDER[tone]) : 'hover:bg-felt',
                  FOCUS
                )}
              >
                {av}
              </button>
            ))}
          </Surface>
        </div>

        {tab === 'join' && (
          <div className="space-y-1.5 animate-fadeIn">
            <Label as="label" htmlFor={`${storagePrefix}-room-code`}>
              Room code
            </Label>
            <CodeInput
              id={`${storagePrefix}-room-code`}
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="7X49"
            />
          </div>
        )}

        {tab === 'create' && (
          <>
            <Surface radius="object" className="p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Room size
                </Label>
                <span className={cx('font-mono text-nano', TONE_TEXT[tone])}>up to {maxPlayers}</span>
              </div>
              <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
                {sizes.map((num) => (
                  <Choice
                    key={num}
                    tone={tone}
                    selected={maxPlayers === num}
                    onClick={() => {
                      playClickSound()
                      setMaxPlayers(num)
                    }}
                    className="px-0 py-2 font-mono"
                  >
                    {num}
                  </Choice>
                ))}
              </div>
            </Surface>

            {createOptions}

            <Surface inset radius="object" className="p-3.5 text-mini text-ink-muted">
              You get a four-letter code and a join link to send round.
            </Surface>
          </>
        )}
      </div>

      <div className="pt-6">
        {tab === 'create' ? (
          <Button tone={tone} fullWidth onClick={handleCreate} disabled={roomState?.isConnecting}>
            <Sparkles className="w-4 h-4" />
            {roomState?.isConnecting ? 'Opening the room…' : 'Open the room'}
          </Button>
        ) : (
          <Button
            tone={tone}
            fullWidth
            onClick={handleJoin}
            disabled={!roomCode.trim() || !playerName.trim() || roomState?.isConnecting}
          >
            <Users className="w-4 h-4" />
            {roomState?.isConnecting ? 'Connecting…' : 'Join the room'}
          </Button>
        )}
      </div>
    </Screen>
  )
}
