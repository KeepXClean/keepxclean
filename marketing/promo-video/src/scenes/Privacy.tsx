import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Background, C, Check, Kicker } from '../brand';
import { BEAT, beatPulse, pop, ramp } from '../timing';

const ROWS: { text: React.ReactNode; at: number; accent?: boolean }[] = [
  { text: <>Zero login.</>, at: 0 },
  { text: <>Zero cookies.</>, at: BEAT * 2 },
  { text: <>Zero tracking.</>, at: BEAT * 4 },
  { text: <>100% open source.</>, at: BEAT * 6, accent: true },
];

// Bars 9–10 (4 s): privacy promises slam in on every other beat.
export const PrivacyScene: React.FC = () => {
  const frame = useCurrentFrame();
  const k = beatPulse(frame, 4);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Background />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: 1180 }}>
          <Kicker style={{ opacity: ramp(frame, 0, 5), marginBottom: 18 }}>Private by design · runs 100% on-device</Kicker>
          {ROWS.map((r, i) => {
            if (frame < r.at) return <div key={i} style={{ height: 132 }} />;
            const p = pop(frame, r.at, { damping: 12, stiffness: 300 });
            const latest = i === ROWS.length - 1 || frame < ROWS[i + 1].at;
            const cp = pop(frame, r.at + 4, { damping: 9, stiffness: 320 });
            return (
              <div
                key={i}
                style={{
                  height: 132,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 36,
                  opacity: Math.min(1, p * 2) * (latest ? 1 : 0.42),
                  transform: `translateX(${(1 - p) * 160}px) scale(${latest ? 1 + k * 0.012 : 1})`,
                  transformOrigin: 'left center',
                }}
              >
                <div style={{ transform: `scale(${cp})` }}>
                  <Check size={92} bg={r.accent ? C.green : C.text} />
                </div>
                <div style={{ fontSize: 124, fontWeight: 850, letterSpacing: '-0.05em', color: r.accent ? C.green : C.text, whiteSpace: 'nowrap' }}>{r.text}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
