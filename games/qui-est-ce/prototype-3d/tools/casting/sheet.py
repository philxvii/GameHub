"""Planche d'apercu : portraits WebP (fond transparent) poses sur les papiers de studio du jeu."""
import json, sys
from PIL import Image, ImageDraw
items = json.load(open(sys.argv[1])); out = sys.argv[2]
BG = ['#D8826A', '#7FA59B', '#D9B26F', '#8C9BC4', '#C98FA0', '#9DB37A']
ims = [(Image.open(f).convert('RGBA'), lab, e, k) for f, lab, e, k in items]
W, H = ims[0][0].size; cols = min(len(ims), 6); rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W, rows * (H + 34)), '#0F2A33'); d = ImageDraw.Draw(sheet)
for n, (im, lab, e, k) in enumerate(ims):
    x, y = (n % cols) * W, (n // cols) * (H + 34)
    bg = Image.new('RGBA', (W, H), BG[k % len(BG)]); bg.alpha_composite(im); sheet.paste(bg.convert('RGB'), (x, y))
    d.text((x + 10, y + H + 8), f'{lab} · {e}', fill='#F3EDE4')
sheet.save(out, quality=88); print(out, sheet.size)
