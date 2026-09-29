"""Room ambience for the intro: trims and loops the supplied recordings.

    python scripts/room-audio.py <folder with the source mp3s>

Writes public/assets/audio/*.mp3 (mono). Loops (lamp, fly) are stored as
three identical periods: the player loops the middle one, so the mp3
encoder's leading/trailing padding can never land inside the loop.
Needs ffmpeg on PATH and numpy/scipy.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "audio"
OUT.mkdir(parents=True, exist_ok=True)
SR = 44100
TMP = Path(tempfile.mkdtemp())


def read(name):
    wav = TMP / (Path(name).stem + ".wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SRC / name), "-ac", "1", "-ar", str(SR), str(wav)], check=True)
    sr, x = wavfile.read(wav)
    return x.astype(np.float64) / 32768


def encode(x, name, rate=SR, kbps=64):
    wav = TMP / (name + ".wav")
    wavfile.write(wav, rate, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-ac", "1", "-b:a", f"{kbps}k", str(OUT / (name + ".mp3"))], check=True)
    print(f"{name}.mp3  {len(x) / rate:.2f} s  {(OUT / (name + '.mp3')).stat().st_size // 1024} KB")


def rms_db(x):
    return 20 * np.log10(np.sqrt((x**2).mean()) + 1e-12)


def normalize(x, db=-18.0):
    return x * 10 ** ((db - rms_db(x)) / 20)


def mains_period(x):
    """Hum period in samples, from the autocorrelation around 50/60 Hz."""
    seg = x[: SR]
    ac = signal.correlate(seg, seg, mode="full")[len(seg) - 1 :]
    lo, hi = int(SR / 130), int(SR / 45)
    return lo + int(np.argmax(ac[lo:hi]))


def loop(x, start, length, fade, period=None):
    """A seamless loop of ~length s from start s, crossfading its tail into its head."""
    n = int(length * SR)
    if period:
        n = int(round(n / period)) * period  # the hum is in phase at the seam
    f = int(fade * SR)
    a = int(start * SR)
    body = x[a : a + n].copy()
    tail = x[a + n : a + n + f]
    ramp = np.sin(np.linspace(0, np.pi / 2, f)) ** 2
    body[:f] = body[:f] * ramp + tail * (1 - ramp)
    return body


# the lamp: skip the switch-on click, stop before the switch-off
lamp = read("platemaker-lamp_m16svfvo-1.mp3")
lamp = signal.sosfilt(signal.butter(2, 40, "highpass", fs=SR, output="sos"), lamp)
period = mains_period(lamp[int(0.8 * SR) :])
print("lamp hum", SR / period, "Hz")
lamp_loop = normalize(loop(lamp, 0.7, 3.6, 0.4, period), -20)
encode(np.tile(lamp_loop, 3), "lamp-loop")

# the fly: a stretch of steady buzzing, the harsh top taken off
fly = read("fly-buzzing.mp3")
fly = signal.sosfilt(signal.butter(2, [150, 7000], "bandpass", fs=SR, output="sos"), fly)
fly_loop = loop(fly, 3.9, 3.2, 0.35)
fly_loop = normalize(fly_loop, -20)
encode(np.tile(fly_loop, 3), "fly-loop")

# crickets: played in short windows by the page, so kept whole
crickets = read("zvuk-pary-sverchkov.mp3")
crickets = normalize(signal.sosfilt(signal.butter(2, 900, "highpass", fs=SR, output="sos"), crickets), -24)
crickets[: int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR))
crickets[-int(0.3 * SR) :] *= np.linspace(1, 0, int(0.3 * SR))
encode(crickets, "crickets")

# the TV: mono, band-limited; the page muffles it further
tv = read("Telegram Desktop/Nujabes - Next view.mp3")[45 * SR :]  # start at 0:45
# the page muffles it to ~1 kHz, so 11 kHz / 16 kbps mono loses nothing audible
tv = normalize(signal.sosfilt(signal.butter(6, 4800, "lowpass", fs=SR, output="sos"), tv), -18)
wav = TMP / "tv.wav"
wavfile.write(wav, SR, (np.clip(tv, -1, 1) * 32767).astype(np.int16))
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-ac", "1", "-ar", "11025", "-b:a", "16k", str(OUT / "tv.mp3")], check=True)
print(f"tv.mp3  {len(tv) / SR:.1f} s  {(OUT / 'tv.mp3').stat().st_size // 1024} KB")
