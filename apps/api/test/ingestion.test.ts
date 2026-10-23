import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { assignTags } from '../src/modules/tagging/tagging.service.js';
import { normalizeArticle } from '../src/modules/ingestion/article.normalizer.js';
import { fetchFeed } from '../src/modules/ingestion/rss.client.js';
import { collectSources } from '../src/modules/ingestion/ingestion.service.js';
import { Article } from '../src/modules/articles/articles.model.js';
import { SourceStatus } from '../src/modules/sources/sources.model.js';
import { connectTestDatabase } from './helpers/test-database.js';

const now = new Date('2026-10-20T12:00:00Z');
const source = { id: 'fixture', name: 'Fixture', feedUrl: 'https://example.com/feed' };
const item = { guid: 'story-1', title: 'Избори в София', link: 'https://example.com/story?utm_source=rss&id=7', pubDate: 'Tue, 20 Oct 2026 10:00:00 GMT' };

describe('Bulgarian tags', () => {
  it('matches Cyrillic words and phrases independent of case', () => {
    expect(assignTags('ИЗБОРИ в София: Столична община')).toEqual(['sofia', 'politics']);
  });
  it('does not match keywords inside other words', () => {
    expect(assignTags('Софиански направи изявление')).toEqual([]);
  });
});

describe('article normalization', () => {
  it('keeps identifying URL parameters and assigns normalized metadata', () => {
    expect(normalizeArticle(item, source.id, now)).toEqual({
      sourceId: 'fixture', externalId: 'story-1', title: 'Избори в София',
      url: 'https://example.com/story?id=7', publishedAt: new Date('2026-10-20T10:00:00Z'), tags: ['sofia', 'politics'],
    });
  });
  it('strips feed markup and falls back to URL and first-seen time', () => {
    const result = normalizeArticle({ title: '<b>София</b> &amp; новини', link: 'https://example.com/2', pubDate: 'invalid' }, source.id, now);
    expect(result).toMatchObject({ externalId: 'https://example.com/2', title: 'София & новини', publishedAt: now });
  });
  it('uses first-seen time for timezone-free feed dates even when the parser supplies an ISO date', async () => {
    const feed = await fetchFeed('https://telegraph.bg/rss', async () => new Response(
      '<rss version="2.0"><channel><title>Fixture</title><item><guid>telegraph-1</guid><title>Новини от София</title><link>https://telegraph.bg/novini/1</link><pubDate>2026-10-21 14:38:44</pubDate></item></channel></rss>',
      { headers: { 'Content-Type': 'text/html' } },
    ));
    expect(normalizeArticle(feed.items[0]!, 'telegraph', now)).toMatchObject({ title: 'Новини от София', publishedAt: now });
  });
  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'https://user:secret@example.com/a', 'not-a-url'])('discards unsafe links: %s', (link) => {
    expect(normalizeArticle({ ...item, link }, source.id, now)).toBeNull();
  });
  it('discards missing headlines and links', () => {
    expect(normalizeArticle({ ...item, title: ' ' }, source.id, now)).toBeNull();
    expect(normalizeArticle({ title: 'News' }, source.id, now)).toBeNull();
  });
  it('discards an oversized headline instead of republishing a shortened title', () => {
    expect(normalizeArticle({ ...item, title: 'я'.repeat(501) }, source.id, now)).toBeNull();
  });
  it('discards a URL that exceeds the limit after Cyrillic percent encoding', () => {
    expect(normalizeArticle({ ...item, link: `https://example.com/${'я'.repeat(400)}` }, source.id, now)).toBeNull();
  });
});

describe('RSS request boundary', () => {
  it('parses XML from a successful response', async () => {
    const feed = await fetchFeed(source.feedUrl, async () => new Response('<rss version="2.0"><channel><title>Fixture</title><item><guid>1</guid><title>София</title><link>https://example.com/1</link></item></channel></rss>'));
    expect(feed.items[0]).toMatchObject({ guid: '1', title: 'София' });
  });
  it('rejects failed HTTP responses and oversized bodies', async () => {
    await expect(fetchFeed(source.feedUrl, async () => new Response('', { status: 429 }))).rejects.toThrow('429');
    await expect(fetchFeed(source.feedUrl, async () => new Response('x'.repeat(2_000_001)))).rejects.toThrow('large');
  });
  it('does not follow redirects or accept a non-HTTPS feed', async () => {
    let redirect: RequestRedirect | undefined;
    await fetchFeed(source.feedUrl, async (_input, init) => {
      redirect = init?.redirect;
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response('<rss version="2.0"><channel><title>Fixture</title></channel></rss>');
    });
    expect(redirect).toBe('error');
    await expect(fetchFeed('http://example.com/feed')).rejects.toThrow('HTTPS');
  });
});

