import { tagRules } from './tagging.rules.js';

export function assignTags(text: string): string[] {
  const normalized = text.normalize('NFC').toLocaleLowerCase('bg').replace(/\s+/gu, ' ');
  return tagRules.filter(({ keywords }) => keywords.some((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(normalized);
  })).map(({ id }) => id);
}
