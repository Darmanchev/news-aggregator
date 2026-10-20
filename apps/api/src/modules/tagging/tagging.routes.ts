import { Router } from 'express';
import { tagRules } from './tagging.rules.js';

export const tagRoutes = Router().get('/', (_request, response) => {
  response.json({ items: tagRules.map(({ id, name }) => ({ id, name })) });
});