describe('collection with MongoDB', () => {
  beforeAll(async () => {
    await connectTestDatabase();
    await Article.init();
    await SourceStatus.init();
  });
  beforeEach(async () => {
    await Article.deleteMany({ sourceId: { $in: ['fixture', 'broken'] } });
    await SourceStatus.deleteMany({ _id: { $in: ['fixture', 'broken'] } });
  });
  afterAll(async () => { await mongoose.disconnect(); });

  it('enriches missing photos without losing headlines on metadata failures or refetching saved photos', async () => {
    const { sources } = await import('../src/modules/sources/sources.config.js');
    const mediapool = sources.find(({ id }) => id === 'mediapool')!;
    const entry = { ...item, guid: 'photo-enrichment-fixture', link: 'https://www.mediapool.bg/news/story/', contentSnippet: 'Анонс.' };
    try {
      const options = { loadFeed: async () => ({ items: [entry] }), now,
        loadPreview: async () => ({ imageUrl: 'https://www.mediapool.bg/story.jpg', author: '', excerpt: 'Анонс.' }) };
      await collectSources([mediapool], options);
      expect((await Article.findOne({ externalId: entry.guid }).lean())?.preview?.imageUrl).toBe('https://www.mediapool.bg/story.jpg');
      await collectSources([mediapool], { ...options, loadPreview: async () => { throw new Error('Temporary outage'); } });
      expect((await Article.findOne({ externalId: entry.guid }).lean())?.preview?.imageUrl).toBe('https://www.mediapool.bg/story.jpg');
    } finally {
      await Article.deleteMany({ externalId: entry.guid });
      await SourceStatus.deleteMany({ _id: 'mediapool' });
    }
  });

  it('records successful empty checks and preserves success when a later check fails', async () => {
    await collectSources([source], { loadFeed: async () => ({ items: [] }), now });
    expect(await SourceStatus.findById(source.id).lean()).toMatchObject({ lastAttemptAt: now, lastSuccessAt: now });
    const later = new Date('2026-10-20T12:05:00Z');
    await collectSources([source], { loadFeed: async () => { throw new Error('Unavailable'); }, now: later });
    expect(await SourceStatus.findById(source.id).lean()).toMatchObject({ lastAttemptAt: later, lastSuccessAt: now });
    expect(await Article.countDocuments({ sourceId: source.id })).toBe(0);
  });

  it('records the attempt before fetching, including a first failed check', async () => {
    await collectSources([source], { loadFeed: async () => {
      expect(await SourceStatus.findById(source.id).lean()).toMatchObject({ lastAttemptAt: now, lastSuccessAt: null });
      throw new Error('Unavailable');
    }, now });
    expect(await SourceStatus.findById(source.id).lean()).toMatchObject({ lastAttemptAt: now, lastSuccessAt: null });
  });

  it('imports twice without duplicates and preserves first-seen and fallback dates', async () => {
    const undated = { ...item, pubDate: undefined };
    const options = { loadFeed: async () => ({ items: [undated] }), now };
    await collectSources([source], options);
    await collectSources([source], { ...options, now: new Date('2026-10-21T12:00:00Z') });
    const articles = await Article.find({ sourceId: 'fixture' }).lean();
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({ firstSeenAt: now, publishedAt: now, title: item.title });
  });

  it('continues after a source failure and preserves previously stored articles', async () => {
    await collectSources([source], { loadFeed: async () => ({ items: [item] }), now });
    const report = await collectSources([{ ...source, id: 'broken', feedUrl: 'https://example.com/broken' }, source], {
      loadFeed: async (url) => { if (url.includes('broken')) throw new Error('Unavailable'); return { items: [item] }; },
      now,
    });
    expect(report.failed).toEqual([{ sourceId: 'broken', message: 'Unavailable' }]);
    expect(report.processed).toBe(1);
    expect(await Article.countDocuments({ sourceId: 'fixture' })).toBe(1);
  });

  it('skips an oversized normalized URL and still saves the next article', async () => {
    const report = await collectSources([source], {
      loadFeed: async () => ({ items: [{ ...item, guid: 'oversized', link: `https://example.com/${'я'.repeat(400)}` }, item] }), now,
    });
    expect(report).toEqual({ processed: 1, skipped: 1, failed: [] });
    expect(await Article.countDocuments({ sourceId: 'fixture' })).toBe(1);
  });
});
