import React from 'react'
import { Trophy } from 'lucide-react'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import Pill from '../../../components/ui/Pill'
import PlayerRow, { Badge } from '../../../components/ui/PlayerRow'
import { playClickSound } from '../../../utils/sound'

const PLACE = ['1st', '2nd', '3rd', '4th', '5th', '6th']

/**
 * The finishing order. Solo plays again straight away; online, only the host
 * can take the table back to the lobby, where anyone who left loses their seat.
 */
export default function DiceGameOverModal({ view, isOnline, isHost, onPlayAgain, onBackToLobby, onLeave }) {
  if (view?.phase !== 'over') return null

  const seatOf = (id) => view.seats.find((s) => s.id === id)
  const winner = seatOf(view.winnerId)
  const youWon = view.winnerId === view.yourId
  const click = (fn) => () => {
    playClickSound()
    fn()
  }

  let footer
  if (!isOnline) {
    footer = (
      <div className="space-y-2">
        <Button tone="dice" fullWidth onClick={click(onPlayAgain)}>
          Play again
        </Button>
        <Button variant="ghost" size="md" fullWidth onClick={click(onLeave)}>
          Leave the table
        </Button>
      </div>
    )
  } else if (isHost) {
    footer = (
      <div className="space-y-2">
        <Button tone="dice" fullWidth onClick={click(onBackToLobby)}>
          Back to the lobby
        </Button>
        <Button variant="ghost" size="md" fullWidth onClick={click(onLeave)}>
          Close the room
        </Button>
      </div>
    )
  } else {
    footer = (
      <div className="space-y-2">
        <p className="text-center text-mini text-ink-muted">Waiting for the host to reset the table…</p>
        <Button variant="ghost" size="md" fullWidth onClick={click(onLeave)}>
          Leave this room
        </Button>
      </div>
    )
  }

  return (
    <Modal
      open
      dismissible={false}
      eyebrow={<Pill tone="dice">Game over</Pill>}
      title={youWon ? 'You win the table' : `${winner?.name ?? 'Someone'} wins`}
      footer={footer}
      bodyClassName="space-y-2"
    >
      {view.rankings.map((id, index) => {
        const seat = seatOf(id)
        if (!seat) return null
        return (
          <PlayerRow
            key={id}
            tone={index === 0 ? 'dice' : undefined}
            avatar={index === 0 ? <Trophy className="w-5 h-5" /> : seat.avatar}
            name={seat.name}
            badges={id === view.yourId && <Badge>You</Badge>}
            trailing={<span className="font-mono text-mini text-ink-muted">{PLACE[index]}</span>}
          />
        )
      })}
    </Modal>
  )
}
