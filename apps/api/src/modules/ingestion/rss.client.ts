import Parser from 'rss-parser';
import { readBoundedResponse } from '../../infrastructure/http.js';

const parser = new Parser();

export async function fetchFeed(url: string, fetcher: typeof fetch = fetch) {
  if (new URL(url).protocol !== 'https:') throw new Error('Feed must use HTTPS');
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
    headers: { 'User-Agent': 'BulgarianNews/0.1 (RSS reader)', Accept: 'application/rss+xml, application/xml, text/xml' },
  });
  if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
  const xml = await readBoundedResponse(response);
  if (/<!DOCTYPE/i.test(xml)) throw new Error('Feed document types are not supported');
  const feed = await parser.parseString(xml);
  if (feed.items.length > 500) throw new Error('Feed has too many articles');
  return feed;
}
