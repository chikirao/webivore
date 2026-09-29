import { useSyncExternalStore } from "react";

/**
 * "Less effects": no CRT tube over the page, no RGB tearing or jolts, fewer
 * confetti and a still streak badge. For slower phones and for anyone who
 * finds the glitching tiring. Kept across visits.
 */
const KEY = "webivore.lessEffects";
let less = (() => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();
const listeners = new Set<() => void>();
const apply = () => document.documentElement.classList.toggle("less-effects", less);
if (typeof document !== "undefined") apply();

export const lessEffects = () => less;
export function setLessEffects(value: boolean) {
  less = value;
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
  apply();
  listeners.forEach((f) => f());
}
export function onLessEffects(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}
export const useLessEffects = () => useSyncExternalStore(onLessEffects, lessEffects);
