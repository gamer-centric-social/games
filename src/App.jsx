import React, { useState } from 'react'
import Navbar from './components/Navbar'
import GameHub from './components/GameHub'
import ImposterGame from './games/imposter/ImposterGame'
import UnoGame from './games/uno/UnoGame'
import TankGame from './games/tank/TankGame'
import DiceGame from './games/dice/DiceGame'
import BounceGame from './games/bounce/BounceGame'
import { isSoundEnabled, setSoundEnabled } from './utils/sound'

export default function App() {
  // Check if URL has ?room=... or ?game=... or sessionStorage active room
  const [initialRoomCode, setInitialRoomCode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const deepLinked = params.get('game')
      if (deepLinked === 'dice' || deepLinked === 'bounce') return params.get('room') || ''
      return params.get('room') || sessionStorage.getItem('uno_active_room') || ''
    }
    return ''
  })

  // Navigation State: null = Game Hub Main Menu, 'imposter', 'uno', 'tank'
  const [selectedGame, setSelectedGame] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('game') === 'tank' || (params.get('room') && params.get('game') === 'tank')) {
        return 'tank'
      }
      // Before UNO's branch, which claims any ?room= without a game.
      if (params.get('game') === 'dice') {
        return 'dice'
      }
      if (params.get('game') === 'bounce') {
        return 'bounce'
      }
      if (params.get('room') || params.get('game') === 'uno' || sessionStorage.getItem('uno_active_room')) {
        return 'uno'
      }
      if (params.get('game') === 'imposter') {
        return 'imposter'
      }
    }
    return null
  })
  const [isRulesOpen, setIsRulesOpen] = useState(false)
  // Reported upward by each game so Navbar can warn before discarding a live match.
  const [inGame, setInGame] = useState(false)
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled())

  const handleToggleSound = () => {
    const nextVal = !soundOn
    setSoundOn(nextVal)
    setSoundEnabled(nextVal)
  }

  const handleBackToMenu = () => {
    setSelectedGame(null)
    setInGame(false)
    setInitialRoomCode('')
    setIsRulesOpen(false)
    try {
      sessionStorage.removeItem('uno_active_room')
    } catch {
      // ignore
    }
    // Clean URL query params if any
    if (typeof window !== 'undefined' && window.history && window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }

  const handleOpenRulesForGame = (gameId) => {
    setSelectedGame(gameId)
    setIsRulesOpen(true)
  }

  return (
    <div className="table-lamp min-h-dvh bg-table text-ink flex flex-col selection:bg-lamp/25 selection:text-ink">
      {/* Global Navigation Bar */}
      <Navbar
        soundOn={soundOn}
        onToggleSound={handleToggleSound}
        onOpenRules={() => setIsRulesOpen(true)}
        activeGame={selectedGame}
        inGame={inGame}
        onBackToMenu={handleBackToMenu}
      />

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex flex-col justify-start pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {selectedGame === null && (
          <GameHub
            onSelectGame={(gameId) => setSelectedGame(gameId)}
            onOpenRulesForGame={handleOpenRulesForGame}
          />
        )}

        {selectedGame === 'imposter' && (
          <ImposterGame
            onInGameChange={setInGame}
            isRulesOpen={isRulesOpen}
            onCloseRules={() => setIsRulesOpen(false)}
          />
        )}

        {selectedGame === 'uno' && (
          <UnoGame
            onInGameChange={setInGame}
            isRulesOpen={isRulesOpen}
            onCloseRules={() => setIsRulesOpen(false)}
            initialRoomCode={initialRoomCode}
          />
        )}

        {selectedGame === 'tank' && (
          <TankGame
            onInGameChange={setInGame}
            isRulesOpen={isRulesOpen}
            onCloseRules={() => setIsRulesOpen(false)}
            initialRoomCode={initialRoomCode}
          />
        )}

        {selectedGame === 'dice' && (
          <DiceGame
            onInGameChange={setInGame}
            isRulesOpen={isRulesOpen}
            onCloseRules={() => setIsRulesOpen(false)}
            initialRoomCode={initialRoomCode}
          />
        )}

        {selectedGame === 'bounce' && (
          <BounceGame
            onInGameChange={setInGame}
            isRulesOpen={isRulesOpen}
            onCloseRules={() => setIsRulesOpen(false)}
            initialRoomCode={initialRoomCode}
          />
        )}
      </main>
    </div>
  )
}
