# KeepXClean promo video

A 30-second, beat-synced promo video built with [Remotion](https://www.remotion.dev/) (React → MP4). The soundtrack is synthesized from code, so there are no music licensing issues.

- **Tempo**: 120 BPM, A minor. 1 bar = 2 s = 60 frames at 30 fps. Every cut and pop lands on the beat grid in `src/timing.ts`.
- **Style**: light canvas, brand green `#13865F`, official black-titanium icon (follows `AGENTS.md`).

## Storyboard

| Bars | Time | Scene | Message |
| --- | --- | --- | --- |
| 0–1 | 0–4 s | Noise | Spam cards pile up on every 8th note. "Reply bots. Crypto shills. …" → "Enough." |
| 2 | 4–6 s | Reveal | Impact, logo slam, *KeepXClean: the local-first spam filter for X.* |
| 3–6 | 6–14 s | Demo | Simulated x.com thread. Spam is flagged, folded, then hidden; the extension badge counts up. |
| 7–8 | 14–18 s | Speed | **<1 ms** per post. No extra API calls, no scroll lag. |
| 9–10 | 18–22 s | Privacy | Zero login · Zero cookies · Zero tracking · 100% open source |
| 11–12 | 22–26 s | Features | 8 feature tiles, one per beat |
| 13–14 | 26–30 s | Outro | Logo + "Take back your timeline." + Add to Chrome CTA |

## Commands

```bash
npm install
npm run studio    # live preview / scrub in the browser
npm run music     # regenerate public/music.wav (scripts/make-music.mjs)
npm run export    # render master + every distribution format into out/
```

## Outputs (`out/`)

| File | Use |
| --- | --- |
| `keepxclean-promo-1080p.mp4` | X/Twitter, YouTube, Product Hunt. 1920×1080, H.264 High + AAC, faststart |
| `keepxclean-promo-web.webm` / `.mp4` | Website hero: muted, 1280 px, about 2 MB, loopable |
| `keepxclean-promo-poster.jpg` | `poster=` for the web video (the final end-card frame) |
| `keepxclean-demo.gif` | README: the 8 s demo section, 960 px, 15 fps |

### Website embed

```html
<video autoplay muted loop playsinline poster="/promo/keepxclean-promo-poster.jpg">
  <source src="/promo/keepxclean-promo-web.webm" type="video/webm" />
  <source src="/promo/keepxclean-promo-web.mp4" type="video/mp4" />
</video>
```

### README embed

GitHub won't play an MP4 committed to the repo. Use either:

1. The GIF: `![KeepXClean demo](docs/assets/keepxclean-demo.gif)`, or
2. A video with sound: drag `keepxclean-promo-1080p.mp4` into the README editor on github.com. GitHub uploads it to `user-attachments` and plays it inline.

> Note: all accounts and posts in the video are fictional sample content. Remotion is free for individuals and companies with up to 3 employees; see remotion.dev/license.
