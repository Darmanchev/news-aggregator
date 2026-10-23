import { Query } from 'mongoose';
import { afterEach, expect, it, vi } from 'vitest';
import { Article } from '../src/modules/articles/articles.model.js';
import { findArticlePreview } from '../src/modules/articles/articles.service.js';

const preview = { imageUrl: 'https://i2.offnews.bg/story.jpg', author: 'Автор', excerpt: 'Анонс.' };
afterEach(() => { vi.restoreAllMocks(); });

it('returns an approved stored preview for the requested article identity', async () => {
  vi.spyOn(Query.prototype, 'exec').mockResolvedValue({ preview });
  const lookup = vi.spyOn(Article, 'findOne');
  expect(await findArticlePreview('offnews', 'story')).toEqual(preview);
  expect(lookup).toHaveBeenCalledWith({ sourceId: 'offnews', externalId: 'story' });
});

it.each([
  null,
  { preview: null },
  { preview: { ...preview, imageUrl: 'https://unapproved.example/story.jpg' } },
])('does not reuse missing or unapproved stored previews (%j)', async (stored) => {
  vi.spyOn(Query.prototype, 'exec').mockResolvedValue(stored);
  expect(await findArticlePreview('offnews', 'story')).toBeNull();
});
