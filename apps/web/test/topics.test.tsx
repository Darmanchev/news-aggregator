// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
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

it('shows only broad topics first, then subtopics for the selected section', async () => {
  const onChange = vi.fn();
  const { rerender } = render(<NewsFilters sources={[]} tags={tags} filters={{ source: '', tag: '', q: '' }} onChange={onChange} />);
  expect(within(screen.getByLabelText('Topic')).queryByRole('option', { name: /Футбол/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Subtopic')).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('Topic'), 'medtop:15000000');
  expect(onChange).toHaveBeenLastCalledWith({ source: '', tag: 'medtop:15000000', q: '' });
  rerender(<NewsFilters sources={[]} tags={tags} filters={{ source: '', tag: 'medtop:15000000', q: '' }} onChange={onChange} />);
  expect(screen.getByLabelText('Subtopic')).toHaveValue('medtop:15000000');
  await userEvent.selectOptions(screen.getByLabelText('Subtopic'), 'medtop:20001065');
  expect(onChange).toHaveBeenLastCalledWith({ source: '', tag: 'medtop:20001065', q: '' });
});

it('derives the selected section from a deeply nested hashtag and keeps geography usable', async () => {
  const onChange = vi.fn();
  const { rerender } = render(<NewsFilters sources={[]} tags={tags} filters={{ source: 'fixture', tag: 'medtop:20001065', q: 'goal' }} onChange={onChange} />);
  expect(screen.getByLabelText('Topic')).toHaveValue('medtop:15000000');
  expect(screen.getByLabelText('Subtopic')).toHaveValue('medtop:20001065');
  expect(within(screen.getByLabelText('Subtopic')).getByRole('option', { name: 'Състезателен спорт / Футбол' })).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('Topic'), 'sofia');
  expect(onChange).toHaveBeenLastCalledWith({ source: 'fixture', tag: 'sofia', q: 'goal' });
  rerender(<NewsFilters sources={[]} tags={tags} filters={{ source: 'fixture', tag: 'sofia', q: 'goal' }} onChange={onChange} />);
  expect(screen.queryByLabelText('Subtopic')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Clear filters/ }));
  expect(onChange).toHaveBeenLastCalledWith({ source: '', tag: '', q: '' });
});

it('shows the specific hashtag without repeating its stored ancestors', () => {
  render(<NewsCard article={{ id: '1', title: 'Футбол в София', url: 'https://example.com', sourceId: 'fixture', sourceName: 'Fixture', publishedAt: '2026-10-29T10:00:00Z', tags: tags.map((tag) => tag.id) }} tags={tags} onTag={() => {}} />);
  expect(screen.getByRole('button', { name: '#Футбол' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '#София' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '#Спорт' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '#Състезателен спорт' })).not.toBeInTheDocument();
});
