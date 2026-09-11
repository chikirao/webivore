import { GlobeIcon, PlayIcon, SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react";
import { Plate } from "./ui/Plate";
import { Chevrons, RabbitHero, Serial } from "./ui/marks";
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
      <header className="entry-head">
        <Plate shape="tag" cut={34} className="logo-rail">
          <h1 className="logotype">Webivore</h1>
        </Plate>
        <div className="logo-accents" aria-hidden="true">
          <span className="strip hatch-red" />
          <span className="strip ink-bar" />
        </div>
      </header>

      <section className="entry-form" aria-label="Choose a website">
        <div className="globe" aria-hidden="true">
          <GlobeIcon weight="bold" />
        </div>
        <form
          className="url-form"
          onSubmit={(e) => {
            e.preventDefault();
            onStart();
          }}
        >
          <label className="sr-only" htmlFor="url">
            Paste a website address
          </label>
          <Plate shape="cut" cut={26} corners={["tl", "br"]} fill="var(--paper)" line="var(--ink)" lineWidth={4} inset={0} className="url-slot">
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
          </Plate>
          <Plate as="button" shape="key" fill="var(--red)" className="start-key key" type="submit" disabled={loading}>
            {loading ? "Loading" : "Start"}
            <Chevrons className="chev" />
          </Plate>
        </form>
        <div className="entry-actions">
          <span className="strip hatch tick" aria-hidden="true" />
          <Plate as="button" shape="chip" className="chip demo" onClick={onDemo} disabled={loading}>
            Demo
            <PlayIcon weight="fill" />
          </Plate>
          {PRESETS.map(([name, href]) => (
            <Plate
              key={name}
              as="button"
              shape="chip"
              fill="var(--paper)"
              line="var(--ink)"
              lineWidth={3}
              inset={0}
              className="chip chip-quiet preset"
              disabled={loading}
              onClick={() => {
                setUrl(href);
                onStart(href);
              }}
            >
              {name}
            </Plate>
          ))}
          <span className="strip hatch tick" aria-hidden="true" />
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

      <aside className="entry-hero" aria-hidden="true">
        <RabbitHero className="hero-art" />
      </aside>

      <a className="author entry-author" href="/">
        chikirao
      </a>

      <footer className="entry-rail">
        <span className="strip hatch-white" aria-hidden="true" />
        <span className="strip checker" aria-hidden="true" />
        <Serial className="serial" />
        <span className="rail-bar" aria-hidden="true" />
        <button
          className="rail-sound"
          onClick={() => setMuted(!muted)}
          aria-label={muted ? "Enable sound" : "Mute sound"}
          aria-pressed={muted}
        >
          {muted ? <SpeakerSlashIcon weight="fill" /> : <SpeakerHighIcon weight="fill" />}
        </button>
        <span className="rail-line" aria-hidden="true" />
        <p className="hint rail-hint">
          <b>WASD</b> walk · <b>drag</b> orbit · <b>scroll</b> zoom · <b>space</b> follow
        </p>
        <Chevrons className="rail-chevrons" />
        <span className="strip hatch-red wide" aria-hidden="true" />
        <span className="strip dots-paper" aria-hidden="true" />
      </footer>
    </main>
  );
}
