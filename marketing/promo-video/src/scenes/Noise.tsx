import React from 'react';
import { AbsoluteFill, interpolate, random, useCurrentFrame } from 'remotion';
import { Background, C, Kicker } from '../brand';
import { BEAT, CLAMP, beatPulse, pop } from '../timing';
import { SPAM_PILE, TweetCard } from '../tweet';

const WORDS = ['Reply bots.', 'Crypto shills.', 'Giveaway bait.', 'Impersonators.', 'Promoted ads.', 'AI slop.'];

// Bars 0–1 (4 s): noise piles up on every 8th note, headline swaps on every beat.
export const NoiseScene: React.FC = () => {
  const frame = useCurrentFrame();
  const enough = frame >= BEAT * 6;
  const roll = interpolate(frame, [BEAT * 6, BEAT * 8], [0, 1], CLAMP);
  const shake = enough ? (random(`sx${frame}`) - 0.5) * 18 * roll : 0;
  const shakeY = enough ? (random(`sy${frame}`) - 0.5) * 14 * roll : 0;
  const zoom = interpolate(frame, [0, BEAT * 8], [1.04, 1.16]);

  const beat = Math.floor(frame / BEAT);
  const word = WORDS[Math.min(beat, WORDS.length - 1)];
  const wp = pop(frame, beat * BEAT, { damping: 11, stiffness: 320 });
  const kick = beatPulse(frame, 3);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Background glow={0.6} tint={C.danger} />
      <AbsoluteFill style={{ transform: `translate(${shake}px, ${shakeY}px) scale(${zoom})` }}>
        {SPAM_PILE.map((tw, i) => {
          const start = i < 4 ? -10 + i * 2 : Math.round((i - 4) * (BEAT / 2));
          if (frame < start) return null;
          const s = pop(frame, start, { damping: 12, stiffness: 340, mass: 0.5 });
          const x = -60 + random(`x${i}`) * 1460;
          const y = -30 + ((i * 0.618) % 1) * 880 + random(`y${i}`) * 80;
          const rot = (random(`r${i}`) - 0.5) * 16;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                opacity: Math.min(1, s * 3),
                transform: `rotate(${rot}deg) scale(${1.35 - 0.35 * s})`,
              }}
            >
              <TweetCard tw={tw} width={540} fontSize={23} lines={2} />
            </div>
          );
        })}
      </AbsoluteFill>

      {/* dim layer so the headline reads */}
      <AbsoluteFill style={{ background: `rgba(247,249,248,${interpolate(frame, [0, 30, 90, 105], [0, 0.35, 0.45, 0.75], CLAMP)})` }} />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `translate(${shake * 0.6}px, ${shakeY * 0.6}px)` }}>
        {!enough ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
            <Kicker color={C.danger} style={{ background: '#fff', padding: '10px 20px', borderRadius: 999, boxShadow: '0 8px 24px rgba(23,43,36,0.12)' }}>
              Your X feed is full of
            </Kicker>
            <div
              style={{
                background: C.text,
                color: '#fff',
                fontSize: 132,
                fontWeight: 850,
                letterSpacing: '-0.045em',
                padding: '14px 56px 22px',
                borderRadius: 30,
                transform: `rotate(${beat % 2 ? 2.2 : -2.2}deg) scale(${1.28 - 0.28 * wp + kick * 0.02})`,
                boxShadow: '0 30px 60px -18px rgba(23,43,36,0.45)',
                whiteSpace: 'nowrap',
              }}
            >
              {word}
            </div>
          </div>
        ) : (
          <div
            style={{
              fontSize: 250 + roll * 40,
              fontWeight: 900,
              letterSpacing: '-0.06em',
              color: C.text,
              transform: `scale(${1.3 - 0.3 * pop(frame, BEAT * 6, { damping: 9, stiffness: 300 })})`,
              textShadow: '0 20px 60px rgba(247,249,248,0.9)',
            }}
          >
            Enough.
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
