import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Background, C, Check, Kicker, Logo } from '../brand';
import { BAR, BEAT, CLAMP, pop, ramp } from '../timing';
import { Avatar, DEMO_REPLIES, OP, TweetCard } from '../tweet';

const BW = 1080; // browser width
const BH = 860;
const CHROME_H = 112;
const ROW_FULL = 116;
const ROW_FOLD = 60;
const HEADER_H = 66;
const OP_H = 188;

// timing (local frames)
const spamIdx = DEMO_REPLIES.map((r, i) => (r.spam ? i : -1)).filter((i) => i >= 0);
const filterAt = (k: number) => BEAT * 2 + k * BEAT; // one per beat: 30, 45, 60, 75, 90
const HIDE_AT = BAR * 2; // 120 → switch to "Hide cleanly"
const hideAt = (k: number) => HIDE_AT + 4 + k * 6;

const CAPTIONS: { from: number; node: React.ReactNode }[] = [
  { from: 0, node: <>Bots, shills <br />& bait—</> },
  { from: BAR - 2, node: <>folded into <br /><span style={{ color: C.green }}>one line.</span></> },
  { from: BAR * 2 - 2, node: <>Or <span style={{ color: C.green }}>gone</span> for good.</> },
  { from: BAR * 3 - 2, node: <>Just the <span style={{ color: C.green }}>conversation</span> you came for.</> },
];

const Browser: React.FC<{ frame: number }> = ({ frame }) => {
  // per-row state
  const rows = DEMO_REPLIES.map((r, i) => {
    const k = spamIdx.indexOf(i);
    if (k < 0) return { r, i, k, fold: 0, warn: 0, hide: 0 };
    const t = filterAt(k);
    const warn = ramp(frame, t - 8, 4) * (1 - ramp(frame, t, 6));
    const fold = pop(frame, t, { damping: 16, stiffness: 260 });
    const hide = pop(frame, hideAt(k), { damping: 18, stiffness: 240 });
    return { r, i, k, fold: frame >= t ? fold : 0, warn, hide: frame >= hideAt(k) ? hide : 0 };
  });
  const filtered = spamIdx.filter((_, k) => frame >= filterAt(k)).length;
  const lastAt = filtered > 0 ? filterAt(filtered - 1) : -100;
  const badgePop = filtered > 0 ? 1 + 0.45 * (1 - pop(frame, lastAt, { damping: 9, stiffness: 300 })) : 1;

  let y = 0;
  const layout = rows.map((row) => {
    const h = (ROW_FULL - (ROW_FULL - ROW_FOLD) * row.fold) * (1 - row.hide);
    const top = y;
    y += h;
    return { ...row, h, top };
  });
  const contentTop = CHROME_H + HEADER_H + OP_H;

  return (
    <div
      style={{
        width: BW,
        height: BH,
        borderRadius: 22,
        background: '#fff',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 50px 100px -30px rgba(23,43,36,0.35), 0 8px 24px rgba(23,43,36,0.08)',
        border: `1px solid ${C.border}`,
      }}
    >
      {/* title bar */}
      <div style={{ height: 56, background: '#e8eeea', display: 'flex', alignItems: 'flex-end', padding: '0 18px', gap: 18 }}>
        <div style={{ display: 'flex', gap: 9, alignSelf: 'center' }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <div key={c} style={{ width: 14, height: 14, borderRadius: 14, background: c }} />
          ))}
        </div>
        <div style={{ height: 42, width: 300, background: '#fff', borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', fontSize: 18, color: C.text }}>
          <span style={{ fontWeight: 800, fontSize: 18 }}>𝕏</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Mina Chen on X</span>
        </div>
      </div>
      {/* toolbar */}
      <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ color: C.muted, fontSize: 24 }}>‹ ›</span>
        <div style={{ flex: 1, height: 36, background: C.subtle, borderRadius: 18, display: 'flex', alignItems: 'center', padding: '0 18px', fontSize: 18, color: C.muted }}>
          <span style={{ color: C.text }}>x.com</span>/mina_design/status/1856204417
        </div>
        <div style={{ position: 'relative', width: 36, height: 36, marginRight: 22 }}>
          <Logo size={36} />
          <div
            style={{
              position: 'absolute',
              right: -24,
              bottom: -12,
              background: C.green,
              color: '#fff',
              fontSize: 13,
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: 8,
              transform: `scale(${badgePop})`,
              border: '2px solid #fff',
            }}
          >
            {128 + filtered}
          </div>
        </div>
      </div>
      {/* page */}
      <div style={{ position: 'absolute', top: CHROME_H, left: 0, right: 0, bottom: 0, padding: '0 34px' }}>
        <div style={{ height: HEADER_H, display: 'flex', alignItems: 'center', gap: 22, fontSize: 26, fontWeight: 800, color: C.text }}>
          <span style={{ fontSize: 28 }}>←</span> Post
        </div>
        <div style={{ height: OP_H, borderBottom: `1px solid ${C.border}`, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar a={OP.avatar} size={56} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{OP.name}</div>
              <div style={{ fontSize: 19, color: C.muted }}>{OP.handle}</div>
            </div>
          </div>
          <div style={{ fontSize: 25, lineHeight: 1.4, color: C.text, marginTop: 14 }}>{OP.text}</div>
        </div>
        <div style={{ position: 'relative' }}>
          {layout.map(({ r, i, fold, warn, hide, h, top }) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top,
                left: -34,
                right: -34,
                height: h,
                overflow: 'hidden',
                borderBottom: h > 1 ? `1px solid ${C.border}` : 'none',
                background: warn > 0 ? `rgba(255,240,238,${warn})` : '#fff',
                opacity: 1 - hide,
              }}
            >
              {warn > 0 ? <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: C.danger, opacity: warn }} /> : null}
              <div style={{ position: 'absolute', inset: 0, padding: '18px 34px', opacity: 1 - fold, transform: `translateY(${-fold * 20}px)` }}>
                <TweetCard tw={r.tw} width={BW - 68} fontSize={21} lines={2} bare />
              </div>
              {r.spam && warn > 0 && fold < 0.15 ? (
                <div
                  style={{
                    position: 'absolute',
                    right: 30,
                    top: 16,
                    background: C.danger,
                    color: '#fff',
                    fontSize: 17,
                    fontWeight: 700,
                    padding: '5px 12px',
                    borderRadius: 999,
                    transform: `scale(${0.6 + 0.4 * warn})`,
                    opacity: warn,
                  }}
                >
                  ⚠ {r.spam.label}
                </div>
              ) : null}
              {r.spam && fold > 0 ? (
                <div
                  style={{
                    position: 'absolute',
                    left: 34,
                    right: 34,
                    top: 0,
                    height: ROW_FOLD,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    fontSize: 19,
                    color: C.muted,
                    opacity: fold,
                  }}
                >
                  <Logo size={24} />
                  <span>
                    <b style={{ color: C.text, fontWeight: 650 }}>Filtered</b> · {r.spam.label} · {r.tw.handle}
                  </span>
                  <span style={{ marginLeft: 'auto', color: C.green, fontWeight: 650 }}>Show</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {/* +1 particles flying to the toolbar badge */}
      {layout.map(({ k, i, top }) => {
        if (k < 0) return null;
        const t = filterAt(k);
        const p = interpolate(frame, [t, t + 12], [0, 1], CLAMP);
        if (p <= 0 || p >= 1) return null;
        const e = 1 - Math.pow(1 - p, 2);
        const x0 = BW - 200;
        const y0 = contentTop + top + 20;
        const x1 = BW - 70;
        const y1 = 74;
        return (
          <div
            key={`p${i}`}
            style={{
              position: 'absolute',
              left: x0 + (x1 - x0) * e,
              top: y0 + (y1 - y0) * e - Math.sin(p * Math.PI) * 60,
              background: C.green,
              color: '#fff',
              fontWeight: 800,
              fontSize: 20,
              padding: '4px 12px',
              borderRadius: 999,
              opacity: 1 - p * p,
              transform: `scale(${1 - p * 0.4})`,
            }}
          >
            +1
          </div>
        );
      })}
    </div>
  );
};

