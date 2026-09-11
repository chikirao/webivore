# CIRCUIT implementation QA — 2026-09-11

Selected references: docs/concepts/01-circuit-entry.png, 02-circuit-game.png, 03-circuit-finish.png. Implementation: src/main.tsx, src/circuit.css, src/Circuit.tsx, src/Trophy.tsx.

Desktop reference/browser comparisons were inspected at 1536×1024: artifacts/circuit-{entry,game,finish}-comparison.png. Findings addressed: larger lower HUD controls and export button, larger trophy, white backing for metadata over decorative tracks. Mobile gameplay and finish checked at 390×844; dedicated square entry art avoids desktop illustration cropping. Generated decorative details differ from concepts; live page and ball deliberately reflect the actual collected content.

Cursor: body portal and high stacking order verified at four screen positions (artifacts/circuit-cursor-results.json). Rabbit: all 24 direction/elevation combinations render a connected head/body silhouette (artifacts/circuit-rabbit-results.json and circuit-rabbit-24.png). GIF decoded as 512×512, 48 frames, looping (artifacts/circuit-gif-results.json).

Final collection regression in the browser after priority-layer change: Wikipedia Internet, 1515/1515 pieces, completed; 989 visual bites, 16 outer highlights, all 16 graphics, 22 rendered meshes. Pie chart and network illustration visibly present on rotating trophy. Inner layers retained. Priority atlas has a fixed 16 slots and one extra draw call; score/mass are counted only once. Fresh final screenshot inspected in browser; earlier comparison files predate this priority layer.

npm run build passed. npm test: 15 passed, including graphics excluded from text grouping and late charts replacing text in a bounded selection. Build reports an existing >500 kB bundle warning; not a runtime failure. CLI browser scripts were not rerun; browser interaction used the in-app browser and tests/visual-lab.html.
`nFinal export after priority change: artifacts/circuit-priority-trophy.gif, decoded 512×512, 48 frames, loop=0. Mobile entry and finish visually rechecked; body horizontal overflow clipped to prevent an offscreen pointer after viewport resizing from introducing a scrollbar.
