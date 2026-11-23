// Shared by full exports and re-encoding an existing approved master.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function encodeWebVideos(input, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  // Convert the pixels as well as the metadata. JPEG-derived masters may carry
  // full-range BT.601; merely relabeling them would change the rendered colors.
  const common = [
    '-i', input, '-map', '0:v:0', '-an',
    '-vf', 'scale=1280:-2:out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    '-color_range', 'tv', '-colorspace', 'bt709',
    '-color_primaries', 'bt709', '-color_trc', 'bt709',
  ];
  const outputs = [
    ['webm', 'vp9', ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2']],
    ['mp4', 'h264', ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '26', '-movflags', '+faststart']],
  ];
  for (const [extension, codec, options] of outputs) {
    const output = join(outputDir, `keepxclean-promo-web.${extension}`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...common, ...options, output], { stdio: 'inherit' });
    const info = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error', '-show_streams', '-of', 'json', output,
    ], { encoding: 'utf8' }));
    const video = info.streams.find((stream) => stream.codec_type === 'video');
    const expected = {
      codec_name: codec, pix_fmt: 'yuv420p', color_range: 'tv',
      color_space: 'bt709', color_primaries: 'bt709', color_transfer: 'bt709',
    };
    for (const [key, value] of Object.entries(expected)) {
      if (video?.[key] !== value) throw new Error(`${output}: ${key} must be ${value}, got ${video?.[key]}`);
    }
    if (info.streams.length !== 1) throw new Error(`${output}: website video must contain only one video stream`);
    // Validate every frame, in addition to the declared encoding contract.
    execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', output, '-f', 'null', '-'], { stdio: 'inherit' });
    console.log(`Validated ${output}: ${codec}, limited-range BT.709, yuv420p`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/encode-web.mjs <approved-master.mp4> [output-directory]');
  encodeWebVideos(resolve(process.argv[2]), resolve(process.argv[3] ?? 'out'));
}
