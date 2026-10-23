import { afterEach, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDatabase } from './helpers/test-database.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it.each([
  'mongodb://localhost/production',
  'mongodb://localhost/',
  'mongodb://localhost/production?dbName=bulgarian_news_test',
  'mongodb://localhost/my_test',
  'not-a-uri',
])('rejects a database outside the dedicated test allowlist before connecting: %s', async (uri) => {
  const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
  vi.stubEnv('TEST_MONGODB_URI', uri);
  await expect(connectTestDatabase()).rejects.toThrow('dedicated test database');
  expect(connect).not.toHaveBeenCalled();
});

it('pins the allowed database explicitly even if URI options try to override it', async () => {
  const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
  const uri = 'mongodb://localhost/bulgarian_news_test?dbName=production';
  vi.stubEnv('TEST_MONGODB_URI', uri);
  await connectTestDatabase();
  expect(connect).toHaveBeenCalledWith(uri, { dbName: 'bulgarian_news_test', serverSelectionTimeoutMS: 5000 });
});

it.each(['bulgarian_news_test', 'bulgarian_news_alerts_test'])('uses the dedicated default database %s', async (database) => {
  const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
  vi.stubEnv('TEST_MONGODB_URI', undefined);
  await connectTestDatabase(database);
  expect(connect).toHaveBeenCalledWith(`mongodb://127.0.0.1:27018/${database}`, { dbName: database, serverSelectionTimeoutMS: 5000 });
});
