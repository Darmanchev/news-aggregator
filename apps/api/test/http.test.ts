import { describe, expect, it, vi } from 'vitest';
import { readBoundedResponse } from '../src/infrastructure/http.js';

describe('bounded HTTP response reader', () => {
  it('decodes UTF-8 characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('София');
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 1));
        controller.enqueue(bytes.slice(1));
        controller.close();
      },
    }));
    expect(await readBoundedResponse(response)).toBe('София');
  });

  it('accepts exactly 2 MB and cancels a stream exceeding the limit across chunks', async () => {
    expect(await readBoundedResponse(new Response('x'.repeat(2_000_000)))).toHaveLength(2_000_000);
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1_000_000));
        controller.enqueue(new Uint8Array(1_000_001));
      },
      cancel,
    }));
    await expect(readBoundedResponse(response)).rejects.toThrow('Response is too large');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects a missing body and propagates stream failures', async () => {
    await expect(readBoundedResponse(new Response(null))).rejects.toThrow('Response is empty');
    const response = new Response(new ReadableStream({
      start(controller) { controller.error(new Error('Connection lost')); },
    }));
    await expect(readBoundedResponse(response)).rejects.toThrow('Connection lost');
  });
});
