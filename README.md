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

- Real RSS ingestion from Mediapool.
- Persistent articles ordered by publication time, with stable cursor pagination.
- Source and topic filters, keyword tags, and original publisher links.
- Responsive frontend with loading, empty, failure/retry, and load-more states.
- Duplicate prevention, request timeout, a 2 MB feed limit, and validation of feed entries and API queries.
- Separate web and collection processes; JSON collection logs and database readiness endpoint.

No subscription or API key is required for the enabled news source. There are no AI dependencies, accounts, advertising, full-article scraping, or image republication.

## Project layout

```text
apps/
  api/src/
    modules/
      articles/       Article model, queries, validation, routes, controller
      sources/        Trusted feed configuration and public source list
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

The only enabled source is [Mediapool RSS](https://www.mediapool.bg/feed/). Its [published terms, section III.3](https://www.mediapool.bg/terms/) explicitly permit aggregation of RSS content on other websites. Checked on 20 October 2026. This application stores headlines and metadata, not full articles or photos, and links to the original publisher.

Live checks also found functioning BNT and Dnevnik feeds. They are **not enabled** because commercial aggregation terms were not confirmed. Public access alone does not establish reuse permission.

To add a source, verify its current terms, feed URL, and request guidance, then add `{ id, name, feedUrl }` in `apps/api/src/modules/sources/sources.config.ts`. Restart the API and collector. Feed URLs must be trusted public HTTPS addresses; redirects are intentionally rejected. Never accept user-submitted feed URLs. The source list controls which stored articles are exposed by the API.

Mediapool returned 10 recent items during verification. RSS feeds are recent-item windows, not complete archives; a prolonged outage can cause missed stories. No publisher uptime or unlimited request quota is assumed.

## Tagging and article identity

Edit `apps/api/src/modules/tagging/tagging.rules.ts` to change approved tags and Bulgarian keywords. Matching respects Unicode word boundaries and ignores case. It does not understand every inflection, context, or negation. Existing article tags update the next time that article appears in a collected feed.

Article identity is `(sourceId, externalId)`, using the feed GUID or URL. Only `utm_*` tracking parameters and URL fragments are removed. First-seen time and the initial publication/fallback date are preserved on subsequent imports; titles, URLs, and tags can update. Articles from different publishers about the same event remain separate.

## API

| Endpoint | Response |
| --- | --- |
| `GET /api/health` | 200 when MongoDB is connected; otherwise 503 |
| `GET /api/sources` | `{ items: [{ id, name }] }` |
| `GET /api/tags` | `{ items: [{ id, name }] }` |
| `GET /api/articles` | `{ items: [...], nextCursor: string \| null }` |

Articles accept optional `source`, `tag`, `cursor`, and `limit` query parameters. The default page size is 20 and maximum is 50. Pass `nextCursor` back unchanged for the next page. Invalid or unknown parameters return 400. API errors use `{ error: { code, message } }`. Article responses include `id`, `title`, `url`, `publishedAt`, `tags`, `sourceId`, and `sourceName`.

## Checks

```sh
npm run db:up
npm test
npm run typecheck
npm run build
```

Integration tests use **`bulgarian_news_test`**, separate from the application's database. Tests use local feed fixtures and real MongoDB; they never contact publishers. `TEST_MONGODB_URI` can select another **dedicated test database**. Test setup removes its fixture records; never point it at a database containing data you need.

UI tests check original links, retries, pagination resets, and stale request handling. Backend tests cover Cyrillic tagging, normalization, unsafe URLs, feed size and HTTP failures, unique upserts, preserved dates, partial source failures, API validation, and equal-date pagination. Schedule tests cover timing, shutdown, and avoiding overlap.

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
