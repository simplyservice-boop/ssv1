import { io, Socket } from 'socket.io-client';
let socket: Socket | null = null;
export const getSocket = (token?: string): Socket => {
  if (!socket) {
    socket = io('/', { auth: { token }, transports: ['websocket','polling'], autoConnect: false });
  }
  return socket;
};
export const disconnectSocket = () => { if (socket) { socket.disconnect(); socket = null; } };
