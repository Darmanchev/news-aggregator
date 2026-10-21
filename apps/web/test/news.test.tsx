// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewsPage } from '../src/features/news/NewsPage';

const article = (id: string, title: string) => ({ id, title, url: `https://example.com/${id}`, sourceId: 'mediapool', sourceName: 'Mediapool', publishedAt: '2026-10-20T12:00:00Z', tags: ['sofia'] });
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

function mockApi(articles: (url: URL) => Response | Promise<Response>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/sources/status')) return json({ items: [{ sourceId: 'mediapool', lastAttemptAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString() }] });
    if (url.pathname.endsWith('/sources')) return json({ items: [{ id: 'mediapool', name: 'Mediapool' }] });
    if (url.pathname.endsWith('/tags')) return json({ items: [{ id: 'sofia', name: 'София' }] });
    return articles(url);
  });
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('news feed', () => {
  it('renders the publisher article as a usable external link', async () => {
    mockApi(() => json({ items: [article('1', 'Новини от София')], nextCursor: null }));
    render(<NewsPage />);
    expect(await screen.findByRole('link', { name: 'Новини от София' })).toHaveAttribute('href', 'https://example.com/1');
    expect(screen.getByText('20 Oct 2026', { exact: false })).toBeInTheDocument();
    expect(await screen.findByText(/Last checked:/)).toHaveTextContent('Mediapool');
  });

  it('recovers from a failed request when the reader retries', async () => {
    let failed = true;
    mockApi(() => failed ? new Response('', { status: 503 }) : json({ items: [], nextCursor: null }));
    render(<NewsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load');
    failed = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No stories match these filters.')).toBeInTheDocument();
  });

  it('ignores a late response after a filter has changed', async () => {
    let finishOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => { finishOld = resolve; });
    mockApi((url) => url.searchParams.has('tag') ? json({ items: [article('2', 'Filtered story')], nextCursor: null }) : oldResponse);
    render(<NewsPage />);
    await screen.findByRole('option', { name: 'София' });
    await userEvent.selectOptions(screen.getByLabelText('Topic'), 'sofia');
    expect(await screen.findByRole('link', { name: 'Filtered story' })).toBeInTheDocument();
    await act(async () => { finishOld(json({ items: [article('1', 'Old story')], nextCursor: null })); });
    expect(screen.queryByRole('link', { name: 'Old story' })).not.toBeInTheDocument();
  });

  it('appends another page and resets the feed on filter changes', async () => {
    mockApi((url) => {
      if (url.searchParams.has('tag')) return json({ items: [article('3', 'Filtered story')], nextCursor: null });
      if (url.searchParams.has('cursor')) return json({ items: [article('2', 'Second story')], nextCursor: null });
      return json({ items: [article('1', 'First story')], nextCursor: 'next' });
    });
    render(<NewsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Load more stories' }));
    expect(await screen.findByRole('link', { name: 'Second story' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'First story' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Topic'), 'sofia');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'First story' })).not.toBeInTheDocument());
    expect(await screen.findByRole('link', { name: 'Filtered story' })).toBeInTheDocument();
  });

  it('submits a headline search, retains it on pagination, and clears it with filters', async () => {
    mockApi((url) => {
      if (url.searchParams.get('q') === 'София') {
        return url.searchParams.has('cursor')
          ? json({ items: [article('3', 'Втора новина за София')], nextCursor: null })
          : json({ items: [article('2', 'Новина за София')], nextCursor: 'searched-next' });
      }
      return json({ items: [article('1', 'All headlines')], nextCursor: null });
    });
    render(<NewsPage />);
    await screen.findByRole('link', { name: 'All headlines' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search headlines' }), 'София');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('link', { name: 'Новина за София' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'All headlines' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more stories' }));
    expect(await screen.findByRole('link', { name: 'Втора новина за София' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Clear filters/ }));
    expect(await screen.findByRole('link', { name: 'All headlines' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search headlines' })).toHaveValue('');
  });
});
