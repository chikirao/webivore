# Rabbit tuning editor

Open `/rabbit-editor` on the local Vite server. The rabbit walks in place automatically, the page moves beneath its feet, and a real layered demo ball rotates in front of it. No movement keys are required.

- The 24 view buttons select 8 azimuths at 3 elevations and position the camera immediately.
- Select head/body/left hand/right hand, then adjust position, scale, visibility and sprite rotation. Source head/body columns and rows can be remapped independently.
- Drag the scene to inspect intermediate angles; the displayed actual frame follows the runtime frame selector. Return to the selected view with the floating button.
- Preview radius, zoom, speed, grid and occlusion controls do not change exported settings.
- Drafts autosave to `webivore.rabbit-editor.v1` in this browser. Export JSON downloads all 24 views. Import validates its shape and finite numeric bounds; it never evaluates imported code.
- Apply in game writes `webivore.rabbit-tuning.v1`. It takes effect when starting another game. Exported configuration also works in another browser through Import.

The game and editor use the same `Rabbit` class. The committed source baseline is `src/rabbit-user-settings.json`, copied from the user's `webivore-rabbit-settings (2).json`. The supplied offsets and source-frame corrections are preserved. Resetting a view restores this project baseline, not the earlier uncalibrated pose.

The user's preferred outlined sphere hands have been restored; the head and torso remain composited raster sprites. Hand offset and scale controls apply to these hands at each camera view. Their nominal contact surface follows the actual ball shell.

The original head atlas's first row extends below the former 250 px sampling window. Rendering now reads the complete lower contour without moving the user's calibrated head centre. The original atlas is preserved.

The three regenerated 135-degree heads are transparent standalone assets. They replace source column 5, which the supplied calibration maps to the 135-degree pose. Each head is fitted to the previous head radius and pivot, so the user's offsets and scale remain unchanged. The original atlas is not overwritten.

Validation: 24/24 camera selections, autonomous animation, slider editing, undo, draft restore, JSON export/import, application in the actual demo game, desktop and phone screenshots; no page errors. The visual lab additionally checks 24 views at four ball sizes (96 cells). See `design-qa.md` for images and the scope of overall verification.
