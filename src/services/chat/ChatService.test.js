import { describe, it, expect, vi } from 'vitest'
import { ChatService } from './ChatService'
import { PeerJsChatTransport } from './transports/PeerJsChatTransport'
import { sanitizeChatMessage, createChatMessage, MAX_CHAT_MESSAGE_LENGTH } from './chatTypes'
import { stampChatPacket } from './chatRelay'

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

  it('marks a locally sent message as own, but never puts that flag on the wire', () => {
    const mockSend = vi.fn()
    const chatService = new ChatService({ transport: new PeerJsChatTransport({ send: mockSend }) })

    chatService.sendMessage({ text: 'mine', senderId: 1, senderName: 'P1' })

    expect(chatService.getHistory()[0].isOwn).toBe(true)
    expect(mockSend.mock.calls[0][0].payload).not.toHaveProperty('isOwn')
  })

  it('never treats a network message as own, even if it claims to be', () => {
    const chatService = new ChatService()
    chatService.handleNetworkPacket({
      type: 'CHAT_MESSAGE',
      payload: { id: 'msg_claim', senderId: 1, senderName: 'P1', text: 'hi', isOwn: true },
    })
    chatService.handleNetworkPacket({
      type: 'SYNC_CHAT',
      payload: [{ id: 'msg_claim_2', senderId: 1, senderName: 'P1', text: 'hi', isOwn: true }],
    })

    expect(chatService.getHistory().map((m) => m.isOwn)).toEqual([false, false])
  })

  it('reports whether it accepted a network message', () => {
    const chatService = new ChatService()
    const packet = {
      type: 'CHAT_MESSAGE',
      payload: { id: 'msg_once', senderId: 1, senderName: 'P1', text: 'hi' },
    }

    expect(chatService.handleNetworkPacket(packet)).toBe(true)
    expect(chatService.handleNetworkPacket(packet)).toBe(false)
    expect(
      chatService.handleNetworkPacket({ type: 'CHAT_MESSAGE', payload: { id: 'msg_blank', text: ' ' } })
    ).toBe(false)
    expect(chatService.handleNetworkPacket(null)).toBe(false)
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

  it('relays message from client through host to other clients and updates all histories', () => {
    // 1. Host setup
    const hostBroadcast = vi.fn()
    const hostTransport = new PeerJsChatTransport({ send: hostBroadcast })
    const hostChat = new ChatService({ transport: hostTransport })

    // 2. Client 1 (Mobile) setup
    const client1SendAction = vi.fn()
    const client1Transport = new PeerJsChatTransport({ send: client1SendAction })
    const client1Chat = new ChatService({ transport: client1Transport })

    // 3. Client 2 setup
    const client2SendAction = vi.fn()
    const client2Transport = new PeerJsChatTransport({ send: client2SendAction })
    const client2Chat = new ChatService({ transport: client2Transport })

    // Wiring host broadcast to client 1 and client 2
    hostBroadcast.mockImplementation((packet) => {
      client1Transport.handleIncoming(packet)
      client2Transport.handleIncoming(packet)
    })

    // The host's seat record for client 1 -- the only source of who sent it.
    const client1Seat = { id: 1, name: 'Mobile User', avatar: '📱' }

    // Wiring client1 sendAction to host onClientData (as in UnoGame.jsx)
    client1SendAction.mockImplementation((data) => {
      const stamped = stampChatPacket(data, client1Seat)
      if (stamped && hostChat.handleNetworkPacket(stamped)) {
        hostBroadcast(stamped)
      }
    })

    // Client 1 sends a message claiming to be the host
    client1Chat.sendMessage({
      text: 'Message from mobile!',
      senderId: 0,
      senderName: 'Host',
      avatar: '👑',
    })

    // Client 1 keeps its own copy, marked as its own; the echo is a duplicate.
    expect(client1Chat.getHistory()).toHaveLength(1)
    expect(client1Chat.getHistory()[0]).toMatchObject({ text: 'Message from mobile!', isOwn: true })

    // Host and client 2 see the real sender, not the claimed one.
    for (const chat of [hostChat, client2Chat]) {
      expect(chat.getHistory()).toHaveLength(1)
      expect(chat.getHistory()[0]).toMatchObject({
        text: 'Message from mobile!',
        senderId: 1,
        senderName: 'Mobile User',
        avatar: '📱',
        isOwn: false,
      })
    }
  })

  it('host does not rebroadcast a message whose id it has already seen', () => {
    const hostBroadcast = vi.fn()
    const hostChat = new ChatService({ transport: new PeerJsChatTransport({ send: hostBroadcast }) })
    const seat = { id: 1, name: 'P1' }
    const relay = (data) => {
      const stamped = stampChatPacket(data, seat)
      if (stamped && hostChat.handleNetworkPacket(stamped)) hostBroadcast(stamped)
    }

    const packet = { type: 'CHAT_MESSAGE', payload: { id: 'msg_replay', text: 'once' } }
    relay(packet)
    relay({ ...packet, payload: { ...packet.payload, text: 'replayed with a stolen id' } })

    expect(hostBroadcast).toHaveBeenCalledTimes(1)
    expect(hostChat.getHistory()).toHaveLength(1)
    expect(hostChat.getHistory()[0].text).toBe('once')
  })

  it('supports attaching and detaching transports dynamically', () => {
    const transport1 = new PeerJsChatTransport()
    const transport2 = new PeerJsChatTransport()
    const chatService = new ChatService()

    // Initially no transport attached
    expect(transport1.handlers.size).toBe(0)

    // Attach transport 1
    chatService.attachTransport(transport1)
    expect(transport1.handlers.size).toBe(1)

    // Detach
    chatService.detachTransport()
    expect(transport1.handlers.size).toBe(0)

    // Attach transport 2
    chatService.attachTransport(transport2)
    expect(transport2.handlers.size).toBe(1)

    // Incoming message on transport 2 arrives
    transport2.handleIncoming({
      type: 'CHAT_MESSAGE',
      payload: {
        id: 'msg_dyn_1',
        senderId: 2,
        senderName: 'Player 2',
        text: 'Dynamic transport message',
        timestamp: Date.now(),
      },
    })
    expect(chatService.getHistory()).toHaveLength(1)
    expect(chatService.getHistory()[0].text).toBe('Dynamic transport message')
  })
})
