import { io } from 'socket.io-client'

import { SOCKET_URL } from '../config/api'

export function createRestoSocket() {
  return io(SOCKET_URL, {
    transports: ['websocket'],
    autoConnect: true,
  })
}