"""Captures PNG -> JPEG de rapport (reports/<lot>/) : largeur max et poids < 600 Ko.

    python tools/to_jpeg.py build/da/*.png --out reports/da [--width 1600]
"""
import argparse
import os

from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src', nargs='+'); ap.add_argument('--out', required=True); ap.add_argument('--width', type=int, default=1600)
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
for src in a.src:
    im = Image.open(src).convert('RGB')
    if im.width > a.width: im = im.resize((a.width, round(im.height * a.width / im.width)), Image.LANCZOS)
    dst = os.path.join(a.out, os.path.splitext(os.path.basename(src))[0] + '.jpg')
    for q in (86, 80, 74, 68, 60):                       # qualite la plus haute sous 600 Ko
        im.save(dst, 'JPEG', quality=q, optimize=True, progressive=True)
        if os.path.getsize(dst) < 600 * 1024: break
    print(f'{dst} {im.width}x{im.height} q{q} {os.path.getsize(dst) // 1024} Ko')
