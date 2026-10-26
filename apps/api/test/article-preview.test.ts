import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { normalizeArticle } from '../src/modules/ingestion/article.normalizer.js';
import { Article } from '../src/modules/articles/articles.model.js';
import { saveArticle } from '../src/modules/articles/articles.service.js';
import { createApp } from '../src/app.js';
import { connectTestDatabase } from './helpers/test-database.js';

const now = new Date('2026-10-21T12:00:00Z');
const item = {
  guid: 'preview-fixture', title: 'Изложба в София', link: 'https://offnews.bg/culture/preview-fixture.html',
  creator: 'Автор на новината', content: '<p>Кратък <b>анонс</b> &amp; новини.</p>',
  enclosure: { url: 'https://i2.offnews.bg/events/preview.jpg', type: 'image/jpeg' },
};
const preview = { imageUrl: 'https://i2.offnews.bg/events/preview.jpg', author: 'Автор на новината', excerpt: 'Кратък анонс & новини.' };

describe('licensed RSS previews', () => {
  it('keeps the feed photo, plain-text author and bounded excerpt together', () => {
    expect(normalizeArticle(item, 'offnews', now)).toMatchObject({ preview });
    expect(normalizeArticle({ ...item, content: 'я'.repeat(600) }, 'offnews', now)?.preview?.excerpt).toHaveLength(500);
  });

  it('rejects another publisher image host', () => {
    expect(normalizeArticle(item, 'telegraph', now)).not.toHaveProperty('preview');
  });

  it('accepts Telegraph image/jpg enclosures from its actual CDN', () => {
    expect(normalizeArticle({ ...item, enclosure: { url: 'https://m.netinfo.bg/media/story.jpg', type: 'image/jpg' } }, 'telegraph', now)?.preview?.imageUrl).toBe('https://m.netinfo.bg/media/story.jpg');
  });

  it('keeps Actualno feed photos with author and at most 200 excerpt characters', () => {
    const entry = { ...item, content: 'а'.repeat(300), enclosure: { url: 'https://cdn.actualno.eu/news/photo.jpg', type: 'image/jpg' } };
    expect(normalizeArticle(entry, 'actualno', now)?.preview).toEqual({ imageUrl: entry.enclosure.url, author: item.creator, excerpt: 'а'.repeat(200) });
    expect(normalizeArticle({ ...entry, creator: '' }, 'actualno', now)).not.toHaveProperty('preview');
    expect(normalizeArticle({ ...entry, content: '' }, 'actualno', now)).not.toHaveProperty('preview');
    for (const sourceId of ['dariknews', 'kaldata']) expect(normalizeArticle(entry, sourceId, now)).not.toHaveProperty('preview');
  });

  it('reads a licensed embedded RSS image and decodes its URL without retaining HTML', () => {
    expect(normalizeArticle({ ...item, enclosure: undefined, contentSnippet: 'Анонс от Дневник.',
      content: '<img src="https://img.dnevnik.bg/shimg/story.jpg?a=1&amp;b=2" /><br />Анонс от Дневник.',
    }, 'dnevnik', now)?.preview).toEqual({
      imageUrl: 'https://img.dnevnik.bg/shimg/story.jpg?a=1&b=2', author: item.creator, excerpt: 'Анонс от Дневник.',
    });
  });

  it('does not mistake other attributes for an embedded photo URL or allow an unapproved host', () => {
    for (const content of [
      '<img data-src="https://img.dnevnik.bg/a.jpg" />',
      '<img src="https://evil.example/a.jpg" />',
      '<img src="javascript:alert(1)" />',
    ]) expect(normalizeArticle({ ...item, enclosure: undefined, content, contentSnippet: 'Анонс.' }, 'dnevnik', now)).not.toHaveProperty('preview');
  });

  it.each([
    'javascript:alert(1)', 'http://i2.offnews.bg/a.jpg', 'https://other.example/a.jpg',
    'https://i2.offnews.bg.evil.example/a.jpg', 'https://user:secret@i2.offnews.bg/a.jpg',
    'https://127.0.0.1/a.jpg', 'https://i2.offnews.bg:444/a.jpg', `https://i2.offnews.bg/${'я'.repeat(400)}`,
  ])('keeps a readable headline but discards an unsafe photo URL: %s', (url) => {
    const result = normalizeArticle({ ...item, enclosure: { ...item.enclosure, url } }, 'offnews', now);
    expect(result?.title).toBe(item.title);
    expect(result).not.toHaveProperty('preview');
  });

  it('rejects oversized author credits and unsupported image types', () => {
    for (const invalid of [

      { ...item, creator: 'a'.repeat(201) }, { ...item, enclosure: { ...item.enclosure, type: 'text/html' } },
    ]) expect(normalizeArticle(invalid, 'offnews', now)).not.toHaveProperty('preview');
  });
});

describe('stored and public photo previews', () => {
  beforeAll(async () => {
    await connectTestDatabase();
    await Article.init();
  });
  beforeEach(async () => { await Article.deleteMany({ externalId: 'preview-fixture' }); });
  afterAll(async () => {
    try {
      if (mongoose.connection.readyState === 1) await Article.deleteMany({ externalId: 'preview-fixture' });
    } finally { await mongoose.disconnect(); }
  });

  it('persists and returns approved preview data and clears it when no longer supplied', async () => {
    await saveArticle(normalizeArticle(item, 'offnews', now)!, now);
    const app = createApp();
    const response = await request(app).get('/api/articles?source=offnews').expect(200);
    expect(response.body.items[0]).toMatchObject({ title: item.title, preview });
    expect(response.headers['content-security-policy']).toContain('https://i2.offnews.bg');
    await saveArticle(normalizeArticle({ ...item, enclosure: undefined }, 'offnews', now)!, now);
    expect((await request(app).get('/api/articles?source=offnews').expect(200)).body.items[0].preview).toBeNull();
    expect((await Article.findOne({ externalId: 'preview-fixture' }).lean())?.preview).toBeNull();
  });

  it('hides stored photo data from another publisher host', async () => {
    await Article.create({ ...normalizeArticle(item, 'telegraph', now), firstSeenAt: now, preview });
    const response = await request(createApp()).get('/api/articles?source=telegraph').expect(200);
    const article = response.body.items.find((row: { title: string }) => row.title === item.title);
    expect(article.preview).toBeNull();
    expect(article.imageLabel).toBe('Телеграф');
  });
});
