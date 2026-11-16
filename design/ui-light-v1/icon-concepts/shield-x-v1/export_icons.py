# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow==11.3.0"]
# ///
"""Reproduce the approved white-matte removal and all brand exports.
Run: uv run design/ui-light-v1/icon-concepts/shield-x-v1/export_icons.py
Only the exterior and its antialiased edge are changed; shield pixels are retained.
"""
from base64 import b64encode
from collections import deque
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
source = Image.open(HERE / 'concept-shield-x.png').convert('RGB')
w, h = source.size
pixels = source.load()
exterior = bytearray(w * h)
queue = deque([(0, 0)])
# Flood only the near-white region connected to the canvas boundary.
while queue:
    x, y = queue.popleft()
    index = y * w + x
    if exterior[index] or min(pixels[x, y]) < 236:
        continue
    exterior[index] = 1
    for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
        if 0 <= nx < w and 0 <= ny < h and not exterior[ny*w+nx]:
            queue.append((nx,ny))
result = source.convert('RGBA')
out = result.load()
for y in range(h):
    for x in range(w):
        r, g, b = pixels[x, y]
        if exterior[y*w+x]:
            if g-r < 4 or r >= 249:
                out[x,y] = (0,0,0,0)
                continue
            edge = True
        else:
            edge = any(exterior[ny*w+nx] for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)) if 0<=nx<w and 0<=ny<h)
        if edge:
            alpha = min(1.0, max(0.0, (255-r)/25.0))
            # Remove the white matte from edge RGB before alpha compositing.
            out[x,y] = tuple(round(max(0,min(255,(c-255*(1-alpha))/alpha))) for c in (r,g,b)) + (round(alpha*255),)
# Remove the old square gutter, retaining two transparent pixels for resampling.
bounds = result.getbbox()
side = max(bounds[2]-bounds[0],bounds[3]-bounds[1])+4
left = (bounds[0]+bounds[2]-side)//2
top = (bounds[1]+bounds[3]-side)//2
result = result.crop((left,top,left+side,top+side))
result.save(HERE / 'shield-x-transparent.png')
assert all(result.getpixel(p)[3]==0 for p in [(0,0),(side-1,0),(0,side-1),(side-1,side-1)])
for size in (16,24,32,48,64,128,256,512,1024):
    scaled = result.resize((size,size), Image.Resampling.LANCZOS)
    for path in [ROOT / f'apps/extension/public/icon/icon-{size}.png', ROOT / f'apps/web/public/icon-{size}.png']:
        scaled.save(path)

def svg(size, path):
    data = b64encode((ROOT / f'apps/extension/public/icon/icon-{size}.png').read_bytes()).decode()
    path.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}" role="img" aria-label="KeepXClean shield and x"><image width="{size}" height="{size}" href="data:image/png;base64,{data}"/></svg>\n')
for name,size in [('logo',512),('logo-small',64),('logo-32',32),('logo-48',48)]:
    svg(size, ROOT / f'apps/extension/public/brand/{name}.svg')
for name,size in [('logo',512),('logo-small',64)]:
    svg(size, ROOT / f'apps/web/public/{name}.svg')
svg(512,ROOT/'marketing/promo-video/public/logo.svg')
# Visual QA composites are documentation, never application icons.
qa = Image.new('RGB',(1000,500),'#f4f9f6')
qa.paste(Image.new('RGB',(500,500),'#152b23'),(500,0))
preview = result.resize((300,300),Image.Resampling.LANCZOS)
qa.paste(preview,(100,100),preview);qa.paste(preview,(600,100),preview)
qa.save(HERE/'transparency-qa.png')
print(f'Exported transparent {side}×{side} master and 18 PNG / 7 SVG assets.')
