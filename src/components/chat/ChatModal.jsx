import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, MessageSquare, X } from 'lucide-react'
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
 * WhatsApp-style in-game and in-lobby chat window.
 *
 * On Mobile (< 640px):
 * - Fixed full-height view synchronized directly with window.visualViewport.
 * - The input box anchors directly to the virtual keyboard as it opens/closes.
 * - The message list fills the remaining space and can be scrolled freely while typing.
 * - Auto-scroll on new messages uses internal container scrolling (never window.scrollIntoView).
 *
 * On Desktop (>= 640px):
 * - Centered modal dialog with blurred table backdrop.
 */
export default function ChatModal({
  open = false,
  onClose,
  messages = [],
  onSendMessage,
  currentUserId,
  roomCode = '',
}) {
  const [inputText, setInputText] = useState('')
  const [viewportStyle, setViewportStyle] = useState({})

  const panelRef = useRef(null)
  const inputRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const isScrolledToBottomRef = useRef(true)

  // Synchronize with mobile visual viewport (virtual keyboard height & position)
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined

    const updateViewport = () => {
      const vv = window.visualViewport
      // On mobile viewports (< 640px)
      if (window.innerWidth < 640 && vv) {
        setViewportStyle({
          height: `${vv.height}px`,
          top: `${vv.offsetTop}px`,
        })
      } else {
        setViewportStyle({})
      }
    }

    updateViewport()

    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', updateViewport)
      vv.addEventListener('scroll', updateViewport)
    }
    window.addEventListener('resize', updateViewport)

    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateViewport)
        vv.removeEventListener('scroll', updateViewport)
      }
      window.removeEventListener('resize', updateViewport)
    }
  }, [open])

  // Prevent background body scrolling when modal is open
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [open])

  // Close on Escape key
  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Internal smooth scroll without scrolling the window or outer document
  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    })
  }, [])

  // Track if user has manually scrolled up to view older messages
  const handleScroll = () => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isScrolledToBottomRef.current = distanceToBottom < 80
  }

  // Auto-scroll on new incoming messages if user is already near bottom
  useEffect(() => {
    if (open && messages.length > 0 && isScrolledToBottomRef.current) {
      scrollToBottom(true)
    }
  }, [messages, open, scrollToBottom])

  // Focus input and jump to latest messages on open
  useEffect(() => {
    if (open) {
      isScrolledToBottomRef.current = true
      const timer = setTimeout(() => {
        scrollToBottom(false)
        inputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [open, scrollToBottom])

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = inputText.trim()
    if (!trimmed || !onSendMessage) return

    const result = onSendMessage(trimmed)
    if (result) {
      setInputText('')
      isScrolledToBottomRef.current = true
      setTimeout(() => scrollToBottom(true), 30)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex sm:items-center sm:justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-table/85 backdrop-blur-md animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Main Chat Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Room Chat"
        tabIndex={-1}
        style={viewportStyle}
        onClick={(e) => e.stopPropagation()}
        className={cx(
          'relative z-10 w-full flex flex-col bg-felt outline-none',
          // Mobile: fixed full-height window locked to visual viewport
          'fixed inset-x-0 top-0 sm:static sm:h-[540px] sm:max-h-[85vh] sm:max-w-md sm:rounded-slab sm:border sm:border-edge sm:shadow-lift-3 sm:animate-scaleUp'
        )}
      >
        {/* Pinned Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-edge">
          <div className="flex items-center gap-2.5 min-w-0">
            <Pill tone="uno">Chat</Pill>
            {roomCode && (
              <span className="font-mono text-nano text-ink-faint tracking-wider">
                {roomCode}
              </span>
            )}
            <h2 className="font-display text-lg sm:text-xl text-ink leading-none ml-1 truncate">
              Room Chat
            </h2>
          </div>

          <IconButton
            label="Close chat"
            size="sm"
            radius="full"
            onClick={onClose}
            className="shrink-0"
          >
            <X className="w-4 h-4 text-ink" />
          </IconButton>
        </div>

        {/* Scrollable Messages Area */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3 min-h-0 select-text"
          style={{ touchAction: 'pan-y' }}
        >
          {messages.length === 0 ? (
            <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center p-4">
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
              const isMe = msg.senderId === currentUserId

              if (isMe) {
                return (
                  <div key={msg.id} className="flex flex-col items-end">
                    <div
                      className={cx(
                        'max-w-[85%] px-3 py-2 rounded-object rounded-tr-xs',
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
                        'px-3 py-2 rounded-object rounded-tl-xs',
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
        </div>

        {/* Pinned Input Bar (anchors on top of mobile keyboard) */}
        <form
          onSubmit={handleSubmit}
          className="shrink-0 p-3 sm:p-4 bg-felt border-t border-edge flex items-center gap-2"
        >
          <TextInput
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message…"
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            className="flex-1 py-2 text-base sm:text-sm"
          />

          <IconButton
            type="submit"
            label="Send message"
            size="md"
            active={Boolean(inputText.trim())}
            onClick={handleSubmit}
            className="shrink-0"
          >
            <Send className="w-4 h-4 text-ink" />
          </IconButton>
        </form>
      </div>
    </div>
  )
}
