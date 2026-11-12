// KeepXClean promo soundtrack — procedurally synthesized, royalty-free.
// 120 BPM · A minor · 15 bars (30 s) + tail. Writes public/music.wav
// Bar grid is shared with the video timeline (src/timing.ts): 1 bar = 2 s = 60 frames @ 30 fps.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const BPM = 120;
const BEAT = 60 / BPM; // 0.5 s
const BAR = BEAT * 4; // 2 s
const BARS = 15;
const TAIL = 1.0;
const LEN = Math.ceil((BARS * BAR + TAIL) * SR);

// Buses (stereo)
const mk = () => [new Float32Array(LEN), new Float32Array(LEN)];
const drums = mk();
const music = mk(); // bass + stabs + pads (sidechained)
const fx = mk(); // risers, impacts, crashes
const verbSend = new Float32Array(LEN); // mono send to reverb
const duck = new Float32Array(LEN).fill(1); // sidechain gain

// ---------- helpers ----------
let seed = 1337;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noise = () => rand() * 2 - 1;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const t2i = (t) => Math.round(t * SR);
const barT = (bar, beat = 0) => bar * BAR + beat * BEAT;

class Biquad {
  constructor(type, freq, q = 0.707) {
    this.type = type;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(freq, q);
  }
  set(freq, q = this.q) {
    this.q = q;
    const w = (2 * Math.PI * Math.min(freq, SR * 0.45)) / SR;
    const cs = Math.cos(w);
    const a = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    const a0 = 1 + a;
    if (this.type === 'lp') {
      b0 = (1 - cs) / 2;
      b1 = 1 - cs;
      b2 = (1 - cs) / 2;
    } else if (this.type === 'hp') {
      b0 = (1 + cs) / 2;
      b1 = -(1 + cs);
      b2 = (1 + cs) / 2;
    } else {
      // band-pass (constant peak gain)
      b0 = a;
      b1 = 0;
      b2 = -a;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cs) / a0;
    this.a2 = (1 - a) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

const add = (bus, i, l, r = l) => {
  if (i < 0 || i >= LEN) return;
  bus[0][i] += l;
  bus[1][i] += r;
};

// ---------- instruments ----------
function kick(t, vel = 1) {
  const s = t2i(t);
  const n = t2i(0.45);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const tt = k / SR;
    const f = 46 + 150 * Math.exp(-tt * 32);
    ph += (2 * Math.PI * f) / SR;
    const amp = Math.exp(-tt * 5.5) * Math.min(1, tt * 800);
    let v = Math.tanh(Math.sin(ph) * 1.8) * amp * 0.9;
    if (tt < 0.004) v += noise() * 0.35 * (1 - tt / 0.004);
    add(drums, s + k, v * vel);
  }
  // sidechain: duck music for ~0.22 s
  const dn = t2i(0.24);
  for (let k = 0; k < dn; k++) {
    const g = 0.25 + 0.75 * Math.pow(k / dn, 1.6);
    const i = s + k;
    if (i < LEN) duck[i] = Math.min(duck[i], g);
  }
}

function clap(t, vel = 1) {
  const s = t2i(t);
  const bp = new Biquad('bp', 1500, 1.1);
  const hp = new Biquad('hp', 600);
  const n = t2i(0.35);
  for (let k = 0; k < n; k++) {
    const tt = k / SR;
    let env = Math.exp(-tt * 16);
    for (const off of [0, 0.011, 0.022]) {
      if (tt >= off && tt < off + 0.009) env += 0.9 * Math.exp(-(tt - off) * 220);
    }
    const v = hp.run(bp.run(noise())) * env * 1.4 * vel;
    add(drums, s + k, v * 0.95, v * 1.05);
    verbSend[s + k] += v * 0.35;
  }
}

function hat(t, open = false, vel = 1, pan = 0) {
  const s = t2i(t);
  const hp = new Biquad('hp', 7600, 0.9);
  const n = t2i(open ? 0.28 : 0.06);
  const decay = open ? 11 : 75;
  // metallic partials
  const freqs = [3140, 4230, 5390, 6670, 8120, 9890];
  for (let k = 0; k < n; k++) {
    const tt = k / SR;
    let m = 0;
    for (const f of freqs) m += Math.sign(Math.sin(2 * Math.PI * f * tt));
    const v = hp.run(noise() * 0.7 + m * 0.08) * Math.exp(-tt * decay) * 0.32 * vel;
    add(drums, s + k, v * (1 - pan), v * (1 + pan));
  }
}

function snare(t, vel = 1) {
  const s = t2i(t);
  const bp = new Biquad('bp', 2200, 0.8);
  const n = t2i(0.18);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const tt = k / SR;
    ph += (2 * Math.PI * (190 + 60 * Math.exp(-tt * 40))) / SR;
    const v = (bp.run(noise()) * 1.2 * Math.exp(-tt * 22) + Math.sin(ph) * 0.5 * Math.exp(-tt * 30)) * vel;
    add(drums, s + k, v * 0.6);
    verbSend[s + k] += v * 0.15;
  }
}

