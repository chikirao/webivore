import { useEffect, useRef, useState } from "react";
import { CaretDoubleRightIcon } from "@phosphor-icons/react";

/** A live data dial: one segment per 2.5% of the captured page. */
export function drawProgressDial(
  c: CanvasRenderingContext2D,
  percent: number,
  size: number,
  full = false,
) {
  const p = Math.max(0, Math.min(100, percent));
  c.clearRect(0, 0, size, size);
  const radius = size * 0.405,
    center = size / 2;
  const start = full ? -Math.PI / 2 : Math.PI / 2;
  const sweep = full ? Math.PI * 2 : Math.PI * 1.5;
  for (let i = 0; i < 40; i++) {
    const a = start + (i * sweep) / 40 + 0.013;
    const b = start + ((i + 1) * sweep) / 40 - 0.013;
    c.beginPath();
    c.arc(center, center, radius, a, b);
    c.strokeStyle = "#a0a0a0";
    c.lineWidth = size * 0.09;
    c.stroke();
    c.strokeStyle = "#dedede";
    c.lineWidth = size * 0.077;
    c.stroke();
    const fraction = Math.min(1, Math.max(0, p / 2.5 - i));
    if (fraction > 0) {
      c.beginPath();
      c.arc(center, center, radius, a, a + (b - a) * fraction);
      c.strokeStyle = "#ed0016";
      c.lineWidth = size * 0.077;
      c.stroke();
      c.beginPath();
      c.arc(center, center, radius - size * 0.024, a, a + (b - a) * fraction);
      c.strokeStyle = "#ff6972";
      c.lineWidth = size * 0.009;
      c.stroke();
    }
  }
}

export function ProgressDial({
  percent,
  count,
}: {
  percent: number;
  count: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [pulse, setPulse] = useState(0);
  const previous = useRef(0);
  useEffect(() => {
    const stage = Math.floor(Math.min(100, percent + 0.000001) / 25);
    if (stage > previous.current) setPulse(stage);
    previous.current = stage;
    const timer = setTimeout(() => setPulse(0), 1300);
    return () => clearTimeout(timer);
  }, [Math.floor(percent / 25)]);
  useEffect(() => {
    if (ref.current)
      drawProgressDial(ref.current.getContext("2d")!, percent, 512);
  }, [percent, pulse]);
  return (
    <section
      className={`scoreboard ${percent >= 75 ? "charged" : ""}`}
      aria-label="Page consumed"
    >
      <div className={`progress-dial ${pulse ? "milestone" : ""}`} key={pulse}>
        <canvas
          ref={ref}
          width={512}
          height={512}
          role="progressbar"
          aria-label="Website consumed"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
        />
        <img className="dial-mascot" src="/assets/rabbit-victory.png" alt="" />
        <strong>
          {percent.toFixed(1)}
          <small>%</small>
        </strong>
        <span className="dial-caption">CONSUMED</span>
      </div>
      <div className="next-stage silver-panel">
        <span>{percent >= 100 ? "COMPLETE" : "NEXT:"}</span>
        <b>{Math.min(100, (Math.floor(percent / 25) + 1) * 25)}%</b>
        <CaretDoubleRightIcon weight="bold" />
      </div>
      <span className="sr-only">{count} pieces collected</span>
      {pulse > 0 && (
        <div className="milestone-label" role="status">
          {pulse === 4 ? "ALL YOURS!" : `${pulse * 25}% — KEEP EATING!`}
        </div>
      )}
    </section>
  );
}

export function PickupSignal({
  count,
  label,
}: {
  count: number;
  label: string;
}) {
  const previous = useRef(count);
  const [signal, setSignal] = useState({ id: 0, big: false, visible: false });
  useEffect(() => {
    const delta = count - previous.current;
    previous.current = count;
    if (delta <= 0) return;
    setSignal({ id: count, big: delta >= 4, visible: true });
    const timeout = setTimeout(
      () => setSignal((s) => ({ ...s, visible: false })),
      1100,
    );
    return () => clearTimeout(timeout);
  }, [count]);
  if (!signal.visible) return null;
  return (
    <div
      key={signal.id}
      className={`pickup-label ${signal.big ? "big-bite" : ""}`}
    >
      <b>{signal.big ? "BIG BITE!" : "GOT IT!"}</b>
      <span>{label}</span>
    </div>
  );
}
