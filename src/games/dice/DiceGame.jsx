import React, { useCallback, useEffect, useState } from 'react'
import { preloadIceConfig } from '../../services/peerConfig'
import useRoomChat from '../../hooks/useRoomChat'
import JoinCreate from '../../components/room/JoinCreate'
import RoomWaiting from '../../components/room/RoomWaiting'
import ChatModal from '../../components/chat/ChatModal'
import ChatToastPreview from '../../components/chat/ChatToastPreview'
import DiceModeSelect from './components/DiceModeSelect'
import DiceSoloSetup from './components/DiceSoloSetup'
import DiceRulesModal from './components/DiceRulesModal'
import DiceGameOverModal from './components/DiceGameOverModal'
import DiceBoard from './components/board/DiceBoard'
import useDiceTable from './hooks/useDiceTable'
import useDiceRoom from './hooks/useDiceRoom'
import { createGame } from './engine/diceEngine'
import { BOT_PRESETS, MAX_PLAYERS, MIN_PLAYERS, STORAGE_PREFIX } from './constants/diceConstants'

const ROOM_SIZES = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS)

const inMatch = (view) => view?.phase === 'bidding' || view?.phase === 'reveal'

/** Liar's Dice: screen routing only. Solo and online both render the same board. */
export default function DiceGame({ onInGameChange, isRulesOpen, onCloseRules, initialRoomCode = '' }) {
  const [screen, setScreen] = useState(initialRoomCode ? 'online' : 'mode')
  const [internalRulesOpen, setInternalRulesOpen] = useState(false)

  const solo = useDiceTable()

  const [myName, setMyName] = useState('')
  const chat = useRoomChat({ me: { id: 0, name: myName || 'Player', avatar: '👤' } })
  const room = useDiceRoom({ chat })

  useEffect(() => {
    preloadIceConfig()
  }, [])

  const liveView = screen === 'solo' ? solo.view : screen === 'online' ? room.view : null
  useEffect(() => {
    onInGameChange?.(inMatch(liveView))
  }, [liveView, onInGameChange])

  const startSolo = useCallback(
    ({ name, botCount }) => {
      const players = [
        { name, avatar: '😎' },
        ...BOT_PRESETS.slice(0, botCount).map((bot) => ({ ...bot, isBot: true })),
      ]
      solo.table.load(createGame({ players }), 0)
      solo.table.start()
      setScreen('solo')
    },
    [solo.table]
  )

  const leaveSolo = useCallback(() => {
    solo.clear()
    setScreen('mode')
  }, [solo])

  const leaveOnline = useCallback(() => {
    room.leave()
  }, [room])

  const showRules = Boolean(isRulesOpen) || internalRulesOpen
  const closeRules = () => {
    setInternalRulesOpen(false)
    onCloseRules?.()
  }

  let body
  if (screen === 'mode') {
    body = (
      <DiceModeSelect
        onSelectMode={(mode) => setScreen(mode === 'solo' ? 'solo_setup' : 'online')}
        onOpenRules={() => setInternalRulesOpen(true)}
      />
    )
  } else if (screen === 'solo_setup') {
    body = (
      <DiceSoloSetup
        onStart={startSolo}
        onBack={() => setScreen('mode')}
        onOpenRules={() => setInternalRulesOpen(true)}
      />
    )
  } else if (screen === 'solo' && solo.view) {
    body = (
      <>
        <DiceBoard view={solo.view} notice={solo.notice} onIntent={solo.act} onLeave={leaveSolo} />
        <DiceGameOverModal
          view={solo.view}
          isOnline={false}
          onPlayAgain={() => solo.table.start()}
          onLeave={leaveSolo}
        />
      </>
    )
  } else if (screen === 'online' && !room.inRoom) {
    body = (
      <JoinCreate
        tone="dice"
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
        tone="dice"
        gameId="dice"
        roomCode={room.roomCode}
        isHost={room.isHost}
        yourId={room.view?.yourId}
        seats={room.view?.seats ?? []}
        maxPlayers={room.view?.maxPlayers ?? MAX_PLAYERS}
        minPlayers={MIN_PLAYERS}
        startLabel="Roll the dice"
        waitingLabel="Waiting for the host to roll…"
        onStart={room.start}
        onLeave={leaveOnline}
        onOpenChat={chat.openChat}
        unreadChatCount={chat.unreadCount}
      />
    )
  } else if (screen === 'online') {
    body = (
      <>
        <DiceBoard
          view={room.view}
          notice={room.notice}
          isOnline
          isHost={room.isHost}
          roomCode={room.roomCode}
          connectionStatus="connected"
          onIntent={room.sendIntent}
          onLeave={leaveOnline}
          onOpenChat={chat.openChat}
          unreadChatCount={chat.unreadCount}
        />
        <DiceGameOverModal
          view={room.view}
          isOnline
          isHost={room.isHost}
          onBackToLobby={room.backToLobby}
          onLeave={leaveOnline}
        />
      </>
    )
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {body}

      {screen === 'online' && room.inRoom && (
        <>
          <ChatModal
            open={chat.isChatOpen}
            onClose={chat.closeChat}
            messages={chat.messages}
            onSendMessage={chat.sendMessage}
            roomCode={room.roomCode}
            tone="dice"
          />
          <ChatToastPreview toast={chat.activeToast} onClick={chat.openChat} onDismiss={chat.dismissToast} />
        </>
      )}

      <DiceRulesModal isOpen={showRules} onClose={closeRules} />
    </div>
  )
}
