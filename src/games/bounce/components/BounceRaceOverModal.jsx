import React from 'react'
import { Trophy } from 'lucide-react'
import { playClickSound } from '../../../utils/sound'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import Pill from '../../../components/ui/Pill'
import PlayerRow, { Avatar, Badge } from '../../../components/ui/PlayerRow'
import { formatMs } from '../utils/formatTime'

/**
 * The results. Finishers in the order the host received them, which is the order
 * that decided the race -- no clock is shared between devices, so first past the
 * post is literally first past the post.
 */
export default function BounceRaceOverModal({
  view,
  isOnline = false,
  isHost = false,
  soloTime = null,
  bestMs = null,
  isNewBest = false,
  onPlayAgain,
  onBackToLobby,
  onLeave,
}) {
  const open = isOnline ? view?.phase === 'over' : soloTime != null
  if (!open) return null

  const seats = isOnline
    ? [...(view?.seats ?? [])].sort((a, b) => {
        if (a.finished && b.finished) return a.rank - b.rank
        if (a.finished !== b.finished) return (a.finished ? -1 : 1)
        return (b.progress ?? 0) - (a.progress ?? 0)
      })
    : []

  const winner = seats.find((seat) => seat.rank === 1)
  const youWon = isOnline && winner?.id === view?.yourId

  const act = (fn) => () => {
    playClickSound()
    fn?.()
  }

  return (
    <Modal
      open
      onClose={act(onLeave)}
      dismissible={false}
      title={isOnline ? (youWon ? 'You made it first' : 'Race over') : 'Time trial'}
      eyebrow={<Pill tone="bounce">Bounce</Pill>}
      size="sm"
      footer={
        <div className="w-full space-y-2">
          {isOnline ? (
            isHost ? (
              <Button tone="bounce" fullWidth onClick={act(onBackToLobby)}>
                Back to the lobby
              </Button>
            ) : (
              <p className="text-center text-mini text-ink-muted">Waiting for the host to set up another climb…</p>
            )
          ) : (
            <Button tone="bounce" fullWidth onClick={act(onPlayAgain)}>
              Climb again
            </Button>
          )}
          <Button variant="ghost" size="md" fullWidth onClick={act(onLeave)}>
            Leave
          </Button>
        </div>
      }
      bodyClassName="space-y-3"
    >
      {isOnline ? (
        <ul className="space-y-2">
          {seats.map((seat) => (
            <li key={seat.id}>
              <PlayerRow
                tone={seat.rank === 1 ? 'bounce' : 'neutral'}
                avatar={<Avatar tone={seat.rank === 1 ? 'bounce' : 'neutral'}>{seat.avatar}</Avatar>}
                name={seat.name}
                badges={
                  <>
                    {seat.id === view?.yourId && <Badge>You</Badge>}
                    {seat.rank === 1 && (
                      <Badge tone="bounce">
                        <Trophy className="w-3 h-3" />
                        First
                      </Badge>
                    )}
                  </>
                }
                trailing={
                  <span className="font-mono text-mini text-ink-muted tabular-nums">
                    {seat.finished ? formatMs(seat.finishMs) : 'did not finish'}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-2 text-center">
          <p className="font-mono text-3xl text-ink tabular-nums">{formatMs(soloTime)}</p>
          {isNewBest ? (
            <p className="text-mini text-bounce">A new best. The old one is gone.</p>
          ) : (
            <p className="text-mini text-ink-muted">Best so far {formatMs(bestMs)}</p>
          )}
        </div>
      )}
    </Modal>
  )
}
