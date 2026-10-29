import { createHash } from 'node:crypto';
import { Article, type ArticleInput } from '../articles/articles.model.js';
import type { TagClassifier } from './tagging.client.js';
import { expandTags, localTags } from './tagging.service.js';

export function taggingInputHash(title: string, excerpt: string): string {
  return createHash('sha256').update(JSON.stringify([title.slice(0, 500), excerpt.slice(0, 500)])).digest('hex');
}

export async function classifyArticleTags(article: ArticleInput, excerpt: string, classifier: TagClassifier, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const inputHash = taggingInputHash(article.title, excerpt);
  const stored = await Article.findOne({ sourceId: article.sourceId, externalId: article.externalId }).select('classification').lean();
  signal?.throwIfAborted();
  const cached = stored?.classification;
  const classification = cached?.version === classifier.version && cached.inputHash === inputHash
    ? cached
    : { version: classifier.version, inputHash, tags: await classifier.classify(article.title, excerpt, signal) };
  signal?.throwIfAborted();
  article.tags = expandTags([...article.tags.filter((id) => localTags.some((tag) => tag.id === id)), ...classification.tags]);
  article.classification = classification;
}
