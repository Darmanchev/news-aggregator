import { afterEach, expect, it, vi } from 'vitest';
import { Query } from 'mongoose';
import { Article } from '../src/modules/articles/articles.model.js';
import { SourceStatus } from '../src/modules/sources/sources.model.js';
import { collectSources } from '../src/modules/ingestion/ingestion.service.js';

const source = { id: 'offnews', name: 'OFFNews', feedUrl: 'https://feed.offnews.bg/rss/all' };
const now = new Date('2026-10-23T10:00:00Z');
const item = {
  guid: 'broken', title: 'Новини от София', link: 'https://offnews.bg/story.html',
  enclosure: { url: 'https://i2.offnews.bg/story.jpg', type: 'image/jpeg' },
};
const updated = { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null };

afterEach(() => { vi.restoreAllMocks(); });

it('does not start a collection after cancellation', async () => {
  const status = vi.spyOn(SourceStatus, 'updateOne').mockResolvedValue(updated);
  const controller = new AbortController();
  controller.abort();
  const loadFeed = vi.fn(async () => ({ items: [] }));
  const report = await collectSources([source], { signal: controller.signal, loadFeed });
  expect(report).toEqual({ processed: 0, skipped: 0, failed: [] });
  expect(status).not.toHaveBeenCalled();
  expect(loadFeed).not.toHaveBeenCalled();
});

it('stops during preview loading without saving the article or reporting a source outage', async () => {
  vi.spyOn(Query.prototype, 'exec').mockResolvedValue(null);
  const save = vi.spyOn(Article, 'updateOne').mockResolvedValue(updated);
  const status = vi.spyOn(SourceStatus, 'updateOne').mockResolvedValue(updated);
  const controller = new AbortController();
  const report = await collectSources([source, { ...source, id: 'later' }], {
    now, signal: controller.signal,
    loadFeed: async () => ({ items: [{ ...item, enclosure: undefined }, { ...item, guid: 'later' }] }),
    loadPreview: async (_article, _item, signal) => {
      expect(signal).toBe(controller.signal);
      controller.abort();
      signal?.throwIfAborted();
      return null;
    },
  });
  expect(report).toEqual({ processed: 0, skipped: 0, failed: [] });
  expect(save).not.toHaveBeenCalled();
  expect(status).toHaveBeenCalledExactlyOnceWith({ _id: 'offnews' }, { $set: { lastAttemptAt: now } },
    { upsert: true, runValidators: true });
});

it('does not mark an empty feed successful after cancellation', async () => {
  const status = vi.spyOn(SourceStatus, 'updateOne').mockResolvedValue(updated);
  const controller = new AbortController();
  const report = await collectSources([source], {
    now, signal: controller.signal,
    loadFeed: async () => { controller.abort(); return { items: [] }; },
  });
  expect(report).toEqual({ processed: 0, skipped: 0, failed: [] });
  expect(status).toHaveBeenCalledExactlyOnceWith({ _id: 'offnews' }, { $set: { lastAttemptAt: now } },
    { upsert: true, runValidators: true });
});

it('keeps the count of saved articles when cancellation interrupts a later article', async () => {
  vi.spyOn(Query.prototype, 'exec').mockResolvedValue(null);
  const save = vi.spyOn(Article, 'updateOne').mockResolvedValue(updated);
  vi.spyOn(SourceStatus, 'updateOne').mockResolvedValue(updated);
  const controller = new AbortController();
  const report = await collectSources([source], {
    now, signal: controller.signal,
    loadFeed: async () => ({ items: [item, { ...item, guid: 'cancelled', enclosure: undefined }] }),
    loadPreview: async () => { controller.abort(); controller.signal.throwIfAborted(); return null; },
  });
  expect(report).toEqual({ processed: 1, skipped: 0, failed: [] });
  expect(save).toHaveBeenCalledExactlyOnceWith({ sourceId: 'offnews', externalId: 'broken' },
    expect.anything(), expect.anything());
});

it('saves later articles after one persistence failure without marking the source successful', async () => {
  const save = vi.spyOn(Article, 'updateOne').mockResolvedValue(updated)
    .mockImplementationOnce(() => { throw new Error('Write failed'); });
  const status = vi.spyOn(SourceStatus, 'updateOne').mockResolvedValue(updated);
  const report = await collectSources([source], {
    now, loadFeed: async () => ({ items: [item, { ...item, guid: 'surviving' }] }),
  });

  expect(report.processed).toBe(1);
  expect(report.failed).toHaveLength(1);
  expect(report.failed[0]).toMatchObject({ sourceId: 'offnews', message: expect.stringContaining('Write failed') });
  expect(save).toHaveBeenCalledWith({ sourceId: 'offnews', externalId: 'surviving' }, expect.anything(), expect.anything());
  expect(status).toHaveBeenLastCalledWith({ _id: 'offnews', firstFailureAt: null },
    { $set: { firstFailureAt: now } }, { runValidators: true });
  expect(status.mock.calls.some(([, update]) => update && '$set' in update && update.$set?.lastSuccessAt)).toBe(false);
});

it('reports multiple failed articles once for their source and still processes valid entries', async () => {
  vi.spyOn(Article, 'updateOne').mockResolvedValue(updated)
    .mockImplementationOnce(() => { throw new Error('First write failed'); })
    .mockImplementationOnce(() => { throw new Error('Second write failed'); });
  vi.spyOn(SourceStatus, 'updateOne').mockResolvedValue(updated);
  const report = await collectSources([source], {
    now, loadFeed: async () => ({ items: [item, { ...item, guid: 'broken-2' }, { ...item, guid: 'surviving' }] }),
  });

  expect(report.processed).toBe(1);
  expect(report.failed).toHaveLength(1);
  expect(report.failed[0]?.message).toContain('2 article(s) failed');
  expect(report.failed[0]?.message).toContain('First write failed');
});

it('still saves the headline when a missing preview cannot be fetched', async () => {
  vi.spyOn(Query.prototype, 'exec').mockResolvedValue(null);
  const save = vi.spyOn(Article, 'updateOne').mockResolvedValue(updated);
  vi.spyOn(SourceStatus, 'updateOne').mockResolvedValue(updated);
  const report = await collectSources([source], {
    now, loadFeed: async () => ({ items: [{ ...item, enclosure: undefined }] }),
    loadPreview: async () => { throw new Error('Metadata unavailable'); },
  });
  expect(report).toEqual({ processed: 1, skipped: 0, failed: [] });
  expect(save).toHaveBeenCalledWith({ sourceId: 'offnews', externalId: 'broken' },
    expect.objectContaining({ $set: expect.objectContaining({ title: item.title, preview: null }) }), expect.anything());
});
