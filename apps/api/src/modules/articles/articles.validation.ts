import { Types } from 'mongoose';
import { sources } from '../sources/sources.config.js';
import { isTagId } from '../tagging/tagging.service.js';
import { HttpError } from '../../middleware/error-handler.js';

const periods = { day: 1, week: 7, month: 30, year: 365 } as const;
const sorts = ['newest', 'oldest', 'relevant', 'popular'] as const;

export interface ArticleQuery {
  source?: string;
  tag?: string;
  q?: string;
  limit: number;
  days: number;
  sort: typeof sorts[number];
  cursor?: { date: Date; id: Types.ObjectId; rank?: number; asOf?: Date };
}

function invalid(): never {
  throw new HttpError(400, 'INVALID_QUERY', 'Use a valid source, tag, cursor, period, sort, search up to 100 characters, and a limit from 1 to 50.');
}

export function parseArticleQuery(query: Record<string, unknown>): ArticleQuery {
  const allowed = ['source', 'tag', 'cursor', 'limit', 'q', 'period', 'sort'];
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.includes(key) || typeof value !== 'string') invalid();
  }
  const { source, tag, cursor, q, limit = '20', period = 'year', sort = 'newest' } = query as Record<string, string>;
  if (!/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 50) invalid();
  if (source !== undefined && !sources.some(({ id }) => id === source)) invalid();
  if (tag !== undefined && !isTagId(tag)) invalid();
  if (q !== undefined && (q.length > 100 || /[\u0000-\u001f\u007f]/u.test(q))) invalid();

  if (!Object.hasOwn(periods, period) || !sorts.some((value) => value === sort)) invalid();
  const search = q?.normalize('NFC').trim();
  const order = sort === 'relevant' && !search ? 'newest' : sort as ArticleQuery['sort'];
  const result: ArticleQuery = { source, tag, q: search, limit: Number(limit), days: periods[period as keyof typeof periods], sort: order };
  if (cursor !== undefined) {
    if (cursor.length > 256 || !/^[\w-]+$/.test(cursor)) invalid();
    try {
      const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (!value || typeof value !== 'object' || !('date' in value) || !('id' in value)) invalid();
      const { date, id } = value;
      if (typeof date !== 'string' || typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) invalid();
      const parsedDate = new Date(date);
      if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString() !== date) invalid();
      const rank = 'rank' in value ? value.rank : undefined;
      if (rank !== undefined && (typeof rank !== 'number' || !Number.isSafeInteger(rank) || rank < 1)) invalid();
      if ((order === 'popular' || order === 'relevant') !== (rank !== undefined)) invalid();
      const asOf = 'asOf' in value && typeof value.asOf === 'string' ? new Date(value.asOf) : undefined;
      if ('asOf' in value && (!asOf || !Number.isFinite(asOf.getTime()) || asOf.getTime() > Date.now())) invalid();
      if (order === 'popular' && !asOf) invalid();
      result.cursor = { date: parsedDate, id: new Types.ObjectId(id), rank, asOf };
    } catch { invalid(); }
  }
  return result;
}
