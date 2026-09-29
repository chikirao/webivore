import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react";
import { setMix, setMuted, useMix, useMuted } from "../audio/engine";
import "./sound-mixer.css";

/** Where a slider comes back to when its speaker is turned on at zero. */
const RESTORE = 0.7;

function Row({
  label,
  value,
  off,
  onToggle,
  onChange,
}: {
  label: string;
  value: number;
  off: boolean;
  onToggle: () => void;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className={`mixer-row${off ? " is-off" : ""}`}>
      <button
        type="button"
        className="mixer-speaker"
        aria-pressed={off}
        aria-label={off ? `Turn ${label.toLowerCase()} on` : `Mute ${label.toLowerCase()}`}
        onClick={onToggle}
      >
        {off ? <SpeakerSlashIcon weight="fill" /> : <SpeakerHighIcon weight="fill" />}
      </button>
      <label className="label mixer-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="mixer-range"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={off ? 0 : value}
        style={{ "--fill": `${(off ? 0 : value) * 100}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/**
 * Two sliders: all sound and music. Each speaker mutes its slider; dragging a
 * slider to zero turns its speaker off, and dragging it up turns it back on.
 */
export function SoundMixer() {
  const mix = useMix(),
    muted = useMuted();
  const allOff = muted || mix.volume === 0,
    musicOff = mix.musicMuted || mix.music === 0;
  return (
    <div className="sound-mixer">
      <Row
        label="All sound"
        value={mix.volume}
        off={allOff}
        onToggle={() => {
          if (!allOff) setMuted(true);
          else {
            if (mix.volume === 0) setMix({ volume: RESTORE });
            setMuted(false);
          }
        }}
        onChange={(v) => {
          setMix({ volume: v });
          if (v > 0 && muted) setMuted(false);
        }}
      />
      <Row
        label="Music"
        value={mix.music}
        off={musicOff}
        onToggle={() => setMix(musicOff ? { musicMuted: false, music: mix.music || RESTORE } : { musicMuted: true })}
        onChange={(v) => setMix({ music: v, musicMuted: false })}
      />
    </div>
  );
}

/** A speaker that opens the mixer in a small window above it. */
export function SoundButton({ className = "", label = "Sound" }: { className?: string; label?: string }) {
  const mix = useMix(),
    muted = useMuted();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null),
    pop = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ right: number; bottom: number } | null>(null);
  const off = muted || mix.volume === 0;
  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (r) setAt({ right: Math.max(12, innerWidth - r.right), bottom: innerHeight - r.top + 10 });
  };
  useLayoutEffect(() => {
    if (open) place();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", key, true);
    addEventListener("resize", place);
    return () => {
      removeEventListener("pointerdown", away, true);
      removeEventListener("keydown", key, true);
      removeEventListener("resize", place);
    };
  }, [open]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`sound-button ${className}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        {off ? <SpeakerSlashIcon weight="fill" /> : <SpeakerHighIcon weight="fill" />}
        <span className="sound-button-text">{label}</span>
      </button>
      {open &&
        at &&
        createPortal(
          <div ref={pop} className="sound-pop" role="dialog" aria-label="Sound" style={at}>
            <SoundMixer />
          </div>,
          document.body,
        )}
    </>
  );
}
