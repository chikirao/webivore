# Free public deployment

Короткая русская инструкция без лишних деталей: [CLOUDFLARE-RU.md](CLOUDFLARE-RU.md).

This guide prepares a GitHub Pages frontend plus a Cloudflare Workers Free capture service. It never requires Workers Paid, R2, a VM, a browser extension or a permanently billed server.

The words `USERNAME` and `REPOSITORY` below are not values to paste literally. Take them from the GitHub repository URL: for `https://github.com/alice/webivore`, `USERNAME=alice` and `REPOSITORY=webivore`. This checkout currently has no Git remote configured, so the repository cannot infer them.

## 1. Verify locally

From `D:\dev\katamari_web` in PowerShell:

```powershell
npm ci
npm run cf:install
npm test
npm run build
npm run cf:verify
npm --prefix cloudflare run deploy -- --dry-run
```

The dry run bundles the Worker but does not contact an account or deploy it. The local reference stack remains available with `npm run dev`: Vite at `http://localhost:5174` and Express/Playwright at `http://127.0.0.1:3001`.

## 2. Create a Cloudflare Free account

1. Create an account at [dash.cloudflare.com](https://dash.cloudflare.com/).
2. Open **Workers & Pages → Plans** and confirm **Workers Free**. Do not select Workers Paid.
3. Authorize Wrangler:

```powershell
Set-Location cloudflare
npx wrangler login
Set-Location ..
```

## 3. Create the free KV namespace

Run once from the repository root:

```powershell
npm run cf:kv:create
```

The script uses `--update-config`: Cloudflare creates `WEBIVORE_SNAPSHOTS` and Wrangler adds its account-specific `SNAPSHOTS` binding to `cloudflare/wrangler.jsonc`. The generated namespace ID is public, not a secret. Review and commit that config change in the deployment repository.

Equivalent manual commands:

```powershell
Set-Location cloudflare
npx wrangler kv namespace create WEBIVORE_SNAPSHOTS --binding SNAPSHOTS --update-config
Set-Location ..
```

KV stores status/version, metadata/candidates and atlas separately. Default TTL is 14 days. KV allows a 25 MiB value; WEBIVORE rejects atlases above 20 MiB.

## 4. Browser Run binding and free limits

`cloudflare/wrangler.jsonc` already declares `BROWSER` with remote development enabled. Do not create a paid resource: deployment authenticates this binding automatically.

Current official free limits relevant here are 10 ms Worker CPU and 128 MiB isolate memory. Browser Run Free provides 10 browser minutes per UTC day, 3 concurrent sessions, one new browser instance every 20 seconds and a 60-second browser timeout. WEBIVORE sets a 48-second job deadline and closes every session in `finally`. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Browser Run limits](https://developers.cloudflare.com/browser-run/limits/) and [KV limits](https://developers.cloudflare.com/kv/platform/limits/).

## 5. Create Turnstile and secrets

1. In Cloudflare open **Turnstile → Add widget**.
2. Name it `WEBIVORE capture`, choose Managed mode, and add `USERNAME.github.io` as the production hostname. Do not add localhost to the production widget.
3. Copy the public sitekey for GitHub. Keep the secret out of Git and frontend variables.
4. Store the production secret:

```powershell
Set-Location cloudflare
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Generate a separate random rate-limit salt, copy the printed value, and store it:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
npx wrangler secret put RATE_LIMIT_SALT
Set-Location ..
```

Turnstile Siteverify runs only in the Worker. Tokens expire after five minutes and are single-use. Cache lookup happens before validation, so cached reads need no challenge. See [server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

For localhost, Cloudflare's official always-pass keys are:

- sitekey `1x00000000000000000000AA`;
- secret `1x0000000000000000000000000000000AA`.

Create an ignored root `.env.local`:

```dotenv
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

Copy `cloudflare/.dev.vars.example` to `cloudflare/.dev.vars`; it contains the test secret. If Turnstile is deliberately absent locally, this explicit bypass works only with `ENVIRONMENT=development` and a localhost Origin:

```powershell
Set-Location cloudflare
npx wrangler dev --remote --var ENVIRONMENT:development --var DEV_BYPASS_TURNSTILE:true
```

Production has `ENVIRONMENT=production`, so the bypass is unavailable after deployment.

## 6. Configure CORS

Edit `ALLOWED_ORIGINS` in `cloudflare/wrangler.jsonc`:

```json
"ALLOWED_ORIGINS": "https://USERNAME.github.io,http://localhost:5174,http://127.0.0.1:5174"
```

Origins are exact scheme/host/port values without paths. Add an exact HTTPS origin for a custom domain. Never use `*`; the Worker rejects unlisted origins and handles OPTIONS itself.

## 7. Remote development

Remote Browser Run consumes the same free allowance, so use it for bounded checks:

```powershell
npm run cf:dev
```

Wrangler normally exposes `http://localhost:8787`. Add to root `.env.local`:

```dotenv
VITE_SNAPSHOT_API_URL=http://localhost:8787
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

In another terminal run `npm run dev`. Verify health, create one fresh capture, repeat the same normalized URL and confirm JSON changes from `"cache":"miss"` to `"cache":"hit"`. Stop remote development afterward.

## 8. Deploy the Worker

This is a real external deployment and must only be run after explicit approval:

```powershell
npm run cf:deploy
```

Wrangler prints a URL such as `https://webivore-snapshot.ACCOUNT-SUBDOMAIN.workers.dev`. `ACCOUNT-SUBDOMAIN` comes from Wrangler/Cloudflare; do not guess it. Save the complete printed URL.

Verify health and CORS:

```powershell
$worker = "https://THE-URL-PRINTED-BY-WRANGLER"
Invoke-RestMethod "$worker/api/health"
Invoke-WebRequest "$worker/api/health" -Headers @{ Origin = "https://USERNAME.github.io" }
```

The second response must contain `Access-Control-Allow-Origin: https://USERNAME.github.io`. An unlisted origin must receive 403.

## 9. GitHub variables and Pages

Open **GitHub repository → Settings → Secrets and variables → Actions → Variables** and add:

- `VITE_BASE_PATH` = `/REPOSITORY/`;
- `VITE_SNAPSHOT_API_URL` = the complete deployed workers.dev URL, without trailing slash;
- `VITE_TURNSTILE_SITE_KEY` = the public production sitekey.

These are public build variables. Never put `TURNSTILE_SECRET_KEY` or `RATE_LIMIT_SALT` in GitHub.

Then:

1. Push reviewed code to `main`.
2. Open **Settings → Pages** and select **GitHub Actions** as the source.
3. Run **Actions → Deploy GitHub Pages**, or push another commit to `main`.

`.github/workflows/deploy-pages.yml` uses Node 22, `npm ci`, `npm test`, `npm run build:pages`, and the official Pages actions. It uploads only `dist`, has minimal permissions and contains no Cloudflare secret. The result is `https://USERNAME.github.io/REPOSITORY/`. If `VITE_BASE_PATH` is empty, the workflow derives the repository path, but the explicit variable is easier to audit.

## 10. Acceptance checks

At the public Pages URL verify:

1. Demo starts with DevTools Network offline and makes no `/api` request.
2. **Import file → WEBIVORE level** opens an exported map.
3. HTML import shows: “Local HTML is converted into a safe simplified page. Scripts and unavailable remote assets are ignored.”
4. Image import accepts PNG/JPEG/WebP and creates a playable small-to-large path.
5. A new public URL needs Turnstile; repeating it returns `cache: hit` without another challenge or Browser Run launch.
6. The video fixture/YouTube fallback is recognizable, never a blank black rectangle, and is marked degraded.
7. Demo/local play, 512×512 looping GIF, portable level export/import and replay work.
8. Directly open and refresh `https://USERNAME.github.io/REPOSITORY/rabbit-editor/`.
9. Inspect 1536×1024, 1024×768, 768×1024 and 390×844 for overflow, focus and clipped controls.

## 11. Free quota and no overage

Stay on **Workers Free**. Do not upgrade to Workers Paid. When the free Browser Run allowance is exhausted, Cloudflare returns 429 instead of creating paid overage; WEBIVORE explains that fresh captures are unavailable while demo, cached and local levels continue.

Turnstile protects only cache misses. A second privacy-preserving limit allows three uncached captures per hour by default using a short-lived salted IP hash; full IPs are not stored. Identical concurrent URLs share an in-isolate capture. Errors are never cached.

Monitor **Cloudflare dashboard → Compute → Browser Run → Runs/Usage** and **Workers & Pages → KV**. KV Free currently includes 1 GB storage, 100,000 reads/day and 1,000 writes/day. This project has no required R2 configuration.

## 12. Update, rollback and invalidate cache

Frontend update:

```powershell
npm ci
npm test
npm run build
git push origin main
```

Rollback the frontend with a normal Git revert commit and push it; do not rewrite shared history.

Worker update (real deployment requires approval):

```powershell
npm run cf:verify
npm --prefix cloudflare run deploy -- --dry-run
npm run cf:deploy
```

Cloudflare keeps versions under **Workers & Pages → webivore-snapshot → Deployments**; choose a known-good version and **Rollback**.

Normal cache invalidation is a version bump to `EXTRACTOR_VERSION`, `CAPTURE_PROFILE` or `LEVEL_FORMAT_VERSION`, followed by verification and deployment. Old entries expire. For deliberate cleanup, use the Cloudflare KV browser and delete only keys beginning `status:`, `metadata:`, `atlas:` or `rate:` in `WEBIVORE_SNAPSHOTS`. Dashboard deletion consumes KV operations; there is deliberately no broad deletion script.

## 13. Troubleshooting

- `TURNSTILE_REQUIRED`: expected cache miss; complete the widget. A cache hit should not request it.
- `TURNSTILE_UNAVAILABLE`: add the Worker secret and redeploy.
- `RATE_LIMIT_UNAVAILABLE`: add `RATE_LIMIT_SALT` and redeploy.
- `BROWSER_QUOTA` / 429: wait for the UTC reset; demo/cached/local modes continue.
- Cache always misses: confirm the `SNAPSHOTS` binding was added by `cf:kv:create`, then redeploy.
- CORS failure: compare the browser's exact Origin with `ALLOWED_ORIGINS` and redeploy.
- Pages assets 404: set `VITE_BASE_PATH` to exactly `/REPOSITORY/` and rerun the workflow.
- `/rabbit-editor` refresh 404: confirm the artifact contains `404.html` and `rabbit-editor/index.html`; `npm run build` creates them.
- Local HTML lacks styling/images: expected; scripts, CSS URLs and unavailable remote assets are intentionally ignored. Use a screenshot for visual fidelity.
- Auth/consent/bot wall: expected degraded metadata/thumbnail fallback; WEBIVORE does not bypass login or anti-bot protections.
- Large map rejected: use a smaller screenshot; limits protect memory and portable-file safety.

No external deployment was performed while preparing this repository.
