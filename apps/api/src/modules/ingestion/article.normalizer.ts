import type { Item } from 'rss-parser';
import { decodeHTML } from 'entities';
import type { ArticleInput } from '../articles/articles.model.js';
import { assignTags } from '../tagging/tagging.service.js';

function plainText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return decodeHTML(value.slice(0, 20_000).replace(/<[^>]*>/g, ' ')).replace(/\s+/gu, ' ').trim();
}

export function normalizeArticle(item: Item, sourceId: string, now: Date): ArticleInput | null {
  const title = plainText(item.title).slice(0, 500);
  if (!title || typeof item.link !== 'string' || item.link.length > 2048) return null;

  let url: URL;
  try { url = new URL(item.link); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
  }
  if (url.href.length > 2048) return null;
  const externalId = typeof item.guid === 'string' && item.guid.trim() ? item.guid.trim() : url.href;
  if (externalId.length > 2048) return null;
  const date = new Date(item.isoDate ?? item.pubDate ?? '');

  return {
    sourceId, externalId, title, url: url.href,
    publishedAt: Number.isFinite(date.getTime()) ? date : now,
    tags: assignTags(`${title} ${plainText(item.contentSnippet ?? item.content)}`),
  };
}
