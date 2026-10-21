# The Bulgarian Brief

A working Bulgarian news aggregator built with MongoDB, Express, React, Node.js, and TypeScript. It collects real publisher headlines through RSS, stores them, assigns keyword tags, and links readers to the original articles.

## Run locally

Requires Node.js **22.22.2+** on the Node 22 line (or Node 24.15+ / 26+), npm, and Docker with Compose. This floor includes the UI test dependencies. Docker must be running. You can also use an existing MongoDB deployment by changing `MONGODB_URI`.

```sh
npm ci
cp .env.example .env
npm run db:up
npm run dev
```

Open **http://localhost:5173**. The API runs at **http://127.0.0.1:3000**. Development starts the frontend, API, and a separate collector process. The collector runs immediately, then waits five minutes after each completed run before collecting again. Refresh the website to see newly collected articles. Stop the processes with Ctrl+C.

To collect once manually:

```sh
npm run collect
```

If the first page is empty, wait for the collection log, then click **Refresh news**. Feed failures are logged; existing articles remain readable. Run only one scheduled collector per deployment. Each collector avoids overlapping its own runs; the database unique index prevents duplicate article identities.

`npm run db:down` stops MongoDB and preserves its named data volume. Port **27018** is bound to localhost only. This Compose setup is for local development and does not configure database authentication. Use authenticated, private database access in production.

MongoDB 7 is used locally because MongoDB 8 refused startup on the current Docker kernel (SERVER-121912). Do not bypass MongoDB's compatibility checks. Choose a supported database/kernel combination for deployment.

## What is included

- Real RSS ingestion from Mediapool, Вестник Телеграф, OFFNews, and Дневник.
- Publisher photo cards for all four sources, with available author credits, short excerpts, lazy loading, and a text fallback.
- Persistent articles ordered by publication time, with stable cursor pagination.
- Source and topic filters, literal headline search, keyword tags, and original publisher links.
- Responsive frontend with loading, empty, failure/retry, and load-more states.
- Duplicate prevention, request timeout, a 2 MB feed limit, and validation of feed entries and API queries.
- Separate web and collection processes; JSON collection logs and database readiness endpoint.
- Per-source collection timestamps and a warning after 15 minutes without a successful check.
- A new-stories notice checked every minute; loaded pages stay in place until the reader chooses to refresh.
- Optional email alerts after 15 minutes of continued source failure, with one message per outage.

No subscription or API key is required for the enabled news feeds. There are no AI dependencies, reader accounts, advertising, or stored full articles. Missing RSS photos are looked up in the original publisher page’s preview metadata. Publisher reuse conditions still apply; see below.

## Project layout

```text
apps/
  api/src/
    modules/
      articles/       Article model, queries, validation, routes, controller
      sources/        Trusted feeds, source status, and public source list
      ingestion/      RSS network boundary, normalization, import orchestration
      tagging/        Bulgarian keyword rules and matching
    infrastructure/   MongoDB connection lifecycle
    middleware/       Consistent HTTP errors
    jobs/             One-shot collection and five-minute schedule
    app.ts            HTTP composition and production static hosting
    server.ts         Startup and shutdown
  web/src/
    features/news/    News page, cards, filters, API client and public types
    app/              React entry component
```

The backend accesses MongoDB; the browser accesses only `/api`. Controllers handle HTTP, services implement behavior, and the RSS client handles external feed requests. The collector uses the articles service rather than duplicating persistence logic. Both processes use the same backend package and database; no network communication between services is required.

## Sources and content rights

Enabled sources:

