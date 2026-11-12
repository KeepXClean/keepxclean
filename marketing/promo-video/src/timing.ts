import { interpolate, spring } from 'remotion';

// Shared beat grid — must match scripts/make-music.mjs (120 BPM).
export const FPS = 30;
export const BEAT = 15; // frames per beat (0.5 s)
export const BAR = BEAT * 4; // 60 frames (2 s)
export const TOTAL_BARS = 15;
export const DURATION = TOTAL_BARS * BAR; // 900 frames = 30 s

/** Frame index of a given bar/beat. */
export const at = (bar: number, beat = 0) => Math.round(bar * BAR + beat * BEAT);

export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 1 on the beat, decaying to 0 before the next one. */
export const beatPulse = (frame: number, decay = 4, period = BEAT) => {
  const f = ((frame % period) + period) % period;
  return Math.exp(-f / decay);
};

export const pop = (frame: number, start: number, cfg: Partial<{ damping: number; stiffness: number; mass: number }> = {}) =>
  spring({ frame: frame - start, fps: FPS, config: { damping: 13, stiffness: 230, mass: 0.6, ...cfg } });

export const ramp = (frame: number, start: number, dur: number, from = 0, to = 1) =>
  interpolate(frame, [start, start + dur], [from, to], CLAMP);

// Section layout (bars)
export const SECTIONS = {
  noise: { from: at(0), dur: BAR * 2 },
  reveal: { from: at(2), dur: BAR },
  demo: { from: at(3), dur: BAR * 4 },
  speed: { from: at(7), dur: BAR * 2 },
  privacy: { from: at(9), dur: BAR * 2 },
  features: { from: at(11), dur: BAR * 2 },
  outro: { from: at(13), dur: BAR * 2 },
} as const;
