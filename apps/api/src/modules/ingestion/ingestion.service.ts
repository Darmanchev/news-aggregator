import type { Item } from 'rss-parser';
import type { Source } from '../sources/sources.config.js';
import { saveArticle } from '../articles/articles.service.js';
import { normalizeArticle } from './article.normalizer.js';
import { fetchFeed } from './rss.client.js';
import { recordCollectionAttempt, recordCollectionFailure, recordCollectionSuccess } from '../sources/sources.service.js';

interface CollectionOptions {
  loadFeed?: (url: string) => Promise<{ items: Item[] }>;
  now?: Date;
}

export async function collectSources(sources: Source[], { loadFeed = fetchFeed, now = new Date() }: CollectionOptions = {}) {
  const report = { processed: 0, skipped: 0, failed: [] as { sourceId: string; message: string }[] };
  for (const source of sources) {
    try {
      await recordCollectionAttempt(source.id, now);
      const feed = await loadFeed(source.feedUrl);
      for (const item of feed.items) {
        const article = normalizeArticle(item, source.id, now);
        if (!article) { report.skipped++; continue; }
        await saveArticle(article, now);
        report.processed++;
      }
      await recordCollectionSuccess(source.id, now);
    } catch (error) {
      try { await recordCollectionFailure(source.id, now); } catch { /* Keep collecting other sources when status storage fails. */ }
      report.failed.push({ sourceId: source.id, message: error instanceof Error ? error.message : 'Unknown collection failure' });
    }
  }
  return report;
}
