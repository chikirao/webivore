import * as THREE from "three";

/**
 * Partial canvas-texture uploads. Re-uploading a whole 1280 × 1024 page tile or
 * a 1024² ball atlas for every bite stalls weaker GPUs and phones (Safari reads
 * the whole canvas back first). Callers mark the rectangle they drew; before
 * each render only that rectangle is copied straight from the canvas with a
 * WebGL2 sub-rectangle texSubImage2D.
 */
type Box = { x0: number; y0: number; x1: number; y1: number };
type Patch = { texture: THREE.Texture; canvas: HTMLCanvasElement; box: Box };

const pending = new Map<THREE.Texture, Patch>();

export function markDirty(texture: THREE.Texture, canvas: HTMLCanvasElement, x: number, y: number, width: number, height: number) {
  const box = {
    x0: Math.max(0, Math.floor(x)),
    y0: Math.max(0, Math.floor(y)),
    x1: Math.min(canvas.width, Math.ceil(x + width)),
    y1: Math.min(canvas.height, Math.ceil(y + height)),
  };
  if (box.x1 <= box.x0 || box.y1 <= box.y0) return;
  const known = pending.get(texture);
  if (known && known.canvas === canvas) {
    known.box.x0 = Math.min(known.box.x0, box.x0);
    known.box.y0 = Math.min(known.box.y0, box.y0);
    known.box.x1 = Math.max(known.box.x1, box.x1);
    known.box.y1 = Math.max(known.box.y1, box.y1);
  } else pending.set(texture, { texture, canvas, box });
}

export function flushPatches(renderer: THREE.WebGLRenderer) {
  if (!pending.size) return;
  const webgl2 = renderer.getContext() instanceof WebGL2RenderingContext;
  for (const { texture, canvas, box } of pending.values()) {
    const props = renderer.properties.get(texture) as { __version?: number };
    // Never uploaded: the first upload carries the patch.
    if (props.__version === undefined) {
      texture.needsUpdate = true;
      continue;
    }
    // A full upload is already queued, or the canvas was swapped out (compaction).
    if (props.__version !== texture.version || texture.image !== canvas) continue;
    const width = box.x1 - box.x0,
      height = box.y1 - box.y0;
    if (!webgl2 || width * height > canvas.width * canvas.height * 0.6) {
      texture.needsUpdate = true;
      continue;
    }
    // With UNPACK_FLIP_Y the source is flipped before the sub-rectangle is taken,
    // so both the source rows and the destination rows are counted from the bottom.
    const y = texture.flipY ? canvas.height - box.y1 : box.y0;
    renderer.copyTextureToTexture(
      new THREE.Texture(canvas),
      texture,
      new THREE.Box2(new THREE.Vector2(box.x0, y), new THREE.Vector2(box.x1, y + height)),
      new THREE.Vector2(box.x0, y),
    );
  }
  pending.clear();
}

/** Forget queued patches for textures that are being thrown away. */
export function dropPatches(textures: THREE.Texture[]) {
  for (const t of textures) pending.delete(t);
}
