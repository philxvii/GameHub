"""Planche d'un accessoire : personnage 01 sans et avec chaque variante, dans les etats du jeu,
plus une rangee a la taille d'une carte du plateau (lisibilite du critere de jeu).

    python tools/accessories/sheet.py reports/accessories/lunettes.jpg build/bench/acc-none:sans \
        build/bench/acc-glasses-acetate:"acetate ecaille" build/bench/acc-glasses-metal:"metal dore"

Les dossiers viennent de tools/character-ict/bench_character.js (--acc ...).
"""
import sys

import cv2
import numpy as np

ROI = (slice(40, 800), slice(120, 900))
ROWS = ['neutral', 'smile', 'suspicious', 'surprised', 'left', 'right', 'yeux-fermes', 'profil', 'gp-yeux', 'gp-bouche-surpris']
TILE = 300                       # largeur d'une vignette de la planche
CARD = 120                       # largeur d'un portrait de carte sur le plateau (bureau, en px)


def label(img, text, size=0.8):
    img = img.copy()
    cv2.putText(img, text, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, size, (0, 0, 0), 5, cv2.LINE_AA)
    cv2.putText(img, text, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, size, (255, 255, 255), 2, cv2.LINE_AA)
    return img


def tile(path, state):
    im = cv2.imread(f'{path}/{state}.png')
    if state in ('neutral', 'smile', 'suspicious', 'surprised', 'left', 'right', 'yeux-fermes'): im = im[ROI]
    return cv2.resize(im, (TILE, round(TILE * im.shape[0] / im.shape[1])), interpolation=cv2.INTER_AREA)


def main():
    out, cols = sys.argv[1], [a.split(':', 1) for a in sys.argv[2:]]
    rows = []
    for st in ROWS:
        ims = [tile(p, st) for p, _ in cols]
        h = max(i.shape[0] for i in ims)
        ims = [np.pad(i, ((0, h - i.shape[0]), (0, 0), (0, 0))) for i in ims]
        rows.append(np.hstack([label(i, f'{name} - {st}' if k == 0 else name, 0.6) for k, (i, (_, name)) in enumerate(zip(ims, cols))]))
    # rangee « taille de carte » : le portrait tel qu'il apparait sur le plateau, agrandi x2 sans lissage
    cards = []
    for p, name in cols:
        im = cv2.imread(f'{p}/neutral.png')[ROI]
        small = cv2.resize(im, (CARD, round(CARD * im.shape[0] / im.shape[1])), interpolation=cv2.INTER_AREA)
        big = cv2.resize(small, (TILE, round(TILE * small.shape[0] / small.shape[1])), interpolation=cv2.INTER_NEAREST)
        cards.append(label(big, f'carte {CARD} px', 0.6))
    rows.append(np.hstack(cards))
    sheet = np.vstack(rows)
    k = min(1.0, 1600 / sheet.shape[1])
    sheet = cv2.resize(sheet, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    for q in (85, 78, 70, 62):
        ok, buf = cv2.imencode('.jpg', sheet, [cv2.IMWRITE_JPEG_QUALITY, q])
        if len(buf) < 600 * 1024: break
    open(out, 'wb').write(buf.tobytes())
    print(out, sheet.shape[1], 'x', sheet.shape[0], len(buf) // 1024, 'Ko')


if __name__ == '__main__':
    main()
