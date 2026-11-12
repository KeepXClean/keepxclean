import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Background, C, Flash, Logo } from '../brand';
import { BEAT, CLAMP, pop } from '../timing';

const NAME = 'KeepXClean';

// Bar 2 (2 s): impact → logo slam → wordmark → tagline → zoom-through.
export const RevealScene: React.FC = () => {
  const frame = useCurrentFrame();
  const lp = pop(frame, 0, { damping: 10, stiffness: 180, mass: 0.8 });
  const shine = interpolate(frame, [6, 30], [0, 1], CLAMP);
  const out = interpolate(frame, [BEAT * 3 + 4, BEAT * 4], [0, 1], { ...CLAMP, easing: (t) => t * t * t });

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Background glow={1.2} />
      {/* shockwave */}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: 300,
            height: 300,
            borderRadius: 999,
            border: `6px solid ${C.green}`,
            opacity: interpolate(frame, [0, 22], [0.5, 0], CLAMP),
            transform: `scale(${interpolate(frame, [0, 22], [0.6, 6], CLAMP)})`,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${1 + out * 5})`,
          opacity: 1 - interpolate(out, [0.6, 1], [0, 1], CLAMP),
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ transform: `scale(${0.3 + 0.7 * lp}) rotate(${(1 - lp) * -25}deg)`, filter: 'drop-shadow(0 30px 50px rgba(23,43,36,0.22))' }}>
            <Logo size={250} shine={shine} />
          </div>
          <div style={{ display: 'flex', marginTop: 40, fontSize: 132, fontWeight: 850, letterSpacing: '-0.05em', color: C.text, lineHeight: 1 }}>
            {NAME.split('').map((ch, i) => {
              const p = pop(frame, BEAT + i * 1, { damping: 14, stiffness: 260 });
              return (
                <span key={i} style={{ display: 'inline-block', opacity: Math.min(1, p * 2), transform: `translateY(${(1 - p) * 60}px)`, color: i === 4 ? C.green : C.text }}>
                  {ch}
                </span>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 44,
              fontWeight: 600,
              color: C.muted,
              letterSpacing: '-0.01em',
              opacity: interpolate(frame, [BEAT * 2, BEAT * 2 + 5], [0, 1], CLAMP),
              transform: `translateY(${interpolate(frame, [BEAT * 2, BEAT * 2 + 8], [20, 0], CLAMP)}px)`,
            }}
          >
            The local-first spam filter for X.
          </div>
        </div>
      </AbsoluteFill>
      <Flash at={0} dur={10} />
    </AbsoluteFill>
  );
};
