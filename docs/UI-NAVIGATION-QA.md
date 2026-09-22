# Interface and navigation QA — 2026-09-22

Scope: entry loading/Start sizing, globe rails, local minimap, optional pickup guidance, touch regression. Existing backend work and user changes preserved. Branch: astra/overdrive-fidelity-v3.

## Behavior

- Start/Loading uses the button's own width AND height, rather than viewport font sizing. The longer loading label has a separate fit. Phone retains the stacked URL/button layout. Removed the white paths cutting through the globe's black rails.
- At 1280x600 the Demo chip also overlapped the preset links; reduced its height in short landscape windows.
- Minimap keeps its HUD window. Its drawing buffer follows its actual CSS aspect ratio; one uniform scale maps both page axes. The shorter dimension shows 700 page pixels, player stays centered even at page boundaries. White is page, grey is outside; black fragments are collectible, light grey are too large, red dot is player. Collected pieces disappear.
- In-game question-mark button and H toggle the guide; pressed/red means enabled. Animated black chevrons with a thin white edge point to the nearest currently eligible remaining fragment. Selection uses actual fragment regions. A bounded set of 48 arrows shows the route ahead; target is refreshed while moving and after pickup. No guide during pause/loading/completion. Reduced motion stops arrow travel.
- First game guides until 3 original pieces have been collected (groups count their original members). Subsequent games guide until 1. Persist `webivore:played` after the first successful pickup. An early manual dismissal stays off; manual re-enabling stays on until dismissed. Blocked storage does not break gameplay, but cannot retain returning-player status across games.
- No server/security/Level schema changes in this UI task.

## Automated and visual checks

Local app: http://localhost:5174/ . `tests/navigation-browser.mjs` covers 1536x1024, 1024x768, 768x1024, 390x844 and 1280x600. Each has real entry, pending `/api/snapshot` loading (YouTube URL entered, request intercepted), and Three.js demo screenshots. Assertions check label bounds, no horizontal document overflow, clickable hint control, H/button toggle, joystick detection, centered minimap pixel and three/one real-pickup tutorial. No page errors.

Inspected screenshots in `artifacts/navigation-qa/`: desktop/tablet/phone loading states, desktop/phone game, and `guide-path.png` showing actual world-space chevrons toward a collectible. `long-map.png` uses a 9000px synthetic page extent to check the player remains centered; it is a geometry test, not a live captured site. Results: `results.json`.

`tests/touch-controls.mjs` passed on touch phone 390x844 / 844x390 and tablet 768x1024 / 1024x768: actual joystick movement, dead zone, independent two-finger camera swipe, release, cancel, pause and blur reset, controls inside landscape bounds. Desktop 1536x1024 mouse/keyboard also passed. Narrowing a mouse-only browser does not enable the joystick; touch capability or a touch pointer event does. Screenshots/results: `artifacts/touch-qa/`.

`tests/navigation.test.ts` covers eligibility, distant target, collected exclusions, sparse regions, grouped pickup, manual override, storage failure, first/returning quotas and isotropic centered map transforms. Full build/test results and live regression are recorded below when complete.

Physical phone hardware was not available; touch validation uses Chromium device emulation. This task does not claim to finish the broader rabbit/redesign backlog.

## Final results

- `npm run build`: passed (existing bundle-size advisory remains).
- `npm test`: 46/46 passed, including browser readiness/security fixtures.
- `node tests/navigation-browser.mjs`: passed all five viewport sizes and tutorial/toggle checks.
- `node tests/touch-controls.mjs`: passed phone/tablet/desktop controls.
- `node tests/youtube-live.mjs`: passed against https://www.youtube.com/watch?v=XFl4q2FfkVg through the unchanged VPN. Snapshot: 12,188 ms; 82 requests; 18,415,602 bytes; poster, 20 comments, 20 recommendations; 42 images, none missing. Actual Three.js top/comments views inspected. Completion: 342/342 unique original fragments, matching mass. GIF downloaded: 512x512, 48 frames, looping; replay passed. No page errors.
- Additional saved-snapshot visual checks: `artifacts/navigation-qa/youtube-local-map.png` (real YouTube page around y=2400), `finish-stable.png` after the finish transition. Reduced-motion arrow positions stayed fixed, guidance hidden at completion. Initial live-test finish screenshot catches its transition; use the stable screenshot for visual assessment.
- Final short-window screenshot: `artifacts/navigation-qa/1280-600-entry-final.png`; Demo ends at y=453.19, presets begin y=455.98, no overlap.

No VPN settings were changed. Remaining mobile limitation is physical-device verification; Chromium touch emulation passed. The larger rabbit/ball visual backlog remains outside this change.
