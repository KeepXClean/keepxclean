import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Background, C, Kicker } from '../brand';
import { BEAT, beatPulse, pop, ramp } from '../timing';

const TILES: { big: string; label: string }[] = [
  { big: '24', label: 'built-in spam keyword rules' },
  { big: '@≈', label: 'lookalike impersonator detection' },
  { big: 'Ads', label: 'promoted posts, silently removed' },
  { big: '1-click', label: 'Quick Clean & block' },
  { big: '4.5s', label: 'undo window, every time' },
  { big: '1 = 1', label: 'one account, one vote community list' },
  { big: 'Aa', label: 'language allow & block lists' },
  { big: '10', label: 'UI languages' },
];

// Bars 11–12 (4 s): feature grid, one tile per beat.
export const FeaturesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const k = beatPulse(frame, 4);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Background />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 46 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, opacity: ramp(frame, 0, 6) }}>
          <Kicker>Built for heavy X users</Kicker>
          <div style={{ fontSize: 76, fontWeight: 850, letterSpacing: '-0.045em', color: C.text }}>
            Every kind of noise. <span style={{ color: C.green }}>Handled.</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 390px)', gap: 26 }}>
          {TILES.map((t, i) => {
            const s = i * BEAT;
            const p = frame >= s ? pop(frame, s, { damping: 11, stiffness: 300 }) : 0;
            const isNew = frame >= s && frame < s + BEAT;
            return (
              <div
                key={i}
                style={{
                  height: 230,
                  borderRadius: 24,
                  background: isNew ? C.selected : '#fff',
                  border: `1.5px solid ${isNew ? C.green : C.border}`,
                  boxShadow: '0 20px 40px -20px rgba(23,43,36,0.25)',
                  padding: '28px 30px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  opacity: Math.min(1, p * 2),
                  transform: `translateY(${(1 - p) * 60}px) scale(${(0.85 + 0.15 * p) * (frame >= s ? 1 + k * 0.012 : 1)})`,
                }}
              >
                <div style={{ fontSize: 88, fontWeight: 900, letterSpacing: '-0.05em', color: C.green, lineHeight: 1 }}>{t.big}</div>
                <div style={{ fontSize: 27, fontWeight: 600, color: C.text, lineHeight: 1.25 }}>{t.label}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
