"""Fabrique un personnage de casting PROVISOIRE (sans photos) a partir du personnage 01 :
autre forme de visage (identite ICT), teint, yeux, rasage, coiffure et accessoires ajustes a
la nouvelle tete. Memes 53 expressions, meme squelette : le rig marche sans changement.

    python tools/casting/make_character.py character-07          # lit data/casting/character-07.json

Fiche data/casting/<id>.json :
  modes       ecarts d'identite ICT {indice: valeur} (visage ; s'efface vers le crane et le cou)
  shave       true : peau rasee (models/character-01-ict-opt-shaved.glb, tools/accessories/shave.py)
  skin        [L, a, b] teint vise (Lab, L sur 100) ; null : celui du 01
  eyes        marron | vert | bleu
  hair        coiffure partagee : hair-curly-v41 | prop-short-grey | prop-long-blond | null (chauve)
  tint        teinte de la coiffure (noir, brun, blond, roux, gris) ; null : sa couleur propre
  accessoires ex. ["glasses-metal", "full", "earrings-hoops"] : refaits sur CETTE tete

Sorties : models/<id>/<id>-ict-opt.glb, models/<id>/accessories/*.glb ; la fiche du roster
(glb, coiffure, teinte, accessoires, statut « pilote »). Les portraits se refont ensuite avec
tools/bake_portraits.js <id>. Les visages sans photo ne remplacent pas un vrai casting : voir
FIN_DE_MISSION_3.md.
"""
import io, json, os, shutil, subprocess, sys

import cv2
import numpy as np
import pygltflib as G

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
PY = sys.executable
SHAVED_SKIN = os.path.join(PROTO, 'build', 'opt', 'skin-shaved.jpg')
EYES = {'marron': (32, 13, 24), 'vert': (44, -10, 20), 'bleu': (52, -3, -20)}      # Lab moyen de l'iris
HAIRS = {'hair-curly-v41': 'models/hair/hair-curly-v41-opt.glb', 'prop-short-grey': 'models/hair/prop-short-grey-opt.glb',
         'prop-long-blond': 'models/hair/prop-long-blond-opt.glb'}


def run(cmd, env=None):
    print('  $', ' '.join(os.path.relpath(c, PROTO) if c.startswith(PROTO) else ('python' if c == PY else c) for c in cmd), flush=True)
    r = subprocess.run(cmd, cwd=PROTO, env={**os.environ, **(env or {})}, capture_output=True, text=True)
    if r.returncode: print(r.stdout[-2000:], r.stderr[-2000:]); raise SystemExit(f'echec ({r.returncode})')
    return r.stdout


def textures(glb_path):
    """Images de couleur par materiau (BGR)."""
    g = G.GLTF2().load(glb_path); blob = g.binary_blob(); out = {}
    for m in g.materials:
        t = m.pbrMetallicRoughness and m.pbrMetallicRoughness.baseColorTexture
        if not t: continue
        bv = g.bufferViews[g.images[g.textures[t.index].source].bufferView]
        out[m.name] = cv2.imdecode(np.frombuffer(blob, np.uint8, bv.byteLength, bv.byteOffset), cv2.IMREAD_COLOR)
    return out


