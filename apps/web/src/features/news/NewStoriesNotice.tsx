import { useEffect, useState } from 'react';
import { fetchArticles, type Article, type Filters } from './news.api';

export function NewStoriesNotice({ filters, firstArticle, onRefresh }: {
  filters: Filters;
  firstArticle: Article | undefined;
  onRefresh: () => void;
}) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let controller: AbortController | undefined;
    setAvailable(false);
    const timer = setInterval(() => {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      void fetchArticles(filters, signal).then(({ items }) => {
        if (signal.aborted) return;
        const latest = items[0];
        setAvailable(Boolean(latest && (!firstArticle || latest.publishedAt > firstArticle.publishedAt
          || (latest.publishedAt === firstArticle.publishedAt && latest.id > firstArticle.id))));
      }).catch(() => {});
    }, 60_000);
    return () => { clearInterval(timer); controller?.abort(); };
  }, [filters, firstArticle]);

  return available ? <div className="notice new-stories" role="status">
    <button className="text-button" onClick={onRefresh}>New stories available — load latest</button>
  </div> : null;
}
