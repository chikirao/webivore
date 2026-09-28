import { useEffect, useRef, useState } from "react";
import type { PickupEvent } from "./game";
import { burstFrom } from "./ui/confetti";

/** A streak ends this long after the last bite. */
export const STREAK_MS = 2400;

/** Streak steps: every step up looks and moves louder; rainbow is saved for 100. */
const TIERS: [number, string][] = [
  [150, "Godlike!!!"],
  [100, "Webivore!!!"],
  [75, "Rampage!!"],
  [50, "Frenzy!!"],
  [35, "Feast!"],
  [20, "Greedy"],
  [10, "Hungry"],
  [5, "Nice"],
];
/** 0–4 exclamation marks, one more at 20, 50, 100 and 150. */
export const bangs = (n: number) => [20, 50, 100, 150].filter((from) => n >= from).length;
export function comboTier(n: number) {
  const i = TIERS.findIndex(([from]) => n >= from);
  return i < 0 ? { tier: 0, word: "" } : { tier: TIERS.length - i, word: TIERS[i][1] };
}

/**
 * One streak counter instead of a popup per bite. Each bite bumps it (X1, X2,
 * …) and restarts the timer bar; every tenth bite throws confetti from it.
 */
export function Combo({ pickups }: { pickups: PickupEvent[] }) {
  const [streak, setStreak] = useState(0);
  const [bumped, setBumped] = useState(0);
  const seen = useRef(new Set<number>());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const badge = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const fresh = pickups.filter((p) => !seen.current.has(p.id));
    if (!fresh.length) return;
    for (const p of fresh) seen.current.add(p.id);
    if (seen.current.size > 64) seen.current = new Set([...seen.current].slice(-32));
    setStreak((n) => n + fresh.length);
    setBumped((b) => b + 1);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStreak(0), STREAK_MS);
  }, [pickups]);
  const previous = useRef(0);
  useEffect(() => {
    if (Math.floor(streak / 10) > Math.floor(previous.current / 10))
      burstFrom(badge.current, { count: 30 + Math.min(90, streak / 2), rainbow: streak >= 100, power: 480 + Math.min(300, streak) });
    previous.current = streak;
  }, [streak]);
  if (!streak) return null;
  const { tier, word } = comboTier(streak);
  return (
    <div ref={badge} className={`combo tier-${tier}`} aria-live="polite" aria-label={`Streak ${streak}`}>
      <strong key={bumped} className="display combo-count">
        <small>x</small>
        {streak}
        {"!".repeat(bangs(streak))}
      </strong>
      {word && (
        <span key={word} className="combo-word display">
          {word}
        </span>
      )}
      <i key={`t${bumped}`} className="combo-timer" style={{ animationDuration: `${STREAK_MS}ms` }} />
    </div>
  );
}