def to_lab(img): return cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32) * [100 / 255, 1, 1] - [0, 128, 128]
def from_lab(lab): return cv2.cvtColor(np.clip((lab + [0, 128, 128]) * [255 / 100, 1, 1], 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)


def recolor_skin(img, target):
    """Teint vise, detail garde : L recentre (contraste un peu reduit pour les teints fonces),
    a et b decales. Les pixels vides de l'atlas (noirs) ne comptent pas."""
    lab = to_lab(img); m = lab[..., 0] > 18
    mean = lab[m].mean(0); tL, ta, tb = target
    k = 0.75 + 0.25 * min(1.0, tL / max(mean[0], 1))
    out = lab.copy()
    out[..., 0] = (lab[..., 0] - mean[0]) * k + tL
    out[..., 1] = lab[..., 1] + (ta - mean[1]); out[..., 2] = lab[..., 2] + (tb - mean[2])
    res = from_lab(out); res[~m] = img[~m]
    return res


def recolor_iris(img, target):
    """Iris (disque central de la texture du globe, hors pupille, reflet et paupiere) vers une couleur."""
    h, w = img.shape[:2]; lab = to_lab(img)
    yy, xx = np.mgrid[0:h, 0:w]; r = np.hypot(xx - w * 0.5, yy - h * 0.47) / w
    iris = (r < 0.36) & (lab[..., 0] > 14) & (lab[..., 0] < 78) & ~((lab[..., 1] > 8) & (lab[..., 0] > 55))
    wgt = cv2.GaussianBlur(iris.astype(np.float32), (0, 0), 2)
    mean = lab[iris].mean(0); tL, ta, tb = target
    new = lab.copy()
    new[..., 0] = (lab[..., 0] - mean[0]) * 0.9 + tL; new[..., 1] = (lab[..., 1] - mean[1]) * 0.6 + ta; new[..., 2] = (lab[..., 2] - mean[2]) * 0.6 + tb
    lab = lab * (1 - wgt[..., None]) + new * wgt[..., None]
    return from_lab(lab)


def main():
    cid = sys.argv[1]
    spec = json.load(open(os.path.join(PROTO, 'data', 'casting', cid + '.json'), encoding='utf-8'))
    out_dir = os.path.join(PROTO, 'models', cid); acc_dir = os.path.join(out_dir, 'accessories')
    work = os.path.join(PROTO, 'build', 'casting', cid); os.makedirs(work, exist_ok=True); os.makedirs(acc_dir, exist_ok=True)
    ident = os.path.join(work, 'identity.json'); json.dump({'modes': spec['modes']}, open(ident, 'w'))
    head = os.path.join(work, cid + '-ict.glb')
    print(f'[{cid}] tete')
    run([PY, os.path.join(PROTO, 'tools', 'character-ict', 'build_ict.py'), '--identity', ident, head])
    # textures : peau (rasee ou non), teint, yeux
    tex = textures(head); files = []
    skin = cv2.imread(SHAVED_SKIN) if spec.get('shave') else tex['skin']
    scalp = tex['scalp']
    if spec.get('skin'): skin, scalp = recolor_skin(skin, spec['skin']), recolor_skin(scalp, spec['skin'])
    for name, img in (('skin', skin), ('scalp', scalp)):
        p = os.path.join(work, f'{name}.jpg'); cv2.imwrite(p, img, [cv2.IMWRITE_JPEG_QUALITY, 92]); files.append(f'{name}={p}')
    if spec.get('eyes') in EYES:
        for side in ('eyeball-left', 'eyeball-right'):
            p = os.path.join(work, f'{side}.jpg'); cv2.imwrite(p, recolor_iris(tex[side], EYES[spec['eyes']]), [cv2.IMWRITE_JPEG_QUALITY, 92]); files.append(f'{side}={p}')
    glb = os.path.join(out_dir, f'{cid}-ict-opt.glb')
    print(f'[{cid}] optimisation')
    run([PY, os.path.join(PROTO, 'tools', 'character-ict', 'optimize_character.py'), head, glb, '--drop-shells',
         '--tex-file', ','.join(files), '--tex', 'body=jpeg:85@0.5', '--pack', '-vp 16 -vt 16 -cc'])
    # accessoires refaits sur cette tete (QE_HEAD) : lunettes, barbes, boucles d'oreilles
    accs = []
    for a in spec.get('accessoires', []):
        tool, style = ('glasses', a[8:]) if a.startswith('glasses-') else ('earrings', a[9:]) if a.startswith('earrings-') else ('beard', a)
        print(f'[{cid}] accessoire {a}')
        run([PY, os.path.join(PROTO, 'tools', 'accessories', f'{tool}.py'), style], env={'QE_HEAD': head, 'QE_ACC_OUT': acc_dir})
        accs.append(f'models/{cid}/accessories/{a}.glb')
    # roster
    rp = os.path.join(PROTO, 'data', 'roster.json'); r = json.load(open(rp, encoding='utf-8'))
    e = next(c for c in r['personnages'] if c['id'] == cid)
    e.update({'statut': 'pilote', 'glb': f'models/{cid}/{cid}-ict-opt.glb', 'coiffure': HAIRS.get(spec.get('hair')) if spec.get('hair') else None,
              'teinte': spec.get('tint'), 'accessoires': accs})
    with open(rp, 'w', encoding='utf-8', newline='\n') as f: json.dump(r, f, ensure_ascii=False, indent=1); f.write('\n')
    print(f'[{cid}] {os.path.getsize(glb) / 1e6:.2f} Mo, accessoires {accs}')


if __name__ == '__main__':
    main()