const Segmented: React.FC<{ frame: number }> = ({ frame }) => {
  const p = pop(frame, HIDE_AT, { damping: 16, stiffness: 260 });
  const sel = frame >= HIDE_AT ? p : 0;
  return (
    <div style={{ position: 'relative', display: 'flex', width: 520, height: 66, background: '#e9efeb', borderRadius: 16, padding: 5, boxSizing: 'border-box', fontSize: 23, fontWeight: 650 }}>
      <div
        style={{
          position: 'absolute',
          top: 5,
          left: 5 + sel * 255,
          width: 255,
          height: 56,
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 4px 12px rgba(23,43,36,0.12)',
        }}
      />
      {['Collapse bar', 'Hide cleanly'].map((l, i) => (
        <div key={l} style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: (i === 1 ? sel > 0.5 : sel <= 0.5) ? C.green : C.muted }}>
          {l}
        </div>
      ))}
    </div>
  );
};

// Bars 3–6 (8 s): in-page demo on a simulated x.com thread.
export const DemoScene: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = pop(frame, 0, { damping: 15, stiffness: 160, mass: 0.8 });
  const zoom = interpolate(frame, [BAR * 3, BAR * 4], [1, 1.035], CLAMP);
  const capIdx = CAPTIONS.reduce((acc, c, i) => (frame >= c.from ? i : acc), 0);
  const cap = CAPTIONS[capIdx];
  const cp = pop(frame, cap.from, { damping: 14, stiffness: 260 });

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Background />
      <div style={{ position: 'absolute', left: 90, top: 110, transform: `translateY(${(1 - enter) * 500}px) scale(${zoom}) rotate(${(1 - enter) * 4}deg)`, transformOrigin: '50% 50%' }}>
        <Browser frame={frame} />
      </div>
      <div style={{ position: 'absolute', left: 1250, top: 0, bottom: 0, width: 600, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 34 }}>
        <Kicker style={{ opacity: ramp(frame, 4, 6) }}>{capIdx < 2 ? 'Automatic filtering' : capIdx === 2 ? 'Your choice' : 'Signal only'}</Kicker>
        <div
          key={capIdx}
          style={{
            fontSize: 84,
            fontWeight: 850,
            letterSpacing: '-0.045em',
            lineHeight: 1.02,
            color: C.text,
            opacity: Math.min(1, cp * 2),
            transform: `translateY(${(1 - cp) * 50}px)`,
          }}
        >
          {cap.node}
        </div>
        {capIdx === 2 ? (
          <div style={{ opacity: ramp(frame, BAR * 2 - 8, 6) }}>
            <Segmented frame={frame} />
          </div>
        ) : null}
        {capIdx === 3 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              ['5 posts filtered', BAR * 3 + BEAT],
              ['0 clicks needed', BAR * 3 + BEAT * 2],
            ].map(([t, s]) => {
              const p = pop(frame, s as number);
              return (
                <div key={t as string} style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, fontWeight: 650, color: C.text, opacity: Math.min(1, p * 2), transform: `translateX(${(1 - p) * 40}px)` }}>
                  <Check size={38} /> {t}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

