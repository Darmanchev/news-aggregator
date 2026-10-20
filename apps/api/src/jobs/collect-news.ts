import { readConfig } from '../config.js';
import { connectDatabase, disconnectDatabase } from '../infrastructure/database.js';
import { collectSources } from '../modules/ingestion/ingestion.service.js';
import { sources } from '../modules/sources/sources.config.js';
import { runCollectionSchedule } from './collection-schedule.js';

const watch = process.argv.includes('--watch');
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());

try {
  await connectDatabase(readConfig().mongoUri);
  const collect = async () => {
    const report = await collectSources(sources);
    console.log(JSON.stringify({ collectedAt: new Date().toISOString(), ...report }));
    if (report.failed.length && !watch) process.exitCode = 1;
  };
  if (watch) await runCollectionSchedule(collect, controller.signal);
  else await collect();
} catch (error) {
  console.error('Collection failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
