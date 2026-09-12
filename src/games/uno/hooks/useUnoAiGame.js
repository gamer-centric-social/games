import { useState, useEffect, useRef, useCallback } from 'react'
import { CARD_COLORS, CARD_TYPES, getRankBadge } from '../constants/unoConstants'
import {
  createUnoDeck,
  dealHands,
  canPlayCard,
  getNextActivePlayerIndex,
} from '../utils/deck'
import { drawCardsFromPile } from '../engine/hostEngine'
import { getAiMove, chooseAiColor, chooseAiCardToGive } from '../utils/unoAi'
import {
  playCardPlaySound,
  playCardDrawSound,
  playActionCardSound,
  playUnoCallSound,
} from '../../../utils/sound'

/**
 * Solo-vs-AI UNO.
 *
 * A self-contained game loop: all state lives in React here, and bots take their turns
 * from a useEffect that fires whenever the active seat changes. This is a second,
 * independent implementation of the UNO rules - engine/hostEngine.js is the one used
 * for multiplayer. Unifying them is deliberately deferred; see docs/roadmap.md.
 *
 * The shared modal state is passed in because both modes drive the same UI: the
 * give-a-card penalty prompt, the placement celebration, and the wild colour picker.
 */
export function useUnoAiGame({
  screen,
  setScreen,
  penaltyGiveCardModal,
  setPenaltyGiveCardModal,
  setFinishedCelebration,
  hasShownMyCelebrationRef,
  setPendingCard,
  setColorPickerOpen,
}) {
  const [aiPlayers, setAiPlayers] = useState([])
  const [aiRankings, setAiRankings] = useState([]) // [{ playerId, name, avatar, isHuman, rank, remainingCards }]
  const [aiDrawPile, setAiDrawPile] = useState([])
  const [aiDiscardPile, setAiDiscardPile] = useState([])
  const [aiTopCard, setAiTopCard] = useState(null)
  const [aiActiveColor, setAiActiveColor] = useState(null)
  const [aiCurrentPlayerIndex, setAiCurrentPlayerIndex] = useState(0)
  const [aiDirection, setAiDirection] = useState(1)
  const [aiHasDrawnCardThisTurn, setAiHasDrawnCardThisTurn] = useState(false)
  const [aiActionMessage, setAiActionMessage] = useState('')
  const [aiUnoCalledPlayers, setAiUnoCalledPlayers] = useState(new Set())
  const [aiHasCalledUnoThisRound, setAiHasCalledUnoThisRound] = useState(false)
  const [aiWinner, setAiWinner] = useState(null)
  const [aiSkippedInfo, setAiSkippedInfo] = useState(null)
  const [aiStackingEnabled, setAiStackingEnabled] = useState(true)
  const [aiPendingDrawCount, setAiPendingDrawCount] = useState(0)
  const [aiPendingStackType, setAiPendingStackType] = useState(null)

  const botTimeoutRef = useRef(null)
  const botUnoCallTimersRef = useRef({})
  const botCatchHumanTimerRef = useRef(null)
  // Solo's counterpart to hostEngine's game.pendingCatchPenalty: one catch resolves
  // at a time, so a second one cannot overwrite the first one's modal.
  const pendingCatchPenaltyRef = useRef(false)
  const aiPlayersRef = useRef(aiPlayers)
  useEffect(() => {
    aiPlayersRef.current = aiPlayers
  }, [aiPlayers])
  const aiUnoCalledPlayersRef = useRef(aiUnoCalledPlayers)
  useEffect(() => {
    aiUnoCalledPlayersRef.current = aiUnoCalledPlayers
  }, [aiUnoCalledPlayers])

  // Guards against a double-tap on the draw pile drawing twice. aiCurrentPlayerIndex is
  // an intentional extra dependency: the lock must also clear on a turn change, even
  // when hasDrawn was already false.
  const isDrawingAiRef = useRef(false)
  useEffect(() => {
    if (!aiHasDrawnCardThisTurn) {
      isDrawingAiRef.current = false
    }
  }, [aiHasDrawnCardThisTurn, aiCurrentPlayerIndex])

  const clearAllAiUnoTimers = useCallback(() => {
    if (botCatchHumanTimerRef.current) {
      clearTimeout(botCatchHumanTimerRef.current)
      botCatchHumanTimerRef.current = null
    }
    Object.values(botUnoCallTimersRef.current).forEach((timer) => clearTimeout(timer))
    botUnoCallTimersRef.current = {}
  }, [])


  const handleStartAiGame = ({ players: initialPlayers, enableStacking = true }) => {
    clearAllAiUnoTimers()
    const freshDeck = createUnoDeck()
    const { hands, drawPile: dealtDraw, discardPile: dealtDiscard, initialColor } = dealHands(
      freshDeck,
      initialPlayers.length
    )

    const populatedPlayers = initialPlayers.map((p, idx) => ({
      ...p,
      hand: hands[idx],
      rank: null,
    }))

    setAiPlayers(populatedPlayers)
    setAiRankings([])
    setAiDrawPile(dealtDraw)
    setAiDiscardPile(dealtDiscard)
    setAiTopCard(dealtDiscard[dealtDiscard.length - 1])
    setAiActiveColor(initialColor)
    setAiCurrentPlayerIndex(0)
    setAiDirection(1)
    setAiHasDrawnCardThisTurn(false)
    setAiActionMessage('Game started! You have the first move.')
    setAiUnoCalledPlayers(new Set())
    setAiHasCalledUnoThisRound(false)
    setAiWinner(null)
    setAiSkippedInfo(null)
    setAiStackingEnabled(enableStacking)
    setAiPendingDrawCount(0)
    setAiPendingStackType(null)
    setFinishedCelebration({ isOpen: false, rank: 1, playerName: 'You', activeRemaining: 2 })
    hasShownMyCelebrationRef.current = false
    pendingCatchPenaltyRef.current = false
    setPenaltyGiveCardModal({
      isOpen: false,
      mode: 'ai',
      penaltyId: null,
      targetPlayerId: null,
      targetPlayerName: '',
      challengerId: null,
      botGifts: [],
    })
    setScreen('ai_playing')
  }

  const handlePlayAgainAi = () => {
    clearAllAiUnoTimers()
    pendingCatchPenaltyRef.current = false
    setPenaltyGiveCardModal({
      isOpen: false,
      mode: 'ai',
      penaltyId: null,
      targetPlayerId: null,
      targetPlayerName: '',
      challengerId: null,
      botGifts: [],
    })
    const resetPlayers = aiPlayers.map((p) => ({ ...p, hand: [], rank: null }))
    handleStartAiGame({ players: resetPlayers, enableStacking: aiStackingEnabled })
  }

  // When human player confirms giving a selected card in AI mode
  const handleConfirmGiveCardAi = useCallback(
    (selectedCard) => {
      // Closing the penalty here also makes this idempotent: a second press of the
      // confirm button finds it already closed and does nothing.
      if (!pendingCatchPenaltyRef.current) return
      pendingCatchPenaltyRef.current = false

      const { targetPlayerId, targetPlayerName, challengerId, botGifts = [] } =
        penaltyGiveCardModal

      const cardsGiven = [
        selectedCard,
        ...botGifts.map((bg) => bg.card).filter(Boolean),
      ]

      let updatedRankings = [...aiRankings]
      const finishedGivers = []

      // 1. Deduct cards from givers and record placements for anyone who emptied hand
      let updatedPlayers = aiPlayers.map((p) => {
        if (p.isHuman) {
          const nextHand = p.hand.filter((c) => c.id !== selectedCard.id)
          if (nextHand.length === 0 && p.rank == null) {
            const rank = updatedRankings.length + 1
            const record = {
              playerId: p.id,
              name: p.name,
              avatar: p.avatar,
              isHuman: true,
              rank,
              remainingCards: 0,
            }
            updatedRankings.push(record)
            finishedGivers.push({ ...p, rank })
            return { ...p, hand: nextHand, rank }
          }
          return { ...p, hand: nextHand }
        }

        const botGift = botGifts.find((bg) => bg.giverId === p.id)
        if (botGift && botGift.card) {
          const nextHand = p.hand.filter((c) => c.id !== botGift.card.id)
          if (nextHand.length === 0 && p.rank == null) {
            const rank = updatedRankings.length + 1
            const record = {
              playerId: p.id,
              name: p.name,
              avatar: p.avatar,
              isHuman: false,
              rank,
              remainingCards: 0,
            }
            updatedRankings.push(record)
            finishedGivers.push({ ...p, rank })
            return { ...p, hand: nextHand, rank }
          }
          return { ...p, hand: nextHand }
        }

        return p
      })

      // 2. Add all penalty cards to target player's hand
      updatedPlayers = updatedPlayers.map((p) => {
        if (p.id === targetPlayerId) {
          return {
            ...p,
            hand: [...p.hand, ...cardsGiven],
          }
        }
        return p
      })

      // 3. Clear target's UNO call status
      setAiUnoCalledPlayers((prev) => {
        const next = new Set(prev)
        next.delete(targetPlayerId)
        return next
      })
      if (targetPlayerId === 0) {
        setAiHasCalledUnoThisRound(false)
      }

      // 4. Check remaining active players
      const remainingActive = updatedPlayers.filter(
        (p) => p.hand.length > 0 && p.rank == null
      )

      // 5. Check if match is over (1 or fewer active players left)
      if (remainingActive.length <= 1) {
        if (remainingActive.length === 1) {
          const lastPlayer = remainingActive[0]
          const lastRank = updatedRankings.length + 1
          const lastRecord = {
            playerId: lastPlayer.id,
            name: lastPlayer.name,
            avatar: lastPlayer.avatar,
            isHuman: lastPlayer.isHuman,
            rank: lastRank,
            remainingCards: lastPlayer.hand.length,
          }
          updatedRankings.push(lastRecord)
          updatedPlayers = updatedPlayers.map((p) =>
            p.id === lastPlayer.id ? { ...p, rank: lastRank } : p
          )
        }
        setAiPlayers(updatedPlayers)
        setAiRankings(updatedRankings)
        setAiWinner(updatedRankings[0])
        setPenaltyGiveCardModal({
          isOpen: false,
          mode: 'ai',
          penaltyId: null,
          targetPlayerId: null,
          targetPlayerName: '',
          challengerId: null,
          botGifts: [],
        })
        setScreen('ai_gameover')
        return
      }

      const humanFinished = finishedGivers.find((fg) => fg.isHuman)
      if (humanFinished) {
        setFinishedCelebration({
          isOpen: true,
          rank: humanFinished.rank,
          playerName: 'You',
          activeRemaining: remainingActive.length,
        })
      }

      // 6. Advance turn if current player finished
      let nextTurnIdx = aiCurrentPlayerIndex
      const activeCurrentP = updatedPlayers[aiCurrentPlayerIndex]
      if (
        activeCurrentP &&
        (activeCurrentP.hand.length === 0 || activeCurrentP.rank != null)
      ) {
        nextTurnIdx = getNextActivePlayerIndex(
          aiCurrentPlayerIndex,
          1,
          updatedPlayers,
          aiDirection,
          (p) => p.hand.length === 0 || p.rank != null
        )
      }

      setAiCurrentPlayerIndex(nextTurnIdx)
      setAiPlayers(updatedPlayers)
      setAiRankings(updatedRankings)
      playActionCardSound(true)

      const challenger = updatedPlayers.find((p) => p.id === challengerId)
      const challengerName = challengerId === 0 ? 'You' : challenger?.name || 'Player'
      let msg = `🚨 ${challengerName} caught ${targetPlayerName}! Received 1 card from each active player (+${cardsGiven.length} cards)!`
      if (finishedGivers.length > 0) {
        const names = finishedGivers.map((fg) => (fg.isHuman ? 'You' : fg.name)).join(', ')
        msg += ` 🏆 ${names} gave away their last card and finished the game!`
      }
      setAiActionMessage(msg)

      setPenaltyGiveCardModal({
        isOpen: false,
        mode: 'ai',
        penaltyId: null,
        targetPlayerId: null,
        targetPlayerName: '',
        challengerId: null,
        botGifts: [],
      })
    },
    [
      penaltyGiveCardModal,
      aiPlayers,
      aiRankings,
      aiCurrentPlayerIndex,
      aiDirection,
      setScreen,
      setPenaltyGiveCardModal,
      setFinishedCelebration,
    ]
  )

  const executeAiCatchUno = useCallback(
    (challengerId, targetPlayerId) => {
      // The engine opens catchUno with exactly this guard; solo never had one, so a
      // bot catching you at the same moment you caught a bot overwrote the modal --
      // with gifts computed from whichever hands the stale closure had.
      if (pendingCatchPenaltyRef.current) return

      // Live players, not the closure's copy. The bot-catch timer below already
      // reads the ref, and the two disagreeing is how cards went to the wrong hand.
      const players = aiPlayersRef.current || aiPlayers
      const target = players.find((p) => p.id === targetPlayerId)
      if (!target) return

      // Validate target: must have 1 card, not finished, not called UNO
      if (target.rank != null) {
        if (challengerId === 0) {
          setAiActionMessage(`${target.name} has already finished the match!`)
        }
        return
      }
      if (target.hand.length !== 1) {
        if (challengerId === 0) {
          setAiActionMessage(
            `${target.name} has ${target.hand.length} cards (must have exactly 1 card to be caught).`
          )
        }
        return
      }
      if (aiUnoCalledPlayersRef.current.has(targetPlayerId)) {
        if (challengerId === 0) {
          setAiActionMessage(`${target.name} already called UNO!`)
        }
        return
      }

      // Clear any pending timers on target
      if (botUnoCallTimersRef.current[targetPlayerId]) {
        clearTimeout(botUnoCallTimersRef.current[targetPlayerId])
        delete botUnoCallTimersRef.current[targetPlayerId]
      }
      if (targetPlayerId === 0 && botCatchHumanTimerRef.current) {
        clearTimeout(botCatchHumanTimerRef.current)
        botCatchHumanTimerRef.current = null
      }

      const otherActive = players.filter(
        (p) => p.id !== targetPlayerId && p.hand.length > 0 && p.rank == null
      )
      if (otherActive.length === 0) return

      const isHumanActiveGiver = otherActive.some((p) => p.isHuman)

      // From here the penalty is open, and no second catch may start until it is
      // resolved -- the human branch below hands off to handleConfirmGiveCardAi.
      pendingCatchPenaltyRef.current = true

      if (isHumanActiveGiver) {
        // Human is one of the active givers: prompt human with UnoGiveCardModal!
        const botGifts = otherActive
          .filter((p) => !p.isHuman)
          .map((bot) => ({
            giverId: bot.id,
            giverName: bot.name,
            card: chooseAiCardToGive(bot.hand),
          }))

        setPenaltyGiveCardModal({
          isOpen: true,
          mode: 'ai',
          penaltyId: null,
          targetPlayerId,
          targetPlayerName: target.name,
          challengerId,
          botGifts,
        })
      } else {
        // Human is NOT an active giver (human is the caught target or already
        // finished). All givers are bots, so this resolves here and now -- nothing
        // waits on a modal, so the penalty closes again in the same breath.
        pendingCatchPenaltyRef.current = false
        const botGifts = otherActive.map((bot) => ({
          giverId: bot.id,
          giverName: bot.name,
          card: chooseAiCardToGive(bot.hand),
        }))
        const cardsGiven = botGifts.map((bg) => bg.card).filter(Boolean)

        let updatedRankings = [...aiRankings]
        const finishedBots = []

        let updatedPlayers = players.map((p) => {
          const bg = botGifts.find((g) => g.giverId === p.id)
          if (bg && bg.card) {
            const nextHand = p.hand.filter((c) => c.id !== bg.card.id)
            if (nextHand.length === 0 && p.rank == null) {
              const rank = updatedRankings.length + 1
              const record = {
                playerId: p.id,
                name: p.name,
                avatar: p.avatar,
                isHuman: false,
                rank,
                remainingCards: 0,
              }
              updatedRankings.push(record)
              finishedBots.push({ ...p, rank })
              return { ...p, hand: nextHand, rank }
            }
            return { ...p, hand: nextHand }
          }
          return p
        })

        // Target receives all cards
        updatedPlayers = updatedPlayers.map((p) => {
          if (p.id === targetPlayerId) {
            return { ...p, hand: [...p.hand, ...cardsGiven] }
          }
          return p
        })

        setAiUnoCalledPlayers((prev) => {
          const next = new Set(prev)
          next.delete(targetPlayerId)
          return next
        })
        if (targetPlayerId === 0) {
          setAiHasCalledUnoThisRound(false)
        }

        const remainingActive = updatedPlayers.filter(
          (p) => p.hand.length > 0 && p.rank == null
        )

        if (remainingActive.length <= 1) {
          if (remainingActive.length === 1) {
            const lastPlayer = remainingActive[0]
            const lastRank = updatedRankings.length + 1
            const lastRecord = {
              playerId: lastPlayer.id,
              name: lastPlayer.name,
              avatar: lastPlayer.avatar,
              isHuman: lastPlayer.isHuman,
              rank: lastRank,
              remainingCards: lastPlayer.hand.length,
            }
            updatedRankings.push(lastRecord)
            updatedPlayers = updatedPlayers.map((p) =>
              p.id === lastPlayer.id ? { ...p, rank: lastRank } : p
            )
          }
          setAiPlayers(updatedPlayers)
          setAiRankings(updatedRankings)
          setAiWinner(updatedRankings[0])
          setScreen('ai_gameover')
          return
        }

        let nextTurnIdx = aiCurrentPlayerIndex
        const activeCurrentP = updatedPlayers[aiCurrentPlayerIndex]
        if (
          activeCurrentP &&
          (activeCurrentP.hand.length === 0 || activeCurrentP.rank != null)
        ) {
          nextTurnIdx = getNextActivePlayerIndex(
            aiCurrentPlayerIndex,
            1,
            updatedPlayers,
            aiDirection,
            (p) => p.hand.length === 0 || p.rank != null
          )
        }

        setAiCurrentPlayerIndex(nextTurnIdx)
        setAiPlayers(updatedPlayers)
        setAiRankings(updatedRankings)
        playActionCardSound(true)

        const challenger = updatedPlayers.find((p) => p.id === challengerId)
        const challengerName = challengerId === 0 ? 'You' : challenger?.name || 'Bot'
        const targetName = targetPlayerId === 0 ? 'You' : target?.name || 'Bot'
        let msg = `🚨 ${challengerName} caught ${targetName}! Received 1 card from each active player (+${cardsGiven.length} cards)!`
        if (finishedBots.length > 0) {
          const names = finishedBots.map((b) => b.name).join(', ')
          msg += ` 🏆 ${names} gave away their last card and finished the game!`
        }
        setAiActionMessage(msg)
      }
    },
    [
      aiPlayers,
      aiRankings,
      aiCurrentPlayerIndex,
      aiDirection,
      setScreen,
      setPenaltyGiveCardModal,
    ]
  )

  const executeAiPlayCard = useCallback(
    /**
     * `playersOverride` is required whenever the caller has already modified hands in
     * this tick - notably the bot draw-then-play path, whose captured roster is one
     * draw out of date.
     */
    (playerIndex, card, chosenColor = null, playersOverride = null) => {
      const players = playersOverride || aiPlayers
      const player = players[playerIndex]
      const nextHand = player.hand.filter((c) => c.id !== card.id)
      const isWild = card.color === CARD_COLORS.WILD
      const effectiveColor = isWild ? chosenColor : card.color

      if (
        card.type === CARD_TYPES.DRAW_TWO ||
        card.type === CARD_TYPES.WILD_DRAW_FOUR
      ) {
        playActionCardSound(true)
      } else if (
        card.type === CARD_TYPES.SKIP ||
        card.type === CARD_TYPES.REVERSE
      ) {
        playActionCardSound(false)
      } else {
        playCardPlaySound()
      }

      // If player emptied their hand, record placement!
      if (nextHand.length === 0) {
        const finishedRank = aiRankings.length + 1
        const rankRecord = {
          playerId: player.id,
          name: player.name,
          avatar: player.avatar,
          isHuman: player.isHuman,
          rank: finishedRank,
          remainingCards: 0,
        }
        const newRankings = [...aiRankings, rankRecord]
        setAiRankings(newRankings)

        const updatedPlayers = players.map((p, idx) =>
          idx === playerIndex ? { ...p, hand: nextHand, rank: finishedRank } : p
        )
        setAiPlayers(updatedPlayers)
        setAiTopCard(card)
        setAiDiscardPile((prev) => [...prev, card])

        const remainingActive = updatedPlayers.filter((p) => p.hand.length > 0)

        // If only 1 player remains with cards, match is over!
        if (remainingActive.length <= 1) {
          if (remainingActive.length === 1) {
            const lastPlayer = remainingActive[0]
            const lastRank = finishedRank + 1
            const lastRecord = {
              playerId: lastPlayer.id,
              name: lastPlayer.name,
              avatar: lastPlayer.avatar,
              isHuman: lastPlayer.isHuman,
              rank: lastRank,
              remainingCards: lastPlayer.hand.length,
            }
            newRankings.push(lastRecord)
            setAiRankings(newRankings)
            setAiPlayers(
              updatedPlayers.map((p) => (p.id === lastPlayer.id ? { ...p, rank: lastRank } : p))
            )
          }
          setAiWinner(newRankings[0])
          setScreen('ai_gameover')
          return
        }

        // More than 1 active player remains: match continues!
        if (player.isHuman) {
          setFinishedCelebration({
            isOpen: true,
            rank: finishedRank,
            playerName: 'You',
            activeRemaining: remainingActive.length,
          })
        }

        const rankBadge = getRankBadge(finishedRank)
        let step = 1
        let newDirection = aiDirection
        let currentSkippedInfo = null

        if (card.type === CARD_TYPES.REVERSE) {
          if (remainingActive.length === 2) {
            step = 1
          } else {
            newDirection = aiDirection * -1
            setAiDirection(newDirection)
          }
        } else if (card.type === CARD_TYPES.SKIP) {
          step = 2
          const skippedIdx = getNextActivePlayerIndex(
            playerIndex,
            1,
            updatedPlayers,
            newDirection,
            (p) => p.hand.length === 0 || p.rank != null
          )
          const targetPlayer = updatedPlayers[skippedIdx]
          currentSkippedInfo = {
            playerId: targetPlayer.id,
            playerName: targetPlayer.name,
            playedByName: player.name,
            cardType: 'skip',
            cardsDrawn: 0,
          }
        } else if (card.type === CARD_TYPES.DRAW_TWO) {
          if (aiStackingEnabled) {
            setAiPendingDrawCount((aiPendingDrawCount || 0) + 2)
            setAiPendingStackType(CARD_TYPES.DRAW_TWO)
            step = 1
          } else {
            step = 2
            const targetIdx = getNextActivePlayerIndex(
              playerIndex,
              1,
              updatedPlayers,
              newDirection,
              (p) => p.hand.length === 0 || p.rank != null
            )
            const targetPlayer = updatedPlayers[targetIdx]
            const { drawnCards, newDrawPile, newDiscardPile } = drawCardsFromPile(
              2,
              aiDrawPile,
              [...aiDiscardPile, card]
            )
            setAiDrawPile(newDrawPile)
            setAiDiscardPile(newDiscardPile)
            setAiPlayers(
              updatedPlayers.map((p, idx) =>
                idx === targetIdx ? { ...p, hand: [...drawnCards, ...p.hand] } : p
              )
            )
            currentSkippedInfo = {
              playerId: targetPlayer.id,
              playerName: targetPlayer.name,
              playedByName: player.name,
              cardType: 'draw2',
              cardsDrawn: 2,
            }
          }
        } else if (card.type === CARD_TYPES.WILD_DRAW_FOUR) {
          if (aiStackingEnabled) {
            setAiPendingDrawCount((aiPendingDrawCount || 0) + 4)
            setAiPendingStackType(CARD_TYPES.WILD_DRAW_FOUR)
            step = 1
          } else {
            step = 2
            const targetIdx = getNextActivePlayerIndex(
              playerIndex,
              1,
              updatedPlayers,
              newDirection,
              (p) => p.hand.length === 0 || p.rank != null
            )
            const targetPlayer = updatedPlayers[targetIdx]
            const { drawnCards, newDrawPile, newDiscardPile } = drawCardsFromPile(
              4,
              aiDrawPile,
              [...aiDiscardPile, card]
            )
            setAiDrawPile(newDrawPile)
            setAiDiscardPile(newDiscardPile)
            setAiPlayers(
              updatedPlayers.map((p, idx) =>
                idx === targetIdx ? { ...p, hand: [...drawnCards, ...p.hand] } : p
              )
            )
            currentSkippedInfo = {
              playerId: targetPlayer.id,
              playerName: targetPlayer.name,
              playedByName: player.name,
              cardType: 'wild4',
              cardsDrawn: 4,
            }
          }
        }

        if (card.type !== CARD_TYPES.DRAW_TWO && card.type !== CARD_TYPES.WILD_DRAW_FOUR) {
          setAiPendingDrawCount(0)
          setAiPendingStackType(null)
        }

        const nextIdx = getNextActivePlayerIndex(
          playerIndex,
          step,
          updatedPlayers,
          newDirection,
          (p) => p.hand.length === 0 || p.rank != null
        )
        setAiCurrentPlayerIndex(nextIdx)
        setAiActiveColor(effectiveColor)
        setAiHasDrawnCardThisTurn(false)
        setAiHasCalledUnoThisRound(false)
        setAiSkippedInfo(currentSkippedInfo)
        setAiActionMessage(
          `${rankBadge.medal} ${player.name} finished in ${rankBadge.label}! (${remainingActive.length} players still battling)`
        )
        return
      }

      if (nextHand.length === 1) {
        if (player.isHuman) {
          if (aiHasCalledUnoThisRound) {
            playUnoCallSound()
            setAiUnoCalledPlayers((prev) => new Set(prev).add(player.id))
            setAiActionMessage('🔔 You shouted UNO! 1 card remaining!')
          } else {
            // Human has not called UNO yet: vulnerable to being caught!
            if (botCatchHumanTimerRef.current) {
              clearTimeout(botCatchHumanTimerRef.current)
            }
            botCatchHumanTimerRef.current = setTimeout(() => {
              const latestPlayers = aiPlayersRef.current || []
              const humanPlayer = latestPlayers[0]
              if (
                humanPlayer &&
                humanPlayer.hand.length === 1 &&
                !humanPlayer.rank &&
                !aiUnoCalledPlayersRef.current.has(0)
              ) {
                const activeBots = latestPlayers.filter(
                  (p) => !p.isHuman && p.hand.length > 0 && !p.rank
                )
                if (activeBots.length > 0) {
                  const randomBot =
                    activeBots[Math.floor(Math.random() * activeBots.length)]
                  executeAiCatchUno(randomBot.id, 0)
                }
              }
            }, 4000)
          }
        } else {
          // Bot reached 1 card: 75% chance to call after delay, or forget
          if (botUnoCallTimersRef.current[player.id]) {
            clearTimeout(botUnoCallTimersRef.current[player.id])
          }
          const willCall = Math.random() < 0.75
          if (willCall) {
            const delay = 2200 + Math.random() * 1600
            botUnoCallTimersRef.current[player.id] = setTimeout(() => {
              setAiUnoCalledPlayers((prev) => {
                const next = new Set(prev)
                next.add(player.id)
                return next
              })
              playUnoCallSound()
              setAiActionMessage(`🔔 ${player.name} shouted UNO! 1 card left!`)
            }, delay)
          }
        }
      } else {
        if (botUnoCallTimersRef.current[player.id]) {
          clearTimeout(botUnoCallTimersRef.current[player.id])
          delete botUnoCallTimersRef.current[player.id]
        }
        if (player.isHuman) {
          if (botCatchHumanTimerRef.current) {
            clearTimeout(botCatchHumanTimerRef.current)
            botCatchHumanTimerRef.current = null
          }
          setAiHasCalledUnoThisRound(false)
        }
      }

      let step = 1
      let newDirection = aiDirection
      let message = `${player.name} played ${card.color !== CARD_COLORS.WILD ? card.color : ''} ${card.label}`
      let currentSkippedInfo = null

      if (card.type === CARD_TYPES.REVERSE) {
        const activeCountNow = players.filter((p) => p.hand.length > 0).length
        if (activeCountNow === 2) {
          step = 2
          const skippedIdx = getNextActivePlayerIndex(
            playerIndex,
            1,
            players,
            newDirection,
            (p) => p.hand.length === 0 || p.rank != null
          )
          const targetPlayer = players[skippedIdx]
          currentSkippedInfo = {
            playerId: targetPlayer.id,
            playerName: targetPlayer.name,
            playedByName: player.name,
            cardType: 'reverse',
            cardsDrawn: 0,
          }
          message = `${player.name} played Reverse! ${targetPlayer.name} was skipped.`
        } else {
          newDirection = aiDirection * -1
          setAiDirection(newDirection)
          message = `${player.name} reversed play direction!`
        }
      }

      if (card.type === CARD_TYPES.SKIP) {
        step = 2
        const skippedIdx = getNextActivePlayerIndex(
          playerIndex,
          1,
          players,
          newDirection,
          (p) => p.hand.length === 0 || p.rank != null
        )
        const targetPlayer = players[skippedIdx]
        currentSkippedInfo = {
          playerId: targetPlayer.id,
          playerName: targetPlayer.name,
          playedByName: player.name,
          cardType: 'skip',
          cardsDrawn: 0,
        }
        message = `${player.name} skipped ${targetPlayer?.name}!`
      }

      let currentDraw = [...aiDrawPile]
      let currentDiscard = [...aiDiscardPile, card]
      let updatedPlayers = players.map((p, idx) =>
        idx === playerIndex ? { ...p, hand: nextHand } : p
      )

      let newPendingDrawCount = 0
      let newPendingStackType = null

      if (card.type === CARD_TYPES.DRAW_TWO) {
        if (aiStackingEnabled) {
          newPendingDrawCount = (aiPendingDrawCount || 0) + 2
          newPendingStackType = CARD_TYPES.DRAW_TWO
          step = 1
          message = `${player.name} played +2! Stack is +${newPendingDrawCount} cards! Next player must counter or draw!`
        } else {
          step = 2
          const targetIdx = getNextActivePlayerIndex(
            playerIndex,
            1,
            players,
            newDirection,
            (p) => p.hand.length === 0 || p.rank != null
          )
          const targetPlayer = players[targetIdx]
          const { drawnCards, newDrawPile, newDiscardPile } = drawCardsFromPile(
            2,
            currentDraw,
            currentDiscard
          )
          currentDraw = newDrawPile
          currentDiscard = newDiscardPile
          updatedPlayers = updatedPlayers.map((p, idx) =>
            idx === targetIdx ? { ...p, hand: [...drawnCards, ...p.hand] } : p
          )
          currentSkippedInfo = {
            playerId: targetPlayer.id,
            playerName: targetPlayer.name,
            playedByName: player.name,
            cardType: 'draw2',
            cardsDrawn: 2,
          }
          message = `${player.name} played +2! ${targetPlayer.name} drew 2 cards and was skipped!`
        }
      }

      if (card.type === CARD_TYPES.WILD_DRAW_FOUR) {
        if (aiStackingEnabled) {
          newPendingDrawCount = (aiPendingDrawCount || 0) + 4
          newPendingStackType = CARD_TYPES.WILD_DRAW_FOUR
          step = 1
          message = `${player.name} played Wild +4! Color is now ${effectiveColor}. Stack is +${newPendingDrawCount} cards!`
        } else {
          step = 2
          const targetIdx = getNextActivePlayerIndex(
            playerIndex,
            1,
            players,
            newDirection,
            (p) => p.hand.length === 0 || p.rank != null
          )
          const targetPlayer = players[targetIdx]
          const { drawnCards, newDrawPile, newDiscardPile } = drawCardsFromPile(
            4,
            currentDraw,
            currentDiscard
          )
          currentDraw = newDrawPile
          currentDiscard = newDiscardPile
          updatedPlayers = updatedPlayers.map((p, idx) =>
            idx === targetIdx ? { ...p, hand: [...drawnCards, ...p.hand] } : p
          )
          currentSkippedInfo = {
            playerId: targetPlayer.id,
            playerName: targetPlayer.name,
            playedByName: player.name,
            cardType: 'wild4',
            cardsDrawn: 4,
          }
          message = `${player.name} played Wild +4! Color is now ${effectiveColor}. ${targetPlayer.name} drew 4 cards and was skipped!`
        }
      }

      if (card.type === CARD_TYPES.WILD) {
        message = `${player.name} played Wild! Color is now ${effectiveColor}.`
      }

      const nextPlayerIdx = getNextActivePlayerIndex(
        playerIndex,
        step,
        updatedPlayers,
        newDirection,
        (p) => p.hand.length === 0 || p.rank != null
      )

      setAiPlayers(updatedPlayers)
      setAiDrawPile(currentDraw)
      setAiDiscardPile(currentDiscard)
      setAiTopCard(card)
      setAiActiveColor(effectiveColor)
      setAiCurrentPlayerIndex(nextPlayerIdx)
      setAiHasDrawnCardThisTurn(false)
      if (player.isHuman && nextHand.length !== 1) {
        setAiHasCalledUnoThisRound(false)
      }
      setAiActionMessage(message)
      setAiSkippedInfo(currentSkippedInfo)
      setAiPendingDrawCount(newPendingDrawCount)
      setAiPendingStackType(newPendingStackType)
    },
    [
      aiPlayers,
      aiRankings,
      aiDirection,
      aiDrawPile,
      aiDiscardPile,
      aiHasCalledUnoThisRound,
      aiStackingEnabled,
      aiPendingDrawCount,
      executeAiCatchUno,
      setScreen,
      setFinishedCelebration,
    ]
  )

  const handleHumanPlayCardAi = (card) => {
    if (card.color === CARD_COLORS.WILD) {
      setPendingCard(card)
      setColorPickerOpen(true)
    } else {
      executeAiPlayCard(aiCurrentPlayerIndex, card, card.color)
    }
  }

  const handleDrawCardAi = () => {
    if (isDrawingAiRef.current) return
    if (aiHasDrawnCardThisTurn && aiPendingDrawCount === 0) return
    isDrawingAiRef.current = true
    playCardDrawSound()

    // Taking Stack Penalty
    if (aiPendingDrawCount > 0) {
      const penaltyCount = aiPendingDrawCount
      const penaltyType = aiPendingStackType
      const { drawnCards, newDrawPile, newDiscardPile } = drawCardsFromPile(
        penaltyCount,
        aiDrawPile,
        aiDiscardPile
      )
      const humanPlayer = aiPlayers[aiCurrentPlayerIndex]
      const updatedPlayers = aiPlayers.map((p, idx) =>
        idx === aiCurrentPlayerIndex ? { ...p, hand: [...drawnCards, ...p.hand] } : p
      )
      const nextPlayerIdx = getNextActivePlayerIndex(
        aiCurrentPlayerIndex,
        1,
        updatedPlayers,
        aiDirection,
        (p) => p.hand.length === 0 || p.rank != null
      )
      setAiPlayers(updatedPlayers)
      setAiDrawPile(newDrawPile)
      setAiDiscardPile(newDiscardPile)
      setAiPendingDrawCount(0)
      setAiPendingStackType(null)
      setAiCurrentPlayerIndex(nextPlayerIdx)
      setAiHasDrawnCardThisTurn(false)
      setAiUnoCalledPlayers((prev) => {
        const next = new Set(prev)
        next.delete(humanPlayer.id)
        return next
      })
      setAiHasCalledUnoThisRound(false)
      setAiSkippedInfo({
        playerId: humanPlayer.id,
        playerName: humanPlayer.name,
        playedByName: 'Stack Penalty',
        cardType: penaltyType,
        cardsDrawn: penaltyCount,
      })
      setAiActionMessage(
        `You drew ${penaltyCount} cards from the stack penalty! Turn passed to ${updatedPlayers[nextPlayerIdx].name}.`
      )
      return
    }

    // Normal 1-card draw
    const { drawnCards, newDrawPile, newDiscardPile } = drawCardsFromPile(
      1,
      aiDrawPile,
      aiDiscardPile
    )
    if (drawnCards.length === 0) {
      setAiHasDrawnCardThisTurn(true)
      setAiActionMessage('No cards left in the draw pile! Pass your turn or play a card.')
      return
    }

    const drawnCard = drawnCards[0]
    const updatedPlayers = aiPlayers.map((p, idx) =>
      idx === aiCurrentPlayerIndex ? { ...p, hand: [drawnCard, ...p.hand] } : p
    )

    setAiPlayers(updatedPlayers)
    setAiDrawPile(newDrawPile)
    setAiDiscardPile(newDiscardPile)
    setAiHasDrawnCardThisTurn(true)
    setAiUnoCalledPlayers((prev) => {
      const next = new Set(prev)
      next.delete(0)
      return next
    })
    setAiHasCalledUnoThisRound(false)
    const activeP = aiPlayers[aiCurrentPlayerIndex]
    setAiActionMessage(`${activeP.name} drew a card.`)
  }

  const handlePassTurnAi = () => {
    if (!aiHasDrawnCardThisTurn && aiPendingDrawCount === 0) return
    const nextPlayerIdx = getNextActivePlayerIndex(
      aiCurrentPlayerIndex,
      1,
      aiPlayers,
      aiDirection,
      (p) => p.hand.length === 0 || p.rank != null
    )
    setAiCurrentPlayerIndex(nextPlayerIdx)
    setAiHasDrawnCardThisTurn(false)
    if (aiPlayers[0]?.hand?.length !== 1) {
      setAiHasCalledUnoThisRound(false)
    }
    setAiSkippedInfo(null)
    const currentP = aiPlayers[aiCurrentPlayerIndex]
    setAiActionMessage(`${currentP.name} passed turn.`)
  }

  const handleCallUnoAi = () => {
    playUnoCallSound()
    setAiHasCalledUnoThisRound(true)
    setAiUnoCalledPlayers((prev) => new Set(prev).add(0))
    if (botCatchHumanTimerRef.current) {
      clearTimeout(botCatchHumanTimerRef.current)
      botCatchHumanTimerRef.current = null
    }
    const humanHand = aiPlayers[0]?.hand || []
    if (humanHand.length === 1) {
      setAiActionMessage('🔔 You shouted UNO! 1 card remaining!')
    } else {
      setAiActionMessage('🔔 You shouted UNO!')
    }
  }

  const handleCatchUnoAi = (targetPlayerId) => {
    executeAiCatchUno(0, targetPlayerId)
  }

  // AI Bots automatic turn loop
  useEffect(() => {
    if (screen !== 'ai_playing' || aiWinner || penaltyGiveCardModal.isOpen) return

    const activePlayer = aiPlayers[aiCurrentPlayerIndex]
    if (!activePlayer || activePlayer.isHuman || activePlayer.hand.length === 0 || activePlayer.rank) {
      // If current player has finished, automatically advance turn to next active player
      if (activePlayer && (activePlayer.hand.length === 0 || activePlayer.rank)) {
        botTimeoutRef.current = setTimeout(() => {
          const nextIdx = getNextActivePlayerIndex(
            aiCurrentPlayerIndex,
            1,
            aiPlayers,
            aiDirection,
            (p) => p.hand.length === 0 || p.rank != null
          )
          setAiCurrentPlayerIndex(nextIdx)
        }, 100)
      }
      return
    }

    botTimeoutRef.current = setTimeout(() => {
      // 1. Stack Counter Check for Bot
      if (aiPendingDrawCount > 0) {
        const stackCard = activePlayer.hand.find((c) => c.type === aiPendingStackType)
        if (stackCard) {
          const chosenColor =
            stackCard.color === CARD_COLORS.WILD
              ? chooseAiColor(activePlayer.hand)
              : stackCard.color
          executeAiPlayCard(aiCurrentPlayerIndex, stackCard, chosenColor)
          return
        } else {
          // Bot takes the stack penalty
          playCardDrawSound()
          const penaltyCount = aiPendingDrawCount
          const penaltyType = aiPendingStackType
          const { drawnCards, newDrawPile, newDiscardPile } = drawCardsFromPile(
            penaltyCount,
            aiDrawPile,
            aiDiscardPile
          )
          const updatedPlayers = aiPlayers.map((p, idx) =>
            idx === aiCurrentPlayerIndex ? { ...p, hand: [...drawnCards, ...p.hand] } : p
          )
          const nextIdx = getNextActivePlayerIndex(
            aiCurrentPlayerIndex,
            1,
            updatedPlayers,
            aiDirection,
            (p) => p.hand.length === 0 || p.rank != null
          )
          setAiPlayers(updatedPlayers)
          setAiDrawPile(newDrawPile)
          setAiDiscardPile(newDiscardPile)
          setAiPendingDrawCount(0)
          setAiPendingStackType(null)
          setAiCurrentPlayerIndex(nextIdx)
          setAiHasDrawnCardThisTurn(false)
          setAiUnoCalledPlayers((prev) => {
            const next = new Set(prev)
            next.delete(activePlayer.id)
            return next
          })
          setAiSkippedInfo({
            playerId: activePlayer.id,
            playerName: activePlayer.name,
            playedByName: 'Stack Penalty',
            cardType: penaltyType,
            cardsDrawn: penaltyCount,
          })
          setAiActionMessage(
            `${activePlayer.name} drew ${penaltyCount} cards from the stack penalty! Turn passed to ${updatedPlayers[nextIdx].name}.`
          )
          return
        }
      }

      const nextPlayerIdx = getNextActivePlayerIndex(
        aiCurrentPlayerIndex,
        1,
        aiPlayers,
        aiDirection,
        (p) => p.hand.length === 0 || p.rank != null
      )
      const nextPlayer = aiPlayers[nextPlayerIdx]
      const nextPlayerCount = nextPlayer ? nextPlayer.hand.length : 7

      const bestCard = getAiMove(
        activePlayer.hand,
        aiTopCard,
        aiActiveColor,
        nextPlayerCount
      )

      if (bestCard) {
        const chosenColor =
          bestCard.color === CARD_COLORS.WILD
            ? chooseAiColor(activePlayer.hand)
            : bestCard.color
        executeAiPlayCard(aiCurrentPlayerIndex, bestCard, chosenColor)
      } else {
        playCardDrawSound()
        const { drawnCards, newDrawPile, newDiscardPile } = drawCardsFromPile(
          1,
          aiDrawPile,
          aiDiscardPile
        )

        if (drawnCards.length > 0) {
          const drawnCard = drawnCards[0]
          const newHand = [drawnCard, ...activePlayer.hand]

          if (canPlayCard(drawnCard, aiTopCard, aiActiveColor)) {
            const chosenColor =
              drawnCard.color === CARD_COLORS.WILD
                ? chooseAiColor(newHand)
                : drawnCard.color

            const updatedPlayers = aiPlayers.map((p, idx) =>
              idx === aiCurrentPlayerIndex ? { ...p, hand: newHand } : p
            )
            setAiPlayers(updatedPlayers)
            setAiDrawPile(newDrawPile)
            setAiDiscardPile(newDiscardPile)

            // Hand the post-draw roster over explicitly: executeAiPlayCard's captured
            // aiPlayers predates this draw, so without it the drawn card is not found
            // in the hand, is not removed, and the stale hand is committed back over
            // this one - losing the card while still pushing it to the discard pile.
            if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current)
            botTimeoutRef.current = setTimeout(() => {
              executeAiPlayCard(aiCurrentPlayerIndex, drawnCard, chosenColor, updatedPlayers)
            }, 600)
            return
          } else {
            const updatedPlayers = aiPlayers.map((p, idx) =>
              idx === aiCurrentPlayerIndex ? { ...p, hand: newHand } : p
            )
            setAiPlayers(updatedPlayers)
            setAiDrawPile(newDrawPile)
            setAiDiscardPile(newDiscardPile)
            const nextIdx = getNextActivePlayerIndex(
              aiCurrentPlayerIndex,
              1,
              aiPlayers,
              aiDirection,
              (p) => p.hand.length === 0 || p.rank != null
            )
            setAiCurrentPlayerIndex(nextIdx)
            setAiHasDrawnCardThisTurn(false)
            setAiUnoCalledPlayers((prev) => {
              const next = new Set(prev)
              next.delete(activePlayer.id)
              return next
            })
            setAiSkippedInfo(null)
            setAiActionMessage(`${activePlayer.name} drew a card and passed.`)
          }
        } else {
          const nextIdx = getNextActivePlayerIndex(
            aiCurrentPlayerIndex,
            1,
            aiPlayers,
            aiDirection,
            (p) => p.hand.length === 0 || p.rank != null
          )
          setAiCurrentPlayerIndex(nextIdx)
          setAiHasDrawnCardThisTurn(false)
          setAiSkippedInfo(null)
        }
      }
    }, 1100)

    return () => {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current)
    }
  }, [
    aiCurrentPlayerIndex,
    screen,
    aiWinner,
    aiPlayers,
    aiTopCard,
    aiActiveColor,
    aiDrawPile,
    aiDiscardPile,
    aiDirection,
    executeAiPlayCard,
    aiPendingDrawCount,
    aiPendingStackType,
    penaltyGiveCardModal.isOpen,
  ])


  // Derived turn state for the board
  const aiActivePlayer = aiPlayers[aiCurrentPlayerIndex]
  const isAiHumanTurn = Boolean(aiActivePlayer && aiActivePlayer.isHuman)
  const isAiWaitingForBot =
    screen === 'ai_playing' && !aiWinner && Boolean(aiActivePlayer && !aiActivePlayer.isHuman)

  // Timers outlive a render, so the hook owns tearing them down.
  useEffect(() => {
    return () => {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current)
      clearAllAiUnoTimers()
    }
  }, [clearAllAiUnoTimers])

  return {
    // board state
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

    // actions
    handleStartAiGame,
    handlePlayAgainAi,
    handleHumanPlayCardAi,
    handleDrawCardAi,
    handlePassTurnAi,
    handleCallUnoAi,
    handleCatchUnoAi,
    handleConfirmGiveCardAi,
    executeAiPlayCard,
  }
}
