import { Types } from 'mongoose';
import { sources } from '../sources/sources.config.js';
import { tagRules } from '../tagging/tagging.rules.js';
import { HttpError } from '../../middleware/error-handler.js';

export interface ArticleQuery {
  source?: string;
  tag?: string;
  q?: string;
  limit: number;
  cursor?: { date: Date; id: Types.ObjectId };
}

function invalid(): never {
  throw new HttpError(400, 'INVALID_QUERY', 'Use a valid source, tag, cursor, search up to 100 characters, and a limit from 1 to 50.');
}

export function parseArticleQuery(query: Record<string, unknown>): ArticleQuery {
  const allowed = ['source', 'tag', 'cursor', 'limit', 'q'];
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.includes(key) || typeof value !== 'string') invalid();
  }
  const { source, tag, cursor, q, limit = '20' } = query as Record<string, string>;
  if (!/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 50) invalid();
  if (source !== undefined && !sources.some(({ id }) => id === source)) invalid();
  if (tag !== undefined && !tagRules.some(({ id }) => id === tag)) invalid();
  if (q !== undefined && (q.length > 100 || /[\u0000-\u001f\u007f]/u.test(q))) invalid();

  const result: ArticleQuery = { source, tag, q: q?.normalize('NFC').trim(), limit: Number(limit) };
  if (cursor !== undefined) {
    if (cursor.length > 256 || !/^[\w-]+$/.test(cursor)) invalid();
    try {
      const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (!value || typeof value !== 'object' || !('date' in value) || !('id' in value)) invalid();
      const { date, id } = value;
      if (typeof date !== 'string' || typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) invalid();
      const parsedDate = new Date(date);
      if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString() !== date) invalid();
      result.cursor = { date: parsedDate, id: new Types.ObjectId(id) };
    } catch { invalid(); }
  }
  return result;
}
