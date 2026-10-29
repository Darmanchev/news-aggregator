import { Article } from '../articles/articles.model.js';
import { sources } from '../sources/sources.config.js';
import type { TagClassifier } from './tagging.client.js';
import { classifyArticleTags, taggingInputHash } from './tagging.classification.js';
import { expandTags, localTags } from './tagging.service.js';

export async function backfillTags(classifier: TagClassifier, limit: number, signal?: AbortSignal) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Use a limit from 1 to 1000.');
  signal?.throwIfAborted();
  const report = { checked: 0, attempted: 0, updated: 0, failed: 0 };
  const cursor = Article.find({ sourceId: { $in: sources.map((source) => source.id) } }).sort({ _id: 1 }).lean().cursor();
  try {
    for await (const article of cursor) {
      signal?.throwIfAborted();
      if (report.attempted >= limit) break;
      report.checked++;
      const excerpt = article.preview?.excerpt ?? '';
      const cached = article.classification?.version === classifier.version && article.classification.inputHash === taggingInputHash(article.title, excerpt);
      if (cached) {
        const expected = expandTags([...article.tags.filter((id) => localTags.some((tag) => tag.id === id)), ...article.classification!.tags]);
        if (article.tags.length === expected.length && article.tags.every((id) => expected.includes(id))) continue;
      } else report.attempted++;
      const previous = article.classification ?? null;
      const previousTags = article.tags;
      try {
        await classifyArticleTags(article, excerpt, classifier, signal);
        signal?.throwIfAborted();
        const result = await Article.updateOne({ _id: article._id, title: article.title, preview: article.preview ?? null, classification: previous, tags: previousTags }, {
          $set: { tags: article.tags, classification: article.classification },
        }, { runValidators: true });
        report.updated += result.modifiedCount;
      } catch {
        signal?.throwIfAborted();
        report.failed++;
        break;
      }
    }
  } finally { await cursor.close(); }
  return report;
}