function crash(t, vel = 1, len = 1.8) {
  const s = t2i(t);
  const hp = new Biquad('hp', 4200, 0.6);
  const hp2 = new Biquad('hp', 5200, 0.6);
  const n = t2i(len);
  const freqs = [2870, 3610, 4470, 5530, 7210];
  for (let k = 0; k < n; k++) {
    const tt = k / SR;
    let m = 0;
    for (const f of freqs) m += Math.sign(Math.sin(2 * Math.PI * f * tt + f));
    const env = Math.exp(-tt * 2.6) * Math.min(1, tt * 2000);
    add(fx, s + k, hp.run(noise() * 0.8 + m * 0.05) * env * 0.26 * vel, hp2.run(noise() * 0.8 + m * 0.05) * env * 0.26 * vel);
  }
}

function impact(t, vel = 1) {
  const s = t2i(t);
  const n = t2i(1.8);
  let ph = 0;
  const lp = new Biquad('lp', 900);
  for (let k = 0; k < n; k++) {
    const tt = k / SR;
    ph += (2 * Math.PI * (38 + 90 * Math.exp(-tt * 9))) / SR;
    const boom = Math.tanh(Math.sin(ph) * 2.2) * Math.exp(-tt * 2.4) * 0.85;
    const grit = lp.run(noise()) * Math.exp(-tt * 7) * 0.5;
    const v = (boom + grit) * vel;
    add(fx, s + k, v);
    verbSend[s + k] += grit * 0.4 * vel;
  }
  crash(t, vel * 1.1, 2.2);
}

function riser(t0, t1, vel = 1) {
  const s = t2i(t0);
  const n = t2i(t1 - t0);
  const bpL = new Biquad('bp', 300, 2.2);
  const bpR = new Biquad('bp', 300, 2.2);
  for (let k = 0; k < n; k++) {
    const p = k / n;
    if (k % 32 === 0) {
      const f = 250 * Math.pow(7000 / 250, p * p);
      bpL.set(f, 2.2);
      bpR.set(f * 1.03, 2.2);
    }
    const env = Math.pow(p, 2.2) * 0.75 * vel;
    add(fx, s + k, bpL.run(noise()) * env, bpR.run(noise()) * env);
    verbSend[s + k] += bpL.y1 * env * 0.3;
  }
}

// detuned saw voice → lowpass, written to `music` bus
function saw(phase) {
  return 2 * (phase - Math.floor(phase + 0.5));
}

function synthNote({ t, dur, notes, cutoff = 1800, cutEnd = cutoff, q = 0.9, attack = 0.004, release = 0.08, gain = 0.15, detune = 0.12, voices = 3, width = 0.5, verb = 0.25, sub = 0 }) {
  const s = t2i(t);
  const n = t2i(dur + release);
  const lpL = new Biquad('lp', cutoff, q);
  const lpR = new Biquad('lp', cutoff, q);
  const osc = [];
  for (const note of notes) {
    for (let v = 0; v < voices; v++) {
      const d = voices === 1 ? 0 : (v / (voices - 1) - 0.5) * 2 * detune;
      osc.push({ f: midi(note + d), ph: rand(), pan: voices === 1 ? 0 : (v / (voices - 1) - 0.5) * 2 * width });
    }
  }
  const subF = notes.length ? midi(notes[0] - 12) : 0;
  let subPh = 0;
  const norm = 1 / Math.sqrt(osc.length);
  for (let k = 0; k < n; k++) {
    const tt = k / SR;
    if (k % 32 === 0) {
      const p = Math.min(1, tt / Math.max(dur, 0.001));
      const c = cutoff * Math.pow(cutEnd / cutoff, p);
      lpL.set(c, q);
      lpR.set(c, q);
    }
    let env = Math.min(1, tt / attack);
    if (tt > dur) env *= Math.max(0, 1 - (tt - dur) / release);
    let l = 0;
    let r = 0;
    for (const o of osc) {
      o.ph += o.f / SR;
      const x = saw(o.ph);
      l += x * (1 - o.pan);
      r += x * (1 + o.pan);
    }
    l *= norm;
    r *= norm;
    let yl = lpL.run(l) * env * gain;
    let yr = lpR.run(r) * env * gain;
    if (sub) {
      subPh += subF / SR;
      const sv = Math.sin(2 * Math.PI * subPh) * env * sub;
      yl += sv;
      yr += sv;
    }
    add(music, s + k, yl, yr);
    verbSend[s + k] += (yl + yr) * 0.5 * verb;
  }
}