- [Mediapool RSS](https://www.mediapool.bg/feed/): its [published terms, section III.3](https://www.mediapool.bg/terms/) permit RSS aggregation. Checked on 20 October 2026.
- [Telegraph RSS](https://telegraph.bg/rss): [terms section 9.3, page 10](https://telegraph.bg/telegraph.pdf?v=2023) permit display of titles supplied through RSS with clear attribution and original links. The source name is **Вестник Телеграф** as required. Original pages open without frames; no derivative RSS feed is provided. Terms and feed checked on 21 October 2026.

- [OFFNews RSS](https://offnews.bg/rss/): [OFFMedia terms VI.2](https://id.offmedia.bg/terms2018.html) permit website aggregation of RSS titles, authors, photos and the first 500 text characters. The collector uses `https://feed.offnews.bg/rss/all`; photo cards show the supplied author, a plain-text feed excerpt of at most 500 characters, source name, and original article link. Terms and a 70-item feed checked on 21 October 2026.

- [Дневник RSS](https://www.dnevnik.bg/rss/): [Economedia terms III.3](https://www.economedia.bg/show.php?guid=550170&lang=bg) explicitly permit website aggregation of RSS content, including feed photos accompanied by the title, feed excerpt (up to 500 characters) and author. Checked on 21 October 2026: 30 feed entries. Photos are supplied in RSS HTML on `img.dnevnik.bg`; the collector uses that supplied image before trying original-page metadata.

This application displays headlines, metadata, and approved feed previews, not full articles. It rejects titles longer than 500 characters rather than shortening publisher headlines. Telegraph's feed omits timezone offsets, so those articles use their first collection time for ordering/display rather than a guessed publication time. That date stays stable on subsequent collections. First-run Telegraph items therefore share a fallback timestamp; their order within that timestamp uses the normal ID tie-breaker.

Live checks also found a functioning BNT feed. BNT remains **disabled** because aggregation permission was not confirmed. Public access alone does not establish reuse permission.

To add a source, verify its current terms, feed URL, and request guidance, then add `{ id, name, feedUrl }` in `apps/api/src/modules/sources/sources.config.ts`. Restart the API and collector. Feed URLs must be trusted public HTTPS addresses; redirects are intentionally rejected. Never accept user-submitted feed URLs. The source list controls which stored articles are exposed by the API.

Mediapool returned 10 recent items during its initial verification; Telegraph returned 50 during its latest feed check, and OFFNews returned 70. RSS feeds are recent-item windows, not complete archives; a prolonged outage can cause missed stories. No publisher uptime or unlimited request quota is assumed.

## Photo previews

The collector first uses the publisher’s RSS image: OFFNews enclosures, Дневник embedded images, and Telegraph’s `image/jpg` enclosures. If RSS supplies no usable preview, it reads the original article’s Open Graph/Twitter image and description metadata. Mediapool currently needs this fallback. Authors and excerpts are retained when supplied; neither is invented when missing. Excerpts are plain text and limited to 500 characters.

Requests are sequential, limited to 10 seconds and 2 MB per article page, and follow at most three redirects after validating every destination against the publisher host list. Only the configured publisher’s exact HTTPS hosts may be requested. Image URLs must match the source’s configured HTTPS image hosts; the browser policy uses the same list. Full article text is not stored. Image files load directly from the publisher without a referrer; they are not downloaded or cached by the server.

Existing valid previews are reused when RSS omits them, avoiding repeat page requests every five minutes. Metadata failures do not stop headline collection. Missing previews are retried during later collections. A publisher may omit a photo, block hotlinking, or remove an image; those cards retain a readable fallback. Saved image URLs are not continuously checked for availability.

To refresh photos for older stored stories, run once from the project root:

```sh
npm run photos:backfill
```

This first collects the latest RSS entries, then checks older records without previews. It updates only photo metadata, preserves article identities and dates, and reports added/unavailable/failed counts. It does not send email alerts. Restart the running collector after updating its code; refresh the browser after collection. The development API reloads automatically; a production API must be restarted to apply the updated image policy.

Mediapool, OFFNews and Economedia publish RSS photo reuse conditions requiring attribution and accompanying excerpts. Mediapool’s metadata fallback extends beyond the RSS fields originally implemented. Telegraph’s checked RSS terms explicitly cover titles/paragraphs; photo reuse permission remains unconfirmed. Enabling a supplied image technically does not establish publication rights: confirm applicable permissions before public reuse.

Additional publishers checked but not enabled: News.bg, Money.bg, Topsport.bg, Lifestyle.bg, Investor and Dnes have noncommercial-only RSS terms or require written aggregation permission. RuseMedia's advertised feed returns HTTP 500. Publicly accessible feeds/photos alone are not treated as reuse permission.

## Tagging and article identity

Edit `apps/api/src/modules/tagging/tagging.rules.ts` to change approved tags and Bulgarian keywords. Matching respects Unicode word boundaries and ignores case. The dictionary includes common definite forms and plurals such as “парламентът”, “министри”, “бюджета”, and “изложбите”, plus narrow phrases. It does not understand unlisted inflections, context, or negation. Existing article tags update the next time that article appears in a collected feed.

Article identity is `(sourceId, externalId)`, using the feed GUID or URL. Only `utm_*` tracking parameters and URL fragments are removed. First-seen time and the initial publication/fallback date are preserved on subsequent imports; titles, URLs, and tags can update. Articles from different publishers about the same event remain separate.

## API

| Endpoint | Response |
| --- | --- |
| `GET /api/health` | 200 when MongoDB is connected; otherwise 503 |
| `GET /api/sources` | `{ items: [{ id, name }] }` |
| `GET /api/sources/status` | `{ items: [{ sourceId, lastAttemptAt, lastSuccessAt }] }` |
| `GET /api/tags` | `{ items: [{ id, name }] }` |
| `GET /api/articles` | `{ items: [...], nextCursor: string \| null }` |

Articles accept optional `source`, `tag`, `q`, `cursor`, and `limit` query parameters. The default page size is 20 and maximum is 50. Pass `nextCursor` back unchanged for the next page. Invalid or unknown parameters return 400. API errors use `{ error: { code, message } }`. Article responses include `id`, `title`, `url`, `publishedAt`, `tags`, `sourceId`, `sourceName`, and `preview`. A preview is either `null` or `{ imageUrl, author, excerpt }`. Older stored articles remain readable without previews.

`q` searches titles by literal, case-insensitive substring, including Cyrillic. It is limited to 100 characters; control characters and repeated query parameters are rejected. Blank search acts like no search. Punctuation is treated literally rather than as a regular expression. Source, topic, search, and cursor can be combined. The page submits search on Enter or the Search button, and resets pagination when filters change. Search scans stored titles with the existing query timeout; add a search index if measured latency warrants it.

While a feed is open, the browser checks for newer matching headlines every minute using the active source/topic/search. A sticky “New stories available” button appears when the newest `(publishedAt, id)` exceeds the displayed first story; it does not replace articles or reset loaded pages automatically. Clicking the button loads the latest first page. Older backfilled stories do not trigger this notice. Polling failures leave the readable feed unchanged.

Collection timestamps are ISO strings, or `null` before the first attempt/success. Each source's attempt is saved before fetching; success is saved only after its feed has been fetched and its valid entries saved, including an empty feed. Failed checks preserve the previous success timestamp. Timestamps identify the start of that collection run, rather than article publication times. Status includes enabled sources only; it does not expose feed URLs or internal errors.

The page checks collection status every minute and shows times in Europe/Sofia. It warns when the last success is at least 15 minutes old, or when a source has been attempted but never succeeded. A source without any attempts shows “Not checked yet.” A stopped collector therefore becomes stale even without a recorded failure. Status requests do not fetch publishers or refresh the article list. Restart both the API and worker after updating; existing articles require no migration, and status appears after the updated collector first runs.

## Checks

```sh
npm run db:up
npm test
npm run typecheck
npm run build
```

Integration tests use **`bulgarian_news_test`**, separate from the application's database. Tests use local feed fixtures and real MongoDB; they never contact publishers. `TEST_MONGODB_URI` can select another **dedicated test database**. Test setup removes its fixture records; never point it at a database containing data you need.

UI tests check original links, search, new-story notices, retries, pagination resets, and stale request handling. Backend tests cover Cyrillic tagging, normalization, unsafe URLs, feed size and HTTP failures, unique upserts, preserved dates, partial source failures, API validation, and equal-date pagination. Schedule tests cover timing, shutdown, and avoiding overlap. Email tests use a stub transport and fixture records only; no real email is sent.

## Collection email alerts

Alerts are disabled unless all three settings are supplied in the root `.env` or the worker environment:

```dotenv
RESEND_API_KEY=your-resend-api-key
ALERT_EMAIL_FROM=news@your-domain.example
ALERT_EMAIL_TO=you@example.com
```

Use a sender authorized in your [Resend account](https://resend.com/docs/api-reference/emails/send-email), and plain single email addresses without display names. Do not commit credentials. No account or sender domain is created by this project. Incomplete or invalid settings disable alerts with a log message while collection continues.

Restart the collector after changing settings. It records the first failed attempt and sends an alert once failures have continued for at least 15 minutes. A successful collection resets that outage. The delivered marker is stored in MongoDB to avoid repeated messages across worker restarts; unsuccessful delivery is retried after the next collection. Provider requests have a 10-second timeout and a stable idempotency key and payload per outage. No external alert request occurs when configuration is absent.

Email alerts require the worker and MongoDB to remain available. They cannot detect a stopped worker or a database outage; use an external uptime check/process supervisor for those cases. If an email is accepted but its database delivery marker is lost, a retry beyond the provider's 24-hour idempotency window can duplicate the alert. Provider availability, sender verification, and delivery limits still apply.

## Production

Build and run the web server and collector as **two separately supervised processes** from the project root:

```sh
npm ci
npm run build
NODE_ENV=production npm start
```

In a second process:

```sh
NODE_ENV=production npm run worker
```

Express serves the compiled React frontend and `/api` on the same port (default 3000). Set `MONGODB_URI` and `PORT` through the environment or root `.env`. Put the service behind an HTTPS reverse proxy. Use a process supervisor or hosting service to restart failed processes, and keep credentials out of Git.

Alternatively, use `npm run collect:prod` from a scheduler every five minutes instead of running the worker. On Linux, this example prevents overlapping cron executions (replace paths and ensure Node is at the specified location):

```cron
*/5 * * * * cd /srv/bulgarian-news && /usr/bin/flock -n /tmp/bulgarian-news-collector.lock /usr/bin/node --env-file-if-exists=.env apps/api/dist/jobs/collect-news.js >> /var/log/bulgarian-news-collector.log 2>&1
```

Do not run cron and the continuous worker together. One-shot collection exits nonzero if any source fails. The worker logs a failed source and tries again on the next scheduled run. A fatal database startup failure exits nonzero and should trigger the process supervisor.

Before public launch, configure authenticated database access, backups, HTTPS, log rotation, and alerts on collection failures and stale collection timestamps. Verify restore procedures and monitor database growth; this version retains all collected metadata. `/api/health` checks database connectivity, not publisher freshness. Hosting and database service charges depend on your chosen provider. No cloud resources, accounts, cron entries, or public deployment were created by this project.

Architecture and implementation notes are in `docs/superpowers/`.
