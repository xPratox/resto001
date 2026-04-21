import { io } from 'socket.io-client'

import { SOCKET_URL } from '../config/api'

export function createAdminSocket(token) {
  return io(SOCKET_URL, {
    transports: ['websocket'],
    autoConnect: true,
    auth: {
      token,
    },
  })
}