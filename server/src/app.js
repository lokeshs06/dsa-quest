import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import routes from './routes/index.js';
import './services/testgen.service.js'; // registers the hook that writes test cases for new problems
import { notFound, errorHandler } from './middleware/errorHandler.js';

// Which browser origins may call the API from another site. In production only CLIENT_URL (comma-separated);
// in development anything goes. Same-origin requests (the one-service deploy) never need CORS at all.
export function corsOrigin(origin, callback) {
  const allowed = (process.env.CLIENT_URL || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  callback(null, !origin || process.env.NODE_ENV !== 'production' || allowed.includes(origin));
}

export function createApp() {
  const app = express();
  // Hosts like Render, Railway and Fly sit behind one proxy: trust it so rate limits see real client IPs
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: corsOrigin, allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Date'], credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  app.use('/api', routes);
  app.use('/api', notFound);

  // In production, serve the built React app from the same server (one deploy, no CORS)
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
