"""WEBIVORE game music: one theme in three variations.

    python scripts/game-music.py

- menu   — the pre-game take: slow, swung, lo-fi and muffled (90 BPM);
- game   — the playing take: Y2K breakbeat (120 BPM), a long loop of
           several sections, plus a "last bites" loop near the end;
- finale — the victory take: brighter chords, half-time groove.

Everything is synthesized here (numpy/scipy, no samples), with the same
voices as the trailer (storyboard/trailer2/tools/music.py).

Each file is [intro][loop][the loop's first TAIL s again] (the game file has
a second loop after the first). Loops are rendered circularly: whatever
rings past a loop's end is wrapped onto its start, so the loop is seamless.
The page loops [start + M, end + M): that stays seamless even if the mp3
decoder shifts the audio by its padding. Loop points go to
src/audio/music-map.json.
"""
import json
import subprocess
import tempfile
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "audio"
MAP = ROOT / "src" / "audio" / "music-map.json"
SR = 44100
M = 0.25  # loop points sit this far into the loop
TAIL = 0.6  # the loop's head repeated after its end
rng = np.random.default_rng(20260929)


# ---------------------------------------------------------------- utilities
def secs(n):
    return np.arange(n) / SR


def midi(m):
    return 440.0 * 2.0 ** ((m - 69) / 12)


def fade(y, fi=0.001, fo=0.01):
    y = np.array(y, dtype=float)
    n = y.shape[-1]
    a, b = min(n, max(1, int(fi * SR))), min(n, max(1, int(fo * SR)))
    y[..., :a] *= np.linspace(0, 1, a)
    y[..., n - b :] *= np.linspace(1, 0, b)
    return y


def norm(y, peak=1.0):
    m = np.max(np.abs(y))
    return y * (peak / m) if m > 0 else y


def sos(x, kind, f, order=2):
    return signal.sosfilt(signal.butter(order, f, kind, fs=SR, output="sos"), x, axis=-1)


def lp(x, f, o=2):
    return sos(x, "lowpass", f, o)


def hp(x, f, o=2):
    return sos(x, "highpass", f, o)


def bp(x, lo, hi, o=2):
    return sos(x, "bandpass", [lo, hi], o)


