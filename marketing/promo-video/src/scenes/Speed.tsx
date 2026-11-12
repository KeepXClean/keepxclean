import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Background, C, Check } from '../brand';
import { BAR, BEAT, CLAMP, beatPulse, pop } from '../timing';

const COLS = [120, 560, 1000, 1440];
const CARD_H = 150;
const GAP = 34;
const SPEED = 30; // px per frame
const SCAN_Y = 540;

const Lines: React.FC = () => (
  <div style={{ display: 'flex', gap: 16 }}>
    <div style={{ width: 52, height: 52, borderRadius: 52, background: '#dfe7e2', flexShrink: 0 }} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
      <div style={{ width: '45%', height: 14, borderRadius: 7, background: '#cfd9d3' }} />
      <div style={{ width: '95%', height: 12, borderRadius: 6, background: '#e3e9e5' }} />
      <div style={{ width: '70%', height: 12, borderRadius: 6, background: '#e3e9e5' }} />
    </div>
  </div>
);

const LINES = ['per post — right in your browser.', 'per post — right in your browser.', 'No extra API calls.', 'No scroll lag. Ever.'];

// Bars 7–8 (4 s): speed. A blurred timeline races through a scan line; giant "<1 ms".
export const SpeedScene: React.FC = () => {
  const frame = useCurrentFrame();
  const big = pop(frame, 0, { damping: 10, stiffness: 260 });
  const k = beatPulse(frame, 4);
  const lineIdx = Math.min(3, Math.floor(frame / (BEAT * 2)));
  const showLine = frame >= BEAT * 2 || lineIdx > 0;
  const lineStart = lineIdx === 0 ? BEAT * 2 : lineIdx * BEAT * 2;
  const lp = pop(frame, Math.max(lineStart, BEAT * 2), { damping: 14, stiffness: 280 });

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Background />
      {/* racing timeline */}
      <AbsoluteFill style={{ filter: 'blur(1.4px)', opacity: 0.75 }}>
        {COLS.map((x, ci) =>
          Array.from({ length: 9 }).map((_, ri) => {
            const span = (CARD_H + GAP) * 9;
            const y = ((ri * (CARD_H + GAP) - frame * SPEED * (1 + ci * 0.12) + ci * 77) % span + span) % span - CARD_H;
            const spam = (ri * 7 + ci * 3) % 4 === 0;
            const passed = y + CARD_H / 2 < SCAN_Y;
            return (
              <div
                key={`${ci}-${ri}`}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: 380,
                  height: spam && passed ? 46 : CARD_H,
                  padding: spam && passed ? '0 18px' : 22,
                  boxSizing: 'border-box',
                  borderRadius: 16,
                  background: spam && passed ? '#eef2ef' : '#fff',
                  border: `1px solid ${C.border}`,
                  boxShadow: '0 10px 30px -14px rgba(23,43,36,0.25)',
                  display: 'flex',
                  alignItems: spam && passed ? 'center' : undefined,
                  flexDirection: 'column',
                  justifyContent: spam && passed ? 'center' : undefined,
                }}
              >
                {spam && passed ? (
                  <div style={{ fontSize: 17, color: C.muted, fontWeight: 600 }}>Filtered · spam</div>
                ) : (
                  <>
                    <Lines />
                    {passed ? (
                      <div style={{ position: 'absolute', right: 14, top: 14 }}>
                        <Check size={26} />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            );
          }),
        )}
      </AbsoluteFill>
      {/* scan line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: SCAN_Y - 2,
          height: 4,
          background: `linear-gradient(90deg, transparent, ${C.green}, transparent)`,
          boxShadow: `0 0 40px 10px ${C.green}55`,
          opacity: 0.8 + 0.2 * k,
        }}
      />
      {/* readability veil */}
      <AbsoluteFill style={{ background: 'radial-gradient(48% 46% at 50% 50%, rgba(247,249,248,0.97) 35%, rgba(247,249,248,0.0) 100%)' }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              fontWeight: 900,
              letterSpacing: '-0.06em',
              lineHeight: 0.9,
              transform: `scale(${(2.2 - 1.2 * big) * (1 + k * 0.025)})`,
              color: C.text,
            }}
          >
            <span style={{ fontSize: 330 }}>&lt;1</span>
            <span style={{ fontSize: 200, color: C.green, marginLeft: 18 }}>ms</span>
          </div>
          <div style={{ height: 80, marginTop: 30 }}>
            {showLine ? (
              <div
                key={lineIdx}
                style={{
                  fontSize: 54,
                  fontWeight: 700,
                  letterSpacing: '-0.025em',
                  color: lineIdx >= 2 ? C.green : C.muted,
                  opacity: Math.min(1, lp * 2),
                  transform: `translateY(${(1 - lp) * 30}px)`,
                  whiteSpace: 'nowrap',
                }}
              >
                {LINES[lineIdx]}
              </div>
            ) : null}
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#fff', opacity: interpolate(frame, [0, 8], [0.8, 0], CLAMP), pointerEvents: 'none' }} />
      {/* bar marker for timing readability in studio */}
      <div style={{ display: 'none' }}>{BAR}</div>
    </AbsoluteFill>
  );
};
