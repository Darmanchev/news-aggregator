import { Router } from 'express';
import { getArticles } from './articles.controller.js';

export const articleRoutes = Router().get('/', getArticles);
