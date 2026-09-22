# Hosting WEBIVORE

WEBIVORE now has a static frontend and an optional capture API.

- GitHub Pages serves the React/Three.js frontend, demo levels, local file imports, portable level import/export and GIF encoding.
- Cloudflare Worker + Browser Run creates new snapshots for public URLs and stores them in Workers KV.
- Cached public snapshots do not launch Browser Run or require Turnstile.
- Demo, portable maps, local HTML and local images never call the capture API.
- The guarded Express/Playwright implementation in `server/` remains the local development/reference backend.

The production frontend reads:

- `VITE_BASE_PATH` — GitHub project base such as `/REPOSITORY/`;
- `VITE_SNAPSHOT_API_URL` — deployed `https://….workers.dev` origin;
- `VITE_TURNSTILE_SITE_KEY` — public Turnstile sitekey.

Vite's development proxy still sends `/api` to `127.0.0.1:3001`. Production never relies on that proxy. Asset links, rabbit sprites, fonts, app navigation, dynamic Web Workers and `/rabbit-editor` use the Vite base path. `scripts/prepare-pages.mjs` adds `404.html` and `rabbit-editor/index.html` to the artifact for refresh/navigation support.

The complete free deployment and rollback procedure is [FREE-DEPLOYMENT.md](FREE-DEPLOYMENT.md). The portable map contract is [LEVEL-FORMAT.md](LEVEL-FORMAT.md).
