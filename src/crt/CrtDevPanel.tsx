import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GearSixIcon, XIcon } from "@phosphor-icons/react";
import { CRT_DEFAULTS, crtSettings, onCrtSettings, resetCrtSettings, setCrtSetting, type CrtSettings } from "./settings";
import { crtKick, crtTransition } from "./fx";
import "./crt-dev.css";

/** Dev builds only: live CRT tuning. Values persist in localStorage. */
type Range = [key: string, label: string, min: number, max: number, step: number];
const GROUPS: [keyof CrtSettings, string, Range[]][] = [
  [
    "room",
    "Room light (intro)",
    [
      ["lamp", "Lamp", 0, 1.5, 0.01],
      ["tv", "TV light", 0, 1.5, 0.01],
      ["spill", "Monitor spill", 0, 1, 0.01],
      ["tvReflect", "TV streak on monitor", 0, 1.5, 0.01],
      ["moon", "Moonlight", 0, 1.5, 0.01],
      ["grain", "Grain", 0, 0.4, 0.005],
      ["grainSize", "Grain size, px @1080p", 0.5, 5, 0.25],
      ["grainFps", "Grain fps", 4, 60, 1],
      ["grainShadows", "Grain in shadows", 0, 1, 0.01],
      ["grainColor", "Grain colour", 0, 1, 0.01],
      ["cloudDark", "Cloud darkness", 0, 1, 0.01],
      ["windowDim", "Window dim under cloud", 0, 1, 0.01],
      ["cloudSize", "Cloud size", 0.5, 3, 0.05],
      ["cloudPeriod", "Cloud pass, s", 8, 90, 1],
    ],
  ],
  [
    "overlay",
    "Tube over the page",
    [
      ["scanlines", "Scanlines", 0, 1, 0.01],
      ["linePx", "Line period, px", 2, 8, 1],
      ["grille", "Aperture grille", 0, 1, 0.01],
      ["vignette", "Vignette", 0, 1.5, 0.01],
      ["corner", "Rounded corners", 0, 1, 0.01],
      ["edgeRgb", "Edge RGB split, px", 0, 12, 0.5],
      ["edgeWidth", "Edge RGB width", 0.05, 0.5, 0.01],
      ["barrel", "Barrel, px", 0, 20, 0.5],
      ["noise", "Noise", 0, 0.2, 0.005],
      ["flicker", "Flicker", 0, 0.15, 0.005],
      ["glare", "Glass glare", 0, 0.3, 0.01],
    ],
  ],
  [
    "burst",
    "Bursts and switches",
    [
      ["kick", "Kick strength", 0, 2, 0.05],
      ["kickMs", "Kick, ms", 120, 1200, 10],
      ["switchMs", "Switch, ms", 200, 1600, 10],
      ["rgbSplit", "RGB split, px", 0, 60, 1],
      ["tear", "Tearing, px", 0, 120, 1],
      ["bands", "Colour bands", 0, 1.5, 0.05],
    ],
  ],
  [
    "screen",
    "Monitor in the room",
    [
      ["curve", "Curvature", 0, 0.15, 0.002],
      ["overscan", "Overscan", 0.95, 1.15, 0.005],
      ["lines", "Lines", 120, 480, 2],
      ["scanlines", "Scanlines", 0, 1, 0.01],
      ["grille", "Aperture grille", 0, 1, 0.01],
      ["halation", "Halation", 0, 1, 0.01],
      ["convergence", "Convergence", 0, 4, 0.05],
      ["noise", "Noise", 0, 0.2, 0.005],
      ["white", "Peak white", 0.4, 1.2, 0.01],
      ["inset", "Glass inset shadow", 0, 1, 0.01],
      ["insetWidth", "Inset width", 0.01, 0.15, 0.005],
      ["bevel", "Plastic bevel", 0, 1, 0.01],
    ],
  ],
];

export function CrtDevPanel() {
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => onCrtSettings(() => bump((n) => n + 1)), []);
  return createPortal(
    <div className="crt-dev">
      <button type="button" className="crt-dev-gear" aria-label="CRT settings" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <XIcon weight="bold" /> : <GearSixIcon weight="fill" />}
      </button>
      {open && (
        <div className="crt-dev-panel" role="dialog" aria-label="CRT settings">
          <label className="crt-dev-row crt-dev-check">
            <input
              type="checkbox"
              checked={crtSettings.overlay.enabled}
              onChange={(e) => setCrtSetting("overlay", "enabled", e.target.checked)}
            />
            Tube over the page
          </label>
          <div className="crt-dev-actions">
            <button type="button" onClick={() => crtKick(1)}>Kick</button>
            <button type="button" onClick={() => crtKick(2)}>Big kick</button>
            <button type="button" onClick={() => crtTransition("switch")}>Switch</button>
            <button type="button" onClick={() => crtTransition("power-on")}>Power on</button>
            <button type="button" onClick={() => crtTransition("reveal")}>Reveal</button>
          </div>
          {GROUPS.map(([group, title, ranges]) => (
            <fieldset key={group}>
              <legend>{title}</legend>
              {ranges.map(([key, label, min, max, step]) => {
                const value = (crtSettings[group] as Record<string, number>)[key];
                const def = (CRT_DEFAULTS[group] as Record<string, number>)[key];
                return (
                  <label key={key} className="crt-dev-row">
                    <span className={value !== def ? "changed" : ""}>{label}</span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={value}
                      onChange={(e) => setCrtSetting(group, key as never, Number(e.target.value))}
                      onDoubleClick={() => setCrtSetting(group, key as never, def)}
                    />
                    <output>{Number(value.toFixed(3))}</output>
                  </label>
                );
              })}
            </fieldset>
          ))}
          <div className="crt-dev-actions">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(JSON.stringify(crtSettings, null, 2));
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? "Copied" : "Copy JSON"}
            </button>
            <button type="button" onClick={resetCrtSettings}>Reset all</button>
          </div>
          <p className="crt-dev-note">Double-click a slider to reset it. Room monitor changes apply live in the intro.</p>
        </div>
      )}
    </div>,
    document.body,
  );
}
