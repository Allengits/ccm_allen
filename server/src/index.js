import app from './app.js';
import { config } from './config/index.js';
import prisma from './db/prisma.js';

const server = app.listen(config.port, () => {
  console.log(
    `[Server] Court Case Management API running on port ${config.port} in ${config.nodeEnv} mode`
  );
  console.log(`[Server] Health check endpoint: http://localhost:${config.port}/api/v1/health`);
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log('[Server] HTTP server closed.');
    await prisma.$disconnect();
    console.log('[Server] Database connection closed.');
    process.exit(0);
  });

  // Force shutdown after timeout
  setTimeout(() => {
    console.error('[Server] Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
