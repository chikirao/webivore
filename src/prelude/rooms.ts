/**
 * Geometry of the generated room plates, in plate pixels. Source of truth:
 * docs/concepts/room-prelude/generated/round-02/<composition>/manifest*.json
 * (after relight.py). The wide plate is the landscape one outpainted 894 px
 * to each side.
 */
export type Rect = { x: number; y: number; w: number; h: number };
export type Room = {
  id: "landscape" | "wide" | "portrait";
  dir: string;
  size: [number, number];
  base: string;
  light: string;
  screen: Rect & { r: number };
  /** Must stay visible; scaling shrinks the plate rather than crop it. */
  safe: Rect;
  console: Rect;
  consoleShadow: { x: number; y: number };
  disc: Rect;
  /** Where the disc lands on the open tray: centre and diameter. */
  tray: { x: number; y: number; w: number };
  /** Full-width plate: never crop the sides (phones). */
  fullWidth?: boolean;
  ambience: Ambience;
};

/** Living details: lamp pool, moonlit window, the fly's airspace and perches. */
export type Ambience = {
  /** Warm lamp, centred off-frame to the left so only its throw is visible. */
  lamp: { x: number; y: number; r: number };
  /** Someone's TV off-frame to the right: a cold, flickering, grainy throw. */
  tv: { x: number; y: number; r: number };
  /** The monitor's plastic housing, which catches the TV's reflection. */
  housing: Rect;
  window?: Rect;
  moon?: { x: number; y: number; r: number };
  fly: { zone: Rect; perches: [number, number][] };
};

const landscape: Room = {
  id: "landscape",
  dir: "landscape",
  size: [3072, 2048],
  base: "room-base.webp",
  light: "screen-light.webp",
  screen: { x: 1186, y: 460, w: 694, h: 508, r: 24 },
  safe: { x: 720, y: 286, w: 1620, h: 1670 },
  console: { x: 1100, y: 1640, w: 850, h: 358 },
  consoleShadow: { x: 1010, y: 1550 },
  disc: { x: 677, y: 1784, w: 400, h: 229 },
  tray: { x: 1340, y: 1858, w: 318 },
  ambience: {
    lamp: { x: -420, y: 980, r: 1450 },
    tv: { x: 3330, y: 1050, r: 1750 },
    housing: { x: 1135, y: 420, w: 795, h: 670 },
    window: { x: 0, y: 32, w: 312, h: 850 },
    moon: { x: 88, y: 312, r: 26 },
    fly: {
      zone: { x: 2280, y: 420, w: 760, h: 900 },
      perches: [
        [2820, 776],
        [2950, 780],
        [2632, 998],
        [2735, 1057],
      ],
    },
  },
};

const WIDE_SHIFT = 894;
const shift = <T extends { x: number }>(r: T): T => ({ ...r, x: r.x + WIDE_SHIFT });
const wide: Room = {
  ...landscape,
  id: "wide",
  size: [4860, 2048],
  base: "room-base-wide.webp",
  light: "screen-light-wide.webp",
  screen: { x: 2082, y: 460, w: 678, h: 508, r: 24 },
  safe: shift(landscape.safe),
  console: shift(landscape.console),
  consoleShadow: shift(landscape.consoleShadow),
  disc: shift(landscape.disc),
  tray: shift(landscape.tray),
  // the wide plate is its own outpainted photo: window, moon and lamp moved
  ambience: {
    lamp: { x: -380, y: 930, r: 1500 },
    tv: { x: 5120, y: 1050, r: 1800 },
    housing: shift(landscape.ambience.housing),
    window: { x: 340, y: 30, w: 870, h: 850 },
    moon: { x: 980, y: 308, r: 26 },
    fly: {
      zone: shift(landscape.ambience.fly.zone),
      perches: landscape.ambience.fly.perches.map(([x, y]) => [x + WIDE_SHIFT, y]),
    },
  },
};

const portrait: Room = {
  id: "portrait",
  dir: "portrait",
  size: [2048, 3072],
  base: "room-base.webp",
  light: "screen-light.webp",
  screen: { x: 662, y: 1136, w: 730, h: 538, r: 24 },
  safe: { x: 0, y: 190, w: 2048, h: 2660 },
  console: { x: 620, y: 2340, w: 820, h: 346 },
  consoleShadow: { x: 530, y: 2250 },
  disc: { x: 142, y: 2583, w: 450, h: 252 },
  tray: { x: 852, y: 2550, w: 308 },
  fullWidth: true,
  ambience: {
    lamp: { x: -420, y: 1320, r: 1500 },
    tv: { x: 2330, y: 1750, r: 1700 },
    housing: { x: 608, y: 1094, w: 837, h: 706 },
    fly: {
      zone: { x: 1300, y: 1450, w: 700, h: 850 },
      perches: [
        [1560, 1986],
        [1660, 1990],
        [1850, 1924],
      ],
    },
  },
};

export function pickRoom(vw: number, vh: number): Room {
  const aspect = vw / vh;
  return aspect < 0.82 ? portrait : aspect > 1.9 ? wide : landscape;
}

export type Fit = {
  s: number;
  tx: number;
  ty: number;
  /** Visible gaps around the plate, in viewport px. */
  gaps: { top: number; bottom: number; left: number; right: number };
};

/** Cover the viewport unless that would cut into the safe area; phones keep the full width. */
export function fitRoom(room: Room, vw: number, vh: number): Fit {
  const [W, H] = room.size;
  const cover = Math.max(vw / W, vh / H);
  const s = room.fullWidth ? vw / W : Math.min(cover, vw / room.safe.w, vh / room.safe.h);
  const place = (view: number, total: number, focus: number) => {
    if (total <= view) return (view - total) / 2;
    return Math.min(0, Math.max(view - total, view / 2 - focus));
  };
  const fx = (room.safe.x + room.safe.w / 2) * s,
    fy = (room.safe.y + room.safe.h / 2) * s;
  const tx = place(vw, W * s, fx),
    ty = place(vh, H * s, fy);
  return {
    s,
    tx,
    ty,
    gaps: {
      top: Math.max(0, ty),
      bottom: Math.max(0, vh - (ty + H * s)),
      left: Math.max(0, tx),
      right: Math.max(0, vw - (tx + W * s)),
    },
  };
}

/** Camera move that fills the viewport with the glass. */
export function zoomToScreen(room: Room, vw: number, vh: number) {
  const { x, y, w, h } = room.screen;
  const s = Math.max(vw / w, vh / h) * 1.06;
  return { s, tx: vw / 2 - (x + w / 2) * s, ty: vh / 2 - (y + h / 2) * s };
}
