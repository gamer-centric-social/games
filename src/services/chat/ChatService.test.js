import { describe, it, expect, vi } from 'vitest'
import { ChatService } from './ChatService'
import { PeerJsChatTransport } from './transports/PeerJsChatTransport'
import { sanitizeChatMessage, createChatMessage, MAX_CHAT_MESSAGE_LENGTH } from './chatTypes'

describe('chatTypes', () => {
  it('sanitizes text properly and truncates to max length', () => {
    expect(sanitizeChatMessage('   hello world   ')).toBe('hello world')
    expect(sanitizeChatMessage(123)).toBe('')
    expect(sanitizeChatMessage(null)).toBe('')

    const longText = 'a'.repeat(MAX_CHAT_MESSAGE_LENGTH + 50)
    const sanitized = sanitizeChatMessage(longText)
    expect(sanitized.length).toBe(MAX_CHAT_MESSAGE_LENGTH)
  })

  it('creates valid chat message envelope', () => {
    const msg = createChatMessage({
      senderId: 1,
      senderName: 'Hansana',
      avatar: '🦊',
      text: 'Hello team!',
    })

    expect(msg).toMatchObject({
      type: 'TEXT',
      senderId: 1,
      senderName: 'Hansana',
      avatar: '🦊',
      text: 'Hello team!',
    })
    expect(typeof msg.id).toBe('string')
    expect(typeof msg.timestamp).toBe('number')
  })

  it('rejects empty messages', () => {
    const msg = createChatMessage({
      senderId: 1,
      senderName: 'Hansana',
      text: '   ',
    })
    expect(msg).toBeNull()
  })
})

describe('ChatService', () => {
  it('sends messages and routes them through transport', () => {
    const mockSend = vi.fn()
    const transport = new PeerJsChatTransport({ send: mockSend })
    const chatService = new ChatService({ transport })

    const listener = vi.fn()
    chatService.subscribe(listener)

    const sent = chatService.sendMessage({
      text: 'Playing a reverse card!',
      senderId: 0,
      senderName: 'Host',
      avatar: '👑',
    })

    expect(sent).not.toBeNull()
    expect(mockSend).toHaveBeenCalledWith({
      type: 'CHAT_MESSAGE',
      payload: expect.objectContaining({
        text: 'Playing a reverse card!',
        senderId: 0,
      }),
    })

    expect(chatService.getHistory()).toHaveLength(1)
    expect(listener).toHaveBeenCalledWith(expect.any(Array), null)
  })

  it('receives incoming network packets, deduplicates, and notifies subscribers with newMsg', () => {
    const transport = new PeerJsChatTransport()
    const chatService = new ChatService({ transport })

    const subscriber = vi.fn()
    chatService.subscribe(subscriber)

    const packet = {
      type: 'CHAT_MESSAGE',
      payload: {
        id: 'msg_test_1',
        type: 'TEXT',
        senderId: 2,
        senderName: 'Alex',
        avatar: '🦁',
        text: 'Hello everyone!',
        timestamp: Date.now(),
      },
    }

    // First arrival
    transport.handleIncoming(packet)
    expect(chatService.getHistory()).toHaveLength(1)
    expect(subscriber).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ id: 'msg_test_1' })
    )

    // Duplicate arrival should be ignored
    transport.handleIncoming(packet)
    expect(chatService.getHistory()).toHaveLength(1)
  })

  it('enforces maximum history buffer length', () => {
    const chatService = new ChatService({ maxHistory: 3 })

    chatService.sendMessage({ text: 'Msg 1', senderId: 1, senderName: 'P1' })
    chatService.sendMessage({ text: 'Msg 2', senderId: 1, senderName: 'P1' })
    chatService.sendMessage({ text: 'Msg 3', senderId: 1, senderName: 'P1' })
    chatService.sendMessage({ text: 'Msg 4', senderId: 1, senderName: 'P1' })

    const history = chatService.getHistory()
    expect(history).toHaveLength(3)
    expect(history[0].text).toBe('Msg 2')
    expect(history[2].text).toBe('Msg 4')
  })

  it('handles SYNC_CHAT packet to sync history without duplicates', () => {
    const transport = new PeerJsChatTransport()
    const chatService = new ChatService({ transport })

    chatService.sendMessage({ text: 'Existing 1', senderId: 1, senderName: 'P1' })

    const syncPacket = {
      type: 'SYNC_CHAT',
      payload: [
        chatService.getHistory()[0], // duplicate
        {
          id: 'msg_synced_2',
          type: 'TEXT',
          senderId: 2,
          senderName: 'P2',
          avatar: '🐼',
          text: 'Synced message',
          timestamp: Date.now(),
        },
      ],
    }

    transport.handleIncoming(syncPacket)
    expect(chatService.getHistory()).toHaveLength(2)
    expect(chatService.getHistory()[1].text).toBe('Synced message')
  })

  it('cleans up resources on destroy', () => {
    const transport = new PeerJsChatTransport()
    const chatService = new ChatService({ transport })

    chatService.sendMessage({ text: 'Hello', senderId: 1, senderName: 'P1' })
    chatService.destroy()

    expect(chatService.getHistory()).toHaveLength(0)
  })
})
