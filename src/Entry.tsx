import {
  GlobeIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  QuestionIcon,
} from "@phosphor-icons/react";
import { Plate } from "./ui/Plate";
import { Chevrons, Serial } from "./ui/marks";
import { ArrowArt, EntryGraphics, Wordmark } from "./ui/OverdriveArt";
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
  muted,
  setMuted,
}: {
  url: string;
  setUrl: (v: string) => void;
  loading: boolean;
  error: string;
  onStart: (value?: string) => void;
  onDemo: () => void;
  muted: boolean;
  setMuted: (m: boolean) => void;
}) {
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
          src="/assets/overdrive-entry-rabbit.png"
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
          <button className="start-key key" type="submit" disabled={loading}>
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
              Cutting the page into bites… <b>up to 55 seconds.</b>
            </p>
          )}
          {error && (
            <p className="status status-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
      <a className="author entry-author" href="/">
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
            <b>Space</b> follow · <b>Q / E</b> turn · <b>Esc</b> pause.
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
    </main>
  );
}
