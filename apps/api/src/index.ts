import http from 'http';
import { Server as SocketServer } from 'socket.io';
import { app } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: config.isDev ? ['query','error','warn'] : ['error'],
});

const server = http.createServer(app);

export const io = new SocketServer(server, {
  cors: { origin: config.corsOrigins, credentials: true },
  transports: ['websocket','polling'],
});

io.on('connection', (socket) => {
  logger.debug(`Socket connected: ${socket.id}`);
  socket.on('join:property',      (id: string) => socket.join(`property:${id}`));
  socket.on('join:conversation',  (id: string) => socket.join(`conversation:${id}`));
  socket.on('leave:conversation', (id: string) => socket.leave(`conversation:${id}`));
  socket.on('disconnect', () => logger.debug(`Socket disconnected: ${socket.id}`));
});

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down...`);
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (r) => logger.error('Unhandled Rejection:', r));
process.on('uncaughtException',  (e) => { logger.error('Uncaught Exception:', e); process.exit(1); });

const start = async () => {
  try {
    await prisma.$connect();
    logger.info('Database connected');
    server.listen(config.port, () =>
      logger.info(`Simply Service API running on port ${config.port} [${config.env}]`));
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
};
start();
