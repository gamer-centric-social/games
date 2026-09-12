import React, { useRef, useState, useMemo, useCallback } from 'react'
import UnoSettingsModal from './UnoSettingsModal'
import { COLOR_CONFIG, CARD_COLORS } from '../constants/unoConstants'
import { canPlayCard, sortCardsByColor, sortCardsByNumber } from '../utils/deck'
import { getActivePlayers, findNextPlayerIndex } from '../utils/turnOrder'
import useDrawAnimation from '../hooks/useDrawAnimation'
import UnoDisconnectBanner from './board/UnoDisconnectBanner'
import UnoFlyingCardsLayer from './board/UnoFlyingCardsLayer'
import UnoSeats from './board/UnoSeats'
import UnoTopBar from './board/UnoTopBar'
import UnoPileArea from './board/UnoPileArea'
import UnoHandHeader from './board/UnoHandHeader'
import UnoStatusLine from './board/UnoStatusLine'
import UnoSpectatorPanel from './board/UnoSpectatorPanel'
import UnoHandTray from './board/UnoHandTray'
import { playClickSound } from '../../../utils/sound'
import { cx } from '../../../components/ui/tokens'

const EMPTY_HAND = []
const EMPTY_SET = new Set()
const LIVE_COLOUR_VAR = '--live'

