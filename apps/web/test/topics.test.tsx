// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopicPanel } from '../src/features/news/TopicPanel';
import { useState } from 'react';
import { NewsCard } from '../src/features/news/NewsCard';

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const tags = [
  { id: 'medtop:15000000', name: 'Спорт' },
  { id: 'medtop:20000822', name: 'Състезателен спорт', parentId: 'medtop:15000000' },
  { id: 'medtop:20001065', name: 'Футбол', parentId: 'medtop:20000822' },
  { id: 'sofia', name: 'София' },
];

function Topics() {
  const [selected, setSelected] = useState('');
  return <TopicPanel tags={tags} selected={selected} onSelect={(id) => setSelected(id === selected ? '' : id)} />;
}

it('opens subtopics, filters by a chip and keeps geography separate', async () => {
  render(<Topics />);
  expect(screen.queryByRole('button', { name: 'Футбол' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Спорт' }));
  const football = screen.getByRole('button', { name: 'Футбол' });
  await userEvent.click(football);
  expect(football).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(football);
  expect(screen.getByRole('button', { name: 'All topics' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(screen.getByRole('group', { name: 'Geography' })).getByRole('button', { name: 'София' })).toBeInTheDocument();
});

it('searches subtopics and restores favorites after remounting', async () => {
  const { unmount } = render(<Topics />);
  await userEvent.type(screen.getByRole('searchbox', { name: 'Find a topic' }), 'футбол');
  await userEvent.click(screen.getByRole('button', { name: 'Favorite Футбол' }));
  unmount();
  render(<Topics />);
  const favorites = screen.getByRole('group', { name: 'Favorite topics' });
  const football = within(favorites).getByRole('button', { name: 'Футбол' });
  await userEvent.click(football);
  expect(football).toHaveAttribute('aria-pressed', 'true');
});

it('shows the specific hashtag without repeating its stored ancestors', () => {
  render(<NewsCard article={{ id: '1', title: 'Футбол в София', url: 'https://example.com', sourceId: 'fixture', sourceName: 'Fixture', publishedAt: '2026-10-29T10:00:00Z', tags: tags.map((tag) => tag.id) }} tags={tags} onTag={() => {}} />);
  expect(screen.getByRole('button', { name: '#Футбол' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '#София' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '#Спорт' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '#Състезателен спорт' })).not.toBeInTheDocument();
});
