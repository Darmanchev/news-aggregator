import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { Article } from '../src/modules/articles/articles.model.js';

describe('news API with MongoDB', () => {
  const app = createApp();
  beforeAll(async () => {
    await mongoose.connect(process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/bulgarian_news_test');
    await Article.init();
  });
  beforeEach(async () => {
    await Article.deleteMany({ sourceId: 'mediapool' });
    await Article.insertMany([
      { sourceId: 'mediapool', externalId: 'a', title: 'First', url: 'https://example.com/a', tags: ['sofia'], publishedAt: new Date('2026-10-20T10:00:00Z'), firstSeenAt: new Date() },
      { sourceId: 'mediapool', externalId: 'b', title: 'Second', url: 'https://example.com/b', tags: ['politics'], publishedAt: new Date('2026-10-20T10:00:00Z'), firstSeenAt: new Date() },
      { sourceId: 'mediapool', externalId: 'c', title: 'Third', url: 'https://example.com/c', tags: [], publishedAt: new Date('2026-10-19T10:00:00Z'), firstSeenAt: new Date() },
    ]);
  });
  afterAll(async () => { await mongoose.disconnect(); });

  it('returns newest-first pages without losing articles with equal dates', async () => {
    const first = await request(app).get('/api/articles?limit=1').expect(200);
    expect(first.body.items[0]).toMatchObject({ title: 'Second', sourceName: 'Mediapool' });
    const second = await request(app).get('/api/articles').query({ limit: 1, cursor: first.body.nextCursor }).expect(200);
    expect(second.body.items[0].title).toBe('First');
    const third = await request(app).get('/api/articles').query({ limit: 1, cursor: second.body.nextCursor }).expect(200);
    expect(third.body.items[0].title).toBe('Third');
    expect(third.body.nextCursor).toBeNull();
  });

  it('filters by an approved tag and source', async () => {
    const response = await request(app).get('/api/articles?source=mediapool&tag=sofia').expect(200);
    expect(response.body.items.map((article: { title: string }) => article.title)).toEqual(['First']);
  });

  it.each([
    'limit=0', 'limit=51', 'limit=1.5', 'limit=abc', 'limit=1&limit=2',
    'source=unknown', 'tag=unknown', 'source[$ne]=x', 'cursor=garbage',
    `cursor=${Buffer.from(JSON.stringify({ date: 'invalid', id: 'not-id' })).toString('base64url')}`,
  ])('rejects malformed query %s', async (query) => {
    const response = await request(app).get(`/api/articles?${query}`).expect(400);
    expect(response.body.error.code).toBe('INVALID_QUERY');
  });

  it('returns source and tag options without exposing configuration', async () => {
    const sources = await request(app).get('/api/sources').expect(200);
    expect(sources.body.items).toEqual([{ id: 'mediapool', name: 'Mediapool' }]);
    const tags = await request(app).get('/api/tags').expect(200);
    expect(tags.body.items).toContainEqual({ id: 'sofia', name: 'София' });
  });

  it('returns database readiness and JSON for unknown API routes', async () => {
    expect((await request(app).get('/api/health').expect(200)).body.status).toBe('ok');
    const response = await request(app).get('/api/missing').expect(404);
    expect(response.headers['content-type']).toContain('application/json');
  });
});
