import React, { useState } from 'react'
import { Gift, Trophy } from 'lucide-react'
import UnoCard from './UnoCard'
import { playClickSound } from '../../../utils/sound'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import Label from '../../../components/ui/Label'
import { cx } from '../../../components/ui/tokens'

export default function UnoGiveCardModal({
  isOpen,
  targetPlayerName = 'Player',
  challengerName = '',
  isMyCatch = false,
  hand = [],
  onGiveCard,
}) {
  const [selectedCardId, setSelectedCardId] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // The modal outlives each penalty, so opening it again has to start clean --
  // adjusted during render rather than in an effect, which would render twice.
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    setIsSubmitting(false)
    setSelectedCardId(null)
  }

  if (!isOpen || hand.length === 0) return null

  const isLastCard = hand.length === 1

  const effectiveSelectedCardId =
    selectedCardId && hand.some((c) => c.id === selectedCardId)
      ? selectedCardId
      : isLastCard
      ? hand[0]?.id || null
      : null

  const selectedCard = hand.find((c) => c.id === effectiveSelectedCardId) || null

  const buttonLabel = () => {
    if (isLastCard) return 'Give your last card and finish'
    if (!selectedCard) return 'Pick a card'
    const colour =
      selectedCard.color && selectedCard.color !== 'wild' ? `${selectedCard.color} ` : ''
    return `Give the ${colour}${selectedCard.label || 'card'}`
  }

  return (
    <Modal
      open
      dismissible={false}
      size="md"
      // Who caught whom, not just who is owed a card. Two people can tap Catch at
      // once and only one of them starts the penalty -- the loser is a giver in the
      // winner's, and used to be shown a bare "Give a card to X" for a catch that
      // was not theirs and, when they had aimed at someone else, not even their X.
      title={
        isMyCatch
          ? `You caught ${targetPlayerName}`
          : challengerName
          ? `${challengerName} caught ${targetPlayerName}`
          : `Give a card to ${targetPlayerName}`
      }
      footer={
        <Button
          tone="uno"
          fullWidth
          disabled={!selectedCard || isSubmitting}
          onClick={() => {
            if (!selectedCard || isSubmitting) return
            setIsSubmitting(true)
            playClickSound()
            onGiveCard(selectedCard)
          }}
        >
          {isLastCard ? <Trophy className="w-4 h-4" /> : <Gift className="w-4 h-4" />}
          {buttonLabel()}
        </Button>
      }
    >
      <p className="text-mini text-ink-muted">
        {targetPlayerName} never called UNO. One card from your hand goes over.
      </p>

      {isLastCard && (
        <p className="mt-3 p-3 rounded-object bg-uno/10 border border-uno/40 text-uno text-mini font-bold flex items-center gap-2.5">
          <Trophy className="w-5 h-5 shrink-0" />
          This is your last card. Handing it over finishes the game for you.
        </p>
      )}

      <div className="py-4">
        <Label className="text-center mb-2.5">Tap the card you want to give</Label>
        <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3">
          {hand.map((card) => {
            const isSelected = card.id === selectedCard?.id
            return (
              <div
                key={card.id}
                className={cx(
                  'relative rounded-well transition duration-200',
                  isSelected
                    ? 'scale-110 ring-2 ring-uno shadow-lift-2 z-10'
                    : 'hover:scale-105 opacity-85 hover:opacity-100'
                )}
              >
                <UnoCard
                  card={card}
                  size="md"
                  isPlayable={true}
                  onClick={() => {
                    playClickSound()
                    setSelectedCardId(card.id)
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
