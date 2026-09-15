import { useEffect, useRef, useState, type PointerEvent } from "react";
import { CrosshairIcon } from "@phosphor-icons/react";
import "./ui/touch-controls.css";

/** Capability detection also covers iPads reporting a desktop user agent. */
export function useTouchControls() {
  const detect = () =>
    navigator.maxTouchPoints > 0 || matchMedia("(any-pointer: coarse)").matches;
  const [touch, setTouch] = useState(detect);
  useEffect(() => {
    const media = matchMedia("(any-pointer: coarse)");
    const update = () => setTouch(detect());
    const actualTouch = (event: globalThis.PointerEvent) => {
      if (event.pointerType === "touch") setTouch(true);
    };
    media.addEventListener("change", update);
    window.addEventListener("pointerdown", actualTouch, { passive: true });
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("pointerdown", actualTouch);
    };
  }, []);
  return touch;
}

export function TouchControls({
  onMove,
}: {
  onMove: (x: number, y: number) => void;
}) {
  const base = useRef<HTMLButtonElement>(null);
  const knob = useRef<HTMLSpanElement>(null);
  const owner = useRef<number | null>(null);
  const held = useRef(new Set<string>());
  useEffect(() => {
    const reset = () => {
      const id = owner.current;
      owner.current = null;
      if (id !== null && base.current?.hasPointerCapture(id))
        base.current.releasePointerCapture(id);
      held.current.clear();
      if (knob.current) knob.current.style.transform = "translate(0px, 0px)";
      if (base.current) base.current.dataset.active = "false";
      onMove(0, 0);
    };
    const hidden = () => {
      if (document.hidden) reset();
    };
    window.addEventListener("blur", reset);
    window.addEventListener("resize", reset);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      reset();
      window.removeEventListener("blur", reset);
      window.removeEventListener("resize", reset);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [onMove]);
  const point = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = Math.max(
      1,
      (rect.width - knob.current!.offsetWidth) / 2 - 8,
    );
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const distance = Math.hypot(dx, dy);
    const scale = distance ? Math.min(radius, distance) / distance : 0;
    knob.current!.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    // Radial dead zone; direction and speed remain analog beyond it.
    const magnitude = Math.max(
      0,
      (Math.min(1, distance / radius) - 0.12) / 0.88,
    );
    onMove(
      distance ? (dx / distance) * magnitude : 0,
      distance ? (dy / distance) * magnitude : 0,
    );
  };
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    if (owner.current !== event.pointerId) return;
    owner.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    knob.current!.style.transform = "translate(0px, 0px)";
    event.currentTarget.dataset.active = "false";
    onMove(0, 0);
  };
  return (
    <div className="touch-controls">
      <button
        type="button"
        className="touch-joystick"
        ref={base}
        aria-label="Movement joystick"
        aria-describedby="joystick-help"
        onPointerDown={(event) => {
          if (owner.current !== null || event.button !== 0) return;
          event.preventDefault();
          owner.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.dataset.active = "true";
          point(event);
        }}
        onPointerMove={(event) => {
          if (owner.current === event.pointerId) point(event);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onKeyDown={(event) => {
          if (!event.key.startsWith("Arrow")) return;
          event.preventDefault();
          event.stopPropagation();
          held.current.add(event.key);
          onMove(
            Number(held.current.has("ArrowRight")) -
              Number(held.current.has("ArrowLeft")),
            Number(held.current.has("ArrowDown")) -
              Number(held.current.has("ArrowUp")),
          );
        }}
        onKeyUp={(event) => {
          if (!event.key.startsWith("Arrow")) return;
          event.preventDefault();
          // Also let the game's keyup clear a key pressed before focus moved here.
          held.current.delete(event.key);
          onMove(
            Number(held.current.has("ArrowRight")) -
              Number(held.current.has("ArrowLeft")),
            Number(held.current.has("ArrowDown")) -
              Number(held.current.has("ArrowUp")),
          );
        }}
        onBlur={() => {
          held.current.clear();
          if (owner.current === null) onMove(0, 0);
        }}
      >
        <span className="joystick-knob" ref={knob}>
          <CrosshairIcon weight="bold" />
        </span>
        <span className="joystick-label" aria-hidden="true">
          Move
        </span>
      </button>
      <span id="joystick-help" className="sr-only">
        Drag to walk. Release to stop. Swipe the game field with another finger
        to rotate the camera. Arrow keys also move.
      </span>
      <span className="touch-camera-hint" aria-hidden="true">
        Swipe to look
      </span>
    </div>
  );
}
