import { useEffect, useRef, useState } from "react";
import { Plate } from "./Plate";
import { Chevrons, RabbitMark } from "./marks";

const SEGMENTS = 40;
/**
 * The appetite strip: rabbit shield, huge percentage, a long segmented meter
 * with 25/50/75/100 milestones, a NEXT marker and chevrons at the live tip.
 * Milestones pulse once; the tip grows busier past 75%; completion sweeps once.
 * Readability never depends on the animation.
 */
export function Meter({ percent, count, total, complete = false }: { percent: number; count: number; total: number; complete?: boolean }) {
  const p = complete ? 100 : Math.max(0, Math.min(100, percent));
  const stage = Math.floor(Math.min(100, p + 1e-6) / 25);
  const previous = useRef(stage);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (stage > previous.current) {
      setPulse(stage);
      const timer = setTimeout(() => setPulse(0), 1100);
      previous.current = stage;
      return () => clearTimeout(timer);
    }
    previous.current = stage;
  }, [stage]);
  const next = Math.min(100, (stage + 1) * 25);
  const filled = p / (100 / SEGMENTS);
  return (
    <section className={`meter ${p >= 75 ? "charged" : ""} ${p >= 100 ? "complete" : ""} ${pulse ? "pulse" : ""}`} aria-label="Page consumed">
      <Plate shape="cut" cut={16} corners={["tl", "br"]} className="meter-shield" inset={4}>
        <RabbitMark className="meter-rabbit" />
      </Plate>
      <div className="meter-readout">
        <strong className="display meter-percent">
          {p < 100 ? p.toFixed(p < 10 ? 1 : 0) : "100"}
          <small>%</small>
        </strong>
        <span className="label meter-caption">Consumed</span>
      </div>
      <div className="meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} aria-valuetext={`${Math.round(p)} percent, ${count} of ${total} pieces`}>
        <div className="meter-segments">
          {Array.from({ length: SEGMENTS }, (_, i) => {
            const f = Math.max(0, Math.min(1, filled - i));
            return <span key={i} className={`seg ${f >= 1 ? "on" : f > 0 ? "edge" : ""}`} style={f > 0 && f < 1 ? { ["--f" as string]: f } : undefined} />;
          })}
        </div>
        <span className="meter-tip" style={{ left: `${p}%` }} aria-hidden="true">
          <Chevrons className="tip-chevrons" />
          <i className="tip-streak" />
        </span>
        <ol className="meter-ticks" aria-hidden="true">
          {[25, 50, 75, 100].map((t) => (
            <li key={t} style={{ left: `${t}%` }} className={p >= t ? "reached" : ""}>
              {t}
            </li>
          ))}
        </ol>
        {p < 100 && (
          <span className="meter-next label" style={{ left: `${next}%` }} aria-hidden="true">
            <b>{next}%</b> next
          </span>
        )}
        <i className="meter-sweep" aria-hidden="true" />
      </div>
      {pulse > 0 && pulse < 4 && (
        <span className="meter-flash label" role="status">
          {pulse * 25}% — keep eating
        </span>
      )}
    </section>
  );
}
