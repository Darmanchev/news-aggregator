import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { Article } from '../src/modules/articles/articles.model.js';
import { connectTestDatabase } from './helpers/test-database.js';
import { backfillTags } from '../src/modules/tagging/tagging.backfill.js';

const date = new Date('2026-10-29T10:00:00Z');
beforeAll(async () => { await connectTestDatabase(); await Article.init(); });
beforeEach(async () => {
  await Article.deleteMany({});
  await Article.insertMany([1, 2, 3].map((i) => ({ sourceId: 'mediapool', externalId: `tag-backfill-${i}`, title: 'Изкуствен интелект', url: 'https://www.mediapool.bg/example', tags: [], firstSeenAt: date, publishedAt: date })));
});
afterAll(async () => { await Article.deleteMany({ externalId: /^tag-backfill-/ }); await mongoose.disconnect(); });

it('limits paid attempts, skips cached articles on rerun, and preserves article dates', async () => {
  let calls = 0;
  const classifier = { version: 'backfill-fixture', classify: async () => { calls++; return ['medtop:20001298']; } };
  const filter = { externalId: /^tag-backfill-/ };
  const first = await backfillTags(classifier, 1);
  expect(first.attempted).toBe(1); expect(first.updated).toBe(1); expect(calls).toBe(1);
  const next = await backfillTags(classifier, 2);
  expect(next.attempted).toBe(2); expect(next.updated).toBe(2); expect(calls).toBe(3);
  await backfillTags(classifier, 3);
  expect(calls).toBe(3);
  const articles = await Article.find(filter).lean();
  for (const article of articles) {
    expect(article.tags).toContain('medtop:20001298');
    expect(article.publishedAt).toEqual(date); expect(article.firstSeenAt).toEqual(date);
  }
});

it('rejects unsafe limits before any provider call and stops at the first failure', async () => {
  let calls = 0;
  const classifier = { version: 'failed', classify: async () => { calls++; throw new Error('Unavailable'); } };
  for (const limit of [0, -1, 1.5, 1001, NaN]) await expect(backfillTags(classifier, limit)).rejects.toThrow('limit');
  expect(calls).toBe(0);
  const result = await backfillTags(classifier, 3);
  expect(result.failed).toBe(1); expect(result.attempted).toBe(1); expect(calls).toBe(1);
  expect(await Article.countDocuments({ externalId: /^tag-backfill-/, classification: { $exists: true } })).toBe(0);
});

it('does not overwrite a newer article changed while classification is in flight', async () => {
  const classifier = { version: 'concurrent', classify: async () => {
    await Article.updateOne({ externalId: 'tag-backfill-1' }, { $set: { title: 'Нов текст от колектора' } });
    return ['medtop:20001298'];
  } };
  const result = await backfillTags(classifier, 1);
  expect(result.updated).toBe(0);
  expect((await Article.findOne({ externalId: 'tag-backfill-1' }).lean())?.classification).toBeUndefined();
});

it('restores cached AI topics overwritten by a keyword import without paying again', async () => {
  let calls = 0;
  const classifier = { version: 'restore-cache', classify: async () => { calls++; return ['medtop:20001298']; } };
  await backfillTags(classifier, 1);
  await Article.updateOne({ externalId: 'tag-backfill-1' }, { $set: { tags: ['politics', 'sofia'] } });
  const result = await backfillTags(classifier, 1);
  expect((await Article.findOne({ externalId: 'tag-backfill-1' }).lean())?.tags).toEqual(expect.arrayContaining(['sofia', 'medtop:20001298', 'medtop:13000000']));
  expect((await Article.findOne({ externalId: 'tag-backfill-1' }).lean())?.tags).not.toContain('politics');
  // One original call and one new article; restoring the cached record is free.
  expect(calls).toBe(2); expect(result.updated).toBe(2); expect(result.attempted).toBe(1);
});

it('preserves geographic tags updated by a concurrent keyword import', async () => {
  const classifier = { version: 'new-geography', classify: async () => {
    await Article.updateOne({ externalId: 'tag-backfill-1' }, { $set: { tags: ['sofia'] } });
    return ['medtop:20001298'];
  } };
  const result = await backfillTags(classifier, 1);
  expect(result.updated).toBe(0);
  expect((await Article.findOne({ externalId: 'tag-backfill-1' }).lean())?.tags).toEqual(['sofia']);
});

it('cancels before starting paid work', async () => {
  const controller = new AbortController(); controller.abort(); let called = false;
  await expect(backfillTags({ version: 'cancel', classify: async () => { called = true; return []; } }, 1, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(called).toBe(false);
});
