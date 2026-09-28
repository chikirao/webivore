import { useEffect, useRef } from "react";
import { Chevrons } from "./ui/marks";
import "./ui/victory.css";

/**
 * The win banner between the last bite and the trophy screen: bands sweep
 * across, YOU WON! slams in, then the finish screen takes over. Any click or
 * key skips it.
 */
export function Victory({ site, pieces, onDone }: { site: string; pieces: number; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => done.current(), reduced ? 1200 : 2600);
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && ["Shift", "Control", "Alt", "Meta", "Tab"].includes(e.key)) return;
      done.current();
    };
    addEventListener("keydown", skip);
    addEventListener("pointerdown", skip);
    return () => {
      clearTimeout(timer);
      removeEventListener("keydown", skip);
      removeEventListener("pointerdown", skip);
    };
  }, []);
  return (
    <div className="victory" role="alert">
      <div className="victory-flash" aria-hidden="true" />
      <div className="victory-band victory-band-red" aria-hidden="true" />
      <div className="victory-band victory-band-ink" aria-hidden="true">
        <Chevrons className="victory-chev" />
        <Chevrons className="victory-chev" />
        <Chevrons className="victory-chev" />
      </div>
      <div className="victory-card">
        <h2 className="victory-title display">
          <span>You</span> <span>won!</span>
        </h2>
        <p className="victory-sub label">
          {site} · {pieces} pieces eaten
        </p>
      </div>
      <span className="victory-skip label" aria-hidden="true">
        Click to skip
      </span>
    </div>
  );
}