export default function UnoBoard({
  players,
  currentPlayerIndex,
  direction, // 1 for clockwise, -1 for counter-clockwise
  topCard,
  activeColor,
  drawPileCount,
  onPlayCard,
  onDrawCard,
  onPassTurn,
  hasDrawnCardThisTurn,
  isHumanTurn,
  isWaitingForBot = false,
  actionMessage,
  unoCalledPlayers,
  onCallUno,
  onCatchUno,
  hasCalledUnoThisRound,
  myPlayerId = 0,
  myHand = null,
  skippedInfo = null,
  pendingDrawCount = 0,
  pendingStackType = null,
  isMultiplayer = false,
  isHost = false,
  roomCode = '',
  onSyncState = null,
  onReturnToLobby = null,
  onLeaveGame = null,
  onOpenRules = null,
  connectionStatus = 'connected',
  onReconnect = null,
  rankings = [],
  handSortMode = 'none',
  onCycleSort,
}) {
  const myPlayer = players.find((p) => p.id === myPlayerId) || players[0]
  const myPlayerRank =
    myPlayer?.rank || rankings.find((r) => r.playerId === myPlayer?.id)?.rank || null
  const isSpectating = Boolean(myPlayerRank)
  const handCards = isSpectating ? EMPTY_HAND : myHand || myPlayer?.hand || EMPTY_HAND
  const activePlayer =
    players[currentPlayerIndex] || players.find((p) => p.id === currentPlayerIndex) || players[0]

  // Both memos can now list exactly what they use: turnOrder's helpers are
  // module-level functions, not closures redefined on every render. The two
  // exhaustive-deps suppressions that used to sit here are gone rather than
  // carried across.
  const activePlayers = useMemo(
    () => getActivePlayers(players, rankings),
    [players, rankings]
  )

  const nextPlayerIndex = useMemo(
    () => findNextPlayerIndex(players, currentPlayerIndex, direction, rankings),
    [players, currentPlayerIndex, direction, rankings]
  )

  const nextPlayer = players[nextPlayerIndex]

  const isCurrentTurnForMe =
    !isSpectating &&
    (isHumanTurn !== undefined
      ? isHumanTurn
      : (activePlayer?.id === myPlayer?.id || currentPlayerIndex === myPlayer?.id))
  const isMyTurnSkipped = !isSpectating && skippedInfo?.playerId === myPlayer?.id

  const canDrawCard =
    isCurrentTurnForMe && (pendingDrawCount > 0 || !hasDrawnCardThisTurn)

  const activeColorConfig =
    COLOR_CONFIG[activeColor] || COLOR_CONFIG[topCard?.color] || COLOR_CONFIG[CARD_COLORS.WILD]

  // One pass over the hand instead of three. This used to be two `.some()`
  // scans here plus a `canPlayCard` call per card inside the tray, all asking
  // the same question of the same hand on every render.
  const playableIds = useMemo(() => {
    if (isSpectating) return EMPTY_SET
    const ids = new Set()
    for (const card of handCards) {
      if (canPlayCard(card, topCard, activeColor, pendingDrawCount, pendingStackType)) {
        ids.add(card.id)
      }
    }
    return ids
  }, [isSpectating, handCards, topCard, activeColor, pendingDrawCount, pendingStackType])

  const myCanPlayAnyCard = playableIds.size > 0
  const myCanStack = pendingDrawCount > 0 && myCanPlayAnyCard

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [flightSpacing, setFlightSpacing] = useState(null)

  const drawPileRef = useRef(null)
  const handTrayRef = useRef(null)
  // Filled by the tray each commit: where every card in the hand actually is, so a
  // drawn card can fly to its own slot even when a sort has put it mid-row.
  const handLayoutRef = useRef(null)

  const { flyingCards, newlyDrawnCardIds, clearNewBadges } = useDrawAnimation({
    handCards,
    drawPileRef,
    handTrayRef,
    handLayoutRef,
    spacing: flightSpacing,
  })

  // Every handler crossing into a memoized child has to be stable, or the memo
  // buys nothing.
  const handlePlayCardWithBadgeClear = useCallback(
    (card) => {
      clearNewBadges()
      onPlayCard(card)
    },
    [clearNewBadges, onPlayCard]
  )

  const openMenu = useCallback(() => setIsSettingsOpen(true), [])
  const closeMenu = useCallback(() => setIsSettingsOpen(false), [])

  const handleHeaderSync = useCallback(() => {
    if (!onSyncState || isSyncing) return
    playClickSound()
    setIsSyncing(true)
    onSyncState()
    setTimeout(() => setIsSyncing(false), 800)
  }, [onSyncState, isSyncing])

  // Memoize sorted cards for smooth rendering and persistent sort preference
  const displayedHandCards = useMemo(() => {
    if (handSortMode === 'color') {
      return sortCardsByColor(handCards)
    }
    if (handSortMode === 'number') {
      return sortCardsByNumber(handCards)
    }
    return handCards
  }, [handCards, handSortMode])

  const handleTrayWheel = useCallback((e) => {
    if (e.deltaY !== 0 && handTrayRef.current) {
      handTrayRef.current.scrollLeft += e.deltaY
    }
  }, [])

  const liveColour = useMemo(
    () => ({ [LIVE_COLOUR_VAR]: activeColorConfig.hex }),
    [activeColorConfig.hex]
  )

  return (
    <div className="relative w-full max-w-2xl mx-auto px-3 flex-1 min-h-0 flex flex-col select-none">
      {/* 1. Who is at the table */}
      <div className="relative z-10 w-full pt-1">
        {isMultiplayer && !isHost && connectionStatus === 'disconnected' && (
          <UnoDisconnectBanner onReconnect={onReconnect} onOpenMenu={openMenu} />
        )}

        <UnoTopBar
          isMultiplayer={isMultiplayer}
          isHost={isHost}
          roomCode={roomCode}
          connectionStatus={connectionStatus}
          onSyncState={onSyncState}
          isSyncing={isSyncing}
          onSync={handleHeaderSync}
          onOpenMenu={openMenu}
        />

        <UnoSeats
          players={players}
          currentPlayerIndex={currentPlayerIndex}
          direction={direction}
          myPlayer={myPlayer}
          handCards={handCards}
          rankings={rankings}
          unoCalledPlayers={unoCalledPlayers}
          skippedInfo={skippedInfo}
          onCatchUno={onCatchUno}
        />
      </div>

      {/* 2. The table itself. flex-1, not my-auto: margin-block:auto absorbed
          every spare pixel and split it evenly above and below this block,
          which is exactly where the dead band under the piles came from. */}
      <div className="relative z-10 flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center gap-3 py-3">
        {/* The table top. The middle of the board used to be the one region
            with no object in it, which is what made the space between the
            piles and your hand read as a gap rather than as a table. */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[118%] max-w-[560px] aspect-[5/4] max-h-full rounded-[50%] bg-felt border border-edge shadow-lift-1 overflow-hidden">
          {/* UNO's one extension to the lamp rule: the colour in play is the
              light falling on the felt. Never the only signal -- the pile
              names the colour in words directly underneath it. */}
          <div className="uno-table-light" style={liveColour} />
        </div>

        <UnoPileArea
          drawPileRef={drawPileRef}
          drawPileCount={drawPileCount}
          canDrawCard={canDrawCard}
          onDrawCard={onDrawCard}
          hasDrawnCardThisTurn={hasDrawnCardThisTurn}
          pendingDrawCount={pendingDrawCount}
          topCard={topCard}
          activeColor={activeColor}
          activeColorConfig={activeColorConfig}
        />

        <UnoStatusLine
          isSpectating={isSpectating}
          isCurrentTurnForMe={isCurrentTurnForMe}
          isMyTurnSkipped={isMyTurnSkipped}
          isWaitingForBot={isWaitingForBot}
          activePlayer={activePlayer}
          activePlayers={activePlayers}
          skippedInfo={skippedInfo}
          myCanPlayAnyCard={myCanPlayAnyCard}
          myCanStack={myCanStack}
          pendingDrawCount={pendingDrawCount}
          pendingStackType={pendingStackType}
          actionMessage={actionMessage}
        />
      </div>

      {/* 3. Your hand. The rule above it lights and the band rises while it is
          your turn -- the third wordless statement of whose go it is, after the
          spotlit seat and the hand opening around what you can play. */}
      <div
        className={cx(
          'relative z-10 w-full pt-2 pb-1 border-t transition-transform duration-300',
          isCurrentTurnForMe ? 'border-turn/70 uno-hand-live -translate-y-1.5' : 'border-edge'
        )}
      >
        {isSpectating ? (
          <UnoSpectatorPanel
            myPlayerRank={myPlayerRank}
            activePlayer={activePlayer}
            activePlayers={activePlayers}
            nextPlayer={nextPlayer}
          />
        ) : (
          <>
            <UnoHandHeader
              myPlayer={myPlayer}
              handCards={handCards}
              isCurrentTurnForMe={isCurrentTurnForMe}
              hasDrawnCardThisTurn={hasDrawnCardThisTurn}
              hasCalledUnoThisRound={hasCalledUnoThisRound}
              unoCalledPlayers={unoCalledPlayers}
              pendingDrawCount={pendingDrawCount}
              onCallUno={onCallUno}
              onPassTurn={onPassTurn}
              handSortMode={handSortMode}
              onCycleSort={onCycleSort}
              isSpectating={isSpectating}
            />

            <UnoHandTray
              handTrayRef={handTrayRef}
              handLayoutRef={handLayoutRef}
              displayedHandCards={displayedHandCards}
              isCurrentTurnForMe={isCurrentTurnForMe}
              playableIds={playableIds}
              newlyDrawnCardIds={newlyDrawnCardIds}
              flyingCards={flyingCards}
              onPlayCard={handlePlayCardWithBadgeClear}
              onWheel={handleTrayWheel}
              onStepChange={setFlightSpacing}
            />
          </>
        )}
      </div>

      {flyingCards.length > 0 && <UnoFlyingCardsLayer flyingCards={flyingCards} />}

      <UnoSettingsModal
        isOpen={isSettingsOpen}
        onClose={closeMenu}
        isMultiplayer={isMultiplayer}
        isHost={isHost}
        roomCode={roomCode}
        onSyncState={onSyncState}
        onOpenRules={onOpenRules}
        onReturnToLobby={onReturnToLobby}
        onLeaveGame={onLeaveGame}
        connectionStatus={connectionStatus}
        onReconnect={onReconnect}
      />
    </div>
  )
}
