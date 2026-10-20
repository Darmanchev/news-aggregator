# Bulgarian news MVP

Status: approved and implemented. The feature-module layout in README.md and the implementation plan supersedes the initial flat server layout below.

## Purpose and scope

Build a small public website that collects recent Bulgarian news from RSS feeds, saves article metadata, assigns keyword tags, and links readers to the publishers. The requested stack is MERN with TypeScript. Follow the supplied Ponytail skill: the smallest complete implementation, explicit limits, and checks for non-trivial logic.

Success means a reader can open the site, see articles ordered by publication time, filter by source or tag, and follow the original article link. Repeated collection must not create duplicate records. An unavailable publisher must not prevent collection from other publishers or browsing stored news.

Initial assumptions: Bulgarian content, a few manually selected sources, no user accounts, and periodic collection rather than a real-time guarantee. Feed availability and reuse terms must be checked before enabling any publisher. No publisher has been verified yet.

## Options and decision

1. Recommended: one Express application hosting the API and production React build, plus a collector command from the same server package. One MongoDB database. This minimizes deployment and operational work.
2. Separate frontend hosting and API services: useful when deployments need to scale independently, but unnecessary for this MVP.
3. Microservices, a queue, and AI enrichment: additional infrastructure without value for the first feed. Defer them.

Use npm workspaces for `apps/server` and `apps/web`. React uses Vite for development and a static production build. Express, the collection command, and MongoDB access live in the server package. Use Mongoose for persistence and an established RSS parser for feeds. No shared package or generic repository layer.

## Boundaries and proposed files

```text
apps/
  server/
    src/
      app.ts                 Express routes, static hosting, error responses
      index.ts               Validate environment, connect database, listen
      config.ts              Environment and trusted source configuration
      articles.ts            Mongoose model and article queries
      collect.ts             Feed fetching, parsing, mapping, and upserts
      collect-command.ts     Database lifecycle and collection entry point
      tags.ts                Keyword matching against a fixed tag list
    test/                    Collector, tagging, and API checks
  web/
    src/
      App.tsx                Feed, filters, load-more, and request state
      styles.css             Responsive and accessible presentation
docs/superpowers/specs/
```

Add root workspace scripts, TypeScript configuration, package lock, `.gitignore`, `.env.example`, a MongoDB-only Compose file, and a README with setup, collection, testing, and production commands. Do not add base classes, dependency injection containers, or abstractions for hypothetical future providers.

## Data flow and collection

`Trusted RSS URLs → collector → normalize and tag → MongoDB → Express API → React`

Configure sources in code as `{ id, name, feedUrl }`. Start with a small number whose feeds and usage terms have been checked. Do not expose an endpoint accepting arbitrary feed URLs.

Run collection manually through an npm script and, in deployment, from a scheduler every five minutes. Do not start a scheduler inside each web process. Scheduling setup belongs in the README. This interval is an initial target and must respect publisher limits.

Fetch feeds sequentially with a request timeout, bounded response size, and no uncontrolled redirects. RSS is untrusted input: discard invalid entries, limit stored text lengths, and allow only HTTP(S) article links. Do not fetch article pages or images. Avoid network access to internal hosts when selecting feeds and following permitted redirects.

Use the feed's GUID as the external ID, falling back to the article URL. A unique compound index on `(sourceId, externalId)` makes repeated collection idempotent. Preserve first-seen time on updates. Normalize tracking parameters conservatively; do not remove query parameters that may identify an article.

Use publication time when valid and first-seen time otherwise. Strip feed markup from displayed text. Extract tags from the title and plain-text feed description; persist only the title and metadata initially. A source failure is reported with the source ID, collection continues, and the command exits with failure if any source failed so a scheduler can detect degraded collection.

## Article record

