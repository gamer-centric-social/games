import React, { useCallback, useEffect, useState } from 'react'
import { preloadIceConfig } from '../../services/peerConfig'
import useRoomChat from '../../hooks/useRoomChat'
import JoinCreate from '../../components/room/JoinCreate'
import RoomWaiting from '../../components/room/RoomWaiting'
import ChatModal from '../../components/chat/ChatModal'
import ChatToastPreview from '../../components/chat/ChatToastPreview'
import BounceModeSelect from './components/BounceModeSelect'
import BounceCanvas from './components/BounceCanvas'
import BounceHud from './components/BounceHud'
import BounceRulesModal from './components/BounceRulesModal'
import BounceRaceOverModal from './components/BounceRaceOverModal'
import useBounceTable from './hooks/useBounceTable'
import useBounceRoom from './hooks/useBounceRoom'
import { cryptoRng } from '../../utils/rng'
import { BEST_TIME_KEY, MAX_PLAYERS, MIN_PLAYERS, STORAGE_PREFIX } from './constants/bounceConstants'

const ROOM_SIZES = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS)

const readBest = () => {
  try {
    const saved = Number(localStorage.getItem(BEST_TIME_KEY))
    return Number.isFinite(saved) && saved > 0 ? saved : null
  } catch {
    return null
  }
}

const writeBest = (ms) => {
  try {
    localStorage.setItem(BEST_TIME_KEY, String(Math.round(ms)))
  } catch {
    // ignore
  }
}

/** Bounce: screen routing only. Solo and online climb the same shaft. */
export default function BounceGame({ onInGameChange, isRulesOpen, onCloseRules, initialRoomCode = '' }) {
  const [screen, setScreen] = useState(initialRoomCode ? 'online' : 'mode')
  const [internalRulesOpen, setInternalRulesOpen] = useState(false)
  const [myName, setMyName] = useState('')

  const [bestMs, setBestMs] = useState(readBest)
  const [soloTime, setSoloTime] = useState(null)
  const [isNewBest, setIsNewBest] = useState(false)

  const handleSoloFinish = useCallback((run) => {
    const ms = run.finishT * 1000
    setSoloTime(ms)
    setBestMs((previous) => {
      if (previous != null && previous <= ms) return previous
      writeBest(ms)
      setIsNewBest(previous != null)
      return ms
    })
  }, [])

  const solo = useBounceTable({ onFinish: handleSoloFinish })

  const chat = useRoomChat({ me: { id: 0, name: myName || 'Player', avatar: '🔵' } })
  const room = useBounceRoom({ chat })

  useEffect(() => {
    preloadIceConfig()
  }, [])

  const inSoloRace = screen === 'solo' && solo.hud?.status === 'climbing'
  const inOnlineRace = screen === 'online' && room.view?.phase === 'racing'
  useEffect(() => {
    onInGameChange?.(inSoloRace || inOnlineRace)
  }, [inSoloRace, inOnlineRace, onInGameChange])

  const startSolo = useCallback(() => {
    setSoloTime(null)
    setIsNewBest(false)
    solo.load(Math.floor(cryptoRng() * 2 ** 31) >>> 0)
    setScreen('solo')
  }, [solo])

  const leaveSolo = useCallback(() => {
    solo.clear()
    setSoloTime(null)
    setIsNewBest(false)
    setScreen('mode')
  }, [solo])

  const showRules = Boolean(isRulesOpen) || internalRulesOpen
  const closeRules = () => {
    setInternalRulesOpen(false)
    onCloseRules?.()
  }

  let body
  if (screen === 'mode') {
    body = (
      <BounceModeSelect
        onSelectMode={(mode) => (mode === 'solo' ? startSolo() : setScreen('online'))}
        onOpenRules={() => setInternalRulesOpen(true)}
      />
    )
  } else if (screen === 'solo') {
    body = (
      <>
        <BounceHud hud={solo.hud} bestMs={bestMs} onLeave={leaveSolo} />
        <BounceCanvas table={solo.table} active={solo.hud?.status === 'climbing'} />
        <BounceRaceOverModal
          soloTime={soloTime}
          bestMs={bestMs}
          isNewBest={isNewBest}
          onPlayAgain={startSolo}
          onLeave={leaveSolo}
        />
      </>
    )
  } else if (screen === 'online' && !room.inRoom) {
    body = (
      <JoinCreate
        tone="bounce"
        storagePrefix={STORAGE_PREFIX}
        sizes={ROOM_SIZES}
        defaultSize={4}
        initialRoomCode={initialRoomCode}
        roomState={{ error: room.error, isConnecting: room.isConnecting }}
        onCreateRoom={(details) => {
          setMyName(details.name)
          room.createRoom(details)
        }}
        onJoinRoom={(details) => {
          setMyName(details.name)
          room.joinRoom(details)
        }}
        onBack={() => setScreen('mode')}
      />
    )
  } else if (screen === 'online' && (!room.view || room.view.phase === 'lobby')) {
    body = (
      <RoomWaiting
        tone="bounce"
        gameId="bounce"
        roomCode={room.roomCode}
        isHost={room.isHost}
        yourId={room.view?.yourId}
        seats={room.view?.seats ?? []}
        maxPlayers={room.view?.maxPlayers ?? MAX_PLAYERS}
        minPlayers={MIN_PLAYERS}
        startLabel="Drop the flag"
        waitingLabel="Waiting for the host to drop the flag…"
        onStart={room.start}
        onLeave={room.leave}
        onOpenChat={chat.openChat}
        unreadChatCount={chat.unreadCount}
      />
    )
  } else if (screen === 'online') {
    body = (
      <>
        <BounceHud
          hud={room.local.hud}
          seats={room.view?.seats ?? []}
          yourId={room.yourId}
          onLeave={room.leave}
          onOpenChat={chat.openChat}
          unreadChatCount={chat.unreadCount}
        />
        <BounceCanvas
          table={room.local.table}
          active={room.view?.phase === 'racing' && room.local.hud?.status === 'climbing'}
        />
        <BounceRaceOverModal
          view={room.view}
          isOnline
          isHost={room.isHost}
          onBackToLobby={room.backToLobby}
          onLeave={room.leave}
        />
      </>
    )
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {body}

      {room.notice && screen === 'online' && (
        <p className="shrink-0 px-4 py-2 text-center text-mini text-ink-muted">{room.notice}</p>
      )}

      {screen === 'online' && room.inRoom && (
        <>
          <ChatModal
            open={chat.isChatOpen}
            onClose={chat.closeChat}
            messages={chat.messages}
            onSendMessage={chat.sendMessage}
            roomCode={room.roomCode}
            tone="bounce"
          />
          <ChatToastPreview toast={chat.activeToast} onClick={chat.openChat} onDismiss={chat.dismissToast} />
        </>
      )}

      <BounceRulesModal isOpen={showRules} onClose={closeRules} />
    </div>
  )
}
