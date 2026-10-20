import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { assignTags } from '../src/modules/tagging/tagging.service.js';
import { normalizeArticle } from '../src/modules/ingestion/article.normalizer.js';
import { fetchFeed } from '../src/modules/ingestion/rss.client.js';
import { collectSources } from '../src/modules/ingestion/ingestion.service.js';
import { Article } from '../src/modules/articles/articles.model.js';

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
  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'https://user:secret@example.com/a', 'not-a-url'])('discards unsafe links: %s', (link) => {
    expect(normalizeArticle({ ...item, link }, source.id, now)).toBeNull();
  });
  it('discards missing headlines and links', () => {
    expect(normalizeArticle({ ...item, title: ' ' }, source.id, now)).toBeNull();
    expect(normalizeArticle({ title: 'News' }, source.id, now)).toBeNull();
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
    await mongoose.connect(process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/bulgarian_news_test');
    await Article.init();
  });
  beforeEach(async () => { await Article.deleteMany({ sourceId: { $in: ['fixture', 'broken'] } }); });
  afterAll(async () => { await mongoose.disconnect(); });

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
