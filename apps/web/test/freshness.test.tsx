// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { SourceFreshness } from '../src/features/news/SourceFreshness';

const now = new Date('2026-10-21T12:00:00Z');
const sources = [{ id: 'mediapool', name: 'Mediapool' }, { id: 'other', name: 'Other' }];
function mockStatus(lastAttemptAt: string | null, lastSuccessAt: string | null) {
  vi.spyOn(Date, 'now').mockReturnValue(now.getTime());
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ items: [
    { sourceId: 'mediapool', lastAttemptAt, lastSuccessAt },
    { sourceId: 'other', lastAttemptAt: null, lastSuccessAt: null },
  ] })));
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('shows a recent successful check and limits status to the selected source', async () => {
  mockStatus('2026-10-21T11:55:00Z', '2026-10-21T11:55:00Z');
  render(<SourceFreshness sources={sources} source="mediapool" />);
  expect(await screen.findByText(/Last checked:/)).toHaveTextContent('Mediapool');
  expect(screen.getByText(/Last successful check:/)).toBeInTheDocument();
  expect(screen.queryByText(/Other/)).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('warns at 15 minutes without success even if a recent attempt failed', async () => {
  mockStatus('2026-10-21T11:59:00Z', '2026-10-21T11:45:00Z');
  render(<SourceFreshness sources={sources} source="mediapool" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Headlines may be out of date');
});

it('distinguishes a source never checked from one that has never succeeded', async () => {
  mockStatus('2026-10-21T11:59:00Z', null);
  render(<SourceFreshness sources={sources} source="" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No successful check yet');
  expect(screen.getByText(/Not checked yet/)).toHaveTextContent('Other');
});

it('keeps the feed usable when status cannot be loaded', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
  render(<SourceFreshness sources={sources} source="" />);
  expect(await screen.findByRole('status')).toHaveTextContent('Collection status is unavailable');
});

it('updates the warning as an open page ages and stops polling on unmount', async () => {
  const fetchMock = mockStatus('2026-10-21T11:46:00Z', '2026-10-21T11:46:00Z');
  const view = render(<SourceFreshness sources={sources} source="mediapool" />);
  await screen.findByText(/Last checked:/);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  vi.useFakeTimers();
  // Remount so the polling interval is controlled by the fake clock.
  view.unmount();
  const next = render(<SourceFreshness sources={sources} source="mediapool" />);
  await act(async () => {});
  vi.spyOn(Date, 'now').mockReturnValue(now.getTime() + 60_000);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(screen.getByRole('alert')).toHaveTextContent('Headlines may be out of date');
  next.unmount();
  const calls = fetchMock.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
  expect(fetchMock).toHaveBeenCalledTimes(calls);
});

it('recovers on the next poll and ignores a late response from an aborted check', async () => {
  const fetchMock = mockStatus('2026-10-21T11:59:00Z', '2026-10-21T11:59:00Z');
  fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
  vi.useFakeTimers();
  render(<SourceFreshness sources={sources} source="mediapool" />);
  await act(async () => {});
  expect(screen.getByRole('status')).toHaveTextContent('Collection status is unavailable');
  let finishOld!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finishOld = resolve; }));
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  const oldSignal = fetchMock.mock.calls.at(-1)?.[1]?.signal;
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(oldSignal?.aborted).toBe(true);
  expect(screen.getByText(/Last successful check:/)).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  await act(async () => { finishOld(new Response('', { status: 503 })); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
