import { useEffect, useRef } from "react";
import { LightningIcon } from "@phosphor-icons/react";

/**
 * The boost: fires on press (not on release, so a thumb can tap it between
 * camera swipes); fills up again over the cooldown. `charge` is read every
 * frame straight from the game, without React renders.
 */
export function BoostButton({
  onBoost,
  charge,
  className = "",
  keyLabel,
}: {
  onBoost: () => void;
  charge: () => number;
  className?: string;
  /** Shown on keyboards: the key that also boosts. */
  keyLabel?: string;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const el = button.current,
        c = charge();
      if (el) {
        el.style.setProperty("--charge", String(c));
        const ready = String(c >= 1);
        if (el.dataset.ready !== ready) el.dataset.ready = ready;
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [charge]);
  return (
    <button
      ref={button}
      type="button"
      className={`boost-button ${className}`}
      aria-label="Boost"
      aria-keyshortcuts={keyLabel ? "Space" : undefined}
      title={keyLabel ? "Boost (Space)" : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        onBoost();
      }}
      // keyboard activation (Enter on the focused button); pointers fired on press
      onClick={(e) => {
        if (e.detail === 0) onBoost();
      }}
    >
      <LightningIcon weight="fill" />
      {keyLabel ? <span className="boost-key">{keyLabel}</span> : <span className="boost-label">Boost</span>}
    </button>
  );
}
