import type { Item } from 'rss-parser';
import { decodeHTML } from 'entities';
import type { ArticleInput } from '../articles/articles.model.js';
import { assignTags } from '../tagging/tagging.service.js';
import { sources, isSourceImageUrl } from '../sources/sources.config.js';

function plainText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return decodeHTML(value.slice(0, 20_000).replace(/<[^>]*>/g, ' ')).replace(/\s+/gu, ' ').trim();
}

export function normalizePreview(item: Item, sourceId: string): ArticleInput['preview'] {
  const hosts = sources.find(({ id }) => id === sourceId)?.imageHosts;
  if (!hosts || (item.enclosure && !['image/jpg', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(item.enclosure.type ?? ''))) return null;
  // shortcut: embedded photos require a simple quoted <img src>, use an HTML parser if publisher markup changes.
  const embedded = item.content?.slice(0, 20_000).match(/<img\s+src\s*=\s*(["'])([^"'<>]+)\1\s*\/?>/i)?.[2];
  const imageUrl = item.enclosure?.url ?? (embedded ? decodeHTML(embedded) : undefined);
  const author = plainText(item.creator);
  const excerpt = plainText(item.contentSnippet ?? item.content).slice(0, 500);
  if (author.length > 200 || typeof imageUrl !== 'string' || imageUrl.length > 2048) return null;
  try {
    const image = new URL(imageUrl);
    if (!isSourceImageUrl(image.href, sourceId)) return null;
    return { imageUrl: image.href, author, excerpt };
  } catch { return null; }
}

export function normalizeArticle(item: Item, sourceId: string, now: Date): ArticleInput | null {
  const title = plainText(item.title);
  if (!title || title.length > 500 || typeof item.link !== 'string' || item.link.length > 2048) return null;

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
  // Do not inherit the server's timezone for publisher dates without an offset.
  const unzoned = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(item.pubDate ?? '');
  const date = new Date(unzoned ? '' : item.isoDate ?? item.pubDate ?? '');
  const preview = normalizePreview(item, sourceId);

  return {
    sourceId, externalId, title, url: url.href,
    publishedAt: Number.isFinite(date.getTime()) ? date : now,
    tags: assignTags(`${title} ${plainText(item.contentSnippet ?? item.content)}`),
    ...(preview ? { preview } : {}),
  };
}
