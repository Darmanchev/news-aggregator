import { Router } from 'express';
import mongoose from 'mongoose';
import { HttpError } from '../../middleware/error-handler.js';
import { parseArticleQuery } from './articles.validation.js';
import { listArticles, recordArticleOpen } from './articles.service.js';

export const articleRoutes = Router().get('/', async (request, response) => {
  const query = parseArticleQuery(request.query);
  if (mongoose.connection.readyState !== 1) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'News is temporarily unavailable.');
  response.json(await listArticles(query));
}).post('/:id/open', async (request, response) => {
  if (!/^[a-f\d]{24}$/i.test(request.params.id)) throw new HttpError(400, 'INVALID_ARTICLE_ID', 'Use a valid article ID.');
  if (request.get('Sec-Fetch-Site') === 'cross-site') throw new HttpError(403, 'CROSS_SITE_REQUEST', 'Open tracking is only available on this site.');
  if (mongoose.connection.readyState !== 1) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'News is temporarily unavailable.');
  if (!await recordArticleOpen(request.params.id)) throw new HttpError(404, 'ARTICLE_NOT_FOUND', 'Article not found.');
  response.sendStatus(204);
});
