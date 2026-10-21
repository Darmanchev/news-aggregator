// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewsPage } from '../src/features/news/NewsPage';

const json = (value: unknown) => new Response(JSON.stringify(value));
const story = (id: string, title: string, publishedAt = '2026-10-21T12:00:00.000Z') => ({
  id, title, publishedAt, url: `https://example.com/${id}`, sourceId: 'mediapool', sourceName: 'Mediapool', tags: [],
});
function mockApi(articles: (url: URL) => Response | Promise<Response>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/sources/status') return json({ items: [] });
    if (url.pathname === '/api/sources') return json({ items: [{ id: 'mediapool', name: 'Mediapool' }] });
    if (url.pathname === '/api/tags') return json({ items: [{ id: 'sofia', name: 'София' }] });
    return articles(url);
  });
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('offers newer matching stories without changing loaded pages until the reader clicks', async () => {
  let newer = false;
  mockApi((url) => url.searchParams.has('cursor')
    ? json({ items: [story('1', 'Older story')], nextCursor: null })
    : json({ items: newer ? [story('3', 'New headline'), story('2', 'Current headline')] : [story('2', 'Current headline')], nextCursor: 'older' }));
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  render(<NewsPage />);
  await act(async () => {});
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Load more stories' }));
  expect(screen.getByRole('link', { name: 'Older story' })).toBeInTheDocument();
  newer = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(screen.getByRole('button', { name: /New stories available/ })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'New headline' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Older story' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /New stories available/ }));
  expect(screen.getByRole('link', { name: 'New headline' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Older story' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /New stories available/ })).not.toBeInTheDocument();
});

it('uses active search/topic/source filters when checking for new stories', async () => {
  let newer = false;
  mockApi((url) => {
    const filtered = url.searchParams.get('q') === 'София' && url.searchParams.get('tag') === 'sofia' && url.searchParams.get('source') === 'mediapool';
    return json({ items: [newer && filtered ? story('3', 'New matching headline') : story('2', 'Current headline')], nextCursor: null });
  });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  render(<NewsPage />);
  await act(async () => {});
  const user = userEvent.setup();
  await user.type(screen.getByRole('searchbox'), 'София');
  await user.click(screen.getByRole('button', { name: 'Search' }));
  await user.selectOptions(screen.getByLabelText('Topic'), 'sofia');
  await user.selectOptions(screen.getByLabelText('Source'), 'mediapool');
  newer = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  await user.click(screen.getByRole('button', { name: /New stories available/ }));
  expect(screen.getByRole('link', { name: 'New matching headline' })).toBeInTheDocument();
});

it('does not announce an older replacement or interrupt the feed on polling errors', async () => {
  let response = 'current';
  mockApi(() => response === 'error' ? new Response('', { status: 503 }) : json({
    items: [response === 'older' ? story('1', 'Older headline') : story('2', 'Current headline')], nextCursor: null,
  }));
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const view = render(<NewsPage />);
  await act(async () => {});
  response = 'older';
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(screen.queryByRole('button', { name: /New stories available/ })).not.toBeInTheDocument();
  response = 'error';
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(screen.getByRole('link', { name: 'Current headline' })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
