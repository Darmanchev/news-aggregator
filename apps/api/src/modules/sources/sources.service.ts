import { sources } from './sources.config.js';
import { SourceStatus } from './sources.model.js';

export async function recordCollectionAttempt(sourceId: string, at: Date) {
  await SourceStatus.updateOne({ _id: sourceId }, { $set: { lastAttemptAt: at } }, { upsert: true, runValidators: true });
}

export async function recordCollectionSuccess(sourceId: string, at: Date) {
  await SourceStatus.updateOne({ _id: sourceId }, { $set: { lastSuccessAt: at, firstFailureAt: null, lastAlertAt: null } }, { runValidators: true });
}

export async function recordCollectionFailure(sourceId: string, at: Date) {
  await SourceStatus.updateOne({ _id: sourceId, firstFailureAt: null }, { $set: { firstFailureAt: at } }, { runValidators: true });
}

export async function listSourceStatuses() {
  const statuses = await SourceStatus.find({ _id: { $in: sources.map(({ id }) => id) } }).maxTimeMS(5000).lean();
  return { items: sources.map(({ id }) => {
    const status = statuses.find(({ _id }) => _id === id);
    return { sourceId: id, lastAttemptAt: status?.lastAttemptAt ?? null, lastSuccessAt: status?.lastSuccessAt ?? null };
  }) };
}
