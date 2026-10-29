import { describe, expect, it, vi } from 'vitest';
import { createQwenClassifier, readTaggingConfig } from '../src/modules/tagging/tagging.client.js';

const config = { apiKey: 'fixture-key', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' };
const response = (tags: unknown, finish = 'stop') => new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content: JSON.stringify({ tags }) } }] }));

describe('optional Qwen tagging', () => {
  it('is disabled without credentials and rejects unsafe configuration', () => {
    expect(readTaggingConfig({})).toBeNull();
    expect(readTaggingConfig({ QWEN_API_KEY: 'key' })).toEqual({ ...config, apiKey: 'key' });
    for (const baseUrl of ['http://localhost', 'https://evil.example', 'https://user:pass@dashscope-intl.aliyuncs.com/compatible-mode/v1']) {
      expect(() => readTaggingConfig({ QWEN_API_KEY: 'key', QWEN_BASE_URL: baseUrl })).toThrow();
    }
  });

  it('requests non-thinking JSON and accepts only catalog topics', async () => {
    const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ model: 'qwen-flash', enable_thinking: false, response_format: { type: 'json_object' }, max_tokens: 256 });
      expect(body.messages[0].content).toContain('medtop:20001298');
      expect(body.messages[1].content).toContain('Изкуствен интелект');
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return response(['medtop:20001298']);
    });
    const classifier = createQwenClassifier(config, request);
    expect(await classifier.classify('Изкуствен интелект', 'Нов софтуер')).toEqual(['medtop:20001298']);
    expect(request.mock.calls[0]?.[0]).toBe('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');
  });

  it.each([['invented'], ['sofia'], ['medtop:20001298', 'medtop:20001298'], [5], 'politics', Array(6).fill('medtop:11000000')])('rejects invalid model tags %j', async (tags) => {
    await expect(createQwenClassifier(config, async () => response(tags)).classify('Title', '')).rejects.toThrow();
  });

  it('accepts and caches the meaning of no matching topics without inventing one', async () => {
    expect(await createQwenClassifier(config, async () => response([])).classify('Title', '')).toEqual([]);
  });

  it('rejects failed, malformed, oversized and truncated provider responses', async () => {
    for (const result of [new Response('secret-provider-error', { status: 429 }), new Response('not json'), response([], 'length'), new Response('x'.repeat(2_000_001))]) {
      await expect(createQwenClassifier(config, async () => result).classify('Title', '')).rejects.toThrow();
    }
  });

  it('bounds article input before sending it to the provider', async () => {
    const classify = createQwenClassifier(config, async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(JSON.parse(body.messages[1].content)).toEqual({ title: 'я'.repeat(500), excerpt: 'б'.repeat(500) });
      return response([]);
    });
    await classify.classify('я'.repeat(2000), 'б'.repeat(2000));
  });

  it('does not start an already cancelled paid request and aborts in-flight calls', async () => {
    const controller = new AbortController(); controller.abort();
    const request = vi.fn(async () => response([]));
    await expect(createQwenClassifier(config, request).classify('Title', '', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
    const next = new AbortController();
    const pending = createQwenClassifier(config, async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    })).classify('Title', '', next.signal);
    next.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('times out an unresponsive provider', async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController(); setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms); return controller.signal;
    });
    try {
      const pending = createQwenClassifier(config, async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      })).classify('Title', '');
      const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
      await vi.advanceTimersByTimeAsync(10_000); await assertion;
    } finally { timeout.mockRestore(); vi.useRealTimers(); }
  });
});
