import { tagRules } from './tagging.rules.js';
import { topicCatalog } from './tagging.catalog.js';

export const legacyTopicIds: Record<string, string> = {
  politics: 'medtop:11000000', economy: 'medtop:04000000', sport: 'medtop:15000000', culture: 'medtop:01000000',
};
export const localTags = [{ id: 'sofia', name: 'София' }, { id: 'world', name: 'Свят' }];
const topics = new Map(topicCatalog.map((topic) => [topic.id, topic]));

export function expandTags(ids: string[]): string[] {
  const result = new Set<string>();
  for (const original of ids) {
    let id: string | undefined = legacyTopicIds[original] ?? original;
    while (id && !result.has(id)) {
      if (!topics.has(id) && !localTags.some((tag) => tag.id === id)) break;
      result.add(id);
      id = topics.get(id)?.parentId;
    }
  }
  return [...result];
}

export function isTagId(id: string): boolean {
  return topics.has(id) || Object.hasOwn(legacyTopicIds, id) || localTags.some((tag) => tag.id === id);
}

export function tagFilterIds(id: string): string[] {
  const canonical = legacyTopicIds[id] ?? id;
  const descendants = topicCatalog.filter((topic) => expandTags([topic.id]).includes(canonical)).map((topic) => topic.id);
  return [...new Set([canonical, ...descendants, ...Object.keys(legacyTopicIds).filter((alias) => descendants.includes(legacyTopicIds[alias]!))])];
}

const subjectKeywords: Record<string, string[]> = {
  'medtop:20000574': ['избори', 'изборите'],
  'medtop:20000607': ['бюджет', 'бюджетът', 'бюджета'],
  'medtop:20000370': ['инфлация', 'инфлацията'],
  'medtop:20001065': ['футбол', 'футболът', 'футбола'],
  'medtop:20001085': ['тенис', 'тенисът', 'тениса'],
  'medtop:20000851': ['баскетбол', 'баскетболът', 'баскетбола'],
  'medtop:20001089': ['волейбол', 'волейболът', 'волейбола'],
  'medtop:20000029': ['театър', 'театърът', 'театъра', 'театри', 'театрите'],
  'medtop:20000005': ['кино', 'киното'],
  'medtop:20000018': ['концерт', 'концертът', 'концерта', 'концерти', 'концертите'],
  'medtop:20001181': ['фестивал', 'фестивалът', 'фестивала', 'фестивали', 'фестивалите'],
  'medtop:20001298': ['изкуствен интелект', 'изкуственият интелект', 'изкуствения интелект'],
  'medtop:20000763': ['киберсигурност', 'киберсигурността'],
  'medtop:20000086': ['киберпрестъпност', 'кибератака', 'кибератаки'],
  'medtop:20000153': ['земетресение', 'земетресението', 'земетресения'],
  'medtop:20000154': ['наводнение', 'наводнението', 'наводнения', 'наводненията'],
  'medtop:20000477': ['ваксина', 'ваксината', 'ваксини', 'ваксините'],
  'medtop:20000405': ['университет', 'университетът', 'университета', 'университети'],
  'medtop:20000418': ['климатични промени', 'изменение на климата'],
  'medtop:20000533': ['безработица', 'безработицата'],
  'medtop:20000531': ['пенсиониране', 'пенсии', 'пенсиите'],
};

const matchers = [...tagRules, ...topicCatalog.map((topic) => ({
  id: topic.id, keywords: [topic.name, ...(subjectKeywords[topic.id] ?? [])],
}))].map(({ id, keywords }) => ({
  id,
  patterns: keywords.map((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u');
  }),
}));

export function assignTags(text: string, categories: string[] = []): string[] {
  const normalized = text.normalize('NFC').toLocaleLowerCase('bg').replace(/\s+/gu, ' ');
  const matched = matchers.filter(({ patterns }) => patterns.some((pattern) => pattern.test(normalized))).map(({ id }) => id);
  const aliases: Record<string, string> = { technology: 'medtop:13000000', sports: 'medtop:15000000', business: 'medtop:04000000' };
  for (const category of categories) {
    const name = category.normalize('NFC').trim().toLocaleLowerCase('bg');
    const topic = topicCatalog.find((topic) => [topic.name.toLocaleLowerCase('bg'), topic.englishName].includes(name));
    const legacy = tagRules.find((rule) => [rule.id, rule.name.toLocaleLowerCase('bg')].includes(name));
    const id = topic?.id ?? legacy?.id ?? (Object.hasOwn(aliases, name) ? aliases[name] : undefined);
    if (id) matched.push(id);
  }
  return [...new Set([...matched, ...expandTags(matched)])];
}
