import type { Source } from '../modules/sources/sources.config.js';
import { SourceStatus } from '../modules/sources/sources.model.js';

interface AlertConfig { apiKey: string; from: string; to: string }

export function readAlertConfig(env: NodeJS.ProcessEnv = process.env): AlertConfig | null {
  const { RESEND_API_KEY: apiKey, ALERT_EMAIL_FROM: from, ALERT_EMAIL_TO: to } = env;
  if (apiKey === undefined && from === undefined && to === undefined) return null;
  const email = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;
  if (!apiKey || !/^[!-~]+$/.test(apiKey) || !from || !email.test(from) || !to || !email.test(to)) {
    throw new Error('Set RESEND_API_KEY, ALERT_EMAIL_FROM and ALERT_EMAIL_TO together; use valid plain email addresses.');
  }
  return { apiKey, from, to };
}

export async function sendCollectionAlerts(enabledSources: Source[], config: AlertConfig | null, now = new Date(), request = fetch) {
  if (!config) return;
  try {
    const outages = await SourceStatus.find({
      _id: { $in: enabledSources.map(({ id }) => id) },
      firstFailureAt: { $ne: null, $lte: new Date(now.getTime() - 15 * 60_000) },
      lastAlertAt: null,
    }).maxTimeMS(5000).lean();
    for (const outage of outages) {
      try {
        const firstFailureAt = outage.firstFailureAt!;
        const response = await request('https://api.resend.com/emails', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json',
            'Idempotency-Key': `collection-alert/${outage._id}/${firstFailureAt.toISOString()}`,
          },
          body: JSON.stringify({
            from: config.from, to: [config.to], subject: `News collection failed: ${outage._id}`,
            text: `Source ${outage._id} has failed collection since ${firstFailureAt.toISOString()} (at least 15 minutes). Check the collector logs and RSS feed.`,
          }),
        });
        if (!response.ok) throw new Error('Email delivery rejected');
        await SourceStatus.updateOne({ _id: outage._id, firstFailureAt, lastAlertAt: null }, { $set: { lastAlertAt: now } });
      } catch {
        console.error(`Collection alert delivery failed for ${outage._id}; retrying next collection.`);
      }
    }
  } catch {
    console.error('Collection alerts could not read source status; retrying next collection.');
  }
}
