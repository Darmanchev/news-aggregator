import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { collectSources } from '../src/modules/ingestion/ingestion.service.js';
import { SourceStatus } from '../src/modules/sources/sources.model.js';
import { readAlertConfig, sendCollectionAlerts } from '../src/jobs/collection-alerts.js';
import { connectTestDatabase } from './helpers/test-database.js';

const source = { id: 'alert-fixture', name: 'Alert fixture', feedUrl: 'https://example.com/feed' };
const start = new Date('2026-10-20T12:00:00Z');
const threshold = new Date('2026-10-20T12:15:00Z');
const env = { RESEND_API_KEY: 'test-secret', ALERT_EMAIL_FROM: 'news@example.com', ALERT_EMAIL_TO: 'owner@example.com' };
const config = { apiKey: 'test-secret', from: 'news@example.com', to: 'owner@example.com' };
const failedFeed = async () => { throw new Error('Feed unavailable'); };

describe('collection failure alerts', () => {
  beforeAll(async () => {
    await connectTestDatabase('bulgarian_news_alerts_test');
    await SourceStatus.init();
  });
  beforeEach(async () => { await SourceStatus.deleteMany({}); });
  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => { await mongoose.disconnect(); });

  it('starts an outage once, preserves last success, and resets it after recovery', async () => {
    await collectSources([source], { now: start, loadFeed: async () => ({ items: [] }) });
    const firstFailure = new Date('2026-10-20T12:05:00Z');
    await collectSources([source], { now: firstFailure, loadFeed: failedFeed });
    await collectSources([source], { now: threshold, loadFeed: failedFeed });
    expect(await SourceStatus.findById(source.id).lean()).toMatchObject({ firstFailureAt: firstFailure, lastSuccessAt: start });
    await SourceStatus.updateOne({ _id: source.id }, { $set: { lastAlertAt: threshold } });
    await collectSources([source], { now: threshold, loadFeed: async () => ({ items: [] }) });
    expect(await SourceStatus.findById(source.id).lean()).toMatchObject({ firstFailureAt: null, lastAlertAt: null, lastSuccessAt: threshold });
    await collectSources([source], { now: new Date('2026-10-20T12:20:00Z'), loadFeed: failedFeed });
    expect(await SourceStatus.findById(source.id).lean()).toMatchObject({ firstFailureAt: new Date('2026-10-20T12:20:00Z') });
  });

  it('sends at 15 minutes, keeps durable deduplication, and skips disabled sources', async () => {
    await collectSources([source, { ...source, id: 'disabled' }], { now: start, loadFeed: failedFeed });
    const requests: { url: unknown; init: RequestInit | undefined }[] = [];
    const transport: typeof fetch = async (url, init) => { requests.push({ url, init }); return new Response('{"id":"email-id"}'); };
    await sendCollectionAlerts([source], config, new Date('2026-10-20T12:14:59.999Z'), transport);
    expect(requests).toHaveLength(0);
    await sendCollectionAlerts([source], config, threshold, transport);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://api.resend.com/emails');
    expect(requests[0]?.init).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json', 'Idempotency-Key': 'collection-alert/alert-fixture/2026-10-20T12:00:00.000Z' } });
    expect(requests[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(requests[0]?.init?.body as string)).toMatchObject({ from: config.from, to: [config.to], subject: expect.stringContaining(source.id), text: expect.stringContaining(start.toISOString()) });
    expect(await SourceStatus.findById(source.id).lean()).toMatchObject({ lastAlertAt: threshold });
    await mongoose.disconnect();
    await connectTestDatabase('bulgarian_news_alerts_test');
    await sendCollectionAlerts([source], config, new Date('2026-10-21T12:15:00Z'), transport);
    expect(requests).toHaveLength(1);
    expect(await SourceStatus.findById('disabled').lean()).toMatchObject({ lastAlertAt: null });
  });

  it('retries unsuccessful delivery with the same key and payload without leaking provider errors', async () => {
    await collectSources([source], { now: start, loadFeed: failedFeed });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const requests: RequestInit[] = [];
    const transport: typeof fetch = async (_url, init) => { requests.push(init!); if (requests.length === 1) throw new Error('secret transport details'); return new Response('', { status: requests.length === 2 ? 503 : 200 }); };
    await sendCollectionAlerts([source], config, threshold, transport);
    expect(await SourceStatus.findById(source.id).lean()).toMatchObject({ lastAlertAt: null });
    await sendCollectionAlerts([source], config, new Date('2026-10-20T12:20:00Z'), transport);
    expect(await SourceStatus.findById(source.id).lean()).toMatchObject({ lastAlertAt: null });
    await sendCollectionAlerts([source], config, new Date('2026-10-20T12:25:00Z'), transport);
    expect(await SourceStatus.findById(source.id).lean()).toMatchObject({ lastAlertAt: new Date('2026-10-20T12:25:00Z') });
    expect(requests[0]?.body).toBe(requests[1]?.body);
    expect(requests[1]?.body).toBe(requests[2]?.body);
    expect(requests[0]?.headers).toEqual(requests[2]?.headers);
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret transport details');
  });

  it('retries an accepted email after marker persistence fails using the identical request', async () => {
    await collectSources([source], { now: start, loadFeed: failedFeed });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const requests: RequestInit[] = [];
    const transport: typeof fetch = async (_url, init) => { requests.push(init!); return new Response('{"id":"same-email"}'); };
    vi.spyOn(SourceStatus, 'updateOne').mockImplementationOnce(() => { throw new Error('DB unavailable'); });
    await sendCollectionAlerts([source], config, threshold, transport);
    expect(await SourceStatus.findById(source.id).lean()).toMatchObject({ lastAlertAt: null });
    await sendCollectionAlerts([source], config, new Date('2026-10-20T12:20:00Z'), transport);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.body).toEqual(requests[1]?.body);
    expect(requests[0]?.headers).toEqual(requests[1]?.headers);
    expect(await SourceStatus.findById(source.id).lean()).toMatchObject({ lastAlertAt: new Date('2026-10-20T12:20:00Z') });
  });

  it('continues to the next source when failure status cannot be persisted', async () => {
    vi.spyOn(SourceStatus, 'updateOne').mockImplementationOnce(() => { throw new Error('DB unavailable'); }).mockImplementationOnce(() => { throw new Error('DB unavailable'); });
    const report = await collectSources([{ ...source, id: 'broken' }, source], { now: start, loadFeed: async () => ({ items: [] }) });
    expect(report.failed).toEqual([{ sourceId: 'broken', message: 'DB unavailable' }]);
    expect(await SourceStatus.findById(source.id).lean()).toMatchObject({ lastSuccessAt: start });
  });

  it('contains alert status database failures and performs no network calls when disabled', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = vi.fn<typeof fetch>();
    await sendCollectionAlerts([source], null, threshold, transport);
    expect(transport).not.toHaveBeenCalled();
    vi.spyOn(SourceStatus, 'find').mockImplementationOnce(() => { throw new Error('secret DB details'); });
    await expect(sendCollectionAlerts([source], config, threshold, transport)).resolves.toBeUndefined();
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret DB details');
  });
});

describe('alert configuration', () => {
  it('disables alerts when all settings are absent and accepts a complete configuration', () => {
    expect(readAlertConfig({})).toBeNull();
    expect(readAlertConfig(env)).toEqual(config);
  });
  it.each([
    { RESEND_API_KEY: 'secret' },
    { ...env, RESEND_API_KEY: '' },
    { ...env, ALERT_EMAIL_FROM: 'invalid' },
    { ...env, ALERT_EMAIL_TO: 'a@example.com,b@example.com' },
    { ...env, RESEND_API_KEY: 'secret\nheader' },
    { ...env, ALERT_EMAIL_FROM: 'news@example.com\r\nBcc:other@example.com' },
  ])('rejects incomplete or invalid configuration without exposing values', (input) => {
    expect(() => readAlertConfig(input)).toThrow(/RESEND_API_KEY.*ALERT_EMAIL_FROM.*ALERT_EMAIL_TO/);
    try { readAlertConfig(input); } catch (error) { expect(String(error)).not.toContain('secret'); }
  });
});
