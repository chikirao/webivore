import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * A flat graphic plate: cut-corner rail, slanted rail, arrow key or tag,
 * drawn as an SVG behind its content with an exact inset keyline. The polygon
 * is rebuilt in pixels whenever the element resizes, so chamfers and arrow
 * heads keep their angles at every viewport instead of stretching.
 */
export type PlateShape = "cut" | "slant" | "key" | "tag" | "chip";
export type Corner = "tl" | "tr" | "bl" | "br";
type Point = [number, number];
export type PlateProps = {
  shape?: PlateShape;
  /** Chamfer size (cut/tag/chip) or slant offset (slant/tag), px. */
  cut?: number;
  corners?: Corner[];
  /** Arrow head depth for "key"; defaults to 45°. */
  arrow?: number;
  /** -1 leans the slant the other way. */
  lean?: 1 | -1;
  fill?: string;
  line?: string | null;
  lineWidth?: number;
  inset?: number;
  as?: "div" | "button" | "span" | "a" | "section" | "header" | "footer" | "label";
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  [attr: string]: unknown;
};

export function outline(shape: PlateShape, w: number, h: number, cut: number, corners: Corner[], arrow: number, lean: 1 | -1): Point[] {
  const c = Math.min(cut, w / 2, h / 2);
  const has = (k: Corner) => corners.includes(k);
  switch (shape) {
    case "slant":
      return lean > 0 ? [[c, 0], [w, 0], [w - c, h], [0, h]] : [[0, 0], [w - c, 0], [w, h], [c, h]];
    case "key": {
      const a = Math.min(arrow || h * 0.5, w * 0.6);
      const pts: Point[] = [[has("tl") ? c : 0, 0], [w - a, 0], [w, h / 2], [w - a, h], [0, h]];
      if (has("tl")) pts.push([0, c]);
      return pts;
    }
    case "tag":
      return [[c, 0], [w, 0], [w, h - c], [w - c, h], [0, h]];
    case "chip": {
      const r = Math.min(h / 2, w / 2);
      return [[r, 0], [w - r, 0], [w, r], [w, h - r], [w - r, h], [r, h], [0, h - r], [0, r]];
    }
    default: {
      const pts: Point[] = [];
      if (has("tl")) pts.push([c, 0]);
      else pts.push([0, 0]);
      if (has("tr")) pts.push([w - c, 0], [w, c]);
      else pts.push([w, 0]);
      if (has("br")) pts.push([w, h - c], [w - c, h]);
      else pts.push([w, h]);
      if (has("bl")) pts.push([c, h], [0, h - c]);
      else pts.push([0, h]);
      if (has("tl")) pts.push([0, c]);
      return pts;
    }
  }
}

/** Inset a convex polygon by d: offset every edge inward and intersect neighbours. */
export function insetPolygon(points: Point[], d: number): Point[] {
  const n = points.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const sign = area > 0 ? 1 : -1;
  const lines = points.map((p, i) => {
    const q = points[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
    // inward normal
    const nx = (sign * dy) / l, ny = (-sign * dx) / l;
    return { p: [p[0] - nx * d, p[1] - ny * d] as Point, d: [dx, dy] as Point };
  });
  return lines.map((_, i) => {
    const a = lines[(i - 1 + n) % n], b = lines[i];
    const det = a.d[0] * b.d[1] - a.d[1] * b.d[0];
    if (Math.abs(det) < 1e-6) return b.p;
    const t = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / det;
    return [a.p[0] + a.d[0] * t, a.p[1] + a.d[1] * t];
  });
}
const path = (pts: Point[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + "Z";

export function Plate({
  shape = "cut",
  cut = 18,
  corners = ["tl", "br"],
  arrow = 0,
  lean = 1,
  fill = "var(--ink)",
  line = "var(--paper)",
  lineWidth = 3,
  inset = 5,
  as: Tag = "div",
  className = "",
  style,
  children,
  ...rest
}: PlateProps) {
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  useLayoutEffect(() => {
    const el = ref.current!;
    const measure = () => setSize([el.offsetWidth, el.offsetHeight]);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [w, h] = size;
  const pts = w && h ? outline(shape, w, h, cut, corners, arrow, lean).filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 0.5) : [];
  const Element = Tag as "div";
  return (
    <Element ref={ref as never} className={`plate ${className}`} style={style} {...(rest as object)}>
      {w > 0 && (
        <svg className="plate-art" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
          <path d={path(pts)} fill={fill} />
          {line && <path d={path(insetPolygon(pts, inset))} fill="none" stroke={line} strokeWidth={lineWidth} strokeLinejoin="miter" />}
        </svg>
      )}
      <span className="plate-body">{children}</span>
    </Element>
  );
}
