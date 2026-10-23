import { tagRules } from './tagging.rules.js';

const matchers = tagRules.map(({ id, keywords }) => ({
  id,
  patterns: keywords.map((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u');
  }),
}));

export function assignTags(text: string): string[] {
  const normalized = text.normalize('NFC').toLocaleLowerCase('bg').replace(/\s+/gu, ' ');
  return matchers.filter(({ patterns }) => patterns.some((pattern) => pattern.test(normalized))).map(({ id }) => id);
}
