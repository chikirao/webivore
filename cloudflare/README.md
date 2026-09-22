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
