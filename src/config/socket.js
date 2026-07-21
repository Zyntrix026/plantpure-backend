import { Server } from 'socket.io';

let io;

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://www.plantpure.in',
  'https://plantpure.in',
  'https://admin.plantpure.in',
];

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};
