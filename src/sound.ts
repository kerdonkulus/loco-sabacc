// Table sound effects, synthesized with Web Audio so there are no files to
// download and they work offline.

import { storageGet, storageSet } from "./ui";

export type Sound =
  | "deal"
  | "card"
  | "tap"
  | "chips"
  | "allin"
  | "fold"
  | "dice"
  | "shift"
  | "win"
  | "sabacc"
  | "turn";

const MUTE_KEY = "loco-sabacc-muted";
let muted = storageGet<boolean>(MUTE_KEY) ?? false;
let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let master: AudioNode | null = null;

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  storageSet(MUTE_KEY, value);
}

/** Creates or wakes the audio context; must run inside a tap on iPhone. */
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Master volume through a limiter, so phone speakers are loud but never clip. */
function output(ac: AudioContext): AudioNode {
  if (!master) {
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    limiter.connect(ac.destination);
    const gain = ac.createGain();
    gain.gain.value = 2.2;
    gain.connect(limiter);
    master = gain;
  }
  return master;
}

function noise(ac: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function envelope(ac: AudioContext, at: number, attack: number, hold: number, release: number, peak: number): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.setValueAtTime(peak, at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  g.connect(output(ac));
  return g;
}

function tone(ac: AudioContext, at: number, freq: number, dur: number, type: OscillatorType, peak: number, glideTo?: number): void {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
  osc.connect(envelope(ac, at, 0.008, dur * 0.3, dur * 0.7, peak));
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** A short filtered noise burst: a chip clink, a die hitting the table. */
function burst(ac: AudioContext, at: number, freq: number, q: number, dur: number, peak: number): void {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  src.connect(filter).connect(envelope(ac, at, 0.002, 0, dur, peak));
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.05);
}

/** Filtered noise swept up then down: a hyperspace-style whoosh. */
function whoosh(ac: AudioContext, at: number, dur: number, from: number, peakFreq: number, peak: number): void {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(peakFreq, at + dur * 0.6);
  filter.frequency.exponentialRampToValueAtTime(from, at + dur);
  src.connect(filter).connect(envelope(ac, at, dur * 0.4, 0, dur * 0.6, peak));
  src.start(at);
  src.stop(at + dur + 0.05);
}

function chips(ac: AudioContext, at: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const t = at + i * 0.045 + Math.random() * 0.02;
    burst(ac, t, 5200 + Math.random() * 2600, 9, 0.06, 0.9);
    tone(ac, t, 2600 + Math.random() * 900, 0.05, "sine", 0.08);
  }
}

/** Droid-style chatter: a few quick, random-pitched bleeps. */
function bleeps(ac: AudioContext, at: number, count: number, peak: number): void {
  for (let i = 0; i < count; i++) {
    const f = 1100 + Math.random() * 1400;
    tone(ac, at + i * 0.07, f, 0.055, "square", peak, f * (Math.random() > 0.5 ? 1.25 : 0.8));
  }
}

function arpeggio(ac: AudioContext, at: number, notes: number[], step: number, type: OscillatorType, peak: number): void {
  notes.forEach((f, i) => tone(ac, at + i * step, f, 0.35, type, peak));
}

export function play(sound: Sound, delay = 0): void {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.01 + delay;
  switch (sound) {
    case "deal":
      whoosh(ac, t, 0.9, 180, 2600, 0.5);
      chips(ac, t + 0.55, 4);
      break;
    case "card":
      whoosh(ac, t, 0.18, 1200, 4200, 0.6);
      break;
    case "tap":
      tone(ac, t, 1800, 0.06, "sine", 0.12);
      tone(ac, t + 0.07, 1800, 0.06, "sine", 0.1);
      break;
    case "chips":
      chips(ac, t, 3);
      break;
    case "allin":
      chips(ac, t, 9);
      tone(ac, t, 110, 0.5, "sawtooth", 0.08, 220);
      break;
    case "fold":
      tone(ac, t, 340, 0.35, "sawtooth", 0.09, 110);
      break;
    case "dice":
      for (let i = 0; i < 9; i++) {
        burst(ac, t + i * 0.04 + i * i * 0.004, 1800 + Math.random() * 1500, 6, 0.04, 0.9);
      }
      break;
    case "shift":
      tone(ac, t, 900, 0.7, "sine", 0.18, 120);
      tone(ac, t + 0.35, 120, 0.7, "triangle", 0.15, 900);
      whoosh(ac, t, 1.1, 150, 3000, 0.35);
      break;
    case "win":
      arpeggio(ac, t, [523, 659, 784, 1047], 0.09, "triangle", 0.2);
      chips(ac, t + 0.3, 6);
      break;
    case "sabacc":
      arpeggio(ac, t, [392, 523, 659, 784, 1047, 1319], 0.08, "triangle", 0.22);
      arpeggio(ac, t + 0.04, [784, 1047, 1319, 1568, 2093, 2637], 0.08, "sine", 0.06);
      chips(ac, t + 0.5, 10);
      break;
    case "turn":
      bleeps(ac, t, 3, 0.08);
      break;
  }
}
