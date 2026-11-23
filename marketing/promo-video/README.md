# KeepXClean promo video

A 30-second, beat-synced promo video built with [Remotion](https://www.remotion.dev/) (React → MP4). The soundtrack is synthesized from code, so there are no music licensing issues.

- **Tempo**: 120 BPM, A minor. 1 bar = 2 s = 60 frames at 30 fps. Every cut and pop lands on the beat grid in `src/timing.ts`.
- **Style**: light canvas, brand green `#13865F`, original black-titanium shield + x icon (follows `AGENTS.md`).

## Storyboard

| Bars | Time | Scene | Message |
| --- | --- | --- | --- |
| 0–1 | 0–4 s | Noise | Spam cards pile up on every 8th note. "Reply bots. Crypto shills. …" → "Enough." |
| 2 | 4–6 s | Reveal | Impact, logo slam, *KeepXClean: the local-first spam filter for X.* |
| 3–6 | 6–14 s | Demo | Simulated x.com thread. Spam is flagged, folded, then hidden; the extension badge counts up. |
| 7–8 | 14–18 s | Speed | **<1 ms** per post. No extra API calls, no scroll lag. |
| 9–10 | 18–22 s | Privacy | No sign-up · Local filtering · Zero tracking · 100% open source |
| 11–12 | 22–26 s | Features | 8 feature tiles, one per beat |
| 13–14 | 26–30 s | Outro | Logo + "Take back your timeline." + Add to Chrome CTA |

## Commands

```bash
npm install
npm run studio    # live preview / scrub in the browser
npm run music     # regenerate public/music.wav (scripts/make-music.mjs)
npm run export    # render master + every distribution format into out/
npm run encode:web -- out/keepxclean-promo-1080p.mp4 out/web-fixed
                  # encode an existing approved master without another browser render
```

## Outputs (`out/`)

| File | Use |
| --- | --- |
| `keepxclean-promo-1080p.mp4` | X/Twitter, YouTube, Product Hunt. 1920×1080, H.264 High + AAC, faststart |
| `keepxclean-promo-web.webm` / `.mp4` | Website hero: muted, 1280 px, limited-range BT.709 / yuv420p, loopable |
| `keepxclean-promo-poster.jpg` | `poster=` for the web video (the final end-card frame) |
| `keepxclean-demo.gif` | README: the 8 s demo section, 960 px, 15 fps |

### Website embed

```html
<video autoplay muted loop playsinline poster="/promo/keepxclean-promo-poster.jpg">
  <source src="/promo/keepxclean-promo-web.webm" type="video/webm" />
  <source src="/promo/keepxclean-promo-web.mp4" type="video/mp4" />
</video>
```

The production `PromoVideo` component explicitly switches to MP4 if WebM fails
after source selection; a static `<source>` list alone does not recover from
runtime decoder errors. Autoplay rejection exposes native playback controls,
and reduced-motion mode remains manual even after a format change.

### Encoding and release validation

Both export paths use `scripts/encode-web.mjs`. It converts pixel range/matrix
to limited-range BT.709, declares BT.709 primaries/transfer, verifies the actual
output using ffprobe, and decodes every frame with ffmpeg. Do not replace this
with metadata-only relabeling: JPEG-derived full-range BT.601 masters need an
actual pixel conversion.

Copy the validated WebM and MP4 to `apps/web/public/promo/`. Before publishing,
check both formats in Ego, including playback advancing, looping, reduced-motion
behavior, and WebM failure recovery. After deployment, verify the HTTPS page
with hardware decoding: local playback and HTTP/hash checks alone missed the
2026-11-16 macOS VP9 decoder regression. The 2026-11-23 fix re-encodes the approved
shield + x master without changing its scenes or icon artwork.

### README embed

GitHub won't play an MP4 committed to the repo. Use either:

1. The GIF: `![KeepXClean demo](docs/assets/keepxclean-demo.gif)`, or
2. A video with sound: drag `keepxclean-promo-1080p.mp4` into the README editor on github.com. GitHub uploads it to `user-attachments` and plays it inline.

> Note: all accounts and posts in the video are fictional sample content. Remotion is free for individuals and companies with up to 3 employees; see remotion.dev/license.

### 2026-11-16 brand refresh

The current website MP4, WebM and poster were rendered from this source with the approved transparent shield + x artwork. For this run, the Remotion bundle was served locally and captured in Ego at 1920 × 1080, 30 fps (900 frames), then encoded with ffmpeg. This preserves the user's Ego-only browser preference. The SVG mask from the retired X mark has been removed. The icon's rounded exterior is transparent before compositing, so the reveal and outro no longer have a white square frame.
