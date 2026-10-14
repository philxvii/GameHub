"""Ecart visuel entre deux series de captures du banc (bench_hair.js).

    python tools/hair/diff_shots.py build/bench/s0 build/bench/s3 [--sheet build/bench/s3-vs-s0.jpg]

Par etat : ecart moyen (0-255) sur la zone des cheveux, part des pixels qui changent
de plus de 8 et de 24 niveaux, PSNR, SSIM sur la zone des cheveux. La zone des cheveux
= une boite fixe autour de la tete et de l'ombre portee (le cadrage est identique).
"""
import json
import os
import sys

import cv2
import numpy as np

STATES = ['neutral', 'smile', 'suspicious', 'surprised', 'left', 'right']
EXTRA = ['profil', 'trois-quarts-dos', 'dos']      # hors etats de jeu : ce qu'on perd en tournant autour
ROI = (slice(40, 800), slice(120, 900))            # tete, cheveux et leur ombre sur le fond (image 900 x 1200)


def ssim(a, b):
    a = a.astype(np.float64); b = b.astype(np.float64)
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    mu_a, mu_b = cv2.GaussianBlur(a, (11, 11), 1.5), cv2.GaussianBlur(b, (11, 11), 1.5)
    s_a = cv2.GaussianBlur(a * a, (11, 11), 1.5) - mu_a ** 2
    s_b = cv2.GaussianBlur(b * b, (11, 11), 1.5) - mu_b ** 2
    s_ab = cv2.GaussianBlur(a * b, (11, 11), 1.5) - mu_a * mu_b
    m = ((2 * mu_a * mu_b + C1) * (2 * s_ab + C2)) / ((mu_a ** 2 + mu_b ** 2 + C1) * (s_a + s_b + C2))
    return float(m.mean())


def compare(ref_dir, test_dir):
    out = {}
    for s in STATES + EXTRA:
        if not os.path.exists(os.path.join(test_dir, s + '.png')) or not os.path.exists(os.path.join(ref_dir, s + '.png')): continue
        a = cv2.imread(os.path.join(ref_dir, s + '.png'))
        b = cv2.imread(os.path.join(test_dir, s + '.png'))
        if s in STATES: a, b = a[ROI], b[ROI]
        d = np.abs(a.astype(np.int16) - b.astype(np.int16)).max(2)
        mse = ((a.astype(np.float64) - b) ** 2).mean()
        ga, gb = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY), cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
        out[s] = dict(mae=round(float(d.mean()), 2), p8=round(float((d > 8).mean() * 100), 2),
                      p24=round(float((d > 24).mean() * 100), 2),
                      psnr=round(float(10 * np.log10(255 ** 2 / mse)) if mse else 99.0, 1),
                      ssim=round(ssim(ga, gb), 4))
    keys = ['mae', 'p8', 'p24', 'psnr', 'ssim']
    out['moyenne'] = {k: round(float(np.mean([out[s][k] for s in STATES])), 4 if k == 'ssim' else 2) for k in keys}
    return out


def sheet(ref_dir, test_dir, path, label_a='V4.1 originale', label_b='optimisee'):
    rows = []
    for s in STATES:
        a = cv2.imread(os.path.join(ref_dir, s + '.png'))[ROI]
        b = cv2.imread(os.path.join(test_dir, s + '.png'))[ROI]
        d = np.abs(a.astype(np.int16) - b.astype(np.int16)).max(2)
        heat = cv2.applyColorMap(np.clip(d * 4, 0, 255).astype(np.uint8), cv2.COLORMAP_INFERNO)
        rows.append(np.hstack([a, b, heat]))
    img = np.vstack([np.hstack(rows[i:i + 2]) for i in range(0, 6, 2)])
    img = cv2.resize(img, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
    cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, 88])


if __name__ == '__main__':
    ref, test = sys.argv[1], sys.argv[2]
    r = compare(ref, test)
    print(json.dumps(r))
    if '--sheet' in sys.argv:
        sheet(ref, test, sys.argv[sys.argv.index('--sheet') + 1])
