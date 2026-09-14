import React, { useState, useEffect, useRef, useCallback } from 'react'
import UnoModeSelect from './components/UnoModeSelect'
import UnoLobby from './components/UnoLobby'
import UnoMultiplayerLobby from './components/UnoMultiplayerLobby'
import UnoBoard from './components/UnoBoard'
import ColorPickerModal from './components/ColorPickerModal'
import UnoGameOverModal from './components/UnoGameOverModal'
import UnoRulesModal from './components/UnoRulesModal'
import UnoFinishedRankModal from './components/UnoFinishedRankModal'
import UnoGiveCardModal from './components/UnoGiveCardModal'
import { CARD_COLORS } from './constants/unoConstants'
import { getNextActivePlayerIndex } from './utils/deck'
import { useUnoAiGame } from './hooks/useUnoAiGame'
import {
  createHostGame,
  startMatch,
  resetToLobby,
  isMatchInProgress,
  sanitizePlayers,
  handOf,
  playCard,
  drawCard,
  passTurn,
  callUno,
  catchUno,
  submitPenaltyCard,
  finalizeCatchPenalty,
  forceResolvePenalty,
  publicCatchPenalty,
  PENALTY_TIMEOUT_MS,
  SOUNDS,
} from './engine/hostEngine'
import { admitPlayer, ADMIT } from './services/unoHandshake'
import {
  initHostPeer,
  initClientPeer,
  generateRoomCode,
  getClientSessionId,
  preloadIceConfig,
} from './services/unoNetwork'
import {
  playCardPlaySound,
  playCardDrawSound,
  playActionCardSound,
  playUnoCallSound,
} from '../../utils/sound'
import { ChatService } from '../../services/chat/ChatService'
import { PeerJsChatTransport } from '../../services/chat/transports/PeerJsChatTransport'
import { useChat } from '../../hooks/useChat'
import ChatModal from '../../components/chat/ChatModal'
import ChatToastPreview from '../../components/chat/ChatToastPreview'

/**
 * Replace a Set-valued piece of state only when its contents actually changed.
 *
 * hostBroadcastGameState ran `setMpUnoCalledPlayers(new Set(...))` on every
 * accepted action, so a brand-new Set identity landed in props whether or not
 * anyone had called UNO -- which invalidated both of UnoBoard's memos, every
 * action, for nothing.
 */
/** Engine reasons are sentence fragments; the status line shows sentences. */
const capitalise = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text)

