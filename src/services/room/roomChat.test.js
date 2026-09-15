import { describe, it, expect, vi } from 'vitest'
import { ChatService } from '../chat/ChatService'
import { PeerJsChatTransport } from '../chat/transports/PeerJsChatTransport'
import { relayClientChat, sendChatHistory, routeClientChat, broadcastToSeats } from './roomChat'

const seat = { id: 1, name: 'Ana', avatar: '🦊' }
const chat = (id, text = 'hi', extra = {}) => ({
  type: 'CHAT_MESSAGE',
  payload: { id, text, senderId: 0, senderName: 'Host', avatar: '👑', ...extra },
})

describe('relayClientChat (host)', () => {
  it('ignores anything that is not chat, so the caller keeps dispatching', () => {
    const broadcast = vi.fn()
    const handled = relayClientChat({
      data: { type: 'ACTION_BID' },
      seat,
      chatService: new ChatService(),
      broadcast,
    })
    expect(handled).toBe(false)
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('stamps the sender from the seat and relays it once', () => {
    const chatService = new ChatService()
    const broadcast = vi.fn()
    expect(relayClientChat({ data: chat('msg_1'), seat, chatService, broadcast })).toBe(true)

    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast.mock.calls[0][0].payload).toMatchObject({
      senderId: 1,
      senderName: 'Ana',
      avatar: '🦊',
    })
    expect(chatService.getHistory()[0]).toMatchObject({ senderName: 'Ana', isOwn: false })
  })

  it('swallows chat from a peer with no admitted seat', () => {
    const chatService = new ChatService()
    const broadcast = vi.fn()
    expect(relayClientChat({ data: chat('msg_1'), seat: undefined, chatService, broadcast })).toBe(true)
    expect(broadcast).not.toHaveBeenCalled()
    expect(chatService.getHistory()).toHaveLength(0)
  })

  it('does not relay a replayed id', () => {
    const chatService = new ChatService()
    const broadcast = vi.fn()
    relayClientChat({ data: chat('msg_1'), seat, chatService, broadcast })
    relayClientChat({ data: chat('msg_1', 'stolen id'), seat, chatService, broadcast })
    expect(broadcast).toHaveBeenCalledTimes(1)
  })
})

describe('broadcastToSeats (host)', () => {
  it('reaches connected seated players only -- not the host, not a connection without a seat', () => {
    const players = [
      { id: 0, isHost: true, peerId: null },
      { id: 1, peerId: 'peer-1', connected: true },
      { id: 2, peerId: 'peer-2', connected: false },
      { id: 3, peerId: null },
      { id: 4, peerId: 'peer-4' },
    ]
    const sendTo = vi.fn()
    const packet = { type: 'CHAT_MESSAGE' }
    broadcastToSeats(players, sendTo, packet)

    expect(sendTo.mock.calls).toEqual([
      ['peer-1', packet],
      ['peer-4', packet],
    ])
  })
})

describe('sendChatHistory (host, on admit)', () => {
  it('sends history without local-only fields', () => {
    const chatService = new ChatService()
    chatService.sendMessage({ text: 'from host', senderId: 0, senderName: 'Host' })
    const send = vi.fn()
    sendChatHistory({ chatService, send })

    expect(send).toHaveBeenCalledWith({ type: 'SYNC_CHAT', payload: [expect.any(Object)] })
    expect(send.mock.calls[0][0].payload[0]).not.toHaveProperty('isOwn')
  })

  it('sends nothing when there is no history', () => {
    const send = vi.fn()
    sendChatHistory({ chatService: new ChatService(), send })
    expect(send).not.toHaveBeenCalled()
  })
})

describe('routeClientChat (client)', () => {
  it('hands chat packets to the transport and reports them handled', () => {
    const transport = new PeerJsChatTransport()
    const chatService = new ChatService({ transport })
    expect(routeClientChat({ data: chat('msg_9'), chatTransport: transport })).toBe(true)
    expect(routeClientChat({ data: { type: 'SYNC_CHAT', payload: [] }, chatTransport: transport })).toBe(true)
    expect(routeClientChat({ data: { type: 'SYNC_GAME_STATE' }, chatTransport: transport })).toBe(false)
    expect(chatService.getHistory()).toHaveLength(1)
  })
})
