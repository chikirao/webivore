import { useEffect, useState } from "react";
import { CHANNELS, SOUND_DEFAULTS, onSoundSettings, resetSoundSettings, setSoundSetting, soundSettings, type Channel, type SoundSettings } from "./settings";
import { SFX_TESTS } from "./sfx";
import { setMuted, useMuted } from "./engine";
import { MUSIC_TESTS } from "./music";

const RUN: Record<string, () => void> = { ...SFX_TESTS, ...MUSIC_TESTS };

/** Dev builds only: the mixer. One tab per sound; values persist in localStorage. */
type Range = [key: string, label: string, min: number, max: number, step: number];

const STRIP: Range[] = [
  ["volume", "Volume", 0, 1.5, 0.005],
  ["pan", "Left ↔ right", -1, 1, 0.01],
  ["lowpass", "Muffle (low-pass), Hz", 200, 16000, 10],
  ["highpass", "Thin (high-pass), Hz", 20, 2000, 5],
  ["reverb", "Room reverb", 0, 1.5, 0.01],
  ["echo", "Echo", 0, 1, 0.01],
  ["echoTime", "Echo delay, s", 0.02, 1, 0.01],
  ["echoFeedback", "Echo repeats", 0, 0.85, 0.01],
];
const EXTRA: Partial<Record<Channel, Range[]>> = {
  fly: [
    ["flyMin", "Flies for at least, s", 0.5, 10, 0.1],
    ["flyMax", "Flies for at most, s", 0.5, 15, 0.1],
    ["sitMin", "Sits silent at least, s", 0.5, 20, 0.1],
    ["sitMax", "Sits silent at most, s", 0.5, 30, 0.1],
  ],
  crickets: [
    ["playMin", "Chirp for at least, s", 0.5, 10, 0.1],
    ["playMax", "Chirp for at most, s", 0.5, 15, 0.1],
    ["gapMin", "Quiet for at least, s", 0, 20, 0.1],
    ["gapMax", "Quiet for at most, s", 0, 30, 0.1],
  ],
  lamp: [["flicker", "Dips with the light", 0, 1, 0.01]],
  pickup: [["bright", "Brightness", 0, 1, 0.01]],
  music: [
    ["menu", "Menu take level", 0, 1.5, 0.01],
    ["game", "Game take level", 0, 1.5, 0.01],
    ["finale", "Finale take level", 0, 1.5, 0.01],
    ["finalAt", "Last-bites loop from, %", 30, 100, 1],
    ["pauseMuffle", "Pause muffle, Hz", 200, 5000, 10],
  ],
};
const LABELS: Record<Channel, string> = {
  tv: "TV music",
  fly: "Fly",
  crickets: "Crickets",
  lamp: "Lamp",
  intro: "Room SFX",
  music: "Music",
  pickup: "Pickup",
  streak: "Streak",
  party: "Confetti",
  victory: "You won",
  countdown: "Countdown",
  boost: "Boost",
  tube: "CRT",
};
/** Which test buttons belong to which tab. */
const TESTS: Partial<Record<Channel, string[]>> = {
  intro: ["Disc tick", "Tray", "Disc spin", "Monitor on", "Dive"],
  music: ["Menu", "Game", "Last bites", "Finale", "Stop music"],
  pickup: ["Tear small", "Tear big"],
  streak: ["Streak run", "Tier up", "Tier 100"],
  party: ["Popper", "Firework"],
  victory: ["You won"],
  countdown: ["3-2-1-GO", "Landing"],
  boost: ["Boost"],
  tube: ["Tube switch", "Tube power-on"],
};

function Slider<G extends keyof SoundSettings>({ group, range }: { group: G; range: Range }) {
  const [key, label, min, max, step] = range;
  const value = (soundSettings[group] as Record<string, number>)[key];
  const def = (SOUND_DEFAULTS[group] as Record<string, number>)[key];
  return (
    <label className="crt-dev-row">
      <span className={value !== def ? "changed" : ""}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setSoundSetting(group, key as never, Number(e.target.value))}
        onDoubleClick={() => setSoundSetting(group, key as never, def)}
      />
      <output>{Number(value.toFixed(3))}</output>
    </label>
  );
}

export function SoundDevPanel() {
  const [tab, setTab] = useState<Channel>("tv");
  const [copied, setCopied] = useState(false);
  const [, bump] = useState(0);
  const muted = useMuted();
  useEffect(() => onSoundSettings(() => bump((n) => n + 1)), []);
  return (
    <>
      <label className="crt-dev-row crt-dev-check">
        <input type="checkbox" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} />
        Sound on
      </label>
      <fieldset>
        <legend>Master</legend>
        <Slider group="master" range={["volume", "Volume", 0, 1.5, 0.01]} />
        <Slider group="master" range={["reverbTime", "Room reverb length, s", 0.2, 4, 0.05]} />
      </fieldset>
      <div className="crt-dev-tabs" role="tablist">
        {CHANNELS.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={tab === c} onClick={() => setTab(c)}>
            {LABELS[c]}
          </button>
        ))}
      </div>
      <fieldset>
        <legend>{LABELS[tab]}</legend>
        {STRIP.map((r) => (
          <Slider key={r[0]} group={tab} range={r} />
        ))}
        {EXTRA[tab]?.map((r) => (
          <Slider key={r[0]} group={tab} range={r} />
        ))}
      </fieldset>
      {TESTS[tab] && (
        <div className="crt-dev-actions">
          {TESTS[tab]!.map((name) => (
            <button key={name} type="button" onClick={RUN[name]}>
              ▶ {name}
            </button>
          ))}
        </div>
      )}
      {["tv", "fly", "crickets", "lamp"].includes(tab) && (
        <p className="crt-dev-note">Plays in the intro room (reload with the intro, then tap once to start sound).</p>
      )}
      <div className="crt-dev-actions">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(JSON.stringify(soundSettings, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? "Copied" : "Copy sound JSON"}
        </button>
        <button type="button" onClick={resetSoundSettings}>
          Reset sound
        </button>
      </div>
    </>
  );
}
