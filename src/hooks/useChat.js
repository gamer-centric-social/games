import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * useChat
 *
 * Connects React UI to a ChatService instance.
 * Manages message state, unread badge counter, modal visibility,
 * and the 2-second popup toast for new incoming messages.
 */
export function useChat({
  chatService,
  currentUserId,
  currentUserName,
  currentUserAvatar = '👤',
}) {
  const [messages, setMessages] = useState(() =>
    chatService ? chatService.getHistory() : []
  )
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [activeToast, setActiveToast] = useState(null)

  const isChatOpenRef = useRef(isChatOpen)

  useEffect(() => {
    isChatOpenRef.current = isChatOpen
  }, [isChatOpen])

  const toastTimerRef = useRef(null)

  // Listen to ChatService events
  useEffect(() => {
    if (!chatService) return undefined

    const unsubscribe = chatService.subscribe((updatedMessages, newIncomingMsg) => {
      setMessages(updatedMessages)

      // If a message was received from another player
      if (newIncomingMsg && newIncomingMsg.senderId !== currentUserId) {
        if (!isChatOpenRef.current) {
          // Increment unread count
          setUnreadCount((count) => count + 1)

          // Show floating 2-second toast preview
          if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current)
          }

          setActiveToast(newIncomingMsg)

          toastTimerRef.current = setTimeout(() => {
            setActiveToast(null)
            toastTimerRef.current = null
          }, 2000)
        }
      }
    })

    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
      unsubscribe()
    }
  }, [chatService, currentUserId])

  // Open modal & clear unread / toast
  const openChat = useCallback(() => {
    setIsChatOpen(true)
    setUnreadCount(0)
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    setActiveToast(null)
  }, [])

  // Close modal
  const closeChat = useCallback(() => {
    setIsChatOpen(false)
  }, [])

  const toggleChat = useCallback(() => {
    if (isChatOpenRef.current) {
      closeChat()
    } else {
      openChat()
    }
  }, [openChat, closeChat])

  // Dismiss toast manually (e.g. user swipe or tap)
  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    setActiveToast(null)
  }, [])

  // Send message
  const sendMessage = useCallback(
    (text) => {
      if (!chatService) return null
      return chatService.sendMessage({
        text,
        senderId: currentUserId,
        senderName: currentUserName || 'Player',
        avatar: currentUserAvatar,
      })
    },
    [chatService, currentUserId, currentUserName, currentUserAvatar]
  )

  return {
    messages,
    isChatOpen,
    unreadCount,
    activeToast,
    openChat,
    closeChat,
    toggleChat,
    dismissToast,
    sendMessage,
  }
}
