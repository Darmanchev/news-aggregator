import type { Item } from 'rss-parser';
import type { Source } from '../sources/sources.config.js';
import type { ArticleInput } from '../articles/articles.model.js';
import { fetchArticlePreview } from './article-metadata.client.js';
import { findArticlePreview, saveArticle } from '../articles/articles.service.js';
import { normalizeArticle } from './article.normalizer.js';
import { fetchFeed } from './rss.client.js';
import { recordCollectionAttempt, recordCollectionFailure, recordCollectionSuccess } from '../sources/sources.service.js';

interface CollectionOptions {
  loadFeed?: (url: string) => Promise<{ items: Item[] }>;
  now?: Date;
  loadPreview?: typeof fetchArticlePreview;
}

export async function collectSources(sources: Source[], { loadFeed = fetchFeed, now = new Date(), loadPreview = fetchArticlePreview }: CollectionOptions = {}) {
  const report = { processed: 0, skipped: 0, failed: [] as { sourceId: string; message: string }[] };
  for (const source of sources) {
    try {
      await recordCollectionAttempt(source.id, now);
      const feed = await loadFeed(source.feedUrl);
      const articleErrors: string[] = [];
      for (const item of feed.items) {
        try {
          const article = normalizeArticle(item, source.id, now);
          if (!article) { report.skipped++; continue; }
          await enrichArticlePreview(article, item, loadPreview);
          await saveArticle(article, now);
          report.processed++;
        } catch (error) {
          articleErrors.push(error instanceof Error ? error.message : 'Unknown article failure');
        }
      }
      if (articleErrors.length) throw new Error(`${articleErrors.length} article(s) failed; first error: ${articleErrors[0]}`);
      await recordCollectionSuccess(source.id, now);
    } catch (error) {
      try { await recordCollectionFailure(source.id, now); } catch { /* Keep collecting other sources when status storage fails. */ }
      report.failed.push({ sourceId: source.id, message: error instanceof Error ? error.message : 'Unknown collection failure' });
    }
  }
  return report;
}

async function enrichArticlePreview(article: ArticleInput, item: Item, loadPreview = fetchArticlePreview): Promise<void> {
  if (article.preview) return;
  const stored = await findArticlePreview(article.sourceId, article.externalId);
  if (stored) {
    article.preview = stored;
    return;
  }
  try { article.preview = await loadPreview(article, item); }
  catch { /* A preview outage must not prevent the headline from importing. */ }
}
