import React from 'react'
import UnoJoinCreate from './lobby/UnoJoinCreate'
import UnoRoomWaiting from './lobby/UnoRoomWaiting'

// Router only. The setup form and the waiting room are unrelated screens that
// shared a file, separated by an early return halfway down it.
export default function UnoMultiplayerLobby({
  initialRoomCode = '',
  onCreateRoom,
  onJoinRoom,
  onStartGame,
  onLeaveRoom,
  onBackToModeSelect,
  roomState, // { isInRoom, isHost, roomCode, players, maxPlayers, isConnecting, error }
  connectionStatus = 'connected',
  onOpenChat,
  unreadChatCount = 0,
}) {
  if (roomState?.isInRoom) {
    return (
      <UnoRoomWaiting
        roomState={roomState}
        connectionStatus={connectionStatus}
        onStartGame={onStartGame}
        onLeaveRoom={onLeaveRoom}
        onOpenChat={onOpenChat}
        unreadChatCount={unreadChatCount}
      />
    )
  }

  return (
    <UnoJoinCreate
      initialRoomCode={initialRoomCode}
      onCreateRoom={onCreateRoom}
      onJoinRoom={onJoinRoom}
      onBackToModeSelect={onBackToModeSelect}
      roomState={roomState}
    />
  )
}
