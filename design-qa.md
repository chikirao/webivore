# OVERDRIVE QA — 2026-09-13

Branch: `astra/overdrive-fidelity-v3`, from `1723c30`. No reset/history rewrite. Original rabbit atlases, user documents, server protections and read-only portfolio are preserved.

## Desktop image-to-code checks

Every reference and desktop capture is 1536 × 1024. Side-by-side images place the reference left and implementation right; overlays blend them at 50%; differences use absolute RGB difference. References are not production backgrounds. Actual page content, progress and collected geometry differ from the illustrative scenes.

### Entry

[Reference](docs/concepts/04-overdrive-entry.png) · [latest screenshot](artifacts/astra-qa/entry-latest.png) · [comparison](artifacts/astra-qa/entry-comparison.png) · [overlay](artifacts/astra-qa/entry-overlay.png) · [difference](artifacts/astra-qa/entry-difference.png).

Approximate reference landmarks (x/y/width/height in pixels): logo 0/90/1050/247; globe 400/327/158/158; URL arrow from 25/441 to 1030/734; Demo 334/702/271/70; mascot x≈980 through right edge, y≈12–920; lower rail y≈913–1024.

The large logo, connected URL/Start shape, cropped right mascot and substantial lower rail now occupy those regions. The schematic rabbit was replaced by a transparent illustrated cutout; lettering, rails and controls remain editable SVG/HTML/CSS. Demo, presets, sound and help are real accessible controls. Surplus slogans are removed. Remaining differences concern specific glyph shapes, ear pose and small decorative strokes, not a claim of pixel-perfect matching.

### Game

[Reference](docs/concepts/05-overdrive-game.png) · [latest demo screenshot](artifacts/astra-qa/game-latest.png) · [comparison](artifacts/astra-qa/game-comparison.png) · [overlay](artifacts/astra-qa/game-overlay.png) · [difference](artifacts/astra-qa/game-difference.png) · [real Wikipedia gameplay](artifacts/astra-qa/wiki-game.png).

Reference landmarks: meter x≈0–1180/y≈8–213; badge x≈10–208; percentage x≈208/y≈60–179; track x≈454–1020/y≈95–150, ticks near180; map 1187/22/330/205; frame x≈13–1518/y≈210–1000; stats 18/844/560/156; camera 1147/884/370/100.

HUD now occupies the upper band; map and pause/audio share a plate; the real canvas fills the thick central frame. Camera starts on the page and fits portrait viewports. Shared SVG contour removes the stats-panel seam. Percentage and percent sign have independent spacing; the leading-edge streak fits the track; pause/audio glyphs fit their plates. Demo's ball size follows actual mass and differs from the illustrated Wikipedia ball.

Pickup feedback uses actual projected pickup coordinates with canvas offsets, a four-item visible pool, capped history, expiry timers and safe-area clamping away from the upper HUD and lower controls. Large-graphic pickups use BIG BITE. It has no permanent central anchor.

### Finish

[Reference](docs/concepts/06-overdrive-finish.png) · [latest screenshot](artifacts/astra-qa/finish-latest.png) · [comparison](artifacts/astra-qa/finish-comparison.png) · [overlay](artifacts/astra-qa/finish-overlay.png) · [difference](artifacts/astra-qa/finish-difference.png) · [Wikipedia finish](artifacts/astra-qa/wiki-finish.png).

Reference landmarks: completion bar through x≈1220/y≈210; trophy 20/228/668/640; ALL YOURS 710/264/800/183; export arrow x≈710–1520/y≈442–728; replay near892/694–769; note near799; lower rail y≈905–995.

Trophy/title/export/rail fill the corresponding major regions. The real ball renders beside a visible victory rabbit at its natural aspect ratio. Domain text is real; its font-fit loop was corrected. Underlying game controls are inert while finish is active. Tablet trophy height was reduced after visual QA found replay behind the rail.

## Responsive checks

`tests/shots.mjs`: all 12 state/viewport combinations passed page-width, control bounds, minimum 44px tablet/phone touch targets and centre-hit testing. No page errors. Captures were also inspected; centre-hit testing was added after visual inspection exposed tablet replay occlusion.

| Viewport | Entry | Game | Finish |
|---|---|---|---|
| 1536 × 1024 | [entry](artifacts/shots/entry-desktop.png) | [game](artifacts/shots/game-68-mid-desktop.png) | [finish](artifacts/shots/finish-desktop.png) |
| 1024 × 768 | [entry](artifacts/shots/entry-laptop.png) | [game](artifacts/shots/game-68-mid-laptop.png) | [finish](artifacts/shots/finish-laptop.png) |
| 768 × 1024 | [entry](artifacts/shots/entry-tablet.png) | [game](artifacts/shots/game-68-mid-tablet.png) | [finish](artifacts/shots/finish-tablet.png) |
| 390 × 844 | [entry](artifacts/shots/entry-phone.png) | [game](artifacts/shots/game-68-mid-phone.png) | [finish](artifacts/shots/finish-phone.png) |

[Responsive results](artifacts/astra-qa/responsive-results.json). Portrait layout recomposes controls and artwork; it does not scale the desktop screen. Existing touch behavior remains. Reduced-motion CSS disables decorative animation/transitions; the custom cursor is skipped when reduced motion is requested.

