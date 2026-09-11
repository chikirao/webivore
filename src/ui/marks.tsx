import type { CSSProperties, ReactNode } from "react";

/** Authored vector pictograms of the OVERDRIVE system. All editable, all resolution independent. */
type MarkProps = { className?: string; style?: CSSProperties; title?: string };
const a11y = (title?: string) => (title ? { role: "img", "aria-label": title } : { "aria-hidden": true });

/** Outlined rabbit head: one straight ear, one folded, angular eyes, no mouth, no nose. */
export function RabbitMark({ className, style, title }: MarkProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} style={style} {...a11y(title)}>
      <g fill="none" strokeLinecap="round">
        <path d="M46 64 L40 12" stroke="var(--ink)" strokeWidth="19" />
        <path d="M46 64 L40 12" stroke="var(--paper)" strokeWidth="12" />
        <path d="M80 50 Q92 20 110 30" stroke="var(--ink)" strokeWidth="17" />
        <path d="M80 50 Q92 20 110 30" stroke="var(--paper)" strokeWidth="10" />
      </g>
      <circle cx="60" cy="74" r="35" fill="var(--ink)" />
      <circle cx="60" cy="74" r="30" fill="var(--paper)" />
      <path d="M33 70 L56 79 L55 89 L36 81 Z M87 70 L64 79 L65 89 L84 81 Z" fill="var(--ink)" />
    </svg>
  );
}

/** Entry hero: the rabbit emerging behind speed graphics, hugging a "www." paper ball. */
export function RabbitHero({ className, style }: MarkProps) {
  return (
    <svg viewBox="0 0 640 760" className={className} style={style} aria-hidden="true">
      {/* speed slabs */}
      <g fill="var(--red)">
        <path d="M470 0 L640 0 L640 250 L560 250 Z" />
        <path d="M600 300 L640 300 L640 520 L520 520 Z" />
        <path d="M60 690 L200 690 L150 760 L0 760 Z" />
        <path d="M420 690 L640 690 L640 760 L380 760 Z" />
      </g>
      <g fill="var(--ink)">
        <path d="M520 20 L560 20 L520 80 L480 80 Z" opacity="0.9" />
        <path d="M0 560 L60 560 L30 610 L0 610 Z" />
      </g>
      {/* chevrons and marks */}
      <g fill="var(--red)">
        <path d="M40 40 l26 0 l30 34 l-30 34 l-26 0 l30 -34 z" />
        <path d="M84 40 l26 0 l30 34 l-30 34 l-26 0 l30 -34 z" />
        <path d="M128 40 l26 0 l30 34 l-30 34 l-26 0 l30 -34 z" />
      </g>
      <g fill="none" stroke="var(--ink)" strokeWidth="14" strokeLinecap="round">
        <path d="M560 560 l40 40 M600 560 l-40 40" />
        <path d="M600 640 v52 M574 666 h52" />
      </g>
      <g fill="var(--red)">
        {Array.from({ length: 5 }, (_, i) =>
          Array.from({ length: 5 }, (_, j) => <circle key={`${i}-${j}`} cx={470 + i * 16} cy={600 + j * 16} r="4" />),
        )}
      </g>
      {/* ears */}
      <g fill="none" strokeLinecap="round">
        <path d="M262 190 L222 22" stroke="var(--ink)" strokeWidth="78" />
        <path d="M262 190 L222 22" stroke="var(--paper)" strokeWidth="56" />
        <path d="M430 200 Q510 80 600 118" stroke="var(--ink)" strokeWidth="74" />
        <path d="M430 200 Q510 80 600 118" stroke="var(--paper)" strokeWidth="52" />
      </g>
      {/* body below the head */}
      <path d="M228 420 C200 520 236 640 330 650 C424 640 460 520 432 420 Z" fill="var(--ink)" />
      <path d="M242 432 C218 520 250 626 330 636 C410 626 442 520 418 432 Z" fill="var(--paper)" />
      {/* head */}
      <circle cx="330" cy="310" r="160" fill="var(--ink)" />
      <circle cx="330" cy="310" r="146" fill="var(--paper)" />
      <path d="M212 290 L318 322 L314 358 L222 334 Z M448 290 L342 322 L346 358 L438 334 Z" fill="var(--ink)" />
      {/* paper ball with www. */}
      <g transform="translate(330 592) scale(1.12)">
        <path
          d="M-8 -118 L58 -104 L108 -60 L118 8 L96 66 L44 108 L-20 116 L-80 90 L-112 34 L-108 -34 L-74 -92 Z"
          fill="var(--ink)"
        />
        <path
          d="M-8 -104 L50 -92 L94 -54 L104 6 L84 58 L38 94 L-18 102 L-70 78 L-98 30 L-94 -30 L-64 -82 Z"
          fill="var(--paper)"
        />
        <path d="M-64 -82 L-8 -40 L50 -92 M-8 -40 L-18 102 M-8 -40 L104 6 M-8 -40 L-98 30" fill="none" stroke="var(--ash)" strokeWidth="4" />
        <text x="0" y="14" textAnchor="middle" fontFamily="Tektur, Arial, sans-serif" fontWeight="700" fontSize="46" fill="var(--ink)">
          www.
        </text>
        <path d="M-52 40 h104 M-44 56 h88 M-36 72 h72" stroke="var(--ash)" strokeWidth="5" />
      </g>
      {/* hands */}
      <circle cx="176" cy="540" r="56" fill="var(--ink)" />
      <circle cx="176" cy="540" r="46" fill="var(--paper)" />
      <circle cx="484" cy="540" r="56" fill="var(--ink)" />
      <circle cx="484" cy="540" r="46" fill="var(--paper)" />
    </svg>
  );
}

