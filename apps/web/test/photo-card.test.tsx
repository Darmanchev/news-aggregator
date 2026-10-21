// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewsCard } from '../src/features/news/NewsCard';

const article = {
  id: '1', title: 'Новини от София', url: 'https://offnews.bg/story.html',
  sourceId: 'offnews', sourceName: 'OFFNews', publishedAt: '2026-10-21T12:00:00Z', tags: ['sofia'],
};
const preview = { imageUrl: 'https://offnews.bg/images/story.jpg', author: 'Иван Иванов', excerpt: 'Новината накратко.' };
const tags = [{ id: 'sofia', name: 'София' }];
afterEach(cleanup);

it('renders a licensed photo with attribution, Bulgarian excerpt, and the original article links', () => {
  render(<NewsCard article={{ ...article, preview }} tags={tags} onTag={() => {}} />);
  const image = screen.getByRole('presentation');
  expect(image).toHaveAttribute('src', 'https://offnews.bg/images/story.jpg');
  expect(image).toHaveAttribute('loading', 'lazy');
  expect(image).toHaveAttribute('decoding', 'async');
  expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
  expect(image).toHaveAttribute('width', '800');
  expect(image).toHaveAttribute('height', '450');
  expect(screen.getByText('OFFNews')).toBeInTheDocument();
  expect(screen.getByText('Автор: Иван Иванов')).toHaveAttribute('lang', 'bg');
  expect(screen.getByText('Новината накратко.')).toHaveAttribute('lang', 'bg');
  for (const link of screen.getAllByRole('link')) {
    expect(link).toHaveAttribute('href', 'https://offnews.bg/story.html');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
});

it.each([undefined, null])('keeps articles without a preview text-only (%s)', (value) => {
  render(<NewsCard article={{ ...article, preview: value }} tags={tags} onTag={() => {}} />);
  expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: article.title })).toBeInTheDocument();
  expect(screen.queryByText(/Автор:/)).not.toBeInTheDocument();
});

it('removes a failed photo while retaining the author and excerpt', () => {
  render(<NewsCard article={{ ...article, preview }} tags={tags} onTag={() => {}} />);
  fireEvent.error(screen.getByRole('presentation'));
  expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
  expect(screen.getByText('Автор: Иван Иванов')).toBeInTheDocument();
  expect(screen.getByText('Новината накратко.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: article.title })).toBeInTheDocument();
});

it('tries a changed image URL after an earlier image failed for the same article', () => {
  const view = render(<NewsCard article={{ ...article, preview }} tags={tags} onTag={() => {}} />);
  fireEvent.error(screen.getByRole('presentation'));
  view.rerender(<NewsCard article={{ ...article, preview: { ...preview, imageUrl: 'https://offnews.bg/images/new.jpg' } }} tags={tags} onTag={() => {}} />);
  expect(screen.getByRole('presentation')).toHaveAttribute('src', 'https://offnews.bg/images/new.jpg');
});

it('limits excerpts to 500 characters and preserves keyboard topic navigation', async () => {
  const onTag = vi.fn();
  render(<NewsCard article={{ ...article, preview: { ...preview, excerpt: 'а'.repeat(501) } }} tags={tags} onTag={onTag} />);
  expect(screen.getByText('а'.repeat(500))).toHaveTextContent(/^а{500}$/);
  screen.getByRole('button', { name: '#София' }).focus();
  await userEvent.keyboard('{Enter}');
  expect(onTag).toHaveBeenCalledWith('sofia');
});
