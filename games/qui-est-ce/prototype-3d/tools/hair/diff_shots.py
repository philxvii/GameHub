"""Ecart visuel entre deux series de captures du banc (bench_hair.js).

    python tools/hair/diff_shots.py build/bench/s0 build/bench/s3 [--sheet build/bench/s3-vs-s0.jpg]
    python tools/hair/diff_shots.py build/bench/ict-ref build/bench/ict-s1 --char [--sheet x.jpg --labels A,B]

Par etat : ecart moyen (0-255) sur la zone des cheveux, part des pixels qui changent
de plus de 8 et de 24 niveaux, PSNR, SSIM sur la zone des cheveux. La zone des cheveux
= une boite fixe autour de la tete et de l'ombre portee (le cadrage est identique).

--char (banc du personnage, tools/character-ict/bench_character.js) : en plus, les yeux
fermes et les gros plans (image entiere), et des zones separees yeux et bouche dans chaque
etat (zones.json ecrit par le banc) ; la planche montre aussi les gros plans.
"""
import json
import os
import sys

import cv2
import numpy as np

STATES = ['neutral', 'smile', 'suspicious', 'surprised', 'left', 'right']
EXTRA = ['profil', 'trois-quarts-dos', 'dos']      # hors etats de jeu : ce qu'on perd en tournant autour
ROI = (slice(40, 800), slice(120, 900))            # tete, cheveux et leur ombre sur le fond (image 900 x 1200)
CHAR_FULL = ['yeux-fermes']                         # personnage : memes cadrage et zone que les etats
CHAR_ZOOM = ['gp-yeux', 'gp-yeux-fermes', 'gp-yeux-mefiant', 'gp-bouche-sourire', 'gp-bouche-surpris']


def ssim(a, b):
    a = a.astype(np.float64); b = b.astype(np.float64)
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    mu_a, mu_b = cv2.GaussianBlur(a, (11, 11), 1.5), cv2.GaussianBlur(b, (11, 11), 1.5)
    s_a = cv2.GaussianBlur(a * a, (11, 11), 1.5) - mu_a ** 2
    s_b = cv2.GaussianBlur(b * b, (11, 11), 1.5) - mu_b ** 2
    s_ab = cv2.GaussianBlur(a * b, (11, 11), 1.5) - mu_a * mu_b
    m = ((2 * mu_a * mu_b + C1) * (2 * s_ab + C2)) / ((mu_a ** 2 + mu_b ** 2 + C1) * (s_a + s_b + C2))
    return float(m.mean())


def metrics(a, b):
    d = np.abs(a.astype(np.int16) - b.astype(np.int16)).max(2)
    mse = ((a.astype(np.float64) - b) ** 2).mean()
    ga, gb = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY), cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
    return dict(mae=round(float(d.mean()), 2), p8=round(float((d > 8).mean() * 100), 2),
                p24=round(float((d > 24).mean() * 100), 2),
                psnr=round(float(10 * np.log10(255 ** 2 / mse)) if mse else 99.0, 1),
                ssim=round(ssim(ga, gb), 4))


def compare(ref_dir, test_dir, char=False):
    out = {}
    for s in STATES + EXTRA + (CHAR_FULL + CHAR_ZOOM if char else []):
        if not os.path.exists(os.path.join(test_dir, s + '.png')) or not os.path.exists(os.path.join(ref_dir, s + '.png')): continue
        a = cv2.imread(os.path.join(ref_dir, s + '.png'))
        b = cv2.imread(os.path.join(test_dir, s + '.png'))
        if s in STATES or s in CHAR_FULL: a, b = a[ROI], b[ROI]
        out[s] = metrics(a, b)
    keys = ['mae', 'p8', 'p24', 'psnr', 'ssim']
    out['moyenne'] = {k: round(float(np.mean([out[s][k] for s in STATES])), 4 if k == 'ssim' else 2) for k in keys}
    zpath = os.path.join(ref_dir, 'zones.json')
    if char and os.path.exists(zpath):
        zones = json.load(open(zpath))
        worst = {}
        for s, z in zones.items():
            a = cv2.imread(os.path.join(ref_dir, s + '.png')); b = cv2.imread(os.path.join(test_dir, s + '.png'))
            for name, (x0, y0, x1, y1) in z.items():
                m = metrics(a[y0:y1, x0:x1], b[y0:y1, x0:x1])
                out.setdefault('zones', {}).setdefault(s, {})[name] = m
                w = worst.setdefault(name, dict(p8=0.0, ssim=1.0))
                w['p8'], w['ssim'] = max(w['p8'], m['p8']), min(w['ssim'], m['ssim'])
        zoom = [out[s] for s in CHAR_ZOOM if s in out]
        if zoom: worst['gros-plans'] = dict(p8=max(m['p8'] for m in zoom), ssim=min(m['ssim'] for m in zoom))
        out['zones-pire'] = worst
    return out


def sheet(ref_dir, test_dir, path, label_a='V4.1 originale', label_b='optimisee', char=False):
    rows = []
    h, w = ROI[0].stop - ROI[0].start, ROI[1].stop - ROI[1].start
    states = STATES + ([s for s in CHAR_FULL + CHAR_ZOOM if os.path.exists(os.path.join(test_dir, s + '.png'))] if char else [])
    for s in states:
        a = cv2.imread(os.path.join(ref_dir, s + '.png'))
        b = cv2.imread(os.path.join(test_dir, s + '.png'))
        if s in CHAR_ZOOM:                                   # gros plan : image entiere ramenee a la hauteur de la zone
            k = h / a.shape[0]
            a, b = (cv2.resize(x, (round(x.shape[1] * k), h), interpolation=cv2.INTER_AREA) for x in (a, b))
            pad = ((0, 0), ((w - a.shape[1]) // 2, w - a.shape[1] - (w - a.shape[1]) // 2), (0, 0))
            a, b = np.pad(a, pad), np.pad(b, pad)
        else:
            a, b = a[ROI], b[ROI]
        d = np.abs(a.astype(np.int16) - b.astype(np.int16)).max(2)
        heat = cv2.applyColorMap(np.clip(d * 4, 0, 255).astype(np.uint8), cv2.COLORMAP_INFERNO)
        if char:
            a, b, heat = a.copy(), b.copy(), heat.copy()
            for im, t in ((a, f'{label_a} - {s}'), (b, label_b), (heat, 'ecart x4')):
                cv2.putText(im, t, (16, 44), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 6, cv2.LINE_AA)
                cv2.putText(im, t, (16, 44), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2, cv2.LINE_AA)
        rows.append(np.hstack([a, b, heat]))
    if len(rows) % 2: rows.append(np.zeros_like(rows[0]))
    img = np.vstack([np.hstack(rows[i:i + 2]) for i in range(0, len(rows), 2)])
    img = cv2.resize(img, None, fx=0.5 if not char else 0.33, fy=0.5 if not char else 0.33, interpolation=cv2.INTER_AREA)
    cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, 88 if not char else 80])


if __name__ == '__main__':
    ref, test = sys.argv[1], sys.argv[2]
    char = '--char' in sys.argv
    r = compare(ref, test, char)
    print(json.dumps(r))
    if '--sheet' in sys.argv:
        labels = sys.argv[sys.argv.index('--labels') + 1].split(',') if '--labels' in sys.argv else ['V4.1 originale', 'optimisee']
        sheet(ref, test, sys.argv[sys.argv.index('--sheet') + 1], *labels, char=char)
