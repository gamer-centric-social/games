import { createRoomNetwork } from '../../../services/room/roomNetwork'
import { PEER_PREFIX, SESSION_KEY, PROTOCOL_VERSION } from '../constants/bounceConstants'

/** Bounce rooms on the shared room layer. */
export const bounceNetwork = createRoomNetwork({
  peerPrefix: PEER_PREFIX,
  sessionKey: SESSION_KEY,
  protocolVersion: PROTOCOL_VERSION,
})
