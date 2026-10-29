import { Router } from 'express';
import { topicCatalog } from './tagging.catalog.js';
import { localTags } from './tagging.service.js';

export const tagRoutes = Router().get('/', (_request, response) => {
  response.json({ items: [...topicCatalog.map(({ id, name, parentId }) => ({ id, name, ...(parentId ? { parentId } : {}) })), ...localTags] });
});
