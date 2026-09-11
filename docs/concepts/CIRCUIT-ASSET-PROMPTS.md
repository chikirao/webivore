# CIRCUIT — implementation asset generation

Generated using the built-in image_gen tool from the user-approved CIRCUIT references. These are individual UI assets, not whole-screen mockups. Alpha was verified using PNGJS.

## Blank primary button

Output: `public/assets/circuit-button.png`, 2066 × 761 PNG; 522,568 fully transparent pixels. Reference: `docs/concepts/03-circuit-finish.png`.

Initial prompt:

> Create a production UI PNG asset on ACTUAL transparent background with alpha. Extract/recreate ONLY the blank glossy red capsule button chassis matching the EXPORT GIF button in the reference. Reference is visual style only. Wide horizontal rounded capsule approx 4.5:1 aspect ratio, intended display 1000x220. Centered and fills image with minimal transparent margins. Thin black outer edge, silver and white beveled rim, shiny saturated red inset enamel face, specular line near top, subtle dark red lower edge, exact symmetrical front orthographic UI view. NO TEXT, NO ICONS, NO ARROWS, NO LABELS, NO surrounding UI, NO background, NO checkerboard drawing. Keep whole capsule within frame. This is a blank clickable button skin, text will be HTML overlay.

The initial generation baked a checkerboard background. A second built-in image edit corrected transparency:

> Remove the checkerboard background completely, making all pixels outside this glossy capsule TRANSPARENT with alpha channel. Preserve the capsule unchanged and crop close to its edges. This is background extraction for a PNG website button asset. No grey checkerboard, no backdrop, no text.

Selected original: `C:/Users/UserPC/.codex/generated_images/01a08dae-57f4-7503-822b-2ee2cb5d747e/exec-10d64363-ef82-4ee5-bd64-602ad8b26233.png`.

## WEBIVORE logo

Output: `public/assets/circuit-logo.png`, 2172 × 724 PNG; 1,041,794 fully transparent pixels. Reference: `docs/concepts/01-circuit-entry.png`.

Prompt:

> Production logo PNG asset with ACTUAL transparent alpha background. Recreate ONLY the WEBIVORE lettering from the upper center of reference, closely faithful shape. Black extra bold italic rounded aerodynamic PS2 Y2K racing game logotype, tall swooping W, white outline inside thin black outline, small red center in O, red three dots and red speed lines underline at right. Exact word WEBIVORE. Isolated horizontal lockup only, generous width but tight transparent crop, no rabbit, no scene, no slogan or other text, no checkerboard drawing. Clear crisp lettering readable at small size. Preserve reference logo distinctive design.

Selected original: `C:/Users/UserPC/.codex/generated_images/01a08dae-57f4-7503-822b-2ee2cb5d747e/exec-b2f479ef-38c6-48e2-88d6-95b2df0e7c5f.png`.

Generated dimensions differ from the requested aspect ratio. Original generated files remain unchanged. The workspace button and logo underwent lossless PNGJS cropping to nonzero-alpha bounds plus 2 pixels: button 2066 × 633; logo 2018 × 593. Small isolated nonzero pixels are preserved.

## Blank progress dial

Output: `public/assets/circuit-dial.png`, 1254 × 1254 PNG; 399,276 fully transparent pixels. Reference: `docs/concepts/02-circuit-game.png`.

Prompt:

> Generate one isolated production UI blank dial housing based on the upper left circular gauge in reference. Square 512x512, actual transparent alpha outside a perfect circle. Circle fills canvas with only 2 px transparent margin. Front orthographic view. White glossy convex dial face, metallic silver and white bevel outer rim, thin black outer edge, soft gentle silver shading. Center plain offwhite and empty. This will be a dynamic gauge: leave area at radius 200 of256 clear for code drawn arc overlay. NO markings, NO ticks, NO red arc, NO text, NO numbers, NO character, NO icons. Just single beautiful white/silver circular housing, smooth clean PS2 Y2K glossy UI. No checkerboard painted, no shadow outside circle. Actual transparency required.

Selected original: `C:/Users/UserPC/.codex/generated_images/01a08dae-57f4-7503-822b-2ee2cb5d747e/exec-0799a55a-d261-4601-a7b0-405d669d1150.png`.
