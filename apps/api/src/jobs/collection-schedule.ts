export async function runCollectionSchedule(collect: () => Promise<void>, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    await collect();
    if (signal.aborted) break;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, 300_000);
      function done() {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      }
      signal.addEventListener('abort', done, { once: true });
    });
  }
}
