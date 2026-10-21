import { describe, expect, it } from 'vitest';
import { fetchArticlePreview } from '../src/modules/ingestion/article-metadata.client.js';
const article = { sourceId: 'mediapool', externalId: '1', title: 'Новина', url: 'https://www.mediapool.bg/news/story/', publishedAt: new Date(), tags: [] };
const html = `<html><head><meta content='/photo.jpg?a=1&amp;b=2' property='og:image'><meta name="description" content="Кратък &amp; анонс."><meta content="Автор" name="author"></head></html>`;
describe('publisher article photo metadata', () => {
  it('reads quoted metadata in either order, resolves URLs and decodes entities', async () => {
    expect(await fetchArticlePreview(article, {}, async () => new Response(html))).toEqual({ imageUrl: 'https://www.mediapool.bg/photo.jpg?a=1&b=2', author: 'Автор', excerpt: 'Кратък & анонс.' });
  });
  it('keeps feed attribution and excerpt when the page has no author', async () => {
    expect(await fetchArticlePreview(article, { creator: 'RSS автор', contentSnippet: 'RSS анонс.' }, async () => new Response('<meta property="og:image" content="/a.jpg">'))).toEqual({ imageUrl: 'https://www.mediapool.bg/a.jpg', author: 'RSS автор', excerpt: 'RSS анонс.' });
  });
  it('keeps a publisher photo when no author or description is supplied', async () => {
    expect(await fetchArticlePreview(article, {}, async () => new Response('<meta property="og:image" content="/a.jpg">'))).toEqual({ imageUrl: 'https://www.mediapool.bg/a.jpg', author: '', excerpt: '' });
  });
  it('does not fetch article pages for feed-only or headline-only new sources', async () => {
    for (const [sourceId, url] of [['actualno', 'https://www.actualno.com/story.html'], ['dariknews', 'https://dariknews.bg/story'], ['kaldata', 'https://www.kaldata.com/story']]) {
      expect(await fetchArticlePreview({ ...article, sourceId: sourceId!, url: url! }, {}, async () => { throw new Error('Must not fetch'); })).toBeNull();
    }
  });
  it('rejects unsafe article URLs before making a request', async () => {
    for (const url of ['http://www.mediapool.bg/a', 'https://127.0.0.1/a', 'https://www.mediapool.bg.evil.test/a', 'https://u:p@www.mediapool.bg/a', 'https://www.mediapool.bg:444/a']) {
      expect(await fetchArticlePreview({ ...article, url }, {}, async () => { throw new Error('Must not fetch'); })).toBeNull();
    }
  });
  it('rejects oversized pages, HTTP failures, external images, and fake metadata in scripts or body', async () => {
    await expect(fetchArticlePreview(article, {}, async () => new Response('x'.repeat(2_000_001)))).rejects.toThrow('large');
    await expect(fetchArticlePreview(article, {}, async () => new Response('', { status: 429 }))).rejects.toThrow('429');
    for (const content of ['<meta property="og:image" content="https://evil.test/a.jpg">', '<script>"<meta property=\'og:image\' content=\'/a.jpg\'>"</script>', '<body><meta property="og:image" content="/a.jpg">']) {
      expect(await fetchArticlePreview(article, { contentSnippet: 'Анонс.' }, async () => new Response(content))).toBeNull();
    }
  });
  it('follows a renamed article on the same publisher and resolves its relative photo', async () => {
    const urls: string[] = [];
    const result = await fetchArticlePreview(article, {}, async (url) => {
      urls.push(String(url));
      return urls.length === 1 ? new Response(null, { status: 301, headers: { location: '/renamed/story/' } }) : new Response('<meta property="og:image" content="photo.jpg">');
    });
    expect(result?.imageUrl).toBe('https://www.mediapool.bg/renamed/story/photo.jpg');
    expect(urls).toHaveLength(2);
  });
  it('rejects redirect loops and redirects outside the publisher before requesting them', async () => {
    for (const location of ['https://127.0.0.1/a', 'https://evil.test/a', 'http://www.mediapool.bg/a', article.url]) {
      let calls = 0;
      await expect(fetchArticlePreview(article, {}, async () => {
        calls++; return new Response(null, { status: 302, headers: { location } });
      })).rejects.toThrow('redirect');
      expect(calls).toBeLessThanOrEqual(location === article.url ? 4 : 1);
    }
  });
  it('handles redirects manually and sets a request timeout', async () => {
    await fetchArticlePreview(article, {}, async (_url, init) => {
      expect(init?.redirect).toBe('manual'); expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(html);
    });
  });
});
