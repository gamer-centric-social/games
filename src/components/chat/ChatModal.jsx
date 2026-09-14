import React, { useState, useRef, useEffect } from 'react'
import { Send, MessageSquare } from 'lucide-react'
import Modal from '../ui/Modal'
import Pill from '../ui/Pill'
import IconButton from '../ui/IconButton'
import TextInput from '../ui/TextInput'
import { MAX_CHAT_MESSAGE_LENGTH } from '../../services/chat/chatTypes'
import { cx } from '../ui/tokens'

/** Format timestamp to HH:MM */
function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * ChatModal
 *
 * In-game and in-lobby chat dialog.
 * Accessible, styled with the "Table" visual design language.
 */
export default function ChatModal({
  open = false,
  onClose,
  messages = [],
  onSendMessage,
  roomCode = '',
  tone = 'lamp', // the game's ink -- this modal is shared, so it must not pick one
}) {
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const messageCount = messages.length
  // Auto-scroll to bottom on new messages (nothing to scroll to when empty)
  useEffect(() => {
    if (open && messageCount > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messageCount, open])

  // Focus input on modal open
  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [open])

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = inputText.trim()
    if (!trimmed || !onSendMessage) return

    const result = onSendMessage(trimmed)
    if (result) {
      setInputText('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      eyebrow={
        <div className="flex items-center gap-2">
          <Pill tone={tone}>Chat</Pill>
          {roomCode && (
            <span className="font-mono text-nano text-ink-faint tracking-wider">
              {roomCode}
            </span>
          )}
        </div>
      }
      title="Room Chat"
      bodyClassName="flex flex-col min-h-[220px] max-h-[50dvh]"
    >
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-2">
        {messages.length === 0 ? (
          <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center p-4">
            <div className="w-10 h-10 rounded-full bg-well shadow-sink flex items-center justify-center text-ink-faint mb-2">
              <MessageSquare className="w-5 h-5 opacity-40" />
            </div>
            <p className="font-display text-sm text-ink-muted">No messages yet</p>
            <p className="text-nano text-ink-faint mt-0.5">
              Say hello to the table!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.isOwn) {
              return (
                <div key={msg.id} className="flex flex-col items-end">
                  <div
                    className={cx(
                      'max-w-[85%] px-3 py-2 rounded-object rounded-tr-well',
                      'bg-felt-high border border-edge text-ink text-sm shadow-lift-0 break-words'
                    )}
                  >
                    {msg.text}
                  </div>
                  <span className="font-mono text-nano text-ink-faint mt-1 pr-0.5">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              )
            }

            return (
              <div key={msg.id} className="flex items-start gap-2 max-w-[90%]">
                <span className="w-6 h-6 rounded-full bg-well shadow-sink flex items-center justify-center text-xs shrink-0 mt-0.5">
                  {msg.avatar || '👤'}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-display text-nano font-semibold text-ink-muted truncate">
                      {msg.senderName}
                    </span>
                    <span className="font-mono text-nano text-ink-faint">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                  <div
                    className={cx(
                      'px-3 py-2 rounded-object rounded-tl-well',
                      'bg-well border border-edge text-ink text-sm shadow-sink break-words'
                    )}
                  >
                    {msg.text}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={handleSubmit}
        className="mt-3 pt-3 border-t border-edge flex items-center gap-2"
      >
        <TextInput
          ref={inputRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message…"
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          className="flex-1 py-2 text-sm"
        />

        <IconButton
          type="submit"
          label="Send message"
          size="md"
          active={Boolean(inputText.trim())}
          className="shrink-0"
        >
          <Send className="w-4 h-4 text-ink" />
        </IconButton>
      </form>
    </Modal>
  )
}