/** Crumpled ball pictogram (size readout). */
export function BallMark({ className, style, title }: MarkProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} style={style} {...a11y(title)}>
      <path d="M31 4 L48 9 L59 24 L60 42 L48 57 L30 61 L13 52 L4 34 L8 15 L20 6 Z" fill="currentColor" />
      <path
        d="M31 12 L44 16 L52 27 L52 41 L43 51 L30 54 L18 47 L12 34 L15 20 L23 13 Z"
        fill="none"
        stroke="var(--mark-line, var(--paper))"
        strokeWidth="3"
      />
      <path d="M23 13 L31 32 L44 16 M31 32 L18 47 M31 32 L52 41 M31 32 L30 54" fill="none" stroke="var(--mark-line, var(--paper))" strokeWidth="2.5" />
    </svg>
  );
}

/** Stopwatch pictogram (time readout). */
export function ClockMark({ className, style, title }: MarkProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} style={style} {...a11y(title)}>
      <path d="M26 3 h12 v8 h-12 z M44 12 l6 -5 l5 5 l-6 6 z" fill="currentColor" />
      <circle cx="32" cy="37" r="24" fill="currentColor" />
      <circle cx="32" cy="37" r="17" fill="var(--mark-line, var(--paper))" />
      <path d="M32 37 V24 M32 37 L41 43" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Three stacked arrowheads. */
export function Chevrons({ count = 3, className, style }: MarkProps & { count?: number }) {
  return (
    <svg viewBox={`0 0 ${count * 16 + 6} 24`} className={className} style={style} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <path key={i} d={`M${i * 16} 0 h8 l10 12 l-10 12 h-8 l10 -12 z`} fill="currentColor" />
      ))}
    </svg>
  );
}

/** Spiky burst behind a short signal word. */
export function Burst({ children, className, style }: MarkProps & { children?: ReactNode }) {
  const pts: string[] = [];
  const n = 18;
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? 44 : 60 + (i % 3) * 8;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${(70 + Math.cos(a) * r * 1.35).toFixed(1)},${(60 + Math.sin(a) * r).toFixed(1)}`);
  }
  return (
    <span className={`burst ${className ?? ""}`} style={style}>
      <svg viewBox="0 0 140 120" aria-hidden="true">
        <polygon points={pts.join(" ")} fill="var(--red)" stroke="var(--ink)" strokeWidth="4" strokeLinejoin="round" />
        <polygon points={pts.join(" ")} fill="none" stroke="var(--paper)" strokeWidth="3" strokeLinejoin="round" transform="translate(70 60) scale(0.86) translate(-70 -60)" />
      </svg>
      <span className="burst-text">{children}</span>
    </span>
  );
}

/** Three serial indicator dots: one live. */
export function Serial({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 84 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="var(--red)" />
      <circle cx="42" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="72" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}
