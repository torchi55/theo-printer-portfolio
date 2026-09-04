"""Cut a big drawing into a CxR grid of webp tiles for pinch-zoom.js.
usage: python tools/make_tiles.py <image-or-pdf> <out-prefix> <cols>x<rows> [target-width] [quality]
Tiles are written as <out-prefix>-r<row>-c<col>.webp; put
data-pz-tiles="<out-prefix>" data-pz-grid="<cols>x<rows>" on the target."""
import sys, os
from PIL import Image, ImageChops
Image.MAX_IMAGE_PIXELS = None
src, prefix, grid = sys.argv[1], sys.argv[2], sys.argv[3]
width = int(sys.argv[4]) if len(sys.argv) > 4 else None
q = int(sys.argv[5]) if len(sys.argv) > 5 else 82
cols, rows = map(int, grid.lower().split("x"))
if src.lower().endswith(".pdf"):
    import fitz
    p = fitz.open(src)[0]; k = (width or 4000) / p.rect.width
    pix = p.get_pixmap(matrix=fitz.Matrix(k, k), alpha=False)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    bg = Image.new("RGB", im.size, (255,255,255)); bb = ImageChops.difference(im, bg).getbbox()
    pad = int(60 * k / (3700 / p.rect.width)); l,t,r,b = bb
    im = im.crop((max(0,l-pad), max(0,t-pad), min(im.width,r+pad), min(im.height,b+pad)))
else:
    im = Image.open(src).convert("RGB")
    if width and im.width > width: im = im.resize((width, round(im.height*width/im.width)), Image.LANCZOS)
os.makedirs(os.path.dirname(prefix) or ".", exist_ok=True)
W, H = im.size; tot = 0
for r in range(rows):
    for c in range(cols):
        box = (round(c*W/cols), round(r*H/rows), round((c+1)*W/cols), round((r+1)*H/rows))
        out = f"{prefix}-r{r}-c{c}.webp"
        im.crop(box).save(out, "WEBP", quality=q, method=6); tot += os.path.getsize(out)
print(f"{prefix}: {cols}x{rows} tiles from {W}x{H}, total {tot//1024} KB")
