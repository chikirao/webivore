import { XIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plate } from "./ui/Plate";
import "./ui/turnstile.css";

declare global {
  interface Window {
    turnstile?: {
      render(element: HTMLElement, options: Record<string, unknown>): string;
      remove(id: string): void;
      reset(id: string): void;
    };
  }
}

let scriptPromise: Promise<void> | undefined;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise)
    scriptPromise = new Promise<void>((resolve, reject) => {
      document.querySelector("script[data-webivore-turnstile]")?.remove();
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.dataset.webivoreTurnstile = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("The check could not load. Check your connection or VPN and try again."));
      document.head.append(script);
    }).catch((error) => {
      // Let the next attempt inject a fresh script instead of reusing the failure.
      scriptPromise = undefined;
      throw error;
    });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile in a centred modal. Opened only when a request needs a
 * token; the widget is always visible here, so it can't hide under page chrome.
 */
export function TurnstileDialog({
  siteKey,
  onToken,
  onClose,
  action = "snapshot",
  note = "One quick check protects the free capture quota.",
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onClose: () => void;
  action?: string;
  note?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const titleId = useId();
  const latest = useRef({ onToken, onClose });
  latest.current = { onToken, onClose };

  useEffect(() => {
    if (!siteKey || !host.current) return;
    let active = true;
    let widget = "";
    setError("");
    void loadTurnstile()
      .then(() => {
        if (!active || !host.current || !window.turnstile) return;
        widget = window.turnstile.render(host.current, {
          sitekey: siteKey,
          action,
          theme: "light",
          size: "normal",
          appearance: "always",
          callback: (token: string) => latest.current.onToken(token),
          "expired-callback": () => widget && window.turnstile?.reset(widget),
          "error-callback": (code: string) => {
            setError(`The check failed${code ? ` (${code})` : ""}. Try again.`);
            return true;
          },
        });
      })
      .catch((reason) => active && setError((reason as Error).message));
    return () => {
      active = false;
      if (widget) window.turnstile?.remove(widget);
    };
  }, [siteKey, action, attempt]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    // Capture phase: Escape closes only this check, not a dialog underneath.
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      latest.current.onClose();
    };
    addEventListener("keydown", key, true);
    return () => {
      removeEventListener("keydown", key, true);
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="check-backdrop" role="presentation">
      <Plate shape="cut" cut={22} fill="var(--paper)" line="var(--ink)" lineWidth={4} className="check-sheet">
        <div role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <button ref={close} className="check-close" onClick={onClose} aria-label="Cancel check">
            <XIcon weight="bold" />
          </button>
          <h2 id={titleId} className="display check-title">
            Quick <span>check</span>
          </h2>
          {note && <p className="check-note">{note}</p>}
          {siteKey ? (
            <div className="check-widget" ref={host} />
          ) : (
            <p className="check-error" role="alert">
              Fresh captures need a configured Turnstile site key. Demo, cached and local levels still work.
            </p>
          )}
          {error && (
            <p className="check-error" role="alert">
              {error}{" "}
              <button type="button" className="check-retry" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            </p>
          )}
        </div>
      </Plate>
    </div>,
    document.body,
  );
}