// ---------- arrangement ----------
// Am – F – C – G  (A minor). roots for bass (MIDI), chord voicings for stabs
const prog = [
  { root: 33, chord: [57, 60, 64, 69] }, // Am
  { root: 29, chord: [57, 60, 65, 69] }, // F (A C F A)
  { root: 36, chord: [55, 60, 64, 67] }, // C
  { root: 31, chord: [55, 59, 62, 67] }, // G
];

// Bars 0–1: HOOK — noise piling up. Kick on every beat, hats, pulsing filtered bass, rising tension.
for (let bar = 0; bar < 2; bar++) {
  for (let b = 0; b < 4; b++) {
    kick(barT(bar, b), 0.85);
    hat(barT(bar, b + 0.5), false, 0.9, 0.2);
    hat(barT(bar, b + 0.75), false, 0.5, -0.2);
  }
  // bass pulse on 8ths, filter opening over two bars
  for (let e = 0; e < 8; e++) {
    const p = (bar * 8 + e) / 16;
    synthNote({ t: barT(bar, e * 0.5), dur: 0.2, notes: [33], cutoff: 260 + p * 900, q: 3, gain: 0.35, voices: 2, detune: 0.08, width: 0.1, verb: 0, sub: 0.18 });
  }
}
clap(barT(0, 1), 0.7);
clap(barT(0, 3), 0.7);
clap(barT(1, 1), 0.7);
// snare roll into the drop
for (let k = 0; k < 8; k++) snare(barT(1, 2 + k * 0.25), 0.35 + k * 0.08);
riser(barT(1, 0), barT(2, 0), 1);

// Bar 2: "Meet KeepXClean" — impact, sustained pad, breath.
impact(barT(2, 0), 1);
synthNote({ t: barT(2, 0), dur: 1.6, notes: [45, 57, 60, 64, 69, 76], cutoff: 3200, cutEnd: 900, attack: 0.005, release: 0.6, gain: 0.2, voices: 3, detune: 0.14, width: 0.8, verb: 0.6, sub: 0.25 });
// pickup into the groove
kick(barT(2, 3), 0.7);
for (let k = 0; k < 4; k++) snare(barT(2, 3 + k * 0.25), 0.4 + k * 0.12);
riser(barT(2, 2), barT(3, 0), 0.55);

// Bars 3–13: full groove
const grooveStart = 3;
const grooveEnd = 14; // exclusive
for (let bar = grooveStart; bar < grooveEnd; bar++) {
  const c = prog[(bar - grooveStart) % 4];
  const isOutroBar = bar === 13;
  for (let b = 0; b < 4; b++) {
    kick(barT(bar, b), 1);
    hat(barT(bar, b + 0.5), true, 0.75, 0.15);
    for (const sx of [0.25, 0.75]) hat(barT(bar, b + sx), false, 0.45, -0.25);
    if (b % 2 === 1) clap(barT(bar, b), 1);
    // offbeat bass (classic pumping house bass)
    synthNote({ t: barT(bar, b + 0.5), dur: 0.2, notes: [c.root], cutoff: 700, cutEnd: 380, q: 2.2, gain: 0.42, voices: 2, detune: 0.07, width: 0.1, verb: 0, sub: 0.28 });
  }
  // syncopated chord stabs: 1, 2&, 3a(ish), 4&
  const stabs = [0, 1.5, 2.75, 3.5];
  for (const st of stabs) {
    synthNote({ t: barT(bar, st), dur: 0.11, notes: c.chord, cutoff: 3600, cutEnd: 1400, q: 1.1, release: 0.12, gain: 0.17, voices: 3, detune: 0.13, width: 0.7, verb: 0.45 });
  }
  // plucky arp on 16ths in the second half of the groove for lift
  if (bar >= 9) {
    const arp = [c.chord[0] + 12, c.chord[1] + 12, c.chord[2] + 12, c.chord[3] + 12];
    for (let k = 0; k < 16; k++) {
      synthNote({ t: barT(bar, k * 0.25), dur: 0.05, notes: [arp[(k * 3) % 4]], cutoff: 5200, cutEnd: 2000, release: 0.06, gain: 0.06, voices: 1, verb: 0.5 });
    }
  }
  if (isOutroBar) {
    // nothing extra — handled below
  }
}
// section accents (match the video cuts)
for (const bar of [3, 7, 9, 11, 13]) crash(barT(bar, 0), bar === 3 ? 1 : 0.8);
// fills before section changes
for (const bar of [6, 8, 10, 12]) for (let k = 0; k < 4; k++) snare(barT(bar, 3 + k * 0.25), 0.3 + k * 0.1);
riser(barT(12, 0), barT(13, 0), 0.6);

