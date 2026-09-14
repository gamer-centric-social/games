import { describe, it, expect } from 'vitest'
import { stampChatPacket, toWireMessage, MAX_CHAT_ID_LENGTH } from './chatRelay'
import { MAX_CHAT_MESSAGE_LENGTH } from './chatTypes'

const seat = { id: 2, name: 'Ana', avatar: '🦊', peerId: 'peer-ana', sessionId: 'secret' }

const packet = (payload) => ({ type: 'CHAT_MESSAGE', payload })

const valid = {
  id: 'msg_abc_1',
  type: 'TEXT',
  senderId: 0,
  senderName: 'Host',
  avatar: '👑',
  text: 'hello',
  timestamp: 1,
}

describe('stampChatPacket', () => {
  it('overwrites every sender field with the host seat record', () => {
    const stamped = stampChatPacket(packet(valid), seat)

    expect(stamped.type).toBe('CHAT_MESSAGE')
    expect(stamped.payload).toMatchObject({
      id: 'msg_abc_1',
      type: 'TEXT',
      senderId: 2,
      senderName: 'Ana',
      avatar: '🦊',
      text: 'hello',
    })
  })

  it('takes the timestamp from the host, not the client', () => {
    const stamped = stampChatPacket(packet({ ...valid, timestamp: 0 }), seat)
    expect(stamped.payload.timestamp).toBeGreaterThan(0)
  })

  it('drops fields the client added and never copies internal seat identifiers', () => {
    const stamped = stampChatPacket(
      packet({ ...valid, isOwn: true, html: '<b>x</b>', extra: 1 }),
      seat
    )
    expect(Object.keys(stamped.payload).sort()).toEqual(
      ['avatar', 'id', 'senderId', 'senderName', 'text', 'timestamp', 'type'].sort()
    )
    expect(JSON.stringify(stamped)).not.toContain('secret')
    expect(JSON.stringify(stamped)).not.toContain('peer-ana')
  })

  it('does not mutate the incoming packet', () => {
    const incoming = packet({ ...valid })
    stampChatPacket(incoming, seat)
    expect(incoming.payload.senderName).toBe('Host')
  })

  it('refuses a message from a peer with no admitted seat', () => {
    expect(stampChatPacket(packet(valid), null)).toBeNull()
    expect(stampChatPacket(packet(valid), undefined)).toBeNull()
  })

  it('refuses anything that is not a CHAT_MESSAGE with an object payload', () => {
    expect(stampChatPacket({ type: 'SYNC_CHAT', payload: [valid] }, seat)).toBeNull()
    expect(stampChatPacket({ type: 'CHAT_MESSAGE', payload: 'hi' }, seat)).toBeNull()
    expect(stampChatPacket({ type: 'CHAT_MESSAGE' }, seat)).toBeNull()
    expect(stampChatPacket(null, seat)).toBeNull()
  })

  it('refuses a missing, non-string, empty or oversized id', () => {
    expect(stampChatPacket(packet({ ...valid, id: undefined }), seat)).toBeNull()
    expect(stampChatPacket(packet({ ...valid, id: 42 }), seat)).toBeNull()
    expect(stampChatPacket(packet({ ...valid, id: '' }), seat)).toBeNull()
    expect(
      stampChatPacket(packet({ ...valid, id: 'x'.repeat(MAX_CHAT_ID_LENGTH + 1) }), seat)
    ).toBeNull()
    expect(
      stampChatPacket(packet({ ...valid, id: 'x'.repeat(MAX_CHAT_ID_LENGTH) }), seat)
    ).not.toBeNull()
  })

  it('refuses whitespace-only or non-string text', () => {
    expect(stampChatPacket(packet({ ...valid, text: '   ' }), seat)).toBeNull()
    expect(stampChatPacket(packet({ ...valid, text: { a: 1 } }), seat)).toBeNull()
  })

  it('trims and truncates the text', () => {
    const long = '  ' + 'a'.repeat(MAX_CHAT_MESSAGE_LENGTH + 20)
    const stamped = stampChatPacket(packet({ ...valid, text: long }), seat)
    expect(stamped.payload.text).toBe('a'.repeat(MAX_CHAT_MESSAGE_LENGTH))
  })

  it('falls back to a neutral name and avatar when the seat has none', () => {
    const stamped = stampChatPacket(packet(valid), { id: 3 })
    expect(stamped.payload.senderName).toBe('Player')
    expect(stamped.payload.avatar).toBe('👤')
  })
})

describe('toWireMessage', () => {
  it('strips the local-only isOwn flag', () => {
    const wire = toWireMessage({ ...valid, isOwn: true })
    expect(wire).not.toHaveProperty('isOwn')
    expect(wire).toMatchObject({ id: 'msg_abc_1', text: 'hello' })
  })
})
