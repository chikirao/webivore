import { useEffect, useRef, useState } from "react";
import { Chevrons } from "./ui/marks";
import { burstFrom } from "./ui/confetti";
import { popper } from "./audio/sfx";
import "./ui/victory.css";

/** Seconds the rabbit dances before the banner, and how long the banner stays. */
export const DANCE_MS = 4000;
export const BANNER_MS = 3000;
/** The jingle's hits, ms after the banner appears. */
const HITS = [400, 900, 1400, 1900];

/**
 * Between the last bite and the trophy screen: first the rabbit dances in the
 * 3D scene (the game drives that), then the screen washes white and the red
 * YOU WON! card slams in, then the finish screen takes over. Only the Skip
 * button, Enter or Escape skip it; held movement keys and Space (a boost
 * pressed on the last bite) do not.
 */
export function Victory({ site, pieces, onDone }: { site: string; pieces: number; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  const [banner, setBanner] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  // The card lands on the finale jingle's four hits (card, YOU, WON!, the
  // line under it; see scripts/game-music.py), the paper flies on the last.
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => {
      burstFrom(card.current, { count: 90, power: 900, angle: -Math.PI * 0.75, spread: 1.1 });
      burstFrom(card.current, { count: 90, power: 900, angle: -Math.PI * 0.25, spread: 1.1 });
      popper();
    }, HITS[3]);
    return () => clearTimeout(timer);
  }, [banner]);
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dance = reduced ? 0 : DANCE_MS;
    const show = setTimeout(() => setBanner(true), dance);
    const end = setTimeout(() => done.current(), dance + (reduced ? 1500 : BANNER_MS));
    const key = (e: KeyboardEvent) => {
      if (e.repeat || !["Enter", "Escape"].includes(e.key)) return;
      e.preventDefault();
      done.current();
    };
    addEventListener("keydown", key);
    return () => {
      clearTimeout(show);
      clearTimeout(end);
      removeEventListener("keydown", key);
    };
  }, []);
  return (
    <div className={`victory${banner ? " is-banner" : ""}`}>
      {banner && (
        <>
          <div className="victory-veil" aria-hidden="true" />
          <div ref={card} className="victory-card" role="alert">
            <Chevrons className="victory-chev victory-chev-top" count={6} />
            <h2 className="victory-title display">
              <span>You</span> <span>won!</span>
            </h2>
            <p className="victory-sub label">
              {site} · {pieces} pieces eaten
            </p>
            <Chevrons className="victory-chev victory-chev-bottom" count={6} />
          </div>
        </>
      )}
      <button className="victory-skip label" onClick={() => done.current()}>
        Skip
      </button>
    </div>
  );
}
