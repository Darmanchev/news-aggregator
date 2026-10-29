// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewsFilters } from '../src/features/news/NewsFilters';
import { NewsCard } from '../src/features/news/NewsCard';

afterEach(cleanup);
const tags = [
  { id: 'medtop:15000000', name: 'Спорт' },
  { id: 'medtop:20000822', name: 'Състезателен спорт', parentId: 'medtop:15000000' },
  { id: 'medtop:20001065', name: 'Футбол', parentId: 'medtop:20000822' },
  { id: 'sofia', name: 'София' },
];

it('groups IPTC descendants under their main topic and keeps local filters separate', async () => {
  let selected = '';
  render(<NewsFilters sources={[]} tags={tags} filters={{ source: '', tag: '', q: '' }} onChange={(filters) => { selected = filters.tag; }} />);
  expect(within(screen.getByRole('group', { name: 'Спорт' })).getByRole('option', { name: /Футбол/ })).toHaveValue('medtop:20001065');
  expect(within(screen.getByRole('group', { name: 'География' })).getByRole('option', { name: 'София' })).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('Topic'), 'medtop:20001065');
  expect(selected).toBe('medtop:20001065');
});

it('shows the specific hashtag without repeating its stored ancestors', () => {
  render(<NewsCard article={{ id: '1', title: 'Футбол в София', url: 'https://example.com', sourceId: 'fixture', sourceName: 'Fixture', publishedAt: '2026-10-29T10:00:00Z', tags: tags.map((tag) => tag.id) }} tags={tags} onTag={() => {}} />);
  expect(screen.getByRole('button', { name: '#Футбол' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '#София' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '#Спорт' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '#Състезателен спорт' })).not.toBeInTheDocument();
});