| Field | Purpose |
| --- | --- |
| sourceId | Stable configured source identifier |
| externalId | Feed GUID or fallback URL |
| title | Plain-text headline |
| url | Validated original article link |
| publishedAt | Effective publication timestamp |
| firstSeenAt | First successful ingestion timestamp |
| tags | Approved tag slugs |

Indexes: unique `(sourceId, externalId)` and `(publishedAt descending, _id descending)`. Add filter-specific indexes only if query measurements justify them. Keep source display names in the configuration rather than duplicating them in every article.

Cross-publisher event grouping is excluded: articles from two publishers about the same event remain separate. Stable GUIDs and URLs are an assumption; changed publisher identifiers can still create duplicates.

## Tags

Use a short manually curated map of tag slug, display label, and Bulgarian keywords. Normalize case and Unicode; match words or explicit phrases rather than arbitrary substrings. Assign only approved tags. Test Cyrillic word boundaries explicitly rather than assuming JavaScript `\b` handles Bulgarian.

No AI dependency. Keyword tags are imperfect and do not infer meaning, negation, or every Bulgarian inflection. Expand the dictionary from actual examples before considering AI.

## HTTP API

- `GET /api/health`: report service and database readiness without secrets.
- `GET /api/sources`: configured source IDs and names.
- `GET /api/tags`: approved tag slugs and labels.
- `GET /api/articles?source=<id>&tag=<slug>&cursor=<opaque>&limit=20`: return article items and a next cursor or null.

Validate query values, use a maximum limit of 50, reject malformed cursors, and build database filters explicitly. Never pass client query objects to MongoDB. Cursor pagination uses `(publishedAt, _id)` as a stable descending order. Indexing new articles can change the feed between requests; pagination is not a database snapshot.

Return consistent `{ error: { code, message } }` errors. Unknown API routes return JSON 404 responses and must not fall through to the React page. Keep stack traces in server logs. In development Vite proxies `/api`; production uses the same origin, avoiding an unnecessary cross-origin configuration.

## Website

One responsive page: title, source filter, tag filter, article cards, and a load-more button. Each card shows headline, source, publication time, tags, and a link to the original article.

Provide loading, empty, and error states with retry. Changing a filter resets pagination and cancels or ignores outdated requests. Use labelled controls, keyboard-visible focus, semantic links, readable contrast, and text-only rendering of publisher content.

## Configuration and operation

Validate `MONGODB_URI` and the server port at startup. Store secrets in an ignored environment file; commit only an example. Use MongoDB locally through Compose or an existing installation. Node.js 22 is available in the current workspace.

Build React and server TypeScript for production. Serve the React output through Express. Close database connections on collector completion and process shutdown. Keep database startup and listening out of `app.ts` so route checks can import the app independently.

Persist collected metadata; no automatic expiry in the first release. Monitor storage growth before expanding sources. Deployment credentials, hosting, and publisher agreements are outside this implementation.

## Verification and acceptance

Use deterministic local feed fixtures; tests must not depend on live publishers.

1. Ingest a fixture twice and verify exactly one record per source/external ID, with first-seen time preserved.
2. Verify one failed source does not suppress articles from a successful source.
3. Verify malformed dates, missing identifiers, unsafe links, oversized responses, and request timeout handling.
4. Verify Bulgarian tag matching and an unrelated substring that must not match.
5. Verify API query validation, filtering, stable pagination with equal timestamps, and bounded page size.
6. Run type checks, tests, and production builds. With MongoDB available, run an end-to-end collection/API check and inspect the website at desktop and mobile sizes.

Document any checks that cannot run. A production build alone does not establish that ingestion or database queries work.

## Explicit exclusions

No scraping, AI, accounts, payments, advertisements, admin interface, full article republication, publisher photos, full-text search, cross-source event grouping, or guarantee of earliest coverage. Add these only after the small feed is working and the next requirement is concrete.

## Implementation outcome

Implemented in apps/api and apps/web. See README.md for the actual module boundaries, local setup, collection worker, production commands, and limitations. The implementation plan records verification and review results.
