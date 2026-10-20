import { createApp } from './app.js';
import { readConfig } from './config.js';
import { connectDatabase, disconnectDatabase } from './infrastructure/database.js';

try {
  const config = readConfig();
  await connectDatabase(config.mongoUri);
  const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
  const server = createApp().listen(config.port, host, () => { console.log(`News server: http://${host}:${config.port}`); });
  server.on('error', async (error) => {
    console.error('Server failed:', error.message);
    await disconnectDatabase();
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      const timeout = setTimeout(() => process.exit(1), 10_000).unref();
      server.close(() => { void disconnectDatabase().finally(() => clearTimeout(timeout)); });
    });
  }
} catch (error) {
  console.error('Startup failed:', error instanceof Error ? error.message : 'Unknown error');
  await disconnectDatabase();
  process.exitCode = 1;
}
