from rembg import remove
import os

SRC = r"C:\Users\torch\OneDrive\Desktop\Architecture\2nd year\Semester 1\P1 Altadena Building\Final Portfolio Drawings\part 2\MODEL PHOTOS\PNG MODEL PHOTOS"
DST = os.path.join(os.path.dirname(__file__), "assets")

FILES = [
    "Y2-P1_altadena-building-model_photo_01.png",
    "Y2-P1_altadena-building-model_photo_02.png",
    "Y2-P1_altadena-building-model_photo_03.png",
    "Y2-P1_altadena-building-model_photo_04.png",
    "Y2-P1_altadena-building-model_photo_05.png",
]

for f in FILES:
    src_path = os.path.join(SRC, f)
    dst_path = os.path.join(DST, f)
    print(f"Processing {f} …")
    with open(src_path, "rb") as fh:
        result = remove(fh.read(), alpha_matting=False)
    with open(dst_path, "wb") as fh:
        fh.write(result)
    print(f"  saved.")

print("\nDone.")
