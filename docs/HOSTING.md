# Hosting WEBIVORE

The current project is a browser game plus a Node.js snapshot API; the complete product is not backend-free.

- The Three.js game, demo level, rabbit editor and GIF encoding run in the browser.
- Loading an arbitrary URL calls `POST /api/snapshot` from `src/main.tsx`.
- `server/index.ts` runs Express and Playwright/Chromium to fetch a guarded public page, capture it and return the extracted level. GitHub Pages cannot run this service.
- The original page HTML is not executed in the game's origin. Do not remove the URL/IP protections when hosting the API separately.

GitHub Pages is [static HTML/CSS/JavaScript hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). A demo-only edition or an edition with pre-generated level snapshots can run there without a backend. Full URL loading needs the snapshot API on a separate service, with an explicitly configured API URL and narrowly scoped CORS, or a host that serves both frontend and API.

The current build is configured for the domain root. A project Pages URL such as `/webivore/` also needs asset paths and Vite `base` adjusted; there are root-relative `/assets/`, `/fonts/` and `/api/` paths, plus the `/rabbit-editor` route. This task does not deploy or change those hosting settings.

The Vite development proxy (`vite.config.ts`) forwards `/api` to `127.0.0.1:3001`; it does not become a backend when publishing `dist`.
