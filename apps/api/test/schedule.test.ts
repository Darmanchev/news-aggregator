import { afterEach, expect, it, vi } from 'vitest';
import { runCollectionSchedule } from '../src/jobs/collection-schedule.js';

afterEach(() => { vi.useRealTimers(); });

it('collects immediately, waits five minutes, and stops on shutdown', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let count = 0;
  const running = runCollectionSchedule(async () => { count++; }, controller.signal);
  await vi.advanceTimersByTimeAsync(0);
  expect(count).toBe(1);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(count).toBe(2);
  controller.abort();
  await running;
  expect(vi.getTimerCount()).toBe(0);
});

it('does not overlap a slow collection with the next run', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let finish!: () => void;
  let count = 0;
  const running = runCollectionSchedule(async () => {
    count++;
    await new Promise<void>((resolve) => { finish = resolve; });
  }, controller.signal);
  await vi.advanceTimersByTimeAsync(600_000);
  expect(count).toBe(1);
  controller.abort();
  finish();
  await running;
  expect(vi.getTimerCount()).toBe(0);
});
