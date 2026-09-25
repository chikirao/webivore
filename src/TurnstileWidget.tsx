import { useEffect, useRef, useState } from "react";

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
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-webivore-turnstile]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Verification could not load.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.webivoreTurnstile = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Verification could not load."));
      document.head.append(script);
    });
  return scriptPromise;
}

export function TurnstileWidget({
  siteKey,
  onToken,
  action = "snapshot",
  note = "One quick check protects the free capture quota.",
}: {
  siteKey: string;
  onToken: (token: string) => void;
  action?: string;
  note?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!siteKey || !host.current) return;
    let active = true;
    let widget = "";
    void loadTurnstile()
      .then(() => {
        if (!active || !host.current || !window.turnstile) return;
        widget = window.turnstile.render(host.current, {
          sitekey: siteKey,
          action,
          theme: "light",
          size: "flexible",
          appearance: "interaction-only",
          callback: (token: string) => onToken(token),
          "expired-callback": () => widget && window.turnstile?.reset(widget),
          "error-callback": () => setError("Verification failed to load. Try again."),
        });
      })
      .catch((reason) => setError((reason as Error).message));
    return () => {
      active = false;
      if (widget) window.turnstile?.remove(widget);
    };
  }, [siteKey, onToken, action]);
  if (!siteKey)
    return <p className="status status-error">Fresh captures require a configured Turnstile site key. Demo, cached and local levels still work.</p>;
  return (
    <div className="turnstile-block">
      {note && <p>{note}</p>}
      <div ref={host} />
      {error && <p className="status status-error">{error}</p>}
    </div>
  );
}
