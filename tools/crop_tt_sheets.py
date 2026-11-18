"""Cut the Triangulated Tectonic drawing-set index crops from the 9600px board.
usage: python3 crop_tt_sheets.py <repo-root> [out-dir]   (out-dir default: <repo-root>/assets/tt-sheets)
Writes per sheet: <slug>.webp (display, 1600 or 1200 px wide, q82), <slug>-full.webp (native crop, q86),
and 2x2 tiles <slug>-r<row>-c<col>.webp in tiles/ (q82) for pinch-zoom.js. Prints the manifest."""
import sys, os, json
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
root = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, "assets", "tt-sheets")
SRC = os.path.join(root, "assets", "triangulated-tectonic-board-uhq.webp")
# (sheet no, slug, title, scale note, box = left, top, right, bottom in UHQ pixels of the 9600x14017 board)
SHEETS = [
    # no,     slug,                      title,                           note on the board,                      box (UHQ px),              display width
    ("01", "concept-diagrams",   "Concept diagrams",              "Divide / Relocate / Contain / Insert", (6620, 8105, 9500, 8660),  1600),
    ("02", "exploded-iso",       "Exploded iso",                  '1" = 50\'',                            (300, 3700, 4000, 6760),   1200),
    ("03", "site-plan",          "Site plan",                     '1" = 36\'',                            (0, 8040, 4740, 11830),    1200),
    ("04", "section-plan-c",     "Section plan C",                '1" = 36\'',                            (4740, 8090, 9600, 11830), 1200),
    ("05", "floor-plans-south",  "Floor plans / South building",  '1/16" = 1\'-0"',                       (5660, 4215, 9420, 7140),  1200),
    ("06", "floor-plans-north",  "Floor plans / North building",  '1/16" = 1\'-0"',                       (4800, 400, 9600, 2535),   1600),
    ("07", "floor-plans-east",   "Floor plans / East building",   '1/16" = 1\'-0"',                       (4800, 2535, 9600, 4215),  1600),
    ("08", "elevation",          "Elevation",                     '1" = 10\'',                            (0, 11940, 9600, 13960),   1600),
    ("09", "section-a",          "Section A",                     '1/8" = 1\'-0"',                        (0, 6940, 4800, 7960),     1600),
    ("10", "section-b",          "Section B",                     '1/8" = 1\'-0"',                        (4800, 7030, 9600, 8060),  1600),
]
im = Image.open(SRC).convert("RGB")
assert im.size == (9600, 14017), im.size
os.makedirs(os.path.join(out, "tiles"), exist_ok=True)
man = []; total = 0
for no, slug, title, note, box, dw in SHEETS:
    full = im.crop(box); W, H = full.size
    pf = os.path.join(out, f"triangulated-tectonic-{slug}-full.webp"); full.save(pf, "WEBP", quality=86, method=6)
    k = min(1.0, dw / W); disp = full.resize((round(W * k), round(H * k)), Image.LANCZOS)
    pd = os.path.join(out, f"triangulated-tectonic-{slug}.webp"); disp.save(pd, "WEBP", quality=82, method=6)
    tb = 0
    for r in range(2):
        for c in range(2):
            t = full.crop((round(c * W / 2), round(r * H / 2), round((c + 1) * W / 2), round((r + 1) * H / 2)))
            pt = os.path.join(out, "tiles", f"triangulated-tectonic-{slug}-r{r}-c{c}.webp"); t.save(pt, "WEBP", quality=82, method=6); tb += os.path.getsize(pt)
    e = dict(no=no, slug=slug, title=title, note=note, box=box, full=[W, H], disp=list(disp.size),
             kb=dict(disp=os.path.getsize(pd) // 1024, full=os.path.getsize(pf) // 1024, tiles=tb // 1024))
    total += os.path.getsize(pd) + os.path.getsize(pf) + tb; man.append(e); print(json.dumps(e))
print("TOTAL KB", total // 1024)
