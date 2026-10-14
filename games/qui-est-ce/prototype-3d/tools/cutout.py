"""Detourage d'un portrait sur fond studio uni (GrabCut guide), sortie RGBA.

Usage : python tools/cutout.py entree.jpg sortie.png [apercu.jpg]
Zones sures : fond sur les bords hauts, sujet sur visage, cheveux et pull.
"""
import sys
import cv2, numpy as np

src, dst = sys.argv[1], sys.argv[2]
im = cv2.imread(src); h, w = im.shape[:2]
s = 0.5; small = cv2.resize(im, None, fx=s, fy=s); H, W = small.shape[:2]
mask = np.full((H, W), cv2.GC_PR_BGD, np.uint8)
mask[:, :int(W*0.03)] = cv2.GC_BGD; mask[:, int(W*0.97):] = cv2.GC_BGD; mask[:int(H*0.01), :] = cv2.GC_BGD
mask[:int(H*0.5), :int(W*0.10)] = cv2.GC_BGD; mask[:int(H*0.5), int(W*0.90):] = cv2.GC_BGD
cv2.ellipse(mask, (W//2, int(H*0.40)), (int(W*0.19), int(H*0.24)), 0, 0, 360, cv2.GC_FGD, -1)
cv2.ellipse(mask, (W//2, int(H*0.17)), (int(W*0.15), int(H*0.08)), 0, 0, 360, cv2.GC_FGD, -1)
mask[int(H*0.85):, int(W*0.30):int(W*0.70)] = cv2.GC_FGD
bg = np.zeros((1, 65)); fg = np.zeros((1, 65))
cv2.grabCut(small, mask, None, bg, fg, 8, cv2.GC_INIT_WITH_MASK)
m = np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(m); k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
m = np.where(lab == k, 255, 0).astype(np.uint8)
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
m = cv2.GaussianBlur(cv2.resize(m, (w, h)), (5, 5), 0)
rgba = cv2.cvtColor(im, cv2.COLOR_BGR2BGRA); rgba[:, :, 3] = m
cv2.imwrite(dst, rgba)
if len(sys.argv) > 3:
    p = cv2.resize(rgba, None, fx=0.2, fy=0.2); a = p[:, :, 3:4] / 255.0
    cv2.imwrite(sys.argv[3], (p[:, :, :3]*a + np.array([60, 180, 60])*(1-a)).astype(np.uint8))
print("coverage", round((m > 127).mean(), 3))
