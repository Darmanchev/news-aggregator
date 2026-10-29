import { expect, it } from 'vitest';
import { topicCatalog } from '../src/modules/tagging/tagging.catalog.js';
import { expandTags, tagFilterIds } from '../src/modules/tagging/tagging.service.js';

it('has a complete, acyclic mini-IPTC hierarchy with translated labels and definitions', () => {
  expect(topicCatalog.length).toBeGreaterThanOrEqual(100);
  expect(topicCatalog.length).toBeLessThanOrEqual(150);
  expect(topicCatalog.filter((topic) => !topic.parentId)).toHaveLength(17);
  const ids = new Set(topicCatalog.map((topic) => topic.id));
  expect(ids.size).toBe(topicCatalog.length);
  for (const topic of topicCatalog) {
    expect(topic.id).toMatch(/^medtop:\d{8}$/);
    expect(topic.name).toMatch(/[А-Яа-я]/u);
    expect(topic.englishName).toBeTruthy(); expect(topic.description).toBeTruthy();
    const visited = new Set([topic.id]); let parent = topic.parentId;
    while (parent) {
      expect(ids.has(parent)).toBe(true); expect(visited.has(parent)).toBe(false);
      visited.add(parent); parent = topicCatalog.find((item) => item.id === parent)?.parentId;
    }
  }
});

it('expands a specific topic and makes canonical filters include legacy subject aliases', () => {
  expect(expandTags(['medtop:20001065'])).toEqual(['medtop:20001065', 'medtop:20000822', 'medtop:15000000']);
  expect(tagFilterIds('medtop:15000000')).toEqual(expect.arrayContaining(['medtop:20001065', 'sport']));
  expect(expandTags(['politics', 'medtop:11000000', 'sofia'])).toEqual(['medtop:11000000', 'sofia']);
  expect(expandTags(['unknown', '__proto__', 'constructor'])).toEqual([]);
});
