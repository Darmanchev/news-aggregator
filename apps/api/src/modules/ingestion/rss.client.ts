import Parser from 'rss-parser';

const parser = new Parser();
const maxBytes = 2_000_000;

export async function fetchFeed(url: string, fetcher: typeof fetch = fetch) {
  if (new URL(url).protocol !== 'https:') throw new Error('Feed must use HTTPS');
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
    headers: { 'User-Agent': 'BulgarianNews/0.1 (RSS reader)', Accept: 'application/rss+xml, application/xml, text/xml' },
  });
  if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
  if (!response.body) throw new Error('Feed returned an empty response');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('Feed is too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const xml = Buffer.concat(chunks).toString('utf8');
  if (/<!DOCTYPE/i.test(xml)) throw new Error('Feed document types are not supported');
  const feed = await parser.parseString(xml);
  if (feed.items.length > 500) throw new Error('Feed has too many articles');
  return feed;
}
