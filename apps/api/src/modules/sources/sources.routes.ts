import { Router } from 'express';
import { sources } from './sources.config.js';

export const sourceRoutes = Router().get('/', (_request, response) => {
  response.json({ items: sources.map(({ id, name }) => ({ id, name })) });
});
