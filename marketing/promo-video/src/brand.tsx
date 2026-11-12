import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { beatPulse, CLAMP } from './timing';

export const C = {
  canvas: '#f7f9f8',
  surface: '#ffffff',
  subtle: '#f2f5f3',
  border: '#e1e7e3',
  text: '#172b24',
  muted: '#607168',
  green: '#13865f',
  greenDeep: '#0c583e',
  selected: '#eaf6ef',
  danger: '#b54747',
  dangerBg: '#fff0ee',
  dangerBorder: '#f8c9c4',
  warning: '#9b6816',
  warningBg: '#fff6df',
  blue: '#1d9bf0',
  gold: '#e2b719',
};

export const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", "PingFang SC", sans-serif';
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** Official brand icon (black-titanium X on #EAF6EF). Optional light sweep across the metal. */
export const Logo: React.FC<{ size: number; shine?: number; style?: React.CSSProperties }> = ({ size, shine, style }) => {
  const mask = `url(${staticFile('x-mask.svg')})`;
  return (
    <div style={{ position: 'relative', width: size, height: size, ...style }}>
      <Img src={staticFile('logo.svg')} style={{ width: size, height: size, display: 'block' }} />
      {shine !== undefined && shine > 0 && shine < 1 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            WebkitMaskImage: mask,
            maskImage: mask,
            WebkitMaskSize: '100% 100%',
            maskSize: '100% 100%',
            background: `linear-gradient(115deg, transparent ${shine * 160 - 40}%, rgba(255,255,255,0.75) ${shine * 160 - 25}%, transparent ${shine * 160 - 10}%)`,
            mixBlendMode: 'screen',
          }}
        />
      ) : null}
    </div>
  );
};

/** Light canvas with a faint dot grid and a soft green glow that breathes with the kick. */
export const Background: React.FC<{ pulse?: boolean; glow?: number; tint?: string }> = ({ pulse = true, glow = 1, tint = C.green }) => {
  const frame = useCurrentFrame();
  const p = pulse ? beatPulse(frame, 5) : 0;
  return (
    <AbsoluteFill style={{ background: C.canvas }}>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${C.border} 1.6px, transparent 1.6px)`,
          backgroundSize: '36px 36px',
          opacity: 0.9,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 55% at 50% 45%, ${tint}22 0%, ${tint}00 70%)`,
          opacity: (0.55 + 0.45 * p) * glow,
          transform: `scale(${1 + p * 0.04})`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Hard-cut entrance: quick zoom punch over the first frames of a section. */
export const Punch: React.FC<{ children: React.ReactNode; from?: number; strength?: number }> = ({ children, from = 0, strength = 0.07 }) => {
  const frame = useCurrentFrame();
  const s = interpolate(frame - from, [0, 9], [1 + strength, 1], { ...CLAMP, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const blur = interpolate(frame - from, [0, 4], [6, 0], CLAMP);
  return <AbsoluteFill style={{ transform: `scale(${s})`, filter: blur > 0.1 ? `blur(${blur}px)` : undefined }}>{children}</AbsoluteFill>;
};

/** White flash on impacts. */
export const Flash: React.FC<{ at?: number; dur?: number; color?: string; max?: number }> = ({ at = 0, dur = 9, color = '#fff', max = 1 }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const o = interpolate(frame - at, [0, dur], [max, 0], CLAMP);
  if (o <= 0) return null;
  return <AbsoluteFill style={{ background: color, opacity: o, pointerEvents: 'none' }} />;
};

export const Kicker: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.green, style }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 24,
      fontWeight: 700,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color,
      ...style,
    }}
  >
    <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block' }} />
    {children}
  </div>
);

export const Check: React.FC<{ size?: number; color?: string; bg?: string }> = ({ size = 28, color = '#fff', bg = C.green }) => (
  <div style={{ width: size, height: size, borderRadius: size, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
      <path d="M5 12.5l4.2 4.2L19 7" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);
