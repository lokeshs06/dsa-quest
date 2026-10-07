import 'dotenv/config';
import { createServer } from 'node:http';
import { Server as SocketIO } from 'socket.io';
import { corsOrigin, createApp } from './app.js';
import { isLocalRunnerEnabled } from './services/runner.js';
import { connectDB, disconnectDB } from './config/db.js';
import { setupSocket } from './services/socket.service.js';
import { startDigestCron } from './services/digest.cron.js';

// Server port
const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Refuse to run a public server with settings that are only fine on a laptop
if (process.env.NODE_ENV === 'production') {
  const problems = [];
  if (process.env.JWT_SECRET.length < 32 || /change-me/.test(process.env.JWT_SECRET)) problems.push('JWT_SECRET must be a long random string (32+ characters).');
  if (!process.env.MONGO_URI) problems.push('MONGO_URI is not set (use a MongoDB Atlas connection string).');
  if (problems.length) {
    problems.forEach((p) => console.error(`❌ ${p}`));
    process.exit(1);
  }
  if (!process.env.CLIENT_URL) console.warn('⚠️ CLIENT_URL is not set: only same-origin browsers can use the API (fine for the one-service deploy).');
  if (isLocalRunnerEnabled()) console.warn('⚠️ ENABLE_LOCAL_RUNNER=true runs submitted code directly on this machine with no sandbox. Use Judge0 instead on a public server.');
}

try {
  await connectDB(process.env.MONGO_URI);
  const app = createApp();
  const httpServer = createServer(app);
  const io = new SocketIO(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'], credentials: true },
  });
  setupSocket(io);

  httpServer.listen(PORT, () => {
    console.log(`⚡ DSA Quest API listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    startDigestCron();
  });

  // io.close() also stops the HTTP server, and drops open WebSocket connections that would otherwise hold it up
  const shutdown = () => {
    io.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (err) {
  console.error('❌ Failed to start server:', err.message);
  process.exit(1);
}
