import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function BrandCursor() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      !matchMedia("(pointer:fine)").matches ||
      matchMedia("(prefers-reduced-motion:reduce)").matches
    )
      return;
    let x = innerWidth / 2,
      y = innerHeight / 2,
      tx = x,
      ty = y,
      hover = false,
      visible = false,
      raf = 0,
      scale = 1;
    const move = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      visible = true;
      hover =
        e.target instanceof Element && !!e.target.closest("button,a,input");
    };
    const leave = () => {
      visible = false;
    };
    const tick = () => {
      const dx = (tx - x) * 0.24,
        dy = (ty - y) * 0.24;
      x += dx;
      y += dy;
      scale += ((hover ? 1.9 : 1) - scale) * 0.12;
      if (ref.current) {
        const stretch = Math.min(0.78, (Math.hypot(dx, dy) / 42) * 0.78);
        ref.current.style.opacity = visible ? "1" : "0";
        ref.current.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) rotate(${Math.atan2(dy, dx)}rad) scale(${scale * (1 + stretch)},${scale * (1 - stretch * 0.3)})`;
      }
      raf = requestAnimationFrame(tick);
    };
    document.documentElement.classList.add("brand-cursor-active");
    window.addEventListener("pointermove", move);
    document.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      document.documentElement.classList.remove("brand-cursor-active");
    };
  }, []);
  // A body portal escapes transformed/isolated page layers and overflow clips.
  return createPortal(
    <div ref={ref} className="brand-cursor" aria-hidden="true" />,
    document.body,
  );
}
