import { useEffect, useRef } from 'react';
import { getSocket, disconnectSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';
import { Socket } from 'socket.io-client';

export function useSocket(): { socket: Socket | null } {
  const socketRef = useRef<Socket | null>(null);
  const token = useAuthStore(s => s.token);

  useEffect(() => {
    if (!token) return;
    const s = getSocket(token);
    s.connect();
    socketRef.current = s;
    return () => { disconnectSocket(); };
  }, [token]);

  return { socket: socketRef.current };
}
