import { readConfig } from '../config.js';
import { connectDatabase, disconnectDatabase } from '../infrastructure/database.js';
import { createQwenClassifier, readTaggingConfig } from '../modules/tagging/tagging.client.js';
import { backfillTags } from '../modules/tagging/tagging.backfill.js';

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !/^--limit=\d+$/.test(args[0]))) throw new Error('Use --limit=1 through --limit=1000 (default 100).');
  const limit = args[0] ? Number(args[0].slice('--limit='.length)) : 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Use a limit from 1 to 1000.');
  const config = readTaggingConfig();
  if (!config) throw new Error('Configure QWEN_API_KEY before running a paid tags backfill.');
  await connectDatabase(readConfig().mongoUri);
  const report = await backfillTags(createQwenClassifier(config), limit, controller.signal);
  console.log(JSON.stringify({ tags: report }));
  if (report.failed) process.exitCode = 1;
} catch (error) {
  if (!controller.signal.aborted) {
    console.error(error instanceof Error ? error.message : 'Tag backfill failed.');
    process.exitCode = 1;
  }
} finally { await disconnectDatabase(); }
