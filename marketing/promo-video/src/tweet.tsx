import React from 'react';
import { Img, staticFile } from 'remotion';
import { C } from './brand';

export type Tw = {
  name: string;
  handle: string;
  text: string;
  time?: string;
  avatar: { bg: string; fg: string; initials?: string; logo?: boolean };
  badge?: 'blue' | 'gold';
  promoted?: boolean;
};

export const Avatar: React.FC<{ a: Tw['avatar']; size: number }> = ({ a, size }) =>
  a.logo ? (
    <Img src={staticFile('logo.svg')} style={{ width: size, height: size, borderRadius: size, flexShrink: 0 }} />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size,
        background: a.bg,
        color: a.fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
      }}
    >
      {a.initials}
    </div>
  );

export const Badge: React.FC<{ kind: 'blue' | 'gold'; size: number }> = ({ kind, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <path
      d="M12 1.8l2.3 1.9 3-.3.9 2.9 2.7 1.4-.6 2.9 1.5 2.6-2.1 2.1.1 3-2.9.7-1.6 2.6-2.8-1-2.8 1-1.6-2.6-2.9-.7.1-3-2.1-2.1 1.5-2.6-.6-2.9 2.7-1.4.9-2.9 3 .3z"
      fill={kind === 'blue' ? C.blue : C.gold}
    />
    <path d="M7.8 12.3l2.8 2.8 5.6-5.8" stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A compact, X-like post card. Purely illustrative — not X's real UI. */
export const TweetCard: React.FC<{ tw: Tw; width: number; fontSize?: number; style?: React.CSSProperties; lines?: number; bare?: boolean }> = ({
  tw,
  width,
  fontSize = 22,
  style,
  lines = 3,
  bare,
}) => {
  const av = Math.round(fontSize * 2.2);
  return (
    <div
      style={{
        width,
        display: 'flex',
        gap: fontSize * 0.6,
        padding: bare ? 0 : `${fontSize * 0.75}px ${fontSize * 0.85}px`,
        background: bare ? 'transparent' : C.surface,
        borderRadius: bare ? 0 : fontSize * 0.7,
        border: bare ? 'none' : `1px solid ${C.border}`,
        boxShadow: bare ? 'none' : '0 18px 40px -12px rgba(23,43,36,0.18), 0 2px 6px rgba(23,43,36,0.06)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <Avatar a={tw.avatar} size={av} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: fontSize * 0.92, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <span style={{ fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tw.name}</span>
          {tw.badge ? <Badge kind={tw.badge} size={fontSize * 0.95} /> : null}
          <span style={{ color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tw.handle}
            {tw.time ? ` · ${tw.time}` : ''}
          </span>
        </div>
        <div
          style={{
            fontSize,
            lineHeight: 1.38,
            color: C.text,
            marginTop: 2,
            display: '-webkit-box',
            WebkitLineClamp: lines,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {tw.text}
        </div>
        {tw.promoted ? (
          <div style={{ fontSize: fontSize * 0.72, color: C.muted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width={fontSize * 0.7} height={fontSize * 0.7} viewBox="0 0 24 24">
              <path d="M4 20L20 4M9 4h11v11" stroke={C.muted} strokeWidth={2.4} fill="none" strokeLinecap="round" />
            </svg>
            Promoted
          </div>
        ) : null}
      </div>
    </div>
  );
};

// ---------------- sample content (fictional accounts) ----------------
const av = (bg: string, fg: string, initials: string) => ({ bg, fg, initials });

export const SPAM_PILE: Tw[] = [
  { name: 'CryptoGem Sniper 💎', handle: '@gem_sniper_sol', badge: 'blue', text: '🚨 NEXT 100x GEM on $SOL!! CA: 7xKX…gAsU — LFG 🚀🚀', avatar: av('#E0E7FF', '#4F46E5', 'CG') },
  { name: 'Growth Hacks & Tools', handle: '@growth_toolkit', badge: 'blue', text: 'Comment "CLEAN" + RT and I\'ll DM you $2,999 of prompts for FREE 🎁👇', avatar: av('#FEF3C7', '#B45309', 'GH') },
  { name: 'AI Insights Daily', handle: '@ai_insights_x', badge: 'blue', text: 'Certainly! Here is a summary of the post: Great work team! 🔥', avatar: av('#FEE2E2', '#B91C1C', 'AI') },
  { name: 'KeepXClean Official', handle: '@keepxclean_0fficial', badge: 'blue', text: '🚨 AIRDROP: claim 5,000 $KXC now 👉 t.me/keepxclean_claim_bot', avatar: { bg: '', fg: '', logo: true } },
  { name: 'CloudScale AI', handle: '@cloudscale_ai', badge: 'gold', promoted: true, text: '⚡️ Claim $500 in free GPU credits today. Deploy in 30 seconds.', avatar: av('#0F172A', '#38BDF8', '☁') },
  { name: 'reply guy', handle: '@replyguy_9921', badge: 'blue', text: 'So true!! 🔥🔥🔥', avatar: av('#FCE7F3', '#BE185D', 'RG') },
  { name: 'Follow Train 🚂', handle: '@f4f_daily', badge: 'blue', text: 'Follow back = instant follow 💯 #F4F #followback #crypto #ai #web3', avatar: av('#DCFCE7', '#15803D', 'FT') },
  { name: 'Passive Income Pro', handle: '@income_pro_x', badge: 'blue', text: 'I made $48,000 last week with ONE trick 👇 link in bio', avatar: av('#FFEDD5', '#C2410C', 'PI') },
  { name: 'Alpha Whales 🐳', handle: '@alpha_whales', badge: 'blue', text: '📈 Free signals group → t.me/alpha_whales  Don\'t fade this.', avatar: av('#E0F2FE', '#0369A1', 'AW') },
  { name: 'Thoughtful Bot', handle: '@deep_takes_ai', badge: 'blue', text: 'Wow, what an amazing insight! Thanks for sharing. 🙏✨', avatar: av('#F3E8FF', '#7E22CE', 'TB') },
  { name: 'Meme Coin Daily', handle: '@memecoin_daily', badge: 'blue', text: '🔥 $PEPE $BONK $WIF next leg up — not financial advice 🚀🚀🚀', avatar: av('#ECFCCB', '#4D7C0F', 'MC') },
  { name: 'Engagement Farm', handle: '@engage_farm', badge: 'blue', text: 'Like if you agree, RT if you don\'t 👇👇', avatar: av('#FEF9C3', '#A16207', 'EF') },
  { name: 'Collab Queen 💌', handle: '@collab_promo', badge: 'blue', text: 'DM me for a collab 💌 promo available 24/7', avatar: av('#FFE4E6', '#BE123C', 'CQ') },
  { name: 'gm bot', handle: '@gm_gm_gm', badge: 'blue', text: 'gm gm gm ☀️ who\'s still here?', avatar: av('#F1F5F9', '#334155', 'GM') },
  { name: 'Lucky Drop 🎉', handle: '@lucky_drop', badge: 'blue', text: '🎉 GIVEAWAY: 3x iPhone 17! Follow + RT + tag 3 friends', avatar: av('#CCFBF1', '#0F766E', 'LD') },
  { name: 'Hot Takes 24/7', handle: '@hottakes247', badge: 'blue', text: 'Bro this is literally me 😂😂😂', avatar: av('#EDE9FE', '#6D28D9', 'HT') },
];

export const OP: Tw = {
  name: 'Mina Chen',
  handle: '@mina_design',
  badge: undefined,
  time: '2h',
  text: 'Shipped a new design system today. The trick: fewer tokens, stricter rules, and letting whitespace do the heavy lifting. Thread on what we learned 🧵',
  avatar: av('#DCFCE7', '#166534', 'MC'),
};

export type DemoReply = { tw: Tw; spam?: { label: string } };

export const DEMO_REPLIES: DemoReply[] = [
  {
    tw: { name: 'David Vance', handle: '@david_systems', time: '1h', text: 'The "stricter rules" part is underrated. We cut our palette in half and shipping got faster.', avatar: av('#E2E8F0', '#334155', 'DV') },
  },
  { tw: SPAM_PILE[0], spam: { label: 'Crypto shilling' } },
  { tw: SPAM_PILE[1], spam: { label: 'Giveaway bait' } },
  {
    tw: { name: 'Sarah Jenkins', handle: '@sarah_j_codes', time: '40m', text: 'Would love to see how you document the rules. Do you lint for token usage?', avatar: av('#DCFCE7', '#166534', 'SJ') },
  },
  { tw: { ...SPAM_PILE[3], name: 'Mina Chen', handle: '@mina_des1gn', avatar: av('#DCFCE7', '#166534', 'MC'), text: '🎁 Thanks for the support! First 500 to DM me get my full Figma kit FREE 👉 t.me/mina_kit' }, spam: { label: 'Lookalike impersonator' } },
  { tw: SPAM_PILE[2], spam: { label: 'Low-effort AI reply' } },
  { tw: SPAM_PILE[4], spam: { label: 'Promoted ad' } },
  {
    tw: { name: 'Priya Raman', handle: '@priya_builds', time: '22m', text: 'Saving this. Whitespace as a design token is such a good way to frame it.', avatar: av('#FEF3C7', '#92400E', 'PR') },
  },
  {
    tw: { name: 'Tom Okafor', handle: '@tomokafor', time: '12m', text: 'Fewer tokens = fewer arguments in code review. Learned that the hard way 😅', avatar: av('#E0F2FE', '#075985', 'TO') },
  },
];