def svf(x, cutoff, res=0.5, mode="lp"):
    """Zero-delay-feedback state-variable filter; cutoff/res may vary per sample."""
    n = len(x)
    cutoff = np.broadcast_to(np.asarray(cutoff, float), (n,))
    res = np.broadcast_to(np.asarray(res, float), (n,))
    g = np.tan(np.pi * np.clip(cutoff, 20, SR * 0.45) / SR)
    k = 2.0 - 2.0 * np.clip(res, 0, 0.985)
    a1 = 1 / (1 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    X, A1, A2, A3, K = x.tolist(), a1.tolist(), a2.tolist(), a3.tolist(), k.tolist()
    out = [0.0] * n
    ic1 = ic2 = 0.0
    for i in range(n):
        v3 = X[i] - ic2
        v1 = A1[i] * ic1 + A2[i] * v3
        v2 = ic2 + A2[i] * ic1 + A3[i] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[i] = v2 if mode == "lp" else v1 if mode == "bp" else X[i] - K[i] * v1 - v2
    return np.array(out)


def saw(freq, phase=0.0):
    """PolyBLEP sawtooth for a per-sample frequency array."""
    freq = np.asarray(freq, float)
    dt = freq / SR
    ph = (phase + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    x = ph[m] / dt[m]
    y[m] -= x + x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt[m]
    y[m] -= x * x + x + x + 1
    return y


def pulse(freq, width=0.5, phase=0.0):
    return saw(freq, phase) - saw(freq, phase + width)


def sine(freq, phase=0.0):
    return np.sin(2 * np.pi * (phase + np.cumsum(np.asarray(freq, float)) / SR))


def pan2(y, pan):
    a = (np.asarray(pan) + 1) * np.pi / 4
    return np.stack([y * np.cos(a), y * np.sin(a)]) * np.sqrt(2)


def reverb_ir(seconds, predelay=0.015, bright=1.0, seed=7):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = secs(n)
    pre = int(predelay * SR)
    ir = np.zeros((2, n + pre))
    for c in range(2):
        z = r.standard_normal(n)
        lo, mid, hi = lp(z, 400), bp(z, 400, 3500), hp(z, 3500)
        tail = lo * np.exp(-6.9 * t / seconds) + mid * np.exp(-6.9 * t / (seconds * 0.8)) + bright * hi * np.exp(-6.9 * t / (seconds * 0.4))
        ir[c, pre:] = tail * np.minimum(1, t / 0.01)
    return ir / np.sqrt((ir**2).sum() / 2)


HALL = reverb_ir(2.2, 0.02, 0.8, seed=21)
ROOM = reverb_ir(0.9, 0.008, 0.5, seed=11)


# ---------------------------------------------------------------- drums
METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def metal(n):
    t = secs(n)
    return sum(np.sign(np.sin(2 * np.pi * f * t + rng.uniform(0, 6.3))) for f in METAL) / 6


def kick(vel=1.0, f0=165, f1=46, tp=0.032, ta=0.3, dur=0.55, click=0.3, drive=1.9):
    n = int(dur * SR)
    t = secs(n)
    body = sine(f1 + (f0 - f1) * np.exp(-t / tp)) * np.exp(-t / ta)
    cl = hp(rng.standard_normal(n), 1800) * np.exp(-t / 0.0035) * click
    return fade(np.tanh((body + cl) * drive) / np.tanh(drive) * vel, 0.0003, 0.03)


def snare(vel=1.0, tone=188, dur=0.34):
    n = int(dur * SR)
    t = secs(n)
    f = tone * (1 + 0.45 * np.exp(-t / 0.012))
    body = sine(f) * np.exp(-t / 0.07) + 0.45 * sine(f * 1.72) * np.exp(-t / 0.035)
    nz = bp(rng.standard_normal(n), 1300, 9500) * np.exp(-t / 0.12)
    crack = hp(rng.standard_normal(n), 5000) * np.exp(-t / 0.035)
    return fade(norm(np.tanh((0.8 * body + 1.1 * nz + 0.35 * crack) * 1.5)) * vel, 0.0003, 0.03)


def hat(vel=1.0, open_=False):
    n = int((0.5 if open_ else 0.09) * SR)
    t = secs(n)
    y = hp(bp(0.7 * metal(n) + 0.55 * rng.standard_normal(n), 6000, 15000), 7000)
    y *= np.exp(-t / (0.17 if open_ else 0.02))
    return fade(norm(y) * vel, 0.0002, 0.01)


def crash(vel=1.0, dur=2.6):
    n = int(dur * SR)
    t = secs(n)
    ch = []
    for _ in range(2):
        src = 0.55 * metal(n) * (1 + 0.4 * np.sin(2 * np.pi * 2.7 * t)) + rng.standard_normal(n)
        ch.append(hp(bp(src, 2800, 16500), 3200) * (0.65 * np.exp(-t / 0.7) + 0.55 * np.exp(-t / 0.05)))
    return fade(norm(np.stack(ch)) * vel, 0.0002, 0.4)


def rim(vel=1.0):
    n = int(0.05 * SR)
    t = secs(n)
    y = bp(rng.standard_normal(n), 1400, 3200) * np.exp(-t / 0.008) + 0.7 * np.sin(2 * np.pi * 1700 * t) * np.exp(-t / 0.012)
    return fade(norm(y) * vel, 0.0002, 0.005)


def shaker(vel=1.0):
    n = int(0.06 * SR)
    t = secs(n)
    y = bp(rng.standard_normal(n), 4500, 11000) * np.minimum(1, t / 0.006) * np.exp(-t / 0.03)
    return fade(norm(y) * vel, 0.0005, 0.005)


def clap(vel=1.0):
    n = int(0.3 * SR)
    t = secs(n)
    env = np.zeros(n)
    for k, d in enumerate((0.0, 0.009, 0.018, 0.027)):
        i = int(d * SR)
        env[i:] += np.exp(-(t[: n - i]) / (0.006 if k < 3 else 0.09))
    y = bp(rng.standard_normal(n), 900, 5200) * env
    return fade(norm(y) * vel, 0.0002, 0.03)


def tamb(vel=1.0):
    n = int(0.12 * SR)
    t = secs(n)
    y = hp(0.6 * metal(n) + rng.standard_normal(n), 7500) * np.exp(-t / 0.045)
    return fade(norm(y) * vel, 0.0005, 0.01)


# ---------------------------------------------------------------- tonal voices
_stabs = {}


def stab(chord, dur=0.35, cut0=6500, cut1=900, tau=0.16, detune=0.11, release=0.12):
    """Detuned-saw chord through a closing filter (cached: the same hits repeat)."""
    key = (tuple(chord), round(dur, 3), cut0, cut1, tau, release)
    if key not in _stabs:
        n = int((dur + release + 0.05) * SR)
        t = secs(n)
        out = np.zeros((2, n))
        for m in chord:
            for d, p in ((-detune, -0.7), (0.0, 0.0), (detune, 0.7)):
                out += pan2(saw(np.full(n, midi(m + d)), rng.random()), p)
        cutoff = cut1 + (cut0 - cut1) * np.exp(-t / tau)
        y = np.stack([svf(out[c], cutoff, 0.25) for c in range(2)])
        amp = np.minimum(1, t / 0.003) * np.where(t < dur, 1.0, np.exp(-(t - dur) / release))
        _stabs[key] = fade(norm(y * amp), 0.0005, 0.02)
    return _stabs[key]


def pad(chord, dur, attack=0.25, release=0.35, cutoff=1900):
    n = int((dur + release) * SR)
    t = secs(n)
    out = np.zeros((2, n))
    for m in chord:
        for d, p in ((-0.14, -0.9), (-0.05, -0.3), (0.05, 0.3), (0.14, 0.9)):
            out += pan2(saw(np.full(n, midi(m + d)), rng.random()), p)
    out = lp(out, cutoff, 2)
    amp = np.minimum(1, t / attack) * np.where(t < dur, 1.0, np.exp(-(t - dur) / (release / 3)))
    return fade(norm(out * amp), 0.002, 0.05)


def ep(m, dur, vel=1.0):
    f = midi(m)
    n = int((dur + 0.7) * SR)
    t = secs(n)
    index = 1.5 * np.exp(-t / 0.22) + 0.22
    y = np.sin(2 * np.pi * f * t + index * np.sin(2 * np.pi * f * t))
    y += 0.1 * np.sin(2 * np.pi * f * 7.0 * t) * np.exp(-t / 0.018)
    env = np.minimum(1, t / 0.002) * np.exp(-t / 1.1) * np.where(t < dur, 1, np.exp(-(t - dur) / 0.1))
    return fade(y * env * vel, 0.001, 0.02)


def vibe(m, dur, vel=1.0):
    f = midi(m)
    n = int((dur + 1.0) * SR)
    t = secs(n)
    y = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(2 * np.pi * f * 3.98 * t) * np.exp(-t / 0.14)
    y += 0.05 * np.sin(2 * np.pi * f * 9.9 * t) * np.exp(-t / 0.05)
    env = np.minimum(1, t / 0.0015) * np.exp(-t / 0.85) * np.where(t < dur + 0.2, 1, np.exp(-(t - dur - 0.2) / 0.15))
    return fade(y * env * (1 + 0.22 * np.sin(2 * np.pi * 5.4 * t)) * vel, 0.001, 0.02)


def lead(m, dur, vel=1.0):
    """A soft square lead with a late vibrato."""
    f = midi(m)
    n = int((dur + 0.25) * SR)
    t = secs(n)
    fv = f * (1 + 0.005 * np.sin(2 * np.pi * 5.3 * t) * np.clip((t - 0.16) / 0.2, 0, 1))
    y = 0.6 * pulse(fv, 0.32) + 0.4 * saw(fv * 1.004)
    y = lp(y, min(8000, f * 5), 2)
    env = np.minimum(1, t / 0.005) * (0.7 + 0.3 * np.exp(-t / 0.1)) * np.where(t < dur, 1, np.exp(-(t - dur) / 0.06))
    return fade(y * env * vel * 0.8, 0.002, 0.02)


def bell(m, dur, vel=1.0):
    f = midi(m)
    n = int((dur + 1.4) * SR)
    t = secs(n)
    index = 2.2 * np.exp(-t / 0.3) + 0.3
    y = np.sin(2 * np.pi * f * t + index * np.sin(2 * np.pi * f * 3.5 * t))
    env = np.minimum(1, t / 0.001) * np.exp(-t / 0.7)
    return fade(y * env * vel, 0.001, 0.05)


def pluck(m, dur=0.12, vel=1.0):
    f = midi(m)
    n = int((dur + 0.15) * SR)
    t = secs(n)
    y = lp(pulse(np.full(n, f), 0.25), 4200, 2)
    return fade(y * np.minimum(1, t / 0.002) * np.exp(-t / 0.075) * vel, 0.0005, 0.01)


def upright(m, dur, vel=1.0):
    f = midi(m)
    n = int((dur + 0.25) * SR)
    t = secs(n)
    y = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.1)
    y += 0.12 * np.sin(6 * np.pi * f * t) * np.exp(-t / 0.04)
    env = np.minimum(1, t / 0.006) * np.exp(-t / 0.42) * np.where(t < dur, 1, np.exp(-(t - dur) / 0.04))
    return fade(y * env * vel, 0.002, 0.02)


def round_bass(m, dur, vel=1.0):
    f = midi(m)
    n = int((dur + 0.15) * SR)
    t = secs(n)
    y = np.sin(2 * np.pi * f * t) + 0.3 * lp(saw(np.full(n, f)), 600, 2)
    env = np.minimum(1, t / 0.004) * (0.6 + 0.4 * np.exp(-t / 0.15)) * np.where(t < dur, 1, np.exp(-(t - dur) / 0.04))
    return fade(np.tanh(y * env * 1.4) * vel, 0.002, 0.02)


def whoosh(dur, f0, f1, res=0.55, shape=2.0, peak=0.5):
    n = int(dur * SR)
    u = secs(n) / dur
    y = svf(rng.standard_normal(n), f0 * (f1 / f0) ** u, res, "bp")
    env = np.where(u < peak, (u / peak) ** shape, ((1 - u) / (1 - peak)) ** 1.4)
    return fade(norm(y) * env, 0.002, 0.01)


def boom(f0=58, f1=32, dur=1.3):
    n = int(dur * SR)
    t = secs(n)
    y = sine(f1 + (f0 - f1) * np.exp(-t / 0.28)) * np.exp(-t / 0.5) * np.minimum(1, t / 0.003)
    return fade(np.tanh(y * 1.3), 0.0005, 0.1)


def crackle(n, rate=9.0, seed=3):
    """Vinyl: sparse clicks over a little hiss."""
    r = np.random.default_rng(seed)
    y = 0.02 * lp(r.standard_normal(n), 5000)
    for _ in range(int(n / SR * rate)):
        i = r.integers(0, n - 200)
        g = r.integers(20, 120)
        y[i : i + g] += r.standard_normal(g) * np.exp(-np.arange(g) / (g / 4)) * r.uniform(0.1, 0.6)
    return bp(y, 700, 7000)


# ---------------------------------------------------------------- harmony
# name: (bass root, quality, stab voicing)
CH = {
    "Em9": (40, "min", [52, 64, 67, 71, 74, 78]),
    "Cmaj9": (36, "maj", [48, 60, 64, 67, 71, 74]),
    "D69": (38, "maj", [50, 62, 66, 69, 71, 76]),
    "Bm7": (35, "min", [47, 59, 62, 66, 69, 74]),
    "Am9": (45, "min", [45, 60, 64, 67, 71, 76]),
    "Gmaj9": (43, "maj", [43, 59, 62, 66, 69, 74]),
}
TONES = {"min": {"r": 0, "3": 3, "5": 7, "7": 10, "o": 12}, "maj": {"r": 0, "3": 4, "5": 7, "7": 9, "o": 12}}
PROG_A = ["Em9", "Cmaj9", "D69", "Bm7", "Em9", "Cmaj9", ("Am9", "D69"), "Em9"]
PROG_B = ["Cmaj9", "D69", "Bm7", "Em9", "Am9", "Bm7", "Cmaj9", "D69"]
PROG_E = ["Am9", "Bm7", "Cmaj9", "D69"] * 2
PROG_V = ["Cmaj9", "D69", "Bm7", "Em9", "Cmaj9", "D69", "Gmaj9", "Gmaj9"]


def chord_at(prog, bar, step):
    c = prog[bar % len(prog)]
    return (c[0] if step < 8 else c[1]) if isinstance(c, tuple) else c


# ---------------------------------------------------------------- the theme
# (step, midi, length in steps) per bar
THEME = [
    [(0, 76, 3), (3, 74, 1), (4, 71, 2), (6, 74, 2), (8, 76, 4), (12, 79, 2), (14, 76, 2)],
    [(0, 74, 3), (3, 71, 1), (4, 67, 4), (8, 69, 2), (10, 71, 2), (12, 67, 4)],
    [(0, 69, 3), (3, 71, 1), (4, 74, 2), (6, 76, 2), (8, 78, 3), (11, 76, 1), (12, 74, 4)],
    [(0, 71, 6), (6, 69, 2), (8, 66, 2), (10, 69, 2), (12, 74, 4)],
    [(0, 76, 3), (3, 74, 1), (4, 71, 2), (6, 74, 2), (8, 76, 4), (12, 83, 2), (14, 81, 2)],
    [(0, 79, 3), (3, 78, 1), (4, 76, 2), (6, 74, 2), (8, 76, 4), (12, 71, 4)],
    [(0, 72, 3), (3, 71, 1), (4, 69, 2), (6, 71, 2), (8, 74, 4), (12, 78, 4)],
    [(0, 76, 10), (12, 71, 2), (14, 74, 2)],
]
# the answer, over PROG_B
ANSWER = [
    [(0, 83, 2), (2, 81, 2), (4, 79, 4), (10, 76, 2), (12, 79, 4)],
    [(0, 78, 6), (6, 76, 2), (8, 74, 8)],
    [(0, 81, 2), (2, 79, 2), (4, 78, 4), (10, 74, 2), (12, 78, 4)],
    [(0, 76, 8), (10, 71, 2), (12, 74, 4)],
    [(0, 79, 2), (2, 76, 2), (4, 72, 4), (10, 71, 2), (12, 72, 4)],
    [(0, 74, 6), (6, 71, 2), (8, 69, 8)],
    [(0, 83, 2), (2, 79, 2), (4, 76, 4), (8, 74, 2), (10, 76, 2), (12, 79, 4)],
    [(0, 78, 8), (8, 81, 4), (12, 83, 4)],
]
# the victory line, over PROG_V: the answer, resolving to G
VICTORY = ANSWER[:4] + [
    ANSWER[6],
    ANSWER[7],
    [(0, 86, 4), (4, 83, 2), (6, 81, 2), (8, 79, 8)],
    [(0, 78, 4), (4, 79, 12)],
]
# a call-and-response riff over PROG_E
RIFF = [
    [(0, 76, 2), (2, 79, 2), (4, 81, 2), (6, 83, 4), (12, 81, 2), (14, 79, 2)],
    [(0, 78, 4), (4, 74, 2), (6, 76, 2), (8, 78, 8)],
    [(0, 76, 2), (2, 79, 2), (4, 81, 2), (6, 83, 4), (12, 86, 2), (14, 83, 2)],
    [(0, 81, 4), (4, 78, 2), (6, 76, 2), (8, 78, 4), (12, 81, 4)],
]
RIFF2 = RIFF[:3] + [[(0, 81, 4), (4, 83, 2), (6, 86, 2), (8, 88, 8)]]
PICKUP = [(12, 71, 2), (14, 74, 2)]

# drum patterns: step -> velocity
PAT_A = {"k": [(0, 1.0), (2, 0.8), (10, 0.9), (11, 0.7)], "s": [(4, 1.0), (7, 0.28), (9, 0.33), (12, 1.0), (15, 0.3)],
         "h": [(i, 0.5 if i % 4 == 2 else 0.33) for i in range(0, 16, 2)] + [(3, 0.16), (11, 0.16), (13, 0.2)]}
PAT_B = {"k": [(0, 1.0), (2, 0.8), (10, 0.9)], "s": [(4, 1.0), (7, 0.28), (9, 0.33), (12, 1.0), (14, 0.55), (15, 0.35)],
         "h": [(i, 0.5 if i % 4 == 2 else 0.33) for i in range(0, 16, 2)] + [(5, 0.15), (13, 0.2)]}
PAT_C = {"k": [(0, 1.0), (3, 0.6), (8, 0.85), (10, 0.7)], "s": [(4, 1.0), (6, 0.2), (12, 1.0), (13, 0.25), (15, 0.3)],
         "h": [(i, [0.42, 0.18, 0.32, 0.2][i % 4]) for i in range(16)]}
PAT_HALF = {"k": [(0, 1.0), (10, 0.7)], "s": [(8, 1.0)], "h": [(i, 0.4 if i % 4 == 2 else 0.25) for i in range(0, 16, 2)]}
PAT_LOFI = {"k": [(0, 0.9), (7, 0.45), (10, 0.75)], "s": [], "h": []}

# bass templates: (step, tone, accent, slide, length in steps)
BASS_A = [(0, "r", 1, 0, 1), (2, "r", 0, 0, 1), (3, "o", 0, 1, 1), (4, "7", 0, 0, 1), (6, "r", 1, 0, 1), (7, "3", 0, 0, 1),
          (9, "r", 0, 0, 1), (10, "5", 1, 1, 1), (11, "7", 0, 0, 1), (13, "r", 0, 0, 1), (14, "o", 1, 0, 1), (15, "5", 0, 0, 1)]
BASS_B = [(0, "r", 1, 0, 2), (3, "r", 0, 0, 1), (4, "o", 0, 1, 1), (5, "r", 0, 0, 1), (8, "5", 1, 0, 1), (10, "7", 0, 1, 1),
          (11, "o", 0, 0, 1), (14, "r", 1, 0, 1)]
BASS_SUB = [(0, "r", 0, 0, 7), (8, "5", 0, 0, 5), (14, "r", 0, 1, 1)]
BASS_DRIVE = [(i, "o" if i % 4 == 2 else "r", int(i % 8 == 0), 0, 1) for i in range(0, 16, 2)] + [(7, "5", 0, 0, 1), (15, "3", 0, 1, 1)]


# ---------------------------------------------------------------- a stretch of music
class Seg:
    """`bars` bars at `bpm`. A loop wraps everything ringing past its end onto its start."""

    def __init__(self, bars, bpm, loop, swing=0.0):
        self.beat = 60 / bpm
        self.bar = 4 * self.beat
        self.step = self.beat / 4
        self.swing = swing
        self.dur = bars * self.bar
        self.n = int(round(self.dur * SR))
        self.loop = loop
        self.extra = int(4 * SR)
        self.buses = defaultdict(lambda: np.zeros((2, self.n + self.extra)))
        self.kicks = []
        self.bass_notes = []

    def t(self, bar, step=0):
        return bar * self.bar + step * self.step + (self.swing * self.step if step % 2 == 1 else 0)

    def add(self, bus, sig, t, gain=1.0, pan=0.0):
        sig = np.asarray(sig, float)
        if sig.ndim == 1:
            sig = pan2(sig, pan)
        x = self.buses[bus]
        i0 = int(round(t * SR))
        s0 = max(0, -i0)
        i0 = max(0, i0)
        n = min(sig.shape[1] - s0, x.shape[1] - i0)
        if n > 0:
            x[:, i0 : i0 + n] += gain * sig[:, s0 : s0 + n]

    def fold(self, x):
        y = x[:, : self.n].copy()
        if self.loop:
            rest = x[:, self.n :]
            while rest.shape[1]:
                k = min(self.n, rest.shape[1])
                y[:, :k] += rest[:, :k]
                rest = rest[:, k:]
        return y

    def conv(self, x, ir):
        y = np.stack([signal.fftconvolve(x[c], ir[c]) for c in range(2)])
        return self.fold(np.pad(y, ((0, 0), (0, max(0, self.n + self.extra - y.shape[1]))))) if self.loop else y[:, : self.n]

    def shift(self, x, d):
        if self.loop:
            return np.roll(x, d, axis=1)
        return np.pad(x, ((0, 0), (d, 0)))[:, : self.n]

    def lti(self, x, f):
        """A filter as if the loop had always been playing."""
        if not self.loop:
            return f(x)
        return f(np.concatenate([x, x, x], axis=1))[:, self.n : 2 * self.n]

    def duck(self, depth, tau=0.12):
        g = np.ones(self.n + self.extra)
        for tk in self.kicks:
            i0 = int(round(tk * SR))
            n = min(len(g) - i0, int(0.6 * SR))
            if n <= 0:
                continue
            tt = secs(n)
            g[i0 : i0 + n] = np.minimum(g[i0 : i0 + n], 1 - depth * (1 - np.exp(-tt / 0.003)) * np.exp(-tt / tau))
        if self.loop:
            g[: self.extra] = np.minimum(g[: self.extra], g[self.n :])
        return g[: self.n]

    # ---- players
    def groove(self, bar, pat, gain=1.0, steps=range(16), open_hats=(), kick_gain=0.95):
        for s, v in pat["k"]:
            if s in steps:
                self.add("drums", kick(v), self.t(bar, s), kick_gain * gain)
                self.kicks.append(self.t(bar, s))
        for s, v in pat["s"]:
            if s in steps:
                self.add("drums", snare(v), self.t(bar, s), 0.55 * gain, pan=0.05)
        for s, v in pat["h"]:
            if s in steps and s not in open_hats:
                self.add("drums", hat(v), self.t(bar, s), 0.28 * gain, pan=0.28)
        for s in open_hats:
            if s in steps:
                self.add("drums", hat(0.55, True), self.t(bar, s), 0.26 * gain, pan=0.28)

    def melody(self, bars, bar0, voice, gain, shift=0, pan=0.0, bus="lead"):
        for i, notes in enumerate(bars):
            for s, m, ln in notes:
                self.add(bus, voice(m + shift, ln * self.step), self.t(bar0 + i, s), gain, pan)

    def bass(self, prog, bar0, bars, template, octave=0):
        for i in range(bars):
            for s, tone, acc, slide, ln in template:
                root, q, _ = CH[chord_at(prog, i, s)]
                self.bass_notes.append((self.t(bar0 + i, s), root + octave + TONES[q][tone], ln, acc, slide))

    def stabs(self, prog, bar0, bars, hits, gain, bus="keys"):
        for i in range(bars):
            for s, ln in hits:
                self.add(bus, stab(CH[chord_at(prog, i, s)][2], ln * self.step), self.t(bar0 + i, s), gain)

    def pads(self, prog, bar0, bars, gain, cutoff=1900):
        for i in range(bars):
            for half in (0, 8) if isinstance(prog[i % len(prog)], tuple) else (0,):
                ln = self.bar / 2 if isinstance(prog[i % len(prog)], tuple) else self.bar
                v = [m - 12 if m > 70 else m for m in CH[chord_at(prog, i, half)][2][1:]]
                self.add("keys", pad(v, ln, cutoff=cutoff), self.t(bar0 + i, half), gain)

    def keys(self, prog, bar0, bars, hits, gain, voice=ep, strum=0.012):
        for i in range(bars):
            for s, ln in hits:
                v = CH[chord_at(prog, i, s)][2][1:]
                for j, m in enumerate(v):
                    self.add("keys", voice(m, ln * self.step, 0.8), self.t(bar0 + i, s) + j * strum, gain, pan=(j / len(v) - 0.5) * 0.6)

    def arps(self, prog, bar0, bars, gain, up=12, order=(0, 1, 2, 3, 2, 1, 3, 4)):
        for i in range(bars):
            for s in range(16):
                v = CH[chord_at(prog, i, s)][2][1:]
                m = v[order[s % len(order)] % len(v)] + up
                self.add("fx", pluck(m, self.step * 0.8, 0.9), self.t(bar0 + i, s), gain, pan=0.45 if s % 2 else -0.45)

    def roll(self, bar, s0, s1, v0=0.3, v1=0.95, div=1):
        k = (s1 - s0) * div
        for j in range(k):
            self.add("drums", snare(v0 + (v1 - v0) * j / k), self.t(bar, s0) + j * self.step / div, 0.5)

    def acid(self, base_cut, gain):
        """The bass line so far as one monophonic 303-style voice."""
        notes = sorted(self.bass_notes)
        n = self.n + self.extra
        logf = np.full(n, np.log(midi(40)))
        gate, env, acc = np.zeros(n), np.zeros(n), np.zeros(n)
        for j, (on, m, length, a, slide) in enumerate(notes):
            i_on = int(round(on * SR))
            nxt = notes[j + 1][0] if j + 1 < len(notes) else self.dur
            i_nx = min(n, int(round(nxt * SR)))
            slid = j > 0 and notes[j - 1][4]
            target = np.log(midi(m))
            if slid and i_on > 0:
                start = logf[i_on - 1]
                logf[i_on:i_nx] = target + (start - target) * np.exp(-secs(i_nx - i_on) / 0.028)
            else:
                logf[i_on:i_nx] = target
            off = nxt + 0.004 if slide else on + length * self.step * 0.62
            gate[i_on : min(n, int(round(off * SR)))] = 1
            acc[i_on:i_nx] = a
            if not slid:
                env[i_on:] = np.exp(-secs(n - i_on) / (0.085 if a else 0.15)) * (1.0 if a else 0.55)
        amp = signal.lfilter([1 - np.exp(-1 / (0.003 * SR))], [1, -np.exp(-1 / (0.003 * SR))], gate)
        cutoff = base_cut(secs(n)) + (1500 + 2800 * acc) * env
        f = np.exp(logf)
        y = svf(saw(f) * 0.9, cutoff, 0.78 + 0.12 * acc)
        y = np.tanh(y * (1.6 + 0.8 * acc)) * amp * (1 + 0.35 * acc)
        sub = lp(sine(np.where(f > 70, f / 2, f)), 160) * amp * 0.75
        self.add("bass", y + sub, 0, gain)

    def mix(self, duck_bass=0.55, reverb=0.5, echo=0.28):
        b = {k: self.fold(v) for k, v in self.buses.items()}
        z = np.zeros((2, self.n))
        drums, bass, keys, lead, fx = (b.get(k, z) for k in ("drums", "bass", "keys", "lead", "fx"))
        bass = bass * self.duck(duck_bass)
        keys = keys * self.duck(0.25)
        wet = self.conv(keys * 0.3 + lead * 0.3 + fx * 0.25 + drums * 0.05, HALL)
        d = int(3 * self.step * SR)
        tap, echoes = lead * 0.3 + fx * 0.12, np.zeros_like(lead)
        for k in range(1, 5):
            tap = self.lti(tap, lambda x: lp(x, 3200)) * 0.42
            echoes += self.shift(tap[::-1] if k % 2 else tap, d * k)
        return drums + bass + keys + lead + fx + wet * reverb + echoes * echo


# ================================================================ the game (120 BPM)
def game_intro():
    s = Seg(2, 120, loop=False)
    # GO! — a hit, then the groove gathers
    s.add("drums", crash(1.0), 0, 0.3)
    s.add("keys", stab(CH["Em9"][2], 0.3), 0, 0.3)
    s.add("fx", boom(60, 32, 1.2), 0, 0.35)
    for st, v in ((0, 1.0), (6, 0.7), (10, 0.9)):
        s.add("drums", kick(v), s.t(0, st), 0.95)
        s.kicks.append(s.t(0, st))
    for st in range(0, 16, 2):
        s.add("drums", hat(0.45 if st % 4 == 2 else 0.25), s.t(0, st), 0.28, pan=0.28)
    s.groove(1, PAT_A, steps=range(8))
    s.roll(1, 8, 12, 0.25, 0.6)
    s.roll(1, 12, 16, 0.6, 1.0, div=2)
    s.add("fx", whoosh(2.0, 300, 6000, res=0.65, shape=2.3, peak=0.97), s.t(1) - 0.5 * s.bar, 0.18)
    s.bass(["Em9"], 0, 2, [(i, "r" if i % 4 else "o", int(i % 8 == 0), 0, 1) for i in range(0, 16, 2)])
    s.acid(lambda t: np.interp(t, [0, 4], [300, 1400]), 0.34)
    s.melody([[], PICKUP], 0, vibe, 0.2)
    return s


def game_loop():
    s = Seg(48, 120, loop=True)
    A, B, C, D, A2, E, F = 0, 8, 16, 24, 28, 36, 44
    # A — the theme on vibes over the break
    s.add("drums", crash(0.9), s.t(A), 0.28)
    for i in range(8):
        s.groove(A + i, PAT_A if i % 2 == 0 else PAT_B)
    s.bass(PROG_A, A, 8, BASS_A)
    s.melody(THEME, A, vibe, 0.22)
    s.keys(PROG_A, A, 8, [(0, 6), (10, 4)], 0.045)
    s.stabs(PROG_A, A, 1, [(0, 2)], 0.22)
    s.stabs(PROG_A[4:], A + 4, 1, [(0, 2)], 0.2)
    # B — the answer on a square lead, stabs pushing
    for i in range(8):
        s.groove(B + i, PAT_A if i % 2 == 0 else PAT_B, open_hats=(6, 14))
    s.bass(PROG_B, B, 8, BASS_B)
    s.melody(ANSWER, B, lead, 0.1)
    s.melody(ANSWER, B, vibe, 0.07, shift=12, pan=0.3)
    s.stabs(PROG_B, B, 8, [(0, 2), (6, 1), (10, 2)], 0.13)
    # C — breakdown: pads, hats and rim, the theme in fragments
    for i in range(8):
        s.groove(C + i, {"k": [(0, 0.8)] if i < 6 else [], "s": [], "h": PAT_HALF["h"]}, gain=0.8)
        for st in (4, 12):
            s.add("drums", rim(0.8), s.t(C + i, st), 0.14, pan=-0.2)
    s.pads(PROG_A, C, 8, 0.11)
    s.keys(PROG_A, C, 8, [(0, 10)], 0.05)
    s.bass(PROG_A, C, 8, BASS_SUB)
    s.melody(THEME[0:2], C, vibe, 0.2)
    s.melody(THEME[4:6], C + 4, vibe, 0.2)
    s.melody([THEME[7]], C + 7, vibe, 0.16, shift=-12)
    # D — build: four on the floor, a roll, the filter opens
    prog_d = ["Em9", "Cmaj9", "D69", "D69"]
    for i in range(4):
        s.groove(D + i, {"k": [(0, 1.0), (4, 0.9), (8, 0.95), (12, 0.9)], "s": [(4, 0.8), (12, 0.8)] if i < 2 else [],
                         "h": [(st, 0.4) for st in range(2, 16, 4)]})
    s.roll(D + 2, 0, 16, 0.2, 0.5)
    s.roll(D + 3, 0, 8, 0.45, 0.7)
    s.roll(D + 3, 8, 16, 0.7, 1.0, div=2)
    s.stabs(prog_d, D, 4, [(0, 2)], 0.2)
    s.pads(prog_d, D, 4, 0.08, cutoff=1200)
    s.bass(prog_d, D, 4, BASS_DRIVE)
    s.add("fx", whoosh(4 * s.bar, 250, 7000, res=0.7, shape=2.4, peak=0.98), s.t(D), 0.2)
    s.melody([[], [], [], PICKUP], D, vibe, 0.22)
    # A2 — the theme again, lead and vibes an octave apart, arps underneath
    s.add("drums", crash(1.0), s.t(A2), 0.3)
    for i in range(8):
        s.groove(A2 + i, PAT_A if i % 2 == 0 else PAT_B, open_hats=(14,))
    s.bass(PROG_A, A2, 8, BASS_A)
    s.melody(THEME, A2, lead, 0.1)
    s.melody(THEME, A2, vibe, 0.1, shift=12, pan=-0.25)
    s.arps(PROG_A, A2, 8, 0.035)
    s.stabs(PROG_A, A2, 8, [(0, 2)], 0.15)
    # E — a new colour: ii–iii–IV–V, a riff calling across the stereo field
    s.add("drums", crash(0.7), s.t(E), 0.22)
    for i in range(8):
        s.groove(E + i, PAT_C, open_hats=(14,) if i % 2 else ())
    s.bass(PROG_E, E, 8, BASS_B)
    s.melody(RIFF, E, vibe, 0.18, pan=-0.3)
    s.melody(RIFF2, E + 4, pluck_voice, 0.12, pan=0.3)
    s.melody(RIFF2, E + 4, vibe, 0.1, pan=0.3)
    s.stabs(PROG_E, E, 8, [(0, 3), (6, 1), (10, 1), (12, 2)], 0.1)
    s.arps(PROG_E, E + 4, 4, 0.03, order=(0, 1, 2, 3))
    # F — turnaround on E minor, half time, a fill back to the top
    for i in range(3):
        s.groove(F + i, PAT_HALF, open_hats=(14,))
    s.groove(F + 3, PAT_HALF, steps=range(8))
    s.roll(F + 3, 8, 16, 0.3, 1.0, div=2)
    for st in (8, 12, 14):
        s.add("drums", kick(0.9), s.t(F + 3, st), 0.9)
        s.kicks.append(s.t(F + 3, st))
    s.pads(["Em9"] * 3 + ["D69"], F, 4, 0.09)
    s.keys(["Em9"] * 3 + ["D69"], F, 4, [(0, 6), (7, 3), (10, 6)], 0.05)
    s.bass(["Em9"] * 3 + ["D69"], F, 4, BASS_SUB)
    s.melody([[(0, 83, 4), (4, 81, 4), (8, 79, 8)], [(0, 76, 12)], [(0, 79, 4), (4, 78, 4), (8, 74, 8)], PICKUP], F, vibe, 0.18)
    s.add("fx", whoosh(2.0, 400, 9000, res=0.55, shape=2.2, peak=0.98), s.t(F + 3), 0.18)
    s.acid(lambda t: 460 + 220 * np.sin(2 * np.pi * t / 32) ** 2 + np.interp(t, [s.t(D), s.t(A2), s.t(E), s.t(F)], [0, 900, 150, 0]) * ((t > s.t(D)) & (t < s.t(E + 1))), 0.34)
    return s


def pluck_voice(m, dur, vel=1.0):
    return pluck(m, dur, vel)


def game_final():
    """The last bites: everything a notch up."""
    s = Seg(16, 120, loop=True)
    s.add("drums", crash(1.0), 0, 0.3)
    for i in range(8):
        s.groove(i, PAT_A if i % 2 == 0 else PAT_B, open_hats=(6, 14))
        for st in range(1, 16, 2):
            s.add("drums", hat(0.18), s.t(i, st), 0.2, pan=-0.2)
    s.bass(PROG_A, 0, 8, BASS_DRIVE)
    s.melody(THEME, 0, lead, 0.11)
    s.melody(THEME, 0, vibe, 0.1, shift=12, pan=0.25)
    s.stabs(PROG_A, 0, 8, [(0, 2), (6, 1), (10, 2), (14, 1)], 0.12)
    s.arps(PROG_A, 0, 8, 0.03)
    s.add("drums", crash(0.8), s.t(8), 0.26)
    for i in range(8):
        s.groove(8 + i, PAT_C, steps=range(16) if i < 7 else range(8))
    s.roll(15, 8, 16, 0.35, 1.0, div=2)
    s.bass(PROG_E, 8, 8, BASS_A)
    s.melody(RIFF, 8, lead, 0.1)
    s.melody(RIFF2, 12, vibe, 0.14, shift=0, pan=0.3)
    s.melody([PICKUP], 15, vibe, 0.2)
    s.stabs(PROG_E, 8, 8, [(0, 2), (6, 1), (10, 2)], 0.12)
    s.arps(PROG_E, 8, 8, 0.035, order=(0, 1, 2, 3))
    s.add("fx", whoosh(2.0, 400, 9000, res=0.55, shape=2.2, peak=0.98), s.t(15), 0.18)
    s.acid(lambda t: 900 + 500 * np.sin(2 * np.pi * t / 16) ** 2, 0.33)
    return s


# ================================================================ the menu (90 BPM, swung, lo-fi)
UPRIGHT = [(0, "r", 6), (6, "5", 2), (8, "o", 5), (13, "5", 1)]


def lofi_bass(s, prog, bar0, bars, gain=0.42):
    for i in range(bars):
        for st, tone, ln in UPRIGHT:
            root, q, _ = CH[chord_at(prog, i, st)]
            s.add("bass", upright(root + TONES[q][tone], ln * s.step), s.t(bar0 + i, st), gain)
        nxt = CH[chord_at(prog, i + 1, 0)][0]
        s.add("bass", upright(nxt - 1, s.step), s.t(bar0 + i, 15), gain * 0.8)


def lofi_drums(s, bar, kick_on=True):
    if kick_on:
        for st, v in PAT_LOFI["k"]:
            s.add("drums", kick(v, f0=120, f1=48, ta=0.22, click=0.08, drive=1.2), s.t(bar, st), 0.7)
            s.kicks.append(s.t(bar, st))
    for st in (4, 12):
        s.add("drums", rim(0.8), s.t(bar, st), 0.2, pan=-0.15)
    s.add("drums", snare(0.25), s.t(bar, 15), 0.12)
    for st in range(16):
        s.add("drums", shaker(0.9 if st % 2 == 0 else 0.45), s.t(bar, st), 0.07, pan=0.35)


def menu_intro():
    s = Seg(2, 90, loop=False, swing=0.22)
    s.keys(PROG_A, 0, 2, [(0, 14)], 0.07, strum=0.03)
    s.melody([[], PICKUP], 0, vibe, 0.18)
    return s


def menu_loop():
    s = Seg(24, 90, loop=True, swing=0.22)
    comp = [(0, 5), (7, 3), (10, 5)]
    for i in range(24):
        lofi_drums(s, i, kick_on=not (16 <= i < 18))
    s.keys(PROG_A, 0, 8, comp, 0.06)
    s.keys(PROG_B, 8, 8, comp, 0.06)
    s.keys(PROG_A, 16, 8, comp, 0.06)
    lofi_bass(s, PROG_A, 0, 8)
    lofi_bass(s, PROG_B, 8, 8)
    lofi_bass(s, PROG_A, 16, 8)
    s.melody(THEME, 0, vibe, 0.2)
    s.melody(ANSWER, 8, ep, 0.1, shift=-12)
    s.melody(THEME, 16, ep, 0.11, shift=-12)
    s.melody(THEME[4:], 20, vibe, 0.12, pan=0.3)
    s.pads(PROG_B, 8, 8, 0.04, cutoff=1200)
    return s


def lofi(s, x):
    """Muffled, narrow and slightly saturated, like a tape in another room."""
    x = s.lti(x, lambda y: lp(hp(y, 90), 2900, 2))
    mid, side = x.mean(axis=0), (x[0] - x[1]) / 2
    x = np.stack([mid + side * 0.5, mid - side * 0.5])
    x = np.tanh(x * 1.6) / 1.6
    return x + pan2(crackle(x.shape[1], seed=5 if s.loop else 6), 0.0) * 0.5


# ================================================================ the finale (120 BPM, half time)
def finale_intro():
    s = Seg(2, 120, loop=False)
    for i, c in enumerate(("Gmaj9", "Cmaj9")):
        s.add("keys", stab(CH[c][2], 0.5, cut0=7000, cut1=1600, tau=0.4, release=0.4), s.t(i), 0.3)
        s.add("drums", kick(1.0), s.t(i), 0.9)
        s.kicks.append(s.t(i))
        s.add("fx", boom(midi(CH[c][0] - 12) * 1.4, midi(CH[c][0] - 12), 1.0), s.t(i), 0.3)
    s.add("drums", crash(1.0, 3.0), 0, 0.32)
    s.pads(["Gmaj9", "Cmaj9"], 0, 2, 0.08, cutoff=2600)
    s.melody(THEME[:2], 0, lead, 0.12)
    s.melody(THEME[:2], 0, vibe, 0.14, shift=12)
    s.roll(1, 12, 16, 0.4, 1.0, div=2)
    return s


def finale_loop():
    s = Seg(16, 120, loop=True)
    for i in range(16):
        s.groove(i, PAT_HALF, open_hats=(14,) if i % 4 == 3 else ())
        s.add("drums", clap(0.9), s.t(i, 8), 0.2, pan=-0.05)
        for st in range(16):
            s.add("drums", tamb(0.9 if st % 4 == 2 else 0.4), s.t(i, st), 0.06, pan=-0.4)
    s.add("drums", crash(0.8), 0, 0.24)
    s.add("drums", crash(0.8), s.t(8), 0.24)
    for i in range(16):
        root, q, v = CH[PROG_V[i % 8]]
        for st, tone, ln in ((0, "r", 5), (6, "5", 2), (8, "o", 3), (11, "5", 1), (12, "r", 4)):
            s.add("bass", round_bass(root + TONES[q][tone], ln * s.step), s.t(i, st), 0.38)
        for j, m in enumerate(v[1:] + [v[2] + 12]):
            s.add("fx", bell(m + 12, s.step), s.t(i, 2 * j + (8 if i % 2 else 0)), 0.03, pan=(j - 2) * 0.25)
    s.pads(PROG_V * 2, 0, 16, 0.07, cutoff=2400)
    s.melody(VICTORY, 0, vibe, 0.22)
    s.melody(VICTORY, 0, bell, 0.04, shift=12, pan=0.3)
    s.melody(THEME, 8, lead, 0.1)
    s.melody(THEME, 8, vibe, 0.12, shift=12, pan=-0.25)
    s.stabs(PROG_V, 8, 8, [(0, 2), (6, 1), (10, 2)], 0.1)
    return s


# ================================================================ assembly
def db(x):
    return 20 * np.log10(max(1e-9, x))


def render(name, parts, rms, kbps, rate=SR, post=None):
    """parts: [(label, seg)]. Writes the mp3 and returns its loop map."""
    audio, info, pos = [], {}, 0.0
    mixes = []
    for label, seg in parts:
        x = seg.mix()
        if post:
            x = post(seg, x)
        mixes.append((label, seg, x))
    loops = np.concatenate([x for _, s, x in mixes if s.loop], axis=1)
    gain = 10 ** ((rms - db(np.sqrt((loops**2).mean()))) / 20)
    for label, seg, x in mixes:
        x = np.tanh(x * gain * 1.2) / np.tanh(1.2)
        if seg.loop:
            info[label] = [round(pos, 6), round(pos + M, 6), round(pos + seg.dur + M, 6)]
            x = np.concatenate([x, x[:, : int(TAIL * SR)]], axis=1)
        audio.append(x)
        pos += x.shape[1] / SR
    y = np.concatenate(audio, axis=1)
    y *= min(1.0, 0.95 / np.abs(y).max())
    tmp = Path(tempfile.mkdtemp()) / f"{name}.wav"
    wavfile.write(tmp, SR, (y.T * 32767).astype(np.int16))
    out = OUT / f"music-{name}.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-ar", str(rate), "-b:a", f"{kbps}k", str(out)], check=True)
    print(f"music-{name}.mp3  {y.shape[1] / SR:.1f} s  {out.stat().st_size // 1024} KB  loops {info}")
    return {"bar": parts[0][1].bar, **info}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    music = {
        "menu": render("menu", [("intro", menu_intro()), ("loop", menu_loop())], -21, 48, 22050, post=lofi),
        "game": render("game", [("intro", game_intro()), ("loop", game_loop()), ("final", game_final())], -17, 96),
        "finale": render("finale", [("intro", finale_intro()), ("loop", finale_loop())], -17, 96),
    }
    MAP.write_text(json.dumps(music, indent=2) + "\n", "utf-8")
    print("wrote", MAP)
