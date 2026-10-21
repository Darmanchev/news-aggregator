import { Router } from 'express';
import mongoose from 'mongoose';
import { sources } from './sources.config.js';
import { listSourceStatuses } from './sources.service.js';
import { HttpError } from '../../middleware/error-handler.js';

export const sourceRoutes = Router().get('/', (_request, response) => {
  response.json({ items: sources.map(({ id, name }) => ({ id, name })) });
});

sourceRoutes.get('/status', async (_request, response) => {
  if (mongoose.connection.readyState !== 1) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Collection status is temporarily unavailable.');
  response.json(await listSourceStatuses());
});
