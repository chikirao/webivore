import {
  GlobeIcon,
  PlayIcon,
  UploadSimpleIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  QuestionIcon,
} from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { Plate } from "./ui/Plate";
import { Chevrons, Serial } from "./ui/marks";
import { ArrowArt, EntryGraphics, Wordmark } from "./ui/OverdriveArt";
import { ImportDialog } from "./ImportDialog";
import { TurnstileWidget } from "./TurnstileWidget";
import type { ImportKind } from "./local-import";
import { appUrl } from "./paths";
import "./ui/entry.css";
export const PRESETS: [string, string][] = [
  ["Wikipedia", "https://en.wikipedia.org/wiki/Internet"],
  ["Hacker News", "https://news.ycombinator.com"],
];
export function Entry({
  url,
  setUrl,
  loading,
  error,
  onStart,
  onDemo,
  onImport,
  onCancel,
  muted,
  setMuted,
  loadingMessage,
  importError,
  notice,
  turnstileNeeded,
  turnstileSiteKey,
  onTurnstileToken,
}: {
  url: string;
  setUrl: (v: string) => void;
  loading: boolean;
  error: string;
  onStart: (value?: string) => void;
  onDemo: () => void;
  onImport: (file: File, kind?: ImportKind) => void;
  onCancel: () => void;
  muted: boolean;
  setMuted: (m: boolean) => void;
  loadingMessage: string;
  importError: string;
  notice: string;
  turnstileNeeded: boolean;
  turnstileSiteKey: string;
  onTurnstileToken: (token: string) => void;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const closeImport = useCallback(() => {
    setImportOpen(false);
    queueMicrotask(() => document.getElementById("open-import")?.focus());
  }, []);
  return (
    <main className="entry">
      <EntryGraphics />
      <header className="entry-head">
        <h1 className="sr-only">WEBIVORE</h1>
        <Wordmark />
      </header>
      <aside className="entry-hero" aria-hidden="true">
        <img
          className="hero-art"
          src={appUrl("assets/overdrive-entry-rabbit.png")}
          alt=""
        />
      </aside>
      <section className="entry-form" aria-label="Choose a website">
        <div className="globe" aria-hidden="true">
          <GlobeIcon weight="regular" />
        </div>
        <form
          className="url-form"
          onSubmit={(e) => {
            e.preventDefault();
            onStart();
          }}
        >
          <ArrowArt />
          <label className="sr-only" htmlFor="url">
            Paste a website address
          </label>
          <input
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="paste a website"
            autoComplete="url"
            inputMode="url"
            spellCheck={false}
            required
            disabled={loading}
          />
          <button
            className={`start-key key${loading ? " is-loading" : ""}`}
            type="submit"
            disabled={loading}
          >
            <span>{loading ? "Loading" : "Start"}</span>
            <Chevrons />
          </button>
        </form>
        <div className="entry-actions">
          <span className="strip hatch tick" aria-hidden="true" />
          <Plate
            as="button"
            shape="chip"
            line={null}
            className="chip demo"
            onClick={onDemo}
            disabled={loading}
          >
            Demo
            <PlayIcon weight="fill" />
          </Plate>
          <Plate
            id="open-import"
            as="button"
            shape="chip"
            line={null}
            className="chip import"
            onClick={() => setImportOpen(true)}
            disabled={loading}
          >
            Import file
            <UploadSimpleIcon weight="bold" />
          </Plate>
          <span className="strip hatch tick" aria-hidden="true" />
        </div>
        <div className="entry-presets">
          {PRESETS.map(([name, href]) => (
            <button
              key={name}
              className="preset"
              disabled={loading}
              onClick={() => {
                setUrl(href);
                onStart(href);
              }}
            >
              {name}
              <span aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
        <div className="entry-status">
          {loading && (
            <p className="status" role="status">
              {loadingMessage || "Cutting the page into bites…"} <b>up to 55 seconds.</b>{" "}
              <button type="button" className="status-cancel" onClick={onCancel}>Cancel</button>
            </p>
          )}
          {error && (
            <p className="status status-error" role="alert">
              {error}
            </p>
          )}
          {!error && notice && <p className="status" role="status">{notice}</p>}
          {turnstileNeeded && !loading && (
            <TurnstileWidget siteKey={turnstileSiteKey} onToken={onTurnstileToken} />
          )}
        </div>
      </section>
      <a className="author entry-author" href={appUrl("")}>
        chikirao
      </a>
      <details className="entry-help">
        <summary>
          <QuestionIcon weight="bold" />
          How to play
        </summary>
        <div>
          <p>
            <b>WASD / arrows</b> — walk and collect smaller pieces.
          </p>
          <p>
            <b>Drag</b> orbit · <b>right-drag</b> pan · <b>scroll</b> zoom.
          </p>
          <p>
            <b>Space</b> follow · <b>Q / E</b> turn · <b>Esc</b> pause &middot;{" "}
            <b>H</b> toggle pickup hint.
          </p>
        </div>
      </details>
      <footer className="entry-rail">
        <span className="strip hatch-white" />
        <span className="strip checker" />
        <Serial className="serial" />
        <i className="rail-bar" />
        <button
          className="rail-sound"
          onClick={() => setMuted(!muted)}
          aria-label={muted ? "Enable sound" : "Mute sound"}
          aria-pressed={muted}
        >
          {muted ? (
            <SpeakerSlashIcon weight="fill" />
          ) : (
            <SpeakerHighIcon weight="fill" />
          )}
        </button>
        <span className="rail-line" />
        <Chevrons className="rail-chevrons" />
        <span className="strip hatch-red wide" />
        <span className="strip dots-paper" />
      </footer>
      <ImportDialog
        open={importOpen}
        busy={loading}
        status={importOpen && loading ? loadingMessage : ""}
        error={importError}
        onClose={closeImport}
        onCancel={onCancel}
        onImport={onImport}
      />
    </main>
  );
}
