import { Article, type ArticleInput } from './articles.model.js';
import { sources, isSourceImageUrl } from '../sources/sources.config.js';
import type { ArticleQuery } from './articles.validation.js';
import { expandTags, tagFilterIds } from '../tagging/tagging.service.js';

export async function findArticlePreview(sourceId: string, externalId: string): Promise<ArticleInput['preview']> {
  const article = await Article.findOne({ sourceId, externalId }).select('preview').lean();
  return article?.preview && isSourceImageUrl(article.preview.imageUrl, sourceId) ? article.preview : null;
}

export async function saveArticle(article: ArticleInput, now: Date): Promise<void> {
  const { sourceId, externalId, publishedAt, preview, ...metadata } = article;
  await Article.updateOne({ sourceId, externalId }, {
    $set: { ...metadata, preview: preview ?? null },
    // Keep the original sort date stable when an undated article is fetched again.
    $setOnInsert: { sourceId, externalId, publishedAt, firstSeenAt: now },
  }, { upsert: true, runValidators: true });
}

export async function listArticles(query: ArticleQuery) {
  const filter = {
    sourceId: query.source ?? { $in: sources.map(({ id }) => id) },
    ...(query.tag ? { tags: { $in: tagFilterIds(query.tag) } } : {}),
    // shortcut: literal search scans titles, add a search index when measured latency requires it.
    ...(query.q ? { title: { $regex: query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}),
    ...(query.cursor ? { $or: [
      { publishedAt: { $lt: query.cursor.date } },
      { publishedAt: query.cursor.date, _id: { $lt: query.cursor.id } },
    ] } : {}),
  };
  const rows = await Article.find(filter).sort({ publishedAt: -1, _id: -1 }).limit(query.limit + 1).maxTimeMS(5000).lean();
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map((article) => {
      const source = sources.find(({ id }) => id === article.sourceId);
      return {
        id: article._id.toString(), title: article.title, url: article.url,
        publishedAt: article.publishedAt.toISOString(), tags: expandTags(article.tags),
        sourceId: article.sourceId,
        sourceName: source?.name ?? article.sourceId,
        imageLabel: source?.previewPolicy?.imageLabel ?? null,
        preview: article.preview && isSourceImageUrl(article.preview.imageUrl, article.sourceId) ? article.preview : null,
      };
    }),
    nextCursor: rows.length > query.limit && last
      ? Buffer.from(JSON.stringify({ date: last.publishedAt.toISOString(), id: last._id.toString() })).toString('base64url')
      : null,
  };
}
