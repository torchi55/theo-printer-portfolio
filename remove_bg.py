"""
Flood-fill background removal for model photos.
Samples from all four corners, then marks any pixel within `tolerance`
of that sampled colour as transparent.
"""

from PIL import Image
import os, collections

ASSETS = os.path.join(os.path.dirname(__file__), "assets")
FILES  = [
    "Y2-P1_altadena-building-model_photo_01.png",
    "Y2-P1_altadena-building-model_photo_02.png",
    "Y2-P1_altadena-building-model_photo_03.png",
    "Y2-P1_altadena-building-model_photo_04.png",
    "Y2-P1_altadena-building-model_photo_05.png",
]
TOLERANCE = 28   # colour distance; raise if edges look fringed, lower if model bleeds


def colour_distance(a, b):
    return max(abs(int(a[0]) - int(b[0])),
               abs(int(a[1]) - int(b[1])),
               abs(int(a[2]) - int(b[2])))


def flood_fill_bg(img_rgba, seed_colour, tolerance):
    """BFS flood-fill from all four corners; returns set of bg pixel coords."""
    w, h   = img_rgba.size
    pixels = img_rgba.load()
    visited = set()
    queue   = collections.deque()

    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    for sx, sy in seeds:
        if (sx, sy) not in visited:
            visited.add((sx, sy))
            queue.append((sx, sy))

    while queue:
        x, y = queue.popleft()
        r, g, b, a = pixels[x, y]
        if colour_distance((r, g, b), seed_colour) <= tolerance:
            for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                    visited.add((nx, ny))
                    queue.append((nx, ny))

    return visited


def process(filename):
    path = os.path.join(ASSETS, filename)
    img  = Image.open(path).convert("RGBA")
    w, h = img.size

    # Sample background colour from the four corners (average)
    pix    = img.load()
    corners = [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]
    samples = [pix[cx, cy][:3] for cx, cy in corners]
    bg = tuple(sum(c[i] for c in samples) // 4 for i in range(3))
    print(f"  sampled bg colour: rgb{bg}")

    bg_pixels = flood_fill_bg(img, bg, TOLERANCE)

    data = img.getdata()
    new_data = []
    for i, (r, g, b, a) in enumerate(data):
        x, y = i % w, i // w
        if (x, y) in bg_pixels:
            new_data.append((r, g, b, 0))   # fully transparent
        else:
            new_data.append((r, g, b, a))

    img.putdata(new_data)
    img.save(path, "PNG")
    print(f"  saved: {filename}")


for f in FILES:
    print(f"Processing {f} …")
    process(f)

print("\nDone. All backgrounds removed.")
