import { useEffect, useRef, useState } from 'react';
import { fetchArticles, type Article, type Filters } from './news.api';

export function useNewsFeed(filters: Filters, refreshKey: number) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const pageRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    pageRequest.current?.abort();
    pageRequest.current = controller;
    setArticles([]);
    setNextCursor(null);
    setLoading(true);
    setLoadingMore(false);
    setError(false);
    void fetchArticles(filters, controller.signal).then((page) => {
      if (controller.signal.aborted) return;
      setArticles(page.items);
      setNextCursor(page.nextCursor);
    }).catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); pageRequest.current?.abort(); };
  }, [filters, refreshKey]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoadingMore(true);
    setError(false);
    try {
      const page = await fetchArticles(filters, controller.signal, nextCursor);
      if (controller.signal.aborted) return;
      setArticles((previous) => {
        const ids = new Set(previous.map(({ id }) => id));
        return [...previous, ...page.items.filter(({ id }) => !ids.has(id))];
      });
      setNextCursor(page.nextCursor);
    } catch { if (!controller.signal.aborted) setError(true); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  }

  return { articles, nextCursor, loading, loadingMore, error, loadMore };
}
