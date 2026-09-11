export const LAYER_SIZE = 48;
/** Each visual bite is a 9 × 9 crumpled sheet. */
export const GRID = 9,
  VERTS = GRID * GRID;
/** Bounded set of graphics that stay refit to the live surface: one extra draw call, one 1024² atlas. */
export const PRIORITY_LIMIT = 16;
/** Newest full-resolution atlases kept before compaction to 256 × 192. */
export const FULL_RES_LAYERS = 8;

// A complete Fibonacci sphere, visited in a coprime permutation. Latitude and
// longitude no longer derive from the same fractional golden-ratio sequence.
export function attachmentDirection(index: number): [number, number, number] {
  const layer = Math.floor(index / LAYER_SIZE),
    j = ((index % LAYER_SIZE) * 17) % LAYER_SIZE;
  const y = 1 - (2 * (j + 0.5)) / LAYER_SIZE,
    angle = j * Math.PI * (3 - Math.sqrt(5)) + layer * 1.137;
  const r = Math.sqrt(1 - y * y);
  return [Math.cos(angle) * r, y, Math.sin(angle) * r];
}

export type Placement = {
  normal: [number, number, number];
  roll: number;
  depth: number;
  width: number;
  height: number;
  /** Radius the sheet was bent for. */
  radius: number;
};
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** Where a bite lands at pickup. Frozen afterwards: old layers never move. */
export function regularPlacement(index: number, radius: number, aspect: number): Placement {
  const a = clamp(aspect, 0.55, 1.8),
    size = Math.max(10, radius * 1.15);
  return {
    normal: attachmentDirection(index),
    roll: index * 2.117,
    depth: Math.max(2, radius * 0.68),
    width: size * Math.sqrt(a),
    height: size / Math.sqrt(a),
    radius,
  };
}

/**
 * A priority graphic is the same bite refit to the current radius along its own
 * attachment direction: identical depth law and bend as the newest regular
 * pieces, 3% proud so it wins the local overlap, wide diagrams fitted not
 * stretched. It therefore lies inside the live shell band instead of on a
 * separate sphere above it, and hides its frozen inner copy underneath.
 */
export function priorityPlacement(index: number, radius: number, aspect: number): Placement {
  const a = clamp(aspect, 0.4, 2.5),
    size = Math.max(10, radius * 1.15);
  return {
    normal: attachmentDirection(index),
    roll: index * 2.117,
    depth: Math.max(2, radius * 0.68) + radius * 0.03,
    width: Math.min(size * 1.1, size * Math.sqrt(a)),
    height: Math.min(size * 1.1, size / Math.sqrt(a)),
    radius,
  };
}

/** Local sheet vertices (x, y, z) before orientation: bent toward the centre, lightly crumpled. */
export function sheet(p: Placement, seed: number) {
  const out = new Float32Array(VERTS * 3),
    size = Math.max(p.width, p.height);
  for (let i = 0; i < VERTS; i++) {
    const u = (i % GRID) / (GRID - 1) - 0.5,
      v = 0.5 - Math.floor(i / GRID) / (GRID - 1);
    const x = u * p.width,
      y = v * p.height;
    const bend = (x * x + y * y) / (Math.max(10, p.radius) * 2.5);
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = -bend + Math.sin(u * 13 + seed) * Math.sin(v * 11) * size * 0.035;
  }
  return out;
}

/** Quaternion (x, y, z, w) turning +Z onto the normal, then rolling about it. */
export function orientation(p: Placement): [number, number, number, number] {
  const [nx, ny, nz] = p.normal;
  let q: [number, number, number, number];
  const w = 1 + nz;
  if (w < 1e-8) q = [1, 0, 0, 0];
  else {
    const l = Math.hypot(-ny, nx, 0, w);
    q = [-ny / l, nx / l, 0, w / l];
  }
  const s = Math.sin(p.roll / 2),
    c = Math.cos(p.roll / 2);
  // q * roll(z)
  return [
    q[0] * c + q[1] * s,
    q[1] * c - q[0] * s,
    q[2] * c + q[3] * s,
    q[3] * c - q[2] * s,
  ];
}

/** Sheet vertices in ball space: oriented, then pushed out along the normal. */
export function worldVertices(p: Placement, local: Float32Array) {
  const [qx, qy, qz, qw] = orientation(p);
  const out = new Float32Array(local.length);
  for (let i = 0; i < local.length; i += 3) {
    const x = local[i],
      y = local[i + 1],
      z = local[i + 2];
    // v' = v + 2 q × (q × v + w v)
    const tx = 2 * (qy * z - qz * y),
      ty = 2 * (qz * x - qx * z),
      tz = 2 * (qx * y - qy * x);
    out[i] = x + qw * tx + (qy * tz - qz * ty) + p.normal[0] * p.depth;
    out[i + 1] = y + qw * ty + (qz * tx - qx * tz) + p.normal[1] * p.depth;
    out[i + 2] = z + qw * tz + (qx * ty - qy * tx) + p.normal[2] * p.depth;
  }
  return out;
}

export function vertexRadii(world: Float32Array) {
  const r: number[] = [];
  for (let i = 0; i < world.length; i += 3) r.push(Math.hypot(world[i], world[i + 1], world[i + 2]));
  return r;
}
