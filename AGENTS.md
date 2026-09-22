# WEBIVORE — repository guide

## Product

WEBIVORE is a browser-based 3D game for the `chikirao / vault` portfolio. A rabbit walks over a captured website, collects page fragments into a growing paper ball, and exports the finished rotating ball as a 512 × 512 GIF.

The current branch contains an incomplete Claude attempt at **OVERDRIVE**. Its game-mechanics changes may be useful, but its visual implementation is not accepted. The next task is a fidelity-focused Astra rebuild from the same concept trio:

- `docs/concepts/04-overdrive-entry.png`
- `docs/concepts/05-overdrive-game.png`
- `docs/concepts/06-overdrive-finish.png`

Treat these images as the source of truth for desktop composition, scale, proportion and hierarchy. Do not paste them behind HTML. Rebuild the interface with editable vectors, CSS, text and real controls, while using high-quality supplied or generated raster assets for complex rabbit illustrations. The older CIRCUIT trio (`01`–`03`) remains useful history and `main` is the rollback point.

The portfolio source at `C:\Users\UserPC\Documents\my\_portfolio` is read-only design context. Do not modify it. `docs/PORTFOLIO-DESIGN.md` contains the existing analysis.

## Before changing code

The repository now has a protected baseline and two Claude commits:

1. `a5bf528` (`main`) — initial working prototype.
2. `5c4dbcd` — sprite-rabbit and shell work.
3. `1723c30` (`claude/vector-overdrive-v2`) — incomplete OVERDRIVE UI attempt.
4. Before the next redesign, inspect current Git state and create `astra/overdrive-fidelity-v3` from the current head. Preserve untracked tests until reviewed.

Never discard user changes with `git reset --hard`, `git checkout --`, or broad deletion. If Git author identity is missing, ask the user instead of inventing one.

## Architecture

- `src/main.tsx` — React shell, entry, loading, game HUD and state transitions.
- `src/game.ts` — Three.js scene, player movement, camera, collection and effects.
- `src/rabbit.ts`, `src/rabbit-frame.ts` — rabbit rendering and camera-relative view selection.
- `src/grouping.ts` — late-game batching of nearby collectible pieces.
- `src/pile.ts`, `src/packing.ts` — permanent inner ball layers and bounded outer highlights.
- `src/world.ts` — captured page surface and erased regions.
- `src/Circuit.tsx` — current progress dial and pickup feedback.
- `src/Trophy.tsx`, `src/gif.ts`, `src/gif.worker.ts` — finish screen and GIF export.
- `src/circuit.css`, `src/style.css` — current visual implementation.
- `server/` — guarded remote fetch, browser capture and DOM extraction.
- `public/assets/` — current raster assets and rabbit atlases.
- `tests/visual-lab.html` — development-only state harness.
- `docs/WEBIVORE-NEXT.md`, `docs/concepts/`, `design-qa.md` — requirements, concepts and previous QA.

Frontend runs on `http://localhost:5174/`; API runs on `127.0.0.1:3001`. The user needs their VPN. Do not disable, reconfigure or work around it.

## Non-negotiable behavior

- Preserve real external-site loading, demo mode, free movement over any page element, size-gated pickup, grouping, minimap, camera controls, pause/audio controls, completion flow and GIF export.
- Preserve server-side URL/IP protections. Do not relax private-network, metadata, redirect, port, resource or execution restrictions.
- Original page pieces contribute to mass, score and completion exactly once.
- Keep all historical inner ball layers. Optimization may reduce texture resolution, but must not delete collected geometry.
- Important graphics must remain recognizable on the ball. Images/SVG/canvas/video are not merged into text batches. The bounded outer selection must favor meaningful large graphics without making fragments float above empty cavities.
- The exported GIF must show the actual collected ball, remain 512 × 512, animate, loop, include the site name, and keep the rabbit visibly separated from the ball.
- The rabbit has no mouth, smile or nose. Its head, body, feet and hands must remain coherent from every supported camera azimuth and elevation.

## Current issues to solve

- Rabbit parts are built from two independent camera-facing sprites plus 3D hand spheres. At steep camera pitch, the neck separates, the head shifts toward the ball, hands can appear with a mismatched view, and feet visually cross the floor. Treat this as a rendering-model problem, not another frame-specific offset tweak. Prefer one coherent character plane/rig per view or another solution with explicit depth and ground anchoring.
- At the finish, the ball hides most of the celebrating rabbit.
- The bounded outer graphic layer preserves diagrams but can look detached from the ball and expose cavities. Blend priority graphics into the actual shell: constrain their depth to the local surface, overlap neighboring pieces, preserve inner coverage, and avoid coplanar flicker.
- Pickup feedback is fixed in the center. Place feedback near the collected object or use several deterministic screen-space positions, clamp it to the viewport, and prevent overlap with HUD controls.
- The current raster stage background leaks behind the game frame, especially along the bottom.
- Entry contains surplus copy: remove `SURF / BITE / REPEAT` and `A HUNGRIER INTERNET`. Keep the control hint but redesign it as a clear, compact help element. Redesign the sound control as part of the same system.
- Current generated backgrounds are brittle across desktop, tablet and mobile. The layout must recompose, not merely crop or scale one image.

## Visual direction

Build a crisp, editable, vector-led PS2/Y2K interface from the OVERDRIVE trio: black, white and saturated red; bold angled rails; cut corners; thick keylines; directional chevrons; halftone or restrained print texture; assertive italic display type. Keep the rabbit and the real page/ball as the product-specific center.

Use authored SVG files/components, CSS geometry, masks/clip paths, typography, and the existing icon package where appropriate. Do not trace or embed the reference PNGs as production backgrounds. Do not replace real controls with a static mockup. Avoid generic glass panels, soft rounded dashboard cards, neon gradients, filler labels, repeated pills and ornamental metrics.

All key UI chrome must be editable and resolution-independent. Raster imagery is appropriate for the rabbit sprite atlas, captured website pixels and complex mascot illustrations. The current Astra task explicitly authorizes ImageGen for missing rabbit/interface illustrations, but not for entire screens, buttons, frames, meters or text.

Design all three states as one system:

- Entry: authored logo/character composition, URL field, Start, demo/presets, useful help and audio. Minimal copy.
- Game: large expressive progress readout, site/status, minimap, size/time, camera/pause/audio, contextual pickup feedback, unobstructed play area.
- Finish: actual rotating ball, visible rabbit beside or behind it without occlusion, site title, Export GIF, replay and compact real stats.

Support at least 1536 × 1024, 1024 × 768, 768 × 1024 and 390 × 844. No horizontal scrolling, clipped controls, illegible generated text, or background seams. Respect keyboard focus and `prefers-reduced-motion`.

## Verification

Run:

```sh
npm run build
npm test
```

Use the existing in-browser visual lab or the user's chosen browser for interactive QA. Check entry, loading/error, initial game, steep/high/low camera angles, late game with large graphics, completion, GIF export and replay. Inspect desktop, tablet and mobile. Tests must verify behavior rather than snapshot implementation details.

Do not claim the redesign is complete until the four rabbit camera failures above, ball cavities, finish occlusion, responsive layouts and real Wikipedia completion have been observed and fixed. Update `design-qa.md` with the exact states, viewport sizes and remaining limitations.
