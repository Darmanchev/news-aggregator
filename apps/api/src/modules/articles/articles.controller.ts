import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { HttpError } from '../../middleware/error-handler.js';
import { parseArticleQuery } from './articles.validation.js';
import { listArticles } from './articles.service.js';

export const getArticles: RequestHandler = async (request, response) => {
  const query = parseArticleQuery(request.query);
  if (mongoose.connection.readyState !== 1) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'News is temporarily unavailable.');
  response.json(await listArticles(query));
};
