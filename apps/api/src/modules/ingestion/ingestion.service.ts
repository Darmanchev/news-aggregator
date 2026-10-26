import type { Item } from 'rss-parser';
import type { Source } from '../sources/sources.config.js';
import type { ArticleInput } from '../articles/articles.model.js';
import { fetchArticlePreview } from './article-metadata.client.js';
import { findArticlePreview, saveArticle } from '../articles/articles.service.js';
import { normalizeArticle } from './article.normalizer.js';
import { fetchFeed } from './rss.client.js';
import { recordCollectionAttempt, recordCollectionFailure, recordCollectionSuccess } from '../sources/sources.service.js';

interface CollectionOptions {
  loadFeed?: (url: string, signal?: AbortSignal) => Promise<{ items: Item[] }>;
  loadPreview?: (article: ArticleInput, item: Item, signal?: AbortSignal) => Promise<ArticleInput['preview']>;
  now?: Date;
  signal?: AbortSignal;
}

export async function collectSources(sources: Source[], options: CollectionOptions = {}) {
  const report = { processed: 0, skipped: 0, failed: [] as { sourceId: string; message: string }[] };
  const now = options.now ?? new Date();
  for (const source of sources) {
    if (options.signal?.aborted) break;
    const result = await collectSource(source, { ...options, now });
    report.processed += result.processed;
    report.skipped += result.skipped;
    if (result.error !== null) report.failed.push({ sourceId: source.id, message: result.error });
  }
  return report;
}

async function collectSource(source: Source, {
  loadFeed = (url, signal) => fetchFeed(url, fetch, signal),
  loadPreview = (article, item, signal) => fetchArticlePreview(article, item, fetch, signal),
  now = new Date(), signal,
}: CollectionOptions) {
  const result = { processed: 0, skipped: 0, error: null as string | null };
  try {
    await recordCollectionAttempt(source.id, now);
    signal?.throwIfAborted();
    const feed = await loadFeed(source.feedUrl, signal);
    let failedCount = 0;
    let firstError: string | undefined;
    for (const item of feed.items) {
      signal?.throwIfAborted();
      try {
        const article = normalizeArticle(item, source.id, now);
        if (!article) { result.skipped++; continue; }
        await enrichArticlePreview(article, item, loadPreview, signal);
        signal?.throwIfAborted();
        await saveArticle(article, now);
        result.processed++;
      } catch (error) {
        signal?.throwIfAborted();
        failedCount++;
        firstError ??= error instanceof Error ? error.message : 'Unknown article failure';
      }
    }
    signal?.throwIfAborted();
    if (failedCount) throw new Error(`${failedCount} article(s) failed; first error: ${firstError}`);
    await recordCollectionSuccess(source.id, now);
  } catch (error) {
    if (signal?.aborted) return result;
    try { await recordCollectionFailure(source.id, now); }
    catch { /* Keep collecting other sources when status storage fails. */ }
    result.error = error instanceof Error ? error.message : 'Unknown collection failure';
  }
  return result;
}

async function enrichArticlePreview(
  article: ArticleInput, item: Item,
  loadPreview: NonNullable<CollectionOptions['loadPreview']>, signal?: AbortSignal,
): Promise<void> {
  if (article.preview) return;
  const stored = await findArticlePreview(article.sourceId, article.externalId);
  signal?.throwIfAborted();
  if (stored) {
    article.preview = stored;
    return;
  }
  try { article.preview = await loadPreview(article, item, signal); }
  catch {
    signal?.throwIfAborted();
    // A preview outage must not prevent the headline from importing.
  }
}
