# WEBIVORE Cloudflare snapshot Worker

This package is the optional public-URL capture service. It uses Cloudflare Browser Run, Workers KV and Turnstile on the Workers Free plan. It is not used by demo or local-file modes.

The Worker performs bounded navigation, readiness, lazy scrolling, DOM candidate extraction and a compressed JPEG screenshot. It never decodes the screenshot or partitions pixels. The frontend's `level-builder.worker.ts` performs that CPU/memory-heavy work in the user's browser.

Endpoints:

- `GET /api/health` — service metadata;
- `POST /api/snapshot` — cache-first lookup; an uncached request requires a one-use Turnstile token;
- `GET /api/snapshot/:sha256` — cached metadata/candidates;
- `GET /api/snapshot/:sha256/atlas` — cached atlas with `ETag` and cache headers.

The cache key includes normalized URL (fragment removed), capture profile, extractor version and level format version. KV stores status, metadata and atlas under separate keys for 14 days by default. Errors are never cached. An in-isolate promise map provides best-effort single-flight deduplication.

Security controls include URL/port validation, private/reserved IPv4 and IPv6 rejection, guarded redirect/resource hosts with public DNS validation, request/hostname/byte budgets, a 48-second job deadline, denied downloads, blocked unsupported resource types (including WebSocket/media), bypassed Service Workers, closed popups, and unconditional browser closure in `finally`. The service is not a general proxy.

Commands are run from the repository root:

```sh
npm run cf:install
npm run cf:check
npm run cf:test
npm run cf:verify
npm run cf:dev
npm run cf:deploy
```

`npm run cf:deploy` performs a real deployment. Do not run it without explicit authorization. Complete setup is in `docs/FREE-DEPLOYMENT.md`.

## Leaderboard (D1)

The same Worker serves an anonymous leaderboard stored in D1 (`LEADERBOARD` binding, schema in `migrations/`). A *site* is a distinct hostname (without `www.`) cleared to 100%; boards rank sites eaten today (UTC) and all time, ties broken by pieces eaten, then by who got there first.

- `GET /api/leaderboard?period=day|all&limit=1..50` — top rows plus the caller's own standing when a player token is sent; anonymous reads are edge-cached for 20 s;
- `POST /api/players` — claims a nickname (Turnstile-checked) and returns a bearer token the browser keeps in `localStorage`;
- `GET|POST /api/players/me` — validates or renames the current player;
- `POST /api/runs` — opens a server-timed run on a **cached snapshot** (demo and local files cannot rank);
- `POST /api/runs/:id/finish` — closes the run once and credits the site.

Anti-abuse: nicknames are normalised (NFKC, lookalike folding, reserved/rude words), unique case-insensitively; one browser can mint 3 nicknames and one network 10 per day; runs are capped at 60 starts per hour per network; a finish is rejected when it is faster than the page allows (20 s, or 0.05 s per captured candidate) or reports impossible counts. Only salted SHA-256 hashes of tokens, the network address and coarse browser traits (user agent, language, country, time zone, screen) are stored. The results remain client-reported — the checks make forging slow and expensive, not impossible.

One-time setup, from the repository root (requires the existing `RATE_LIMIT_SALT` secret):

```sh
npm run cf:d1:create   # creates webivore-leaderboard; put the printed database_id into wrangler.jsonc if Wrangler did not
npm run cf:d1:migrate  # applies migrations/ to the remote database
npm run cf:deploy
```
