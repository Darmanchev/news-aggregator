import type { PipelineStage, Types } from 'mongoose';
import { Article, ArticleOpen, type ArticleInput } from './articles.model.js';
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

const day = 86_400_000;

export async function recordArticleOpen(id: string): Promise<boolean> {
  const article = await Article.exists({ _id: id, sourceId: { $in: sources.map(({ id }) => id) } });
  if (!article) return false;
  await ArticleOpen.create({ articleId: article._id, openedAt: new Date() });
  return true;
}

export async function listArticles(query: ArticleQuery) {
  const now = new Date();
  const asOf = query.cursor?.asOf ?? now;
  const search = query.q?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = {
    sourceId: query.source ?? { $in: sources.map(({ id }) => id) },
    publishedAt: { $gte: new Date(Math.max(asOf.getTime() - query.days * day, now.getTime() - 365 * day)) },
    ...(query.tag ? { tags: { $in: tagFilterIds(query.tag) } } : {}),
    ...(search ? { title: { $regex: search, $options: 'i' } } : {}),
  };
  const direction = query.sort === 'oldest' ? 1 : -1;
  const comparison = direction === 1 ? '$gt' : '$lt';
  const cursor = query.cursor;
  const dateOrder = { publishedAt: direction, _id: direction } as const;
  const dateAfter = cursor ? [
    { publishedAt: { [comparison]: cursor.date } },
    { publishedAt: cursor.date, _id: { [comparison]: cursor.id } },
  ] : [];

  let rows: (ArticleInput & { _id: Types.ObjectId; rank?: number })[];
  if (query.sort === 'popular') {
    const pipeline: PipelineStage[] = [
      { $match: filter },
      { $lookup: {
        from: ArticleOpen.collection.name,
        localField: '_id', foreignField: 'articleId', as: 'opens',
        pipeline: [
          { $match: { openedAt: { $gte: new Date(asOf.getTime() - 7 * day), $lte: asOf } } },
          { $count: 'count' },
        ],
      } },
      { $set: { rank: { $ifNull: [{ $first: '$opens.count' }, 0] } } },
      { $match: { rank: { $gt: 0 } } },
    ];
    if (cursor) pipeline.push({ $match: { $or: [
      { rank: { $lt: cursor.rank } },
      { rank: cursor.rank, $or: dateAfter },
    ] } });
    pipeline.push({ $sort: { rank: -1, ...dateOrder } }, { $limit: query.limit + 1 });
    rows = await Article.aggregate(pipeline).option({ maxTimeMS: 5000 });
  } else {
    rows = await Article.find({ ...filter, ...(cursor ? { $or: dateAfter } : {}) })
      .sort(dateOrder).limit(query.limit + 1).maxTimeMS(5000).lean();
  }
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
      ? Buffer.from(JSON.stringify({ date: last.publishedAt.toISOString(), id: last._id.toString(), rank: last.rank, asOf: asOf.toISOString() })).toString('base64url')
      : null,
  };
}
