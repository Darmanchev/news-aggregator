export interface Option { id: string; name: string; parentId?: string }
export interface Article {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  sourceId: string;
  sourceName: string;
  imageLabel?: string | null;
  tags: string[];
  preview?: { imageUrl: string; author: string; excerpt: string } | null;
}
export interface ArticlePage { items: Article[]; nextCursor: string | null }
export interface Filters {
  source: string;
  tag: string;
  q: string;
  period?: 'day' | 'week' | 'month' | 'year';
  sort?: 'newest' | 'oldest' | 'popular';
}

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export function fetchArticles(filters: Filters, signal: AbortSignal, cursor?: string): Promise<ArticlePage> {
  const query = new URLSearchParams({ limit: '20' });
  if (filters.source) query.set('source', filters.source);
  if (filters.tag) query.set('tag', filters.tag);
  if (filters.q) query.set('q', filters.q);
  if (filters.period) query.set('period', filters.period);
  if (filters.sort) query.set('sort', filters.sort);
  if (cursor) query.set('cursor', cursor);
  return getJson(`/api/articles?${query}`, signal);
}

export async function fetchOptions(signal: AbortSignal) {
  const [sources, tags] = await Promise.all([
    getJson<{ items: Option[] }>('/api/sources', signal),
    getJson<{ items: Option[] }>('/api/tags', signal),
  ]);
  return { sources: sources.items, tags: tags.items };
}


export function recordArticleOpen(id: string) {
  void fetch(`/api/articles/${encodeURIComponent(id)}/open`, { method: 'POST', keepalive: true }).catch(() => {});
}
