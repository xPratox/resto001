import { io } from 'socket.io-client'

import { SOCKET_URL } from './config'

export const restoSocket = io(SOCKET_URL, {
  transports: ['websocket'],
  autoConnect: false,
})