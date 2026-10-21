import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { articleRoutes } from './modules/articles/articles.routes.js';
import { sourceRoutes } from './modules/sources/sources.routes.js';
import { tagRoutes } from './modules/tagging/tagging.routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { sources } from './modules/sources/sources.config.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    imgSrc: ["'self'", 'data:', ...sources.flatMap(({ imageHosts }) => (imageHosts ?? []).map((host) => `https://${host}`))],
  } } }));
  app.use('/api', (_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  app.get('/api/health', (_request, response) => {
    const ready = mongoose.connection.readyState === 1;
    response.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable' });
  });
  app.use('/api/articles', articleRoutes);
  app.use('/api/sources', sourceRoutes);
  app.use('/api/tags', tagRoutes);
  app.use('/api', (_request, response) => { response.status(404).json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } }); });

  const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  if (existsSync(webRoot)) {
    app.use(express.static(webRoot));
    app.get('/{*path}', (_request, response) => { response.sendFile(`${webRoot}index.html`); });
  }
  app.use(errorHandler);
  return app;
}
