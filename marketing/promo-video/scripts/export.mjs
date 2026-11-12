// Renders the master video with Remotion, then derives every distribution format with ffmpeg.
//   npm run export
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';

const OUT = 'out';
mkdirSync(OUT, { recursive: true });
const run = (cmd, args) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit' });
};
const ff = (...args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

// 0. soundtrack + master render
run('node', ['scripts/make-music.mjs']);
run('npx', ['remotion', 'render', 'src/index.tsx', 'Promo', `${OUT}/master.mp4`, '--log=error']);

// 1. X / Twitter + general use: H.264 High, yuv420p, AAC 192k, faststart
ff('-i', `${OUT}/master.mp4`, '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart', `${OUT}/keepxclean-promo-1080p.mp4`);

// 2. Website hero: muted, small, loop-friendly (WebM VP9 + MP4 fallback) + poster
ff('-i', `${OUT}/master.mp4`, '-an', '-vf', 'scale=1280:-2', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', `${OUT}/keepxclean-promo-web.webm`);
ff('-i', `${OUT}/master.mp4`, '-an', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${OUT}/keepxclean-promo-web.mp4`);
ff('-sseof', '-0.1', '-i', `${OUT}/master.mp4`, '-frames:v', '1', '-q:v', '2', `${OUT}/keepxclean-promo-poster.jpg`);

// 3. README: GitHub only auto-plays GIFs from the repo — keep it light (demo + outro highlights)
const gifFilter = 'fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle';
ff('-ss', '6', '-t', '8', '-i', `${OUT}/master.mp4`, '-filter_complex', gifFilter, '-loop', '0', `${OUT}/keepxclean-demo.gif`);

for (const f of ['keepxclean-promo-1080p.mp4', 'keepxclean-promo-web.webm', 'keepxclean-promo-web.mp4', 'keepxclean-promo-poster.jpg', 'keepxclean-demo.gif']) {
  console.log(`${f.padEnd(32)} ${(statSync(`${OUT}/${f}`).size / 1024 / 1024).toFixed(2)} MB`);
}
