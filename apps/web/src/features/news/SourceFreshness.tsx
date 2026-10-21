import { useEffect, useState } from 'react';
import { fetchSourceStatuses, type Option, type SourceStatus } from './news.api';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Sofia',
});

export function SourceFreshness({ sources, source }: { sources: Option[]; source: string }) {
  const [statuses, setStatuses] = useState<SourceStatus[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let controller: AbortController;
    function refresh() {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      setNow(Date.now());
      void fetchSourceStatuses(signal).then(({ items }) => {
        if (signal.aborted) return;
        setStatuses(items);
        setUnavailable(false);
      }).catch(() => { if (!signal.aborted) setUnavailable(true); });
    }
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, []);

  if (unavailable) return <p className="muted" role="status">Collection status is unavailable. Stored headlines remain readable.</p>;
  return <div className="collection-freshness">
    {sources.filter(({ id }) => !source || id === source).map(({ id, name }) => {
      const status = statuses.find(({ sourceId }) => sourceId === id);
      if (!status) return null;
      if (!status.lastAttemptAt) return <p className="muted" key={id}>{name} · Not checked yet.</p>;
      const stale = status.lastSuccessAt && now - Date.parse(status.lastSuccessAt) >= 15 * 60_000;
      return <div key={id}>
        <p className="muted">{name} · Last checked: <time dateTime={status.lastAttemptAt}>{dateFormat.format(new Date(status.lastAttemptAt))}</time> (Sofia)</p>
        {status.lastSuccessAt && <p className="muted">Last successful check: <time dateTime={status.lastSuccessAt}>{dateFormat.format(new Date(status.lastSuccessAt))}</time> (Sofia)</p>}
        {(!status.lastSuccessAt || stale) && <p className="notice" role="alert">{name}: {stale ? 'No successful check for 15 minutes.' : 'No successful check yet.'} Headlines may be out of date.</p>}
      </div>;
    })}
  </div>;
}
