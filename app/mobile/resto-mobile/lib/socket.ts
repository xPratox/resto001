import { io } from 'socket.io-client';

import { SOCKET_URL } from './api';

export const restoSocket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: false,
  auth: {
    token: '',
  },
});

export function setSocketAuthToken(token: string) {
  restoSocket.auth = {
    token,
  };

  if (token && restoSocket.connected) {
    restoSocket.disconnect();
    restoSocket.connect();
  }
}