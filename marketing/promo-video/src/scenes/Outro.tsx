import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Background, C, Flash, Logo } from '../brand';
import { BAR, BEAT, CLAMP, pop, ramp } from '../timing';

// Bars 13–14 (4 s): end card / CTA. Last frame doubles as a poster.
export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const lp = pop(frame, 0, { damping: 11, stiffness: 200 });
  const tp = pop(frame, BEAT, { damping: 14, stiffness: 260 });
  const cp = pop(frame, BEAT * 2, { damping: 10, stiffness: 280 });
  const hit = frame >= BAR ? 1 - pop(frame, BAR, { damping: 8, stiffness: 300 }) : 0;
  const ring = interpolate(frame, [BAR, BAR + 26], [0, 1], CLAMP);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Background glow={1.3} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        {frame >= BAR ? (
          <div
            style={{
              position: 'absolute',
              width: 700,
              height: 700,
              borderRadius: 999,
              border: `5px solid ${C.green}`,
              opacity: (1 - ring) * 0.35,
              transform: `scale(${0.5 + ring * 2.4})`,
            }}
          />
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 34, transform: `scale(${0.6 + 0.4 * lp})`, opacity: Math.min(1, lp * 2) }}>
            <Logo size={150} shine={ramp(frame, 4, 24)} style={{ filter: 'drop-shadow(0 24px 40px rgba(23,43,36,0.2))' }} />
            <div style={{ fontSize: 128, fontWeight: 850, letterSpacing: '-0.05em', color: C.text }}>
              Keep<span style={{ color: C.green }}>X</span>Clean
            </div>
          </div>
          <div
            style={{
              marginTop: 34,
              fontSize: 64,
              fontWeight: 750,
              letterSpacing: '-0.035em',
              color: C.text,
              opacity: Math.min(1, tp * 2),
              transform: `translateY(${(1 - tp) * 30}px)`,
            }}
          >
            Take back your timeline.
          </div>
          <div
            style={{
              marginTop: 56,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              background: C.green,
              color: '#fff',
              fontSize: 40,
              fontWeight: 750,
              padding: '24px 48px',
              borderRadius: 999,
              boxShadow: `0 24px 50px -16px ${C.green}aa`,
              opacity: Math.min(1, cp * 2),
              transform: `scale(${(0.7 + 0.3 * cp) * (1 + hit * 0.12)})`,
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Add to Chrome — it’s free
          </div>
          <div style={{ marginTop: 40, fontSize: 32, color: C.muted, fontWeight: 600, opacity: ramp(frame, BEAT * 3, 6), letterSpacing: '-0.01em' }}>
            <span style={{ color: C.text }}>keepxclean.com</span>
            <span style={{ margin: '0 18px' }}>·</span>
            Open source on GitHub · MIT
          </div>
        </div>
      </AbsoluteFill>
      <Flash at={0} dur={10} />
      <Flash at={BAR} dur={8} max={0.55} />
    </AbsoluteFill>
  );
};
