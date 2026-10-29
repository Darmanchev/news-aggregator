import { readConfig } from '../config.js';
import { connectDatabase, disconnectDatabase } from '../infrastructure/database.js';
import { collectSources } from '../modules/ingestion/ingestion.service.js';
import { sources } from '../modules/sources/sources.config.js';
import { runCollectionSchedule } from './collection-schedule.js';
import { readAlertConfig, sendCollectionAlerts } from './collection-alerts.js';
import { createQwenClassifier, readTaggingConfig, type TagClassifier } from '../modules/tagging/tagging.client.js';

const watch = process.argv.includes('--watch');
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());

try {
  await connectDatabase(readConfig().mongoUri);
  let classifier: TagClassifier | undefined;
  try {
    const config = readTaggingConfig();
    if (config) classifier = createQwenClassifier(config);
  } catch { console.error('AI tagging disabled: check QWEN_API_KEY and QWEN_BASE_URL.'); }
  let alertConfig: ReturnType<typeof readAlertConfig> = null;
  try { alertConfig = readAlertConfig(); } catch {
    console.error('Collection email alerts disabled: check RESEND_API_KEY, ALERT_EMAIL_FROM and ALERT_EMAIL_TO.');
  }
  const collect = async () => {
    const report = await collectSources(sources, { signal: controller.signal, classifier });
    console.log(JSON.stringify({ collectedAt: new Date().toISOString(), ...report }));
    if (report.failed.length && !watch) process.exitCode = 1;
    if (!controller.signal.aborted) await sendCollectionAlerts(sources, alertConfig);
  };
  if (watch) await runCollectionSchedule(collect, controller.signal);
  else await collect();
} catch (error) {
  console.error('Collection failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