## Rabbit and editor

`/rabbit-editor` automatically walks in place and rolls an actual layered ball. Twenty-four camera buttons select 8 azimuths × 3 heights. Per-view sliders adjust head/body/hands, source frames, offset, scale, visibility and ground anchor. JSON import/export, undo, autosaved draft and Apply in game use the same Rabbit renderer as gameplay.

The user's `webivore-rabbit-settings (2).json` is preserved as `src/rabbit-user-settings.json`; browser drafts are retained. Original sphere hands were restored at the user's request. Head/body remain sprite-based. The low-row sampling window now includes the clipped black jaw outline without shifting the calibrated pivot.

Three regenerated heads replace the calibrated 135° source slot. The user explicitly approved Python alpha extraction on September 13 after ImageGen returned a baked checkerboard. The contour mask preserves interior illustration pixels. Files have true alpha, padding and no mouth/nose/smile. Runtime fits them to the former source radius/pivot, preserving all user offsets.

- [All 24 views](artifacts/rabbit-all-views.png), [alpha on red](artifacts/astra-qa/rabbit-repair/heads-alpha-preview.png).
- Editor: [desktop](artifacts/astra-qa/rabbit-editor-desktop.png), [phone](artifacts/astra-qa/rabbit-editor-phone.png).
- New 135°: [low](artifacts/astra-qa/rabbit-editor-135-0.png), [middle](artifacts/astra-qa/rabbit-editor-135-1.png), [high](artifacts/astra-qa/rabbit-editor-135-2.png).
- Perspective lab: [radius 0](artifacts/rabbit-lab-r0.png), [60](artifacts/rabbit-lab-r60.png), [200](artifacts/rabbit-lab-r200.png), [360](artifacts/rabbit-lab-r360.png), [96-cell results](artifacts/rabbit-lab-results.json).

All 96 diagnostic cells passed connectivity, floor and head-readability checks. Lab captures use false-colour masks; actual appearance was additionally inspected in the editor. Editor tests passed all 24 selections, automatic animation, sliders, undo, draft restore, import/export and actual game application. The asynchronous JSON test now waits for file reading to finish before asserting values.

## Ball and Wikipedia

All historical geometry remains. A bounded 48-patch support skin fills the shell beneath 16 priority graphics. Selected fragment edges lift by up to 0.07 of nominal radius, most by only 0.018; the support skin has no edge lift. This gives a slightly irregular silhouette without placing entire fragments on another sphere. Roughness adds no geometry, texture or draw calls.

[Demo before/after, four sides](artifacts/astra-qa/ball-roughness-comparison.png) · [latest Wikipedia four sides](artifacts/astra-qa/ball-views-wiki.png) · [keyboard acceptance results](artifacts/astra-qa/wikipedia-results.json).

Actual Wikipedia camera captures: [high](artifacts/astra-qa/wiki-camera-high.png), [low](artifacts/astra-qa/wiki-camera-low.png), [side](artifacts/astra-qa/wiki-camera-side.png).

`tests/wikipedia-run.mjs` used the public preset and real keyboard movement, without teleporting, direct pickup or forced completion. It reached 100% in approximately 493 wall-clock seconds: 1515/1515 pieces, 1515 unique IDs, mass difference below 0.001. The first baked layer's vertex array remained unchanged. Final collection had 14 historical layers, 16 render meshes and 16 priority graphics. Three graphics were picked up after 80%, including the content-language diagram. Export and replay passed; no page errors.

That full keyboard run preceded the final edge-fold and head-asset changes, which do not change collection/collision/security logic. Latest geometry was separately checked through the deterministic Wikipedia shell fixture and fresh UI export. `tests/ball-views.mjs` explicitly uses direct pickup for geometry inspection; it is not substituted for keyboard acceptance.

## GIF

[Keyboard-run GIF](artifacts/astra-qa/wikipedia.gif) · [four frames](artifacts/astra-qa/wiki-gif-frames.png).

[Latest rough-shell GIF](artifacts/astra-qa/rough-ball.gif) · [four frames](artifacts/astra-qa/rough-ball-gif-frames.png).

Both decoded as 512 × 512, 48 frames, loop=0, with differing frames proving animation. Frames 0/12/24/36 were visually inspected. The actual collected ball rotates, the domain is legible and the rabbit remains beside the ball. Live rendering and export use the same mesh layers.

## Results and remaining P3 differences

- Final `npm run build`: passed; existing bundle-size warning remains.
- Final `npm test`: 20 passed, including server guards, grouping, packing, priority graphics, rabbit selection and settings validation.
- Responsive: 12 states passed, no horizontal overflow or obstructed primary controls.
- Rabbit lab: 96 cells passed; editor: 24 selections and complete settings workflow passed.
- Wikipedia: 100%, actual export and replay passed; no new runtime errors in the tested runs.

Remaining P3 differences: exact display glyph shapes/weight, small decorative lightning/halftone rhythm, icon stroke style, mascot ear/lighting details. Real demo/Wikipedia page and ball content are not identical to the illustrated references. Comparisons and overlays document these limits; no pixel-perfect claim is made.

final result: passed
