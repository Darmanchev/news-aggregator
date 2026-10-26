import { decodeHTML } from 'entities';
import type { Item } from 'rss-parser';
import type { ArticleInput } from '../articles/articles.model.js';
import { sources } from '../sources/sources.config.js';
import { normalizePreview } from './article.normalizer.js';
import { readBoundedResponse } from '../../infrastructure/http.js';

export async function fetchArticlePreview(
  article: ArticleInput, item: Item, fetcher: typeof fetch = fetch, parentSignal?: AbortSignal,
): Promise<ArticleInput['preview']> {
  parentSignal?.throwIfAborted();
  const source = sources.find(({ id }) => id === article.sourceId);
  if (source?.previewPolicy?.feedOnly) return null;
  let url = new URL(article.url);
  const publisherHost = source && new URL(source.feedUrl).hostname;
  const allowed = (candidate: URL) => !!source?.imageHosts && candidate.protocol === 'https:'
    && !candidate.username && !candidate.password && !candidate.port
    && [publisherHost, publisherHost?.replace(/^feed\./, ''), publisherHost?.replace(/^www\./, '')].includes(candidate.hostname);
  if (!allowed(url)) return null;
  const timeout = AbortSignal.timeout(10_000);
  const signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
  let response: Response;
  for (let redirects = 0; ; redirects++) {
    response = await fetcher(url.href, {
      signal, redirect: 'manual',
      headers: { 'User-Agent': 'BulgarianNews/0.1 (article preview metadata)', Accept: 'text/html' },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location || redirects >= 3) throw new Error('Article redirect limit exceeded');
    const next = new URL(location, url);
    if (!allowed(next)) throw new Error('Article redirect outside publisher rejected');
    url = next;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Article returned HTTP ${response.status}`);
  }
  const html = await readBoundedResponse(response);
  // shortcut: only quoted HTML head metadata is supported; use an HTML parser if publisher markup changes.
  const head = html.split(/<body\b|<\/head\s*>/i)[0]!.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const metadata = new Map<string, string>();
  for (const tag of head.matchAll(/<meta\s+(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attributes = new Map([...tag[0].matchAll(/\s([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
      .map((match) => [match[1]!.toLowerCase(), decodeHTML(match[2] ?? match[3] ?? '')]));
    const key = (attributes.get('property') ?? attributes.get('name'))?.toLowerCase();
    if (key && attributes.has('content') && !metadata.has(key)) metadata.set(key, attributes.get('content')!);
  }
  const image = metadata.get('og:image:secure_url') ?? metadata.get('og:image') ?? metadata.get('twitter:image');
  if (!image) return null;
  let imageUrl: string;
  try { imageUrl = new URL(image, url).href; } catch { return null; }
  return normalizePreview({
    ...item, creator: item.creator || metadata.get('author') || '',
    contentSnippet: item.contentSnippet || item.content || metadata.get('description') || metadata.get('og:description') || '',
    enclosure: { url: imageUrl, type: 'image/jpeg' },
  }, article.sourceId);
}