function sameMembers(a, b) {
  if (a === b) return true
  if (!a || !b || a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

/** The host is always player 0 in a multiplayer room. */
const HOST_PLAYER_ID = 0

const setUrlRoomCode = (code) => {
  if (typeof window !== 'undefined' && window.history) {
    const url = new URL(window.location.href)
    url.searchParams.set('game', 'uno')
    if (code) {
      url.searchParams.set('room', code.toUpperCase())
    } else {
      url.searchParams.delete('room')
    }
    window.history.replaceState({}, document.title, url.toString())
  }
}

const clearUrlRoomCode = () => {
  if (typeof window !== 'undefined' && window.history) {
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    window.history.replaceState({}, document.title, url.toString())
  }
}

export default function UnoGame({
  isRulesOpen,
  onCloseRules,
  initialRoomCode = '',
  onInGameChange,
}) {
  const effectiveInitialRoom =
    initialRoomCode ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('room') ||
        sessionStorage.getItem('uno_active_room') ||
        ''
      : '')

  // Screen state
  const [screen, setScreen] = useState(() => (effectiveInitialRoom ? 'mp_lobby' : 'mode_select'))
  const [internalRulesOpen, setInternalRulesOpen] = useState(false)

  // Tell the hub when a match is live, so leaving warns first.
  useEffect(() => {
    onInGameChange?.(screen === 'ai_playing' || screen === 'mp_playing')
  }, [screen, onInGameChange])
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [pendingCard, setPendingCard] = useState(null)

  // Celebration modal when local player empties hand
  const [finishedCelebration, setFinishedCelebration] = useState({
    isOpen: false,
    rank: 1,
    playerName: 'You',
    activeRemaining: 2,
  })
  const hasShownMyCelebrationRef = useRef(false)

  /**
   * "Give a card" prompt shown to every active player when someone is caught without
   * having called UNO. Shared: both modes drive the same modal, so it lives here rather
   * than inside either game loop. `mode` says which one is currently using it.
   */
  // Your hand's sort lives here rather than in the board, so it survives the board
  // unmounting at the end of a round. It changes when you change it, and at no other
  // time -- drawing a card used to silently reset it.
  const [handSortMode, setHandSortMode] = useState('none') // 'none' | 'color' | 'number'

  const [penaltyGiveCardModal, setPenaltyGiveCardModal] = useState({
    isOpen: false,
    mode: 'ai', // 'ai' | 'mp'
    penaltyId: null,
    targetPlayerId: null,
    targetPlayerName: '',
    challengerId: null,
    botGifts: [],
  })

  // Preload TURN ICE configuration if Metered API credentials are configured
  useEffect(() => {
    preloadIceConfig()
  }, [])

  // ==========================================
  // SOLO VS AI  (see hooks/useUnoAiGame.js)
  // ==========================================
  const {
    aiPlayers,
    aiRankings,
    aiCurrentPlayerIndex,
    aiDirection,
    aiTopCard,
    aiActiveColor,
    aiDrawPile,
    aiHasDrawnCardThisTurn,
    aiActionMessage,
    aiUnoCalledPlayers,
    aiHasCalledUnoThisRound,
    aiWinner,
    aiSkippedInfo,
    aiPendingDrawCount,
    aiPendingStackType,
    isAiHumanTurn,
    isAiWaitingForBot,
    handleStartAiGame,
    handlePlayAgainAi,
    handleHumanPlayCardAi,
    handleDrawCardAi,
    handlePassTurnAi,
    handleCallUnoAi,
    handleCatchUnoAi,
    handleConfirmGiveCardAi,
    executeAiPlayCard,
  } = useUnoAiGame({
    screen,
    setScreen,
    penaltyGiveCardModal,
    setPenaltyGiveCardModal,
    setFinishedCelebration,
    hasShownMyCelebrationRef,
    setPendingCard,
    setColorPickerOpen,
  })

  // ==========================================
  // 2. MULTIPLAYER STATE
  // ==========================================
  const [mpRoomState, setMpRoomState] = useState({
    isInRoom: false,
    isHost: false,
    roomCode: '',
    players: [],
    maxPlayers: 4,
    isConnecting: false,
    error: '',
  })

  const [myPlayerId, setMyPlayerId] = useState(0)
  const myPlayerIdRef = useRef(0)
  const [myHand, setMyHand] = useState([])

  // Shared multiplayer board state (for UI rendering on both Host and Clients)
  const [mpPlayers, setMpPlayers] = useState([])
  const [mpRankings, setMpRankings] = useState([]) // [{ playerId, name, avatar, isHost, rank, remainingCards }]
  const [mpTopCard, setMpTopCard] = useState(null)
  const [mpActiveColor, setMpActiveColor] = useState(null)
  const [mpCurrentPlayerIndex, setMpCurrentPlayerIndex] = useState(0)
  const [mpDirection, setMpDirection] = useState(1)
  const [mpDrawPileCount, setMpDrawPileCount] = useState(0)
  const [mpHasDrawnCardThisTurn, setMpHasDrawnCardThisTurn] = useState(false)
  const [mpActionMessage, setMpActionMessage] = useState('')
  const [mpUnoCalledPlayers, setMpUnoCalledPlayers] = useState(new Set())
  const [mpHasCalledUnoThisRound, setMpHasCalledUnoThisRound] = useState(false)
  const [mpWinner, setMpWinner] = useState(null)
  const [mpSkippedInfo, setMpSkippedInfo] = useState(null)
  const [mpStackingEnabled, setMpStackingEnabled] = useState(true)
  const [mpPendingDrawCount, setMpPendingDrawCount] = useState(0)
  const [mpPendingStackType, setMpPendingStackType] = useState(null)
  const [mpConnectionStatus, setMpConnectionStatus] = useState('connected') // 'connected' | 'reconnecting' | 'disconnected'
  const myProfileRef = useRef({ name: 'Player', avatar: '😎', roomCode: '' })
  const screenRef = useRef(screen)

  useEffect(() => {
    screenRef.current = screen
  }, [screen])

  // Authoritative host master state (immune to React stale closures)
  const hostGameRef = useRef({
    roomCode: '',
    players: [],
    drawPile: [],
    discardPile: [],
    hands: new Map(), // playerId -> card[]
    topCard: null,
    activeColor: null,
    currentPlayerIndex: 0,
    direction: 1,
    unoCalledPlayers: new Set(),
    hasDrawnThisTurn: false,
    winner: null,
    rankings: [], // [{ playerId, name, avatar, isHost, rank, remainingCards }]
    actionMessage: '',
    skippedInfo: null,
    stackingEnabled: true,
    pendingDrawCount: 0,
    pendingStackType: null,
  })

  // Network peer instances and dynamic callbacks ref
  const hostNetworkRef = useRef(null)
  const clientNetworkRef = useRef(null)
  const onClientDataRef = useRef(null)

  const runHostActionRef = useRef(null)

  // Guards against a double-tap on the draw pile firing two ACTION_DRAW_CARDs before
  // the host's reply lands. mpCurrentPlayerIndex is an intentional extra dependency:
  // the lock must also clear on a turn change, even when hasDrawn was already false.
  const isDrawingMpRef = useRef(false)
  useEffect(() => {
    if (!mpHasDrawnCardThisTurn) {
      isDrawingMpRef.current = false
    }
  }, [mpHasDrawnCardThisTurn, mpCurrentPlayerIndex])

  const disconnectTurnTimerRef = useRef(null)
  const penaltyTimeoutRef = useRef(null)
  // The catch this player last gave a card to (see handleConfirmGiveCardMp).
  const submittedPenaltyIdRef = useRef(null)

  // Chat architecture (P2P WebRTC transport + ChatService)
  const [chatTransport] = useState(() => new PeerJsChatTransport())
  const [chatService] = useState(() => new ChatService({ transport: chatTransport }))
  const chatServiceRef = useRef(chatService)
  useEffect(() => {
    chatServiceRef.current = chatService
  }, [chatService])

  const myMpPlayer =
    mpPlayers.find((p) => p.id === myPlayerId) ||
    mpRoomState.players?.find((p) => p.id === myPlayerId) || {
      id: myPlayerId,
      name: mpRoomState.isHost ? 'Host' : 'Player',
      avatar: mpRoomState.isHost ? '👑' : '👤',
    }

  const {
    messages: chatMessages,
    isChatOpen,
    unreadCount: unreadChatCount,
    activeToast: chatActiveToast,
    openChat,
    closeChat,
    dismissToast,
    sendMessage: handleSendChatMessage,
  } = useChat({
    chatService,
    currentUserId: myPlayerId,
    currentUserName: myMpPlayer.name,
    currentUserAvatar: myMpPlayer.avatar,
  })

  const showRules = isRulesOpen !== undefined ? isRulesOpen : internalRulesOpen
  const handleCloseRules = onCloseRules || (() => setInternalRulesOpen(false))

  // Clean up WebRTC and timers on unmount
  useEffect(() => {
    return () => {
      if (clientNetworkRef.current) {
        try {
          clientNetworkRef.current.sendAction({
            type: 'ACTION_LEAVE',
            playerId: myPlayerIdRef.current,
          })
        } catch {
          // ignore
        }
        clientNetworkRef.current.destroy()
      }
      if (hostNetworkRef.current) hostNetworkRef.current.destroy()
      if (disconnectTurnTimerRef.current) clearTimeout(disconnectTurnTimerRef.current)
      if (penaltyTimeoutRef.current) clearTimeout(penaltyTimeoutRef.current)
      try {
        chatService.destroy()
      } catch {
        // ignore
      }
    }
  }, [chatService])

  // ==========================================
  // 3. MULTIPLAYER WEBRTC GAME ENGINE
  // ==========================================

  // Broadcasts state to all connected clients & updates host UI
  const hostBroadcastGameState = useCallback((customMessage = null) => {
    const g = hostGameRef.current
    if (!g) return

    const sanitizedPlayers = sanitizePlayers(g)
    const message = customMessage !== null ? customMessage : g.actionMessage || ''

    // 1. Update Host local UI
    setMpPlayers(sanitizedPlayers)
    setMpRankings(g.rankings || [])
    setMpTopCard(g.topCard)
    setMpActiveColor(g.activeColor)
    setMpCurrentPlayerIndex(g.currentPlayerIndex)
    setMpDirection(g.direction)
    setMpDrawPileCount(g.drawPile.length)
    setMpActionMessage(message)
    setMpUnoCalledPlayers((prev) => {
      const next = new Set(g.unoCalledPlayers)
      return sameMembers(prev, next) ? prev : next
    })
    setMpHasDrawnCardThisTurn(g.hasDrawnThisTurn)
    setMpSkippedInfo(g.skippedInfo || null)
    setMpPendingDrawCount(g.pendingDrawCount || 0)
    setMpPendingStackType(g.pendingStackType || null)
    const hostHandNow = [...handOf(g, HOST_PLAYER_ID)]
    setMyHand(hostHandNow)
    if (hostHandNow.length > 1) {
      setMpHasCalledUnoThisRound(false)
    } else if (g.unoCalledPlayers.has(0)) {
      setMpHasCalledUnoThisRound(true)
    }

    if (g.winner) {
      setMpWinner(g.winner)
      setScreen('mp_gameover')
    }

    // 2. Broadcast personalized state to each client over WebRTC
    if (hostNetworkRef.current) {
      g.players.forEach((p) => {
        if (!p.isHost && p.peerId) {
          hostNetworkRef.current.sendTo(p.peerId, {
            type: 'SYNC_GAME_STATE',
            yourPlayerId: p.id,
            hand: [...handOf(g, p.id)],
            topCard: g.topCard,
            activeColor: g.activeColor,
            currentPlayerIndex: g.currentPlayerIndex,
            direction: g.direction,
            drawPileCount: g.drawPile.length,
            players: sanitizedPlayers,
            rankings: g.rankings || [],
            actionMessage: message,
            unoCalledPlayers: Array.from(g.unoCalledPlayers),
            hasDrawnThisTurn: g.hasDrawnThisTurn,
            winner: g.winner,
            skippedInfo: g.skippedInfo || null,
            pendingDrawCount: g.pendingDrawCount || 0,
            pendingStackType: g.pendingStackType || null,
            stackingEnabled: g.stackingEnabled !== false,
            catchPenalty: publicCatchPenalty(g),
          })
        }
      })
    }
  }, [])

  // -----------------------------------------------------------------
  // Host action dispatch
  //
  // All rules live in engine/hostEngine.js. The component's job is only to run an
  // engine call against the authoritative game object, turn the events it reports
  // into side effects (sound, modals, timers), and broadcast the new state.
  // -----------------------------------------------------------------

  const playEngineSound = useCallback((name) => {
    switch (name) {
      case SOUNDS.CARD_PLAY:
        playCardPlaySound()
        break
      case SOUNDS.CARD_DRAW:
        playCardDrawSound()
        break
      case SOUNDS.ACTION_PENALTY:
        playActionCardSound(true)
        break
      case SOUNDS.ACTION_NEUTRAL:
        playActionCardSound(false)
        break
      case SOUNDS.UNO_CALL:
        playUnoCallSound()
        break
      default:
        break
    }
  }, [])

  const applyEngineEvents = useCallback(
    (events) => {
      for (const event of events) {
        switch (event.type) {
          case 'SOUND':
            playEngineSound(event.sound)
            break

          case 'BROADCAST':
            hostNetworkRef.current?.broadcast(event.message)
            break

          case 'CELEBRATE':
            // Only the host's own placement pops a modal here; clients get theirs
            // from the rankings in SYNC_GAME_STATE.
            if (event.playerId === HOST_PLAYER_ID) {
              hasShownMyCelebrationRef.current = true
              setFinishedCelebration({
                isOpen: true,
                rank: event.rank,
                playerName: 'You',
                activeRemaining: event.activeRemaining,
              })
            }
            break

          case 'PENALTY_STARTED': {
            if (event.giverIds.includes(HOST_PLAYER_ID)) {
              setPenaltyGiveCardModal({
                isOpen: true,
                mode: 'mp',
                penaltyId: event.penaltyId,
                targetPlayerId: event.targetPlayerId,
                targetPlayerName: event.targetPlayerName,
                challengerId: event.challengerId,
              challengerName: event.challengerName,
                botGifts: [],
              })
            }
            // One AFK giver must not be able to stall the match.
            if (penaltyTimeoutRef.current) clearTimeout(penaltyTimeoutRef.current)
            penaltyTimeoutRef.current = setTimeout(() => {
              penaltyTimeoutRef.current = null
              runHostActionRef.current?.(forceResolvePenalty)
            }, PENALTY_TIMEOUT_MS)
            break
          }

          case 'PENALTY_RESOLVED':
            if (penaltyTimeoutRef.current) {
              clearTimeout(penaltyTimeoutRef.current)
              penaltyTimeoutRef.current = null
            }
            setPenaltyGiveCardModal((prev) => ({ ...prev, isOpen: false }))
            break

          default:
            break
        }
      }
    },
    [playEngineSound]
  )

  /**
   * Run one engine action against the authoritative game and publish the result.
   * A rejected action changes nothing and is not broadcast.
   */
  const runHostAction = useCallback(
    (action, origin = null) => {
      const g = hostGameRef.current
      if (!g) return false

      const result = action(g)
      if (!result.ok) {
        console.warn('[Host] rejected action:', result.reason)
        // A refusal used to stop here, on the host's console. The person who tapped
        // saw their button do nothing at all -- which is what made losing a race to
        // catch someone look like a broken button. Tell them why.
        if (origin && result.reason) {
          if (origin.playerId === HOST_PLAYER_ID) {
            setMpActionMessage(capitalise(result.reason))
          } else if (origin.peerId) {
            hostNetworkRef.current?.sendTo(origin.peerId, {
              type: 'ACTION_REJECTED',
              reason: capitalise(result.reason),
            })
          }
        }
        return false
      }

      applyEngineEvents(result.events)
      hostBroadcastGameState()
      return true
    },
    [applyEngineEvents, hostBroadcastGameState]
  )

  // Lets the penalty timeout reach the latest runHostAction without re-arming itself.
  useEffect(() => {
    runHostActionRef.current = runHostAction
  }, [runHostAction])

  const hostProcessPlayCard = useCallback(
    (playerId, cardId, chosenColor = null, fallbackCard = null) =>
      runHostAction((g) => playCard(g, playerId, cardId, chosenColor, fallbackCard)),
    [runHostAction]
  )

  const hostProcessDrawCard = useCallback(
    (playerId) => runHostAction((g) => drawCard(g, playerId)),
    [runHostAction]
  )

  const hostProcessPassTurn = useCallback(
    (playerId) => runHostAction((g) => passTurn(g, playerId)),
    [runHostAction]
  )

  const hostProcessCallUno = useCallback(
    (playerId, playerName) => runHostAction((g) => callUno(g, playerId, playerName)),
    [runHostAction]
  )

  const hostProcessCatchUno = useCallback(
    (challengerId, targetPlayerId, origin = null) =>
      runHostAction((g) => catchUno(g, challengerId, targetPlayerId), origin),
    [runHostAction]
  )

  const hostProcessSubmitPenaltyCard = useCallback(
    (giverId, card, penaltyId) =>
      runHostAction((g) => submitPenaltyCard(g, giverId, card, penaltyId)),
    [runHostAction]
  )


  // Host authoritative handler when a player leaves or disconnects
  const hostProcessClientLeave = useCallback(
    (clientPeerId, explicitPlayerId = null) => {
      const g = hostGameRef.current
      if (!g) return

      if (hostNetworkRef.current) {
        hostNetworkRef.current.removeConnection(clientPeerId)
      }

      const player = g.players.find(
        (p) => p.peerId === clientPeerId || (explicitPlayerId !== null && p.id === explicitPlayerId)
      )
      if (!player || player.isHost) return

      const isGameActive = isMatchInProgress(g) && !g.winner

      if (isGameActive) {
        // If match is active, mark disconnected so player can reconnect without losing hand
        player.peerId = null
        player.connected = false

        const penalty = g.pendingCatchPenalty
        if (penalty) {
          if (penalty.targetPlayerId === player.id) {
            // The caught player left; there is nobody to hand the cards to.
            g.pendingCatchPenalty = null
            if (penaltyTimeoutRef.current) {
              clearTimeout(penaltyTimeoutRef.current)
              penaltyTimeoutRef.current = null
            }
            setPenaltyGiveCardModal((prev) => ({ ...prev, isOpen: false }))
          } else if (penalty.giverIds.includes(player.id)) {
            // Drop them from the collection; resolve if they were the last holdout.
            penalty.giverIds = penalty.giverIds.filter((id) => id !== player.id)
            penalty.givenCards.delete(player.id)
            if (penalty.giverIds.every((id) => penalty.givenCards.has(id))) {
              runHostActionRef.current?.(finalizeCatchPenalty)
            }
          }
        }

        // 1. Check if only 1 connected active player remains in the game
        const connectedActive = g.players.filter(
          (p) => p.connected !== false && handOf(g, p.id).length > 0 && p.rank == null
        )
        if (connectedActive.length <= 1) {
          if (disconnectTurnTimerRef.current) clearTimeout(disconnectTurnTimerRef.current)
          disconnectTurnTimerRef.current = setTimeout(() => {
            const curG = hostGameRef.current
            if (!curG || curG.winner) return
            const curConnected = curG.players.filter(
              (p) => p.connected !== false && handOf(curG, p.id).length > 0 && p.rank == null
            )
            if (curConnected.length === 1) {
              const soleWinner = curConnected[0]
              curG.winner = {
                playerId: soleWinner.id,
                name: soleWinner.name,
                avatar: soleWinner.avatar,
                isHost: soleWinner.isHost,
                rank: 1,
                remainingCards: handOf(curG, soleWinner.id).length,
              }
              curG.actionMessage = `🏆 ${soleWinner.name} wins! All other opponents disconnected.`
              hostBroadcastGameState()
            }
          }, 15000)
        } else if (g.players[g.currentPlayerIndex]?.id === player.id) {
          // 2. Disconnected player's turn is active: give 12s to reconnect before auto-passing turn
          if (disconnectTurnTimerRef.current) clearTimeout(disconnectTurnTimerRef.current)
          disconnectTurnTimerRef.current = setTimeout(() => {
            const curG = hostGameRef.current
            if (!curG || curG.winner) return
            const curActive = curG.players[curG.currentPlayerIndex]
            if (curActive && curActive.connected === false) {
              const nextIdx = getNextActivePlayerIndex(
                curG.currentPlayerIndex,
                1,
                curG.players,
                curG.direction,
                (p) => handOf(curG, p.id).length === 0 || p.rank != null
              )
              curG.currentPlayerIndex = nextIdx
              curG.hasDrawnThisTurn = false
              curG.actionMessage = `${curActive.name} disconnected. Turn passed to ${curG.players[nextIdx]?.name || 'next player'}.`
              hostBroadcastGameState()
            }
          }, 12000)
        }

        hostBroadcastGameState(`${player.name} temporarily disconnected. Waiting for reconnect...`)
        return
      }

      // If in lobby, remove player normally and re-index player IDs cleanly (0 is Host, 1, 2...)
      const filtered = g.players.filter((p) => p.id !== player.id)
      const reIndexed = filtered.map((p, idx) => ({
        ...p,
        id: idx,
        isHost: idx === 0,
      }))
      g.players = reIndexed

      if (hostNetworkRef.current) {
        hostNetworkRef.current.broadcast({
          type: 'ROOM_UPDATE',
          roomCode: g.roomCode,
          players: reIndexed,
          maxPlayers: g.maxPlayers || 4,
          stackingEnabled: g.stackingEnabled !== false,
        })
      }
      setMpRoomState((prev) => ({ ...prev, players: reIndexed }))
    },
    [hostBroadcastGameState]
  )

  // Connect client data ref to latest authoritative processors
  useEffect(() => {
    onClientDataRef.current = (clientPeerId, data) => {
      if (!data) return
      const g = hostGameRef.current
      if (!g) return

      // Look up player directly by peer connection ID
      const player = g.players.find((p) => p.peerId === clientPeerId)
      const playerId = player ? player.id : (data.playerId !== undefined ? data.playerId : g.currentPlayerIndex)

      if (data.type === 'CHAT_MESSAGE') {
        chatTransport.handleIncoming(data)
        hostNetworkRef.current?.broadcast(data)
      } else if (data.type === 'ACTION_PLAY_CARD') {
        hostProcessPlayCard(playerId, data.cardId, data.chosenColor, data.card)
      } else if (data.type === 'ACTION_DRAW_CARD') {
        hostProcessDrawCard(playerId)
      } else if (data.type === 'ACTION_PASS_TURN') {
        hostProcessPassTurn(playerId)
      } else if (data.type === 'ACTION_CALL_UNO') {
        hostProcessCallUno(playerId, player?.name || data.playerName || 'Player')
      } else if (data.type === 'ACTION_CATCH_UNO') {
        hostProcessCatchUno(playerId, data.targetPlayerId, { playerId, peerId: clientPeerId })
      } else if (data.type === 'ACTION_SUBMIT_PENALTY_CARD') {
        hostProcessSubmitPenaltyCard(playerId, data.card, data.penaltyId)
      } else if (data.type === 'ACTION_REQUEST_SYNC') {
        hostBroadcastGameState('Host synchronized game state.')
      } else if (data.type === 'ACTION_LEAVE') {
        hostProcessClientLeave(clientPeerId, data.playerId)
      }
    }
  }, [
    chatTransport,
    hostProcessPlayCard,
    hostProcessDrawCard,
    hostProcessPassTurn,
    hostProcessCallUno,
    hostProcessCatchUno,
    hostProcessSubmitPenaltyCard,
    hostBroadcastGameState,
    hostProcessClientLeave,
  ])

  // Inform host immediately if tab or window is closing / navigating away
  useEffect(() => {
    const handleLeaveGracefully = () => {
      if (clientNetworkRef.current) {
        try {
          clientNetworkRef.current.sendAction({
            type: 'ACTION_LEAVE',
            playerId: myPlayerIdRef.current,
          })
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener('beforeunload', handleLeaveGracefully)
    window.addEventListener('pagehide', handleLeaveGracefully)
    return () => {
      window.removeEventListener('beforeunload', handleLeaveGracefully)
      window.removeEventListener('pagehide', handleLeaveGracefully)
    }
  }, [])

  // Host creates room
  const handleCreateRoom = ({ name, avatar, maxPlayers, enableStacking = true }) => {
    if (clientNetworkRef.current) {
      try {
        clientNetworkRef.current.destroy()
      } catch (e) {
        console.error('[Host] Error destroying client peer when creating room:', e)
      }
      clientNetworkRef.current = null
    }
    if (hostNetworkRef.current) {
      try {
        hostNetworkRef.current.destroy()
      } catch (e) {
        console.error('[Host] Error destroying old host peer when creating room:', e)
      }
      hostNetworkRef.current = null
    }

    const code = generateRoomCode()
    setUrlRoomCode(code)
    try {
      sessionStorage.setItem('uno_active_room', code)
    } catch {
      // ignore
    }
    const hostPlayer = {
      id: HOST_PLAYER_ID,
      name,
      avatar,
      isHost: true,
      isYou: true,
      connected: true,
      sessionId: getClientSessionId(),
    }
    myProfileRef.current = { name, avatar, roomCode: code }
    setMpConnectionStatus('connected')

    hostGameRef.current = createHostGame({
      roomCode: code,
      hostPlayer,
      maxPlayers,
      stackingEnabled: enableStacking,
    })

    setMpRoomState({
      isInRoom: false,
      isHost: true,
      roomCode: code,
      players: [hostPlayer],
      maxPlayers,
      stackingEnabled: enableStacking,
      isConnecting: true,
      error: '',
    })
    setMpStackingEnabled(enableStacking)
    setMpPendingDrawCount(0)
    setMpPendingStackType(null)
    setMyPlayerId(0)
    myPlayerIdRef.current = 0

    const hostPeer = initHostPeer({
      roomCode: code,
      onOpen: () => {
        setMpRoomState((prev) => ({
          ...prev,
          isInRoom: true,
          isConnecting: false,
        }))
      },
      onClientJoin: async (clientPeerId, clientPlayer, conn) => {
        const g = hostGameRef.current
        if (!g) return

        const result = await admitPlayer({
          game: g,
          clientPeerId,
          clientPlayer,
          conn,
          net: {
            removeConnection: (peerId) => hostNetworkRef.current?.removeConnection(peerId),
            checkPeerResponsive: (peerId, timeout) =>
              hostNetworkRef.current
                ? hostNetworkRef.current.checkPeerResponsive(peerId, timeout)
                : Promise.resolve(false),
          },
        })

        if (result.status === ADMIT.REJECTED) return

        const welcome = {
          type: 'WELCOME',
          playerId: result.player.id,
          roomCode: g.roomCode,
          players: g.players,
          maxPlayers: g.maxPlayers || 4,
          stackingEnabled: g.stackingEnabled !== false,
        }
        try {
          conn.send(welcome)
        } catch (e) {
          console.error('[Host] Failed to send WELCOME:', e)
        }

        const recentChat = chatService.getHistory() || []
        if (recentChat.length > 0) {
          try {
            conn.send({
              type: 'SYNC_CHAT',
              payload: recentChat,
            })
          } catch (e) {
            console.warn('[Host] Failed to send SYNC_CHAT:', e)
          }
        }

        if (result.status === ADMIT.RECONNECTED) {
          // Mid-match: this player needs their own hand back, which only a targeted
          // sync can carry.
          try {
            conn.send({
              type: 'SYNC_GAME_STATE',
              yourPlayerId: result.player.id,
              hand: [...handOf(g, result.player.id)],
              topCard: g.topCard,
              activeColor: g.activeColor,
              currentPlayerIndex: g.currentPlayerIndex,
              direction: g.direction,
              drawPileCount: g.drawPile.length,
              players: sanitizePlayers(g),
              rankings: g.rankings || [],
              actionMessage: `${result.player.name} reconnected to the game!`,
              unoCalledPlayers: Array.from(g.unoCalledPlayers),
              hasDrawnThisTurn: g.hasDrawnThisTurn,
              winner: g.winner,
              skippedInfo: g.skippedInfo || null,
              pendingDrawCount: g.pendingDrawCount || 0,
              pendingStackType: g.pendingStackType || null,
              stackingEnabled: g.stackingEnabled !== false,
              catchPenalty: publicCatchPenalty(g),
            })
          } catch (e) {
            console.error('[Host] Failed to send SYNC_GAME_STATE on reconnect:', e)
          }

          // They are back, so cancel the auto-pass / sole-survivor countdown.
          if (disconnectTurnTimerRef.current) {
            clearTimeout(disconnectTurnTimerRef.current)
            disconnectTurnTimerRef.current = null
          }

          hostBroadcastGameState(`${result.player.name} reconnected!`)
          setMpRoomState((prev) => ({ ...prev, players: g.players }))
          return
        }

        // Lobby paths: everyone just needs the updated roster.
        setTimeout(() => {
          hostNetworkRef.current?.broadcast({
            type: 'ROOM_UPDATE',
            roomCode: g.roomCode,
            players: g.players,
            maxPlayers: g.maxPlayers || 4,
            stackingEnabled: g.stackingEnabled !== false,
          })
        }, 50)

        setMpRoomState((prev) => ({ ...prev, players: g.players }))
      },

      onClientLeave: (clientPeerId) => {
        hostProcessClientLeave(clientPeerId)
      },
      onClientData: (clientPeerId, data) => {
        if (onClientDataRef.current) {
          onClientDataRef.current(clientPeerId, data)
        }
      },
      onError: (err) => {
        setMpRoomState((prev) => ({
          ...prev,
          isConnecting: false,
          error: err.message || 'Connection error. Please try again.',
        }))
      },
    })

    hostNetworkRef.current = hostPeer
    chatTransport.setSendFunction((data) => hostPeer.broadcast(data))
  }

  // Client joins room
  const handleJoinRoom = ({ name, avatar, roomCode }) => {
    if (clientNetworkRef.current) {
      try {
        clientNetworkRef.current.destroy()
      } catch (e) {
        console.error('[Client] Error destroying existing client peer:', e)
      }
      clientNetworkRef.current = null
    }

    myProfileRef.current = { name, avatar, roomCode }
    setMpConnectionStatus('reconnecting')
    setMpRoomState((prev) => ({
      ...prev,
      isConnecting: true,
      error: '',
    }))

    const clientPeer = initClientPeer({
      roomCode,
      player: { name, avatar, sessionId: getClientSessionId() },
      onConnected: () => {
        chatTransport.setSendFunction((data) => {
          clientNetworkRef.current?.sendAction(data)
        })
        setMpConnectionStatus('connected')
        setMpRoomState((prev) => ({
          ...prev,
          roomCode,
          isConnecting: true,
          // note: do not set isInRoom: true until host sends WELCOME or SYNC_GAME_STATE!
        }))
      },
      onData: (data) => {
        if (data.type === 'CHAT_MESSAGE' || data.type === 'SYNC_CHAT') {
          chatTransport.handleIncoming(data)
          return
        }
        if (data.type === 'ROOM_ERROR') {
          setMpConnectionStatus('disconnected')
          if (clientNetworkRef.current) {
            try {
              clientNetworkRef.current.destroy()
            } catch {
              // ignore
            }
            clientNetworkRef.current = null
          }
          setMpRoomState((prev) => ({
            ...prev,
            isConnecting: false,
            isInRoom: false,
            error: data.error || 'Unable to join room.',
          }))
          return
        }
        if (data.type === 'WELCOME') {
          setUrlRoomCode(roomCode)
          try {
            sessionStorage.setItem('uno_active_room', roomCode)
            sessionStorage.setItem('uno_last_room', roomCode)
          } catch {
            // ignore
          }
          setMyPlayerId(data.playerId)
          myPlayerIdRef.current = data.playerId
          if (data.stackingEnabled !== undefined) {
            setMpStackingEnabled(data.stackingEnabled)
          }
          if (data.players) {
            setMpRoomState((prev) => ({
              ...prev,
              isInRoom: true,
              isHost: false,
              roomCode,
              error: '',
              isConnecting: false,
              maxPlayers: data.maxPlayers || prev.maxPlayers,
              stackingEnabled: data.stackingEnabled !== undefined ? data.stackingEnabled : prev.stackingEnabled,
              players: data.players.map((p) => ({
                ...p,
                isYou: p.id === data.playerId,
              })),
            }))
          }
        } else if (data.type === 'ROOM_UPDATE') {
          if (data.stackingEnabled !== undefined) {
            setMpStackingEnabled(data.stackingEnabled)
          }
          const myPlayer = data.players.find(
            (p) => (!p.isHost && p.name === name) || p.id === myPlayerIdRef.current
          )
          if (myPlayer) {
            setMyPlayerId(myPlayer.id)
            myPlayerIdRef.current = myPlayer.id
          }
          setMpRoomState((prev) => ({
            ...prev,
            maxPlayers: data.maxPlayers !== undefined ? data.maxPlayers : prev.maxPlayers,
            stackingEnabled: data.stackingEnabled !== undefined ? data.stackingEnabled : prev.stackingEnabled,
            players: data.players.map((p) => ({
              ...p,
              isYou: myPlayer ? p.id === myPlayer.id : p.id === myPlayerIdRef.current,
            })),
          }))
        } else if (data.type === 'SYNC_GAME_STATE') {
          setUrlRoomCode(roomCode)
          try {
            sessionStorage.setItem('uno_active_room', roomCode)
            sessionStorage.setItem('uno_last_room', roomCode)
          } catch {
            // ignore
          }
          setMpConnectionStatus('connected')
          if (data.yourPlayerId !== undefined) {
            setMyPlayerId(data.yourPlayerId)
            myPlayerIdRef.current = data.yourPlayerId
          }
          setMpRoomState((prev) => ({
            ...prev,
            isInRoom: true,
            isHost: false,
            roomCode,
            error: '',
            isConnecting: false,
          }))
          const myHandNow = data.hand || []
          setMyHand(myHandNow)
          setMpPlayers(data.players || [])
          setMpTopCard(data.topCard)
          setMpActiveColor(data.activeColor)
          setMpCurrentPlayerIndex(data.currentPlayerIndex)
          setMpDirection(data.direction)
          setMpDrawPileCount(data.drawPileCount)
          setMpActionMessage(data.actionMessage)
          const unoSet = new Set(data.unoCalledPlayers || [])
          setMpUnoCalledPlayers((prev) => (sameMembers(prev, unoSet) ? prev : unoSet))
          setMpHasDrawnCardThisTurn(data.hasDrawnThisTurn || false)
          if (myHandNow.length > 1) {
            setMpHasCalledUnoThisRound(false)
          } else if (unoSet.has(myPlayerIdRef.current)) {
            setMpHasCalledUnoThisRound(true)
          }
          setMpSkippedInfo(data.skippedInfo || null)
          setMpPendingDrawCount(data.pendingDrawCount || 0)
          setMpPendingStackType(data.pendingStackType || null)
          if (data.stackingEnabled !== undefined) {
            setMpStackingEnabled(data.stackingEnabled)
          }

          if (data.rankings) {
            setMpRankings(data.rankings)
            if (data.rankings.length === 0) {
              hasShownMyCelebrationRef.current = false
              setFinishedCelebration({ isOpen: false, rank: 1, playerName: 'You', activeRemaining: 2 })
            } else {
              const myRankRecord = data.rankings.find((r) => r.playerId === myPlayerIdRef.current)
              if (myRankRecord && !hasShownMyCelebrationRef.current && !data.winner) {
                hasShownMyCelebrationRef.current = true
                const remainingActive = (data.players || []).filter((p) => (p.cardCount || 0) > 0).length
                setFinishedCelebration({
                  isOpen: true,
                  rank: myRankRecord.rank,
                  playerName: 'You',
                  activeRemaining: remainingActive,
                })
              }
            }
          }

          // The give-a-card prompt follows the host's snapshot. It used to be opened by
          // PENALTY_CARD_REQUEST and then closed by the sync right behind it, so no
          // client ever got to answer and every catch waited out the timeout.
          const catchPenalty = data.catchPenalty || null
          const meId = myPlayerIdRef.current
          const owesCard =
            catchPenalty &&
            catchPenalty.giverIds.includes(meId) &&
            !catchPenalty.givenIds.includes(meId) &&
            submittedPenaltyIdRef.current !== catchPenalty.penaltyId
          setPenaltyGiveCardModal((prev) => {
            if (owesCard) {
              if (prev.isOpen && prev.mode === 'mp' && prev.penaltyId === catchPenalty.penaltyId) {
                return prev
              }
              return {
                isOpen: true,
                mode: 'mp',
                penaltyId: catchPenalty.penaltyId,
                targetPlayerId: catchPenalty.targetPlayerId,
                targetPlayerName: catchPenalty.targetPlayerName,
                challengerId: catchPenalty.challengerId,
                challengerName: catchPenalty.challengerName,
                botGifts: [],
              }
            }
            return prev.isOpen && prev.mode === 'mp' ? { ...prev, isOpen: false } : prev
          })

          if (data.winner) {
            setMpWinner(data.winner)
            setFinishedCelebration((prev) => ({ ...prev, isOpen: false }))
            setScreen('mp_gameover')
          } else {
            setScreen('mp_playing')
          }
        } else if (data.type === 'ROOM_RESET_TO_LOBBY') {
          if (data.players) {
            setMpRoomState((prev) => ({
              ...prev,
              isInRoom: true,
              players: data.players.map((p) => ({
                ...p,
                isYou: p.id === myPlayerIdRef.current,
              })),
            }))
          }
          setScreen('mp_lobby')
          setMpPendingDrawCount(0)
          setMpPendingStackType(null)
          setMpRankings([])
          hasShownMyCelebrationRef.current = false
          setFinishedCelebration({ isOpen: false, rank: 1, playerName: 'You', activeRemaining: 2 })
          setPenaltyGiveCardModal({
            isOpen: false,
            mode: 'mp',
            penaltyId: null,
            targetPlayerId: null,
            targetPlayerName: '',
            challengerId: null,
            botGifts: [],
          })
          setMpActionMessage('Host returned all players to room lobby.')
        } else if (data.type === 'UNO_SHOUTED') {
          playUnoCallSound()
          setMpUnoCalledPlayers((prev) => new Set(prev).add(data.playerId))
          setMpActionMessage(`🔔 ${data.playerName} shouted UNO!`)
        } else if (data.type === 'ACTION_REJECTED') {
          setMpActionMessage(data.reason)
        } else if (data.type === 'PENALTY_CARD_REQUEST') {
          if (data.giverIds && data.giverIds.includes(myPlayerIdRef.current)) {
            setPenaltyGiveCardModal({
              isOpen: true,
              mode: 'mp',
              penaltyId: data.penaltyId,
              targetPlayerId: data.targetPlayerId,
              targetPlayerName: data.targetPlayerName,
              challengerId: data.challengerId,
              challengerName: data.challengerName,
              botGifts: [],
            })
          }
        } else if (data.type === 'UNO_CAUGHT') {
          playActionCardSound(true)
          setMpActionMessage(data.message)
          setPenaltyGiveCardModal((prev) => ({ ...prev, isOpen: false }))
        }
      },
      onDisconnected: () => {
        setMpConnectionStatus('disconnected')
        if (screenRef.current === 'mp_playing') {
          setMpActionMessage('Connection interrupted. Click Menu or Reconnect to restore state.')
        } else {
          setMpRoomState((prev) => ({
            ...prev,
            isInRoom: false,
            isConnecting: false,
            error: prev.error || 'Disconnected from host or room closed.',
          }))
          setScreen('mp_lobby')
        }
      },
      onError: (err) => {
        setMpConnectionStatus('disconnected')
        setMpRoomState((prev) => ({
          ...prev,
          isConnecting: false,
          isInRoom: false,
          error: prev.error || err?.message || 'Could not connect to room. Check code and try again.',
        }))
      },
    })

    clientNetworkRef.current = clientPeer
    chatTransport.setSendFunction((data) => clientPeer.sendAction(data))
  }

  // Host starts the match (Host ALWAYS has the first move: currentPlayerIndex = 0)
  const handleHostStartGame = () => {
    if (disconnectTurnTimerRef.current) {
      clearTimeout(disconnectTurnTimerRef.current)
      disconnectTurnTimerRef.current = null
    }
    if (penaltyTimeoutRef.current) {
      clearTimeout(penaltyTimeoutRef.current)
      penaltyTimeoutRef.current = null
    }

    const g = hostGameRef.current
    if (!g) return
    startMatch(g)

    setMpConnectionStatus('connected')
    setMpRoomState((prev) => ({
      ...prev,
      isInRoom: true,
      isHost: true,
      error: '',
    }))
    setScreen('mp_playing')
    setMpCurrentPlayerIndex(0)
    setMyPlayerId(HOST_PLAYER_ID)
    myPlayerIdRef.current = HOST_PLAYER_ID
    setMpWinner(null)
    setMpRankings([])
    setMpSkippedInfo(null)
    setMpPendingDrawCount(0)
    setMpPendingStackType(null)
    hasShownMyCelebrationRef.current = false
    setFinishedCelebration({ isOpen: false, rank: 1, playerName: 'You', activeRemaining: 2 })
    setPenaltyGiveCardModal({
      isOpen: false,
      mode: 'mp',
      penaltyId: null,
      targetPlayerId: null,
      targetPlayerName: '',
      challengerId: null,
      botGifts: [],
    })

    hostBroadcastGameState('Game started! Host has the first move.')
  }

  // Action dispatchers (work for both Host locally and Clients over network)
  const handleMpPlayCard = (card) => {
    if (card.color === CARD_COLORS.WILD) {
      setPendingCard(card)
      setColorPickerOpen(true)
    } else {
      dispatchMpPlayCard(card, card.color)
    }
  }

  const dispatchMpPlayCard = (card, color) => {
    if (mpRoomState.isHost) {
      hostProcessPlayCard(HOST_PLAYER_ID, card.id, color, card)
    } else if (clientNetworkRef.current) {
      clientNetworkRef.current.sendAction({
        type: 'ACTION_PLAY_CARD',
        playerId: myPlayerIdRef.current,
        cardId: card.id,
        card,
        chosenColor: color,
      })
    }
  }

  const handleMpDrawCard = () => {
    if (isDrawingMpRef.current) return
    if (mpHasDrawnCardThisTurn && mpPendingDrawCount === 0) return
    isDrawingMpRef.current = true

    // Safety fallback: release drawing lock after 2000ms if network response is delayed
    setTimeout(() => {
      isDrawingMpRef.current = false
    }, 2000)

    if (mpRoomState.isHost) {
      hostProcessDrawCard(HOST_PLAYER_ID)
    } else if (clientNetworkRef.current) {
      clientNetworkRef.current.sendAction({
        type: 'ACTION_DRAW_CARD',
        playerId: myPlayerIdRef.current,
      })
    }
  }

  const handleMpPassTurn = () => {
    if (mpRoomState.isHost) {
      hostProcessPassTurn(HOST_PLAYER_ID)
    } else if (clientNetworkRef.current) {
      clientNetworkRef.current.sendAction({
        type: 'ACTION_PASS_TURN',
        playerId: myPlayerIdRef.current,
      })
    }
  }

  const handleMpCallUno = () => {
    setMpHasCalledUnoThisRound(true)
    const myPlayer = mpRoomState.players.find((p) => p.id === myPlayerIdRef.current)

    if (mpRoomState.isHost) {
      hostProcessCallUno(HOST_PLAYER_ID, myPlayer?.name || 'Host')
    } else if (clientNetworkRef.current) {
      clientNetworkRef.current.sendAction({
        type: 'ACTION_CALL_UNO',
        playerId: myPlayerIdRef.current,
        playerName: myPlayer?.name || 'Friend',
      })
    }
  }

  const handleMpCatchUno = useCallback(
    (targetPlayerId) => {
      const targetPlayer = mpPlayers.find((p) => p.id === targetPlayerId)
      if (!targetPlayer) return

      if (targetPlayer.rank != null) {
        setMpActionMessage(`${targetPlayer.name} has already finished the match!`)
        return
      }
      if (targetPlayer.cardCount !== 1) {
        setMpActionMessage(
          `${targetPlayer.name} has ${targetPlayer.cardCount} cards (must have exactly 1 card to be caught).`
        )
        return
      }
      if (mpUnoCalledPlayers.has(targetPlayerId)) {
        setMpActionMessage(`${targetPlayer.name} already called UNO!`)
        return
      }

      if (mpRoomState.isHost) {
        hostProcessCatchUno(myPlayerIdRef.current, targetPlayerId, {
          playerId: myPlayerIdRef.current,
        })
      } else if (clientNetworkRef.current) {
        clientNetworkRef.current.sendAction({
          type: 'ACTION_CATCH_UNO',
          challengerId: myPlayerIdRef.current,
          targetPlayerId,
        })
      }
    },
    [mpPlayers, mpUnoCalledPlayers, mpRoomState.isHost, hostProcessCatchUno]
  )

  const handleConfirmGiveCardMp = useCallback(
    (selectedCard) => {
      const penaltyId = penaltyGiveCardModal.penaltyId
      // A sync can land before the host has recorded this pick; it must not reopen
      // the prompt for a card already given.
      submittedPenaltyIdRef.current = penaltyId
      if (mpRoomState.isHost) {
        hostProcessSubmitPenaltyCard(HOST_PLAYER_ID, selectedCard, penaltyId)
      } else if (clientNetworkRef.current) {
        clientNetworkRef.current.sendAction({
          type: 'ACTION_SUBMIT_PENALTY_CARD',
          playerId: myPlayerIdRef.current,
          penaltyId,
          card: selectedCard,
        })
      }
      setPenaltyGiveCardModal({
        isOpen: false,
        mode: 'mp',
        penaltyId: null,
        targetPlayerId: null,
        targetPlayerName: '',
        challengerId: null,
        botGifts: [],
      })
    },
    [penaltyGiveCardModal.penaltyId, mpRoomState.isHost, hostProcessSubmitPenaltyCard]
  )

  const handleReconnectMp = useCallback(() => {
    // If this instance is the host, never execute client reconnection logic
    if (hostNetworkRef.current || mpRoomState.isHost) {
      if (
        hostNetworkRef.current?.peer &&
        hostNetworkRef.current.peer.disconnected &&
        !hostNetworkRef.current.peer.destroyed
      ) {
        try {
          hostNetworkRef.current.peer.reconnect()
        } catch (e) {
          console.warn('[Host] Reconnect signaling peer error:', e)
        }
      }
      setMpConnectionStatus('connected')
      return
    }

    if (!myProfileRef.current || !myProfileRef.current.roomCode) return
    setMpConnectionStatus('reconnecting')
    if (clientNetworkRef.current) {
      try {
        clientNetworkRef.current.destroy()
      } catch (e) {
        console.error('[Client] Error destroying peer on reconnect:', e)
      }
      clientNetworkRef.current = null
    }
    handleJoinRoom(myProfileRef.current)
    // handleJoinRoom is deliberately omitted: it is a plain function re-created every
    // render, so declaring it would make this callback unstable for no benefit. It
    // reads nothing that goes stale - the profile comes from a ref.
  }, [mpRoomState.isHost])

  const handleSyncGameStateMp = useCallback(() => {
    if (hostNetworkRef.current || mpRoomState.isHost) {
      setMpConnectionStatus('connected')
      hostBroadcastGameState('Host synchronized game state.')
      return
    }
    if (clientNetworkRef.current) {
      if (!clientNetworkRef.current.isConnected()) {
        handleReconnectMp()
        return
      }
      const sent = clientNetworkRef.current.sendAction({
        type: 'ACTION_REQUEST_SYNC',
        playerId: myPlayerIdRef.current,
      })
      if (!sent) {
        handleReconnectMp()
      }
    } else {
      handleReconnectMp()
    }
  }, [mpRoomState.isHost, hostBroadcastGameState, handleReconnectMp])

  const handleHostReturnAllToLobby = useCallback(() => {
    if (disconnectTurnTimerRef.current) {
      clearTimeout(disconnectTurnTimerRef.current)
      disconnectTurnTimerRef.current = null
    }
    if (penaltyTimeoutRef.current) {
      clearTimeout(penaltyTimeoutRef.current)
      penaltyTimeoutRef.current = null
    }

    const g = hostGameRef.current
    if (!g) return
    resetToLobby(g)
    if (hostNetworkRef.current) {
      hostNetworkRef.current.broadcast({
        type: 'ROOM_RESET_TO_LOBBY',
        players: g.players,
      })
    }
    setMpConnectionStatus('connected')
    setMpRoomState((prev) => ({
      ...prev,
      isInRoom: true,
      isHost: true,
      players: g.players,
      error: '',
      isConnecting: false,
    }))
    setScreen('mp_lobby')
    setMpPendingDrawCount(0)
    setMpPendingStackType(null)
    setMpRankings([])
    hasShownMyCelebrationRef.current = false
    setFinishedCelebration({ isOpen: false, rank: 1, playerName: 'You', activeRemaining: 2 })
    setMpActionMessage('Host returned all players to room lobby.')
  }, [])

  const handleClientReturnToLobby = useCallback(() => {
    if (clientNetworkRef.current) {
      try {
        clientNetworkRef.current.sendAction({
          type: 'ACTION_LEAVE',
          playerId: myPlayerIdRef.current,
        })
      } catch (e) {
        console.error('[Client] Error sending ACTION_LEAVE on return to lobby:', e)
      }
      try {
        clientNetworkRef.current.destroy()
      } catch (e) {
        console.error('[Client] Error destroying client network on return to lobby:', e)
      }
      clientNetworkRef.current = null
    }
    clearUrlRoomCode()
    try {
      sessionStorage.removeItem('uno_active_room')
    } catch {
      // ignore
    }
    setMpConnectionStatus('connected')
    setMpRoomState((prev) => ({
      ...prev,
      isInRoom: false,
      isHost: false,
      roomCode: '',
      players: [],
      isConnecting: false,
      error: '',
    }))
    setScreen('mp_lobby')
    setMpPendingDrawCount(0)
    setMpPendingStackType(null)
    setMpRankings([])
    hasShownMyCelebrationRef.current = false
    setFinishedCelebration({ isOpen: false, rank: 1, playerName: 'You', activeRemaining: 2 })
  }, [])

  const handleUniversalReturnToLobby = useCallback(() => {
    if (hostNetworkRef.current || mpRoomState.isHost) {
      handleHostReturnAllToLobby()
    } else {
      handleClientReturnToLobby()
    }
  }, [mpRoomState.isHost, handleHostReturnAllToLobby, handleClientReturnToLobby])

  const handleLeaveMpRoom = useCallback(() => {
    chatServiceRef.current?.clear()
    closeChat()
    if (disconnectTurnTimerRef.current) {
      clearTimeout(disconnectTurnTimerRef.current)
      disconnectTurnTimerRef.current = null
    }
    if (penaltyTimeoutRef.current) {
      clearTimeout(penaltyTimeoutRef.current)
      penaltyTimeoutRef.current = null
    }

    if (clientNetworkRef.current) {
      try {
        clientNetworkRef.current.sendAction({
          type: 'ACTION_LEAVE',
          playerId: myPlayerIdRef.current,
        })
      } catch (e) {
        console.error('[Client] Error sending ACTION_LEAVE on leave room:', e)
      }
      try {
        clientNetworkRef.current.destroy()
      } catch (e) {
        console.error('[Client] Error destroying client network on leave room:', e)
      }
      clientNetworkRef.current = null
    }
    if (hostNetworkRef.current) {
      try {
        hostNetworkRef.current.destroy()
      } catch (e) {
        console.error('[Host] Error destroying host peer on leave room:', e)
      }
      hostNetworkRef.current = null
    }

    clearUrlRoomCode()
    try {
      sessionStorage.removeItem('uno_active_room')
    } catch {
      // ignore
    }

    setMpConnectionStatus('connected')
    setMpRoomState({
      isInRoom: false,
      isHost: false,
      roomCode: '',
      players: [],
      maxPlayers: 4,
      isConnecting: false,
      error: '',
    })
    setMpPendingDrawCount(0)
    setMpPendingStackType(null)
    setMpRankings([])
    hasShownMyCelebrationRef.current = false
    setFinishedCelebration({ isOpen: false, rank: 1, playerName: 'You', activeRemaining: 2 })
    setScreen('mp_lobby')
  }, [closeChat])

  // Handle color picker selection
  const handleColorSelected = (color) => {
    setColorPickerOpen(false)
    if (!pendingCard) return

    if (screen === 'ai_playing') {
      executeAiPlayCard(aiCurrentPlayerIndex, pendingCard, color)
    } else if (screen === 'mp_playing') {
      dispatchMpPlayCard(pendingCard, color)
    }
    setPendingCard(null)
  }

  return (
    <div className="w-full flex-1 flex flex-col">
      {/* 1. Mode Select Screen */}
      {screen === 'mode_select' && (
        <UnoModeSelect
          onSelectMode={(mode) => {
            if (mode === 'ai') setScreen('ai_lobby')
            if (mode === 'multiplayer') setScreen('mp_lobby')
          }}
          onOpenRules={() => setInternalRulesOpen(true)}
        />
      )}

      {/* 2. Solo vs AI Mode */}
      {screen === 'ai_lobby' && (
        <UnoLobby
          onStartGame={handleStartAiGame}
          onBackToMenu={() => setScreen('mode_select')}
          onOpenRules={() => setInternalRulesOpen(true)}
        />
      )}

      {screen === 'ai_playing' && (
        <UnoBoard
          players={aiPlayers}
          rankings={aiRankings}
          handSortMode={handSortMode}
          onCycleSort={setHandSortMode}
          currentPlayerIndex={aiCurrentPlayerIndex}
          direction={aiDirection}
          topCard={aiTopCard}
          activeColor={aiActiveColor}
          drawPileCount={aiDrawPile.length}
          onPlayCard={handleHumanPlayCardAi}
          onDrawCard={handleDrawCardAi}
          onPassTurn={handlePassTurnAi}
          hasDrawnCardThisTurn={aiHasDrawnCardThisTurn}
          isHumanTurn={isAiHumanTurn}
          isWaitingForBot={isAiWaitingForBot}
          actionMessage={aiActionMessage}
          unoCalledPlayers={aiUnoCalledPlayers}
          onCallUno={handleCallUnoAi}
          onCatchUno={handleCatchUnoAi}
          hasCalledUnoThisRound={aiHasCalledUnoThisRound}
          myPlayerId={0}
          skippedInfo={aiSkippedInfo}
          pendingDrawCount={aiPendingDrawCount}
          pendingStackType={aiPendingStackType}
          isMultiplayer={false}
          isHost={false}
          onReturnToLobby={() => setScreen('ai_lobby')}
          onLeaveGame={() => setScreen('mode_select')}
          onOpenRules={() => setInternalRulesOpen(true)}
        />
      )}

      {screen === 'ai_gameover' && (
        <UnoGameOverModal
          winner={aiWinner}
          players={aiPlayers}
          rankings={aiRankings}
          handSortMode={handSortMode}
          onCycleSort={setHandSortMode}
          myPlayerId={0}
          onPlayAgain={handlePlayAgainAi}
          onResetToLobby={() => setScreen('ai_lobby')}
        />
      )}

      {/* 3. Multiplayer Mode */}
      {screen === 'mp_lobby' && (
        <UnoMultiplayerLobby
          initialRoomCode={initialRoomCode}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onStartGame={handleHostStartGame}
          onLeaveRoom={handleLeaveMpRoom}
          onBackToModeSelect={() => setScreen('mode_select')}
          roomState={{ ...mpRoomState, stackingEnabled: mpStackingEnabled }}
          onOpenChat={openChat}
          unreadChatCount={unreadChatCount}
        />
      )}

      {screen === 'mp_playing' && (
        <UnoBoard
          players={mpPlayers}
          rankings={mpRankings}
          handSortMode={handSortMode}
          onCycleSort={setHandSortMode}
          currentPlayerIndex={mpCurrentPlayerIndex}
          direction={mpDirection}
          topCard={mpTopCard}
          activeColor={mpActiveColor}
          drawPileCount={mpDrawPileCount}
          onPlayCard={handleMpPlayCard}
          onDrawCard={handleMpDrawCard}
          onPassTurn={handleMpPassTurn}
          hasDrawnCardThisTurn={mpHasDrawnCardThisTurn}
          isHumanTurn={mpCurrentPlayerIndex === myPlayerId || mpPlayers[mpCurrentPlayerIndex]?.id === myPlayerId}
          isWaitingForBot={false}
          actionMessage={mpActionMessage}
          unoCalledPlayers={mpUnoCalledPlayers}
          onCallUno={handleMpCallUno}
          onCatchUno={handleMpCatchUno}
          hasCalledUnoThisRound={mpHasCalledUnoThisRound}
          myPlayerId={myPlayerId}
          myHand={myHand}
          skippedInfo={mpSkippedInfo}
          pendingDrawCount={mpPendingDrawCount}
          pendingStackType={mpPendingStackType}
          isMultiplayer={true}
          isHost={mpRoomState.isHost}
          roomCode={mpRoomState.roomCode}
          onSyncState={handleSyncGameStateMp}
          onReturnToLobby={handleUniversalReturnToLobby}
          onLeaveGame={handleLeaveMpRoom}
          onOpenRules={() => setInternalRulesOpen(true)}
          connectionStatus={mpRoomState.isHost ? 'connected' : mpConnectionStatus}
          onReconnect={mpRoomState.isHost ? undefined : handleReconnectMp}
          onOpenChat={openChat}
          unreadChatCount={unreadChatCount}
        />
      )}

      {screen === 'mp_gameover' && (
        <UnoGameOverModal
          winner={mpWinner}
          players={mpPlayers}
          rankings={mpRankings}
          handSortMode={handSortMode}
          onCycleSort={setHandSortMode}
          myPlayerId={myPlayerId}
          onPlayAgain={mpRoomState.isHost ? handleHostStartGame : undefined}
          onResetToLobby={handleUniversalReturnToLobby}
        />
      )}

      {/* Wild Color Selection Modal */}
      <ColorPickerModal
        isOpen={colorPickerOpen}
        onSelectColor={handleColorSelected}
      />

      {/* Uno Give Card Penalty Modal (AI and Multiplayer) */}
      <UnoGiveCardModal
        isOpen={penaltyGiveCardModal.isOpen}
        targetPlayerName={penaltyGiveCardModal.targetPlayerName}
        challengerName={penaltyGiveCardModal.challengerName}
        isMyCatch={penaltyGiveCardModal.challengerId === myPlayerId}
        hand={
          penaltyGiveCardModal.mode === 'ai'
            ? (aiPlayers[0]?.hand || [])
            : myHand
        }
        onGiveCard={(card) => {
          if (penaltyGiveCardModal.mode === 'ai') {
            handleConfirmGiveCardAi(card)
          } else {
            handleConfirmGiveCardMp(card)
          }
        }}
      />

      {/* Rules Modal */}
      <UnoRulesModal isOpen={showRules} onClose={handleCloseRules} />

      {/* Player Finished Ranking Celebration Modal */}
      <UnoFinishedRankModal
        isOpen={finishedCelebration.isOpen}
        rank={finishedCelebration.rank}
        playerName={finishedCelebration.playerName}
        activeRemaining={finishedCelebration.activeRemaining}
        onClose={() =>
          setFinishedCelebration((prev) => ({ ...prev, isOpen: false }))
        }
      />

      {/* In-game and in-lobby chat modal */}
      {screen.startsWith('mp_') && (
        <>
          <ChatModal
            open={isChatOpen}
            onClose={closeChat}
            messages={chatMessages}
            onSendMessage={handleSendChatMessage}
            currentUserId={myPlayerId}
            roomCode={mpRoomState.roomCode}
          />
          <ChatToastPreview
            toast={chatActiveToast}
            onClick={openChat}
            onDismiss={dismissToast}
          />
        </>
      )}
    </div>
  )
}