// Bar 13: outro, logo hit. Bar 14: final chord ring-out.
impact(barT(13, 0), 0.75);
impact(barT(14, 0), 0.9);
synthNote({ t: barT(14, 0), dur: 1.3, notes: [45, 57, 60, 64, 69, 72, 76], cutoff: 4000, cutEnd: 700, attack: 0.004, release: 1.2, gain: 0.22, voices: 3, detune: 0.14, width: 0.85, verb: 0.7, sub: 0.3 });

// ---------- mixdown ----------
// Simple Schroeder reverb on the send
function reverb(inp) {
  const outL = new Float32Array(LEN);
  const outR = new Float32Array(LEN);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116];
  const aps = [225, 556, 441, 341];
  const runComb = (d, fb, damp, out, spread) => {
    const buf = new Float32Array(d + spread);
    let idx = 0;
    let lp = 0;
    const len = d + spread;
    for (let i = 0; i < LEN; i++) {
      const y = buf[idx];
      lp = y * (1 - damp) + lp * damp;
      buf[idx] = inp[i] + lp * fb;
      idx = (idx + 1) % len;
      out[i] += y;
    }
  };
  for (const d of combs) {
    runComb(d, 0.8, 0.3, outL, 0);
    runComb(d, 0.8, 0.3, outR, 23);
  }
  const runAp = (sig, d) => {
    const buf = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < LEN; i++) {
      const b = buf[idx];
      const y = -sig[i] + b;
      buf[idx] = sig[i] + b * 0.5;
      idx = (idx + 1) % d;
      sig[i] = y;
    }
  };
  for (const d of aps) {
    runAp(outL, d);
    runAp(outR, d + 17);
  }
  return [outL, outR];
}

const [rvL, rvR] = reverb(verbSend);
const mixL = new Float32Array(LEN);
const mixR = new Float32Array(LEN);
for (let i = 0; i < LEN; i++) {
  const g = duck[i];
  mixL[i] = drums[0][i] * 0.62 + music[0][i] * g * 0.5 + fx[0][i] * 0.5 + rvL[i] * 0.028 * (0.5 + 0.5 * g);
  mixR[i] = drums[1][i] * 0.62 + music[1][i] * g * 0.5 + fx[1][i] * 0.5 + rvR[i] * 0.028 * (0.5 + 0.5 * g);
}
// gentle master glue: soft clip + normalize to -1 dBFS, fade tail
let peak = 0;
for (let i = 0; i < LEN; i++) {
  mixL[i] = Math.tanh(mixL[i] * 1.1);
  mixR[i] = Math.tanh(mixR[i] * 1.1);
  peak = Math.max(peak, Math.abs(mixL[i]), Math.abs(mixR[i]));
}
const target = Math.pow(10, -1 / 20);
const norm = target / peak;
const fadeStart = t2i(BARS * BAR + TAIL - 0.6);
const buf = Buffer.alloc(44 + LEN * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + LEN * 4, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(LEN * 4, 40);
for (let i = 0; i < LEN; i++) {
  const f = i > fadeStart ? Math.max(0, 1 - (i - fadeStart) / (LEN - fadeStart)) : 1;
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mixL[i] * norm * f)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mixR[i] * norm * f)) * 32767), 46 + i * 4);
}
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'music.wav');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);
console.log(`wrote ${out} (${(LEN / SR).toFixed(2)} s, peak norm ×${norm.toFixed(2)})`);
