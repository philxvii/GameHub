"""Optimisation du personnage ICT (sortie de build_ict.py) sans le reconstruire :
memes noeuds, memes os, memes expressions dans le meme ordre ; seule la facon de les
stocker change. Ne jamais ecrire sur models/character-01-ict.glb.

    python tools/character-ict/optimize_character.py models/character-01-ict.glb build/ict-opt/x.glb [options]

Passe Python (dans cet ordre) :
  --drop-shells            retire les coquilles de cheveux peintes (maillage, materiau, texture) ;
                           le noeud `hair` reste, vide (compare.js le masque par son nom)
  --drop-targets unused    variante : retire les expressions que js/expressions.js ne pilote pas
                           (liste explicite possible : --drop-targets jawForward,mouthRollUpper)
  --tex MAT=SPEC[,...]     re-encode la texture de couleur d'un materiau. SPEC = format[:qualite][@echelle]
                           format jpeg | webp | webpl (WebP sans perte) | png ; ex. body=jpeg:80@0.5,skin=webp:92
  --tex-file MAT=IMAGE     remplace la texture de couleur d'un materiau par un fichier (ex. visage rase)
Passe gltfpack (optionnelle, apres la passe Python) :
  --pack "OPTIONS"         options de gltfpack, ex. "-vp 16 -vt 16 -c" ; -kn -km -ke sont toujours
                           ajoutes (noms des noeuds, materiaux et noms des expressions conserves)

Le resultat est controle a la fin : noms des noeuds, os du squelette (dans l'ordre), noms et
ordre des expressions, materiaux. Le script echoue si l'un d'eux change.

gltfpack : npm install --prefix build/tools gltfpack@1.3.0   (build/ n'est pas versionne)
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys
import tempfile

import pygltflib as G
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
GLTFPACK = os.path.join(PROTO, 'build', 'tools', 'node_modules', '.bin', 'gltfpack')
SLOTS = ('baseColorTexture', 'metallicRoughnessTexture')
MAT_SLOTS = ('normalTexture', 'occlusionTexture', 'emissiveTexture')


def texinfos(mat):
    """(objet, attribut) de chaque reference de texture d'un materiau."""
    out = [(mat.pbrMetallicRoughness, s) for s in SLOTS if mat.pbrMetallicRoughness]
    return out + [(mat, s) for s in MAT_SLOTS]


def image_source(tex):
    ext = (tex.extensions or {}).get('EXT_texture_webp')
    return ext['source'] if ext else tex.source


class Glb:
    def __init__(self, path):
        self.g = G.GLTF2().load(path)
        self.blob = self.g.binary_blob()
        self.replaced = {}                                  # bufferView -> nouveaux octets

    def view(self, i):
        if i in self.replaced: return self.replaced[i]
        bv = self.g.bufferViews[i]
        return self.blob[bv.byteOffset or 0:(bv.byteOffset or 0) + bv.byteLength]

    # Retire tout ce qui n'est plus reference (maillages, materiaux, textures, images,
    # echantillonneurs, accesseurs, vues) et reconstruit le binaire. Les noeuds restent.
    def collect(self):
        g = self.g

        def remap(items, used):
            used = sorted(used)
            return [items[i] for i in used], {o: n for n, o in enumerate(used)}

        g.meshes, mm = remap(g.meshes, {n.mesh for n in g.nodes if n.mesh is not None})
        for n in g.nodes:
            if n.mesh is not None: n.mesh = mm[n.mesh]
        prims = [p for m in g.meshes for p in m.primitives]
        g.materials, mt = remap(g.materials, {p.material for p in prims if p.material is not None})
        for p in prims:
            if p.material is not None: p.material = mt[p.material]
        refs = [(o, a) for m in g.materials for o, a in texinfos(m) if getattr(o, a) is not None]
        g.textures, tx = remap(g.textures, {getattr(o, a).index for o, a in refs})
        for o, a in refs: getattr(o, a).index = tx[getattr(o, a).index]
        g.images, im = remap(g.images, {image_source(t) for t in g.textures})
        for t in g.textures:
            if t.source is not None: t.source = im[t.source]
            if (t.extensions or {}).get('EXT_texture_webp'): t.extensions['EXT_texture_webp']['source'] = im[t.extensions['EXT_texture_webp']['source']]
        g.samplers, sm = remap(g.samplers, {t.sampler for t in g.textures if t.sampler is not None})
        for t in g.textures:
            if t.sampler is not None: t.sampler = sm[t.sampler]

        acc = set()
        for p in prims:
            acc |= {v for v in p.attributes.__dict__.values() if v is not None}
            if p.indices is not None: acc.add(p.indices)
            for t in p.targets or []: acc |= set(t.values())
        for s in g.skins:
            if s.inverseBindMatrices is not None: acc.add(s.inverseBindMatrices)
        for a in g.animations:
            for s in a.samplers: acc |= {s.input, s.output}
        g.accessors, ac = remap(g.accessors, acc)
        for p in prims:
            for k, v in p.attributes.__dict__.items():
                if v is not None: setattr(p.attributes, k, ac[v])
            if p.indices is not None: p.indices = ac[p.indices]
            p.targets = [{k: ac[v] for k, v in t.items()} for t in p.targets or []] or None
        for s in g.skins:
            if s.inverseBindMatrices is not None: s.inverseBindMatrices = ac[s.inverseBindMatrices]
        for a in g.animations:
            for s in a.samplers: s.input, s.output = ac[s.input], ac[s.output]

        vrefs = []                                          # (objet, attribut) -> vue
        for a in g.accessors:
            if a.bufferView is not None: vrefs.append((a, 'bufferView'))
            if a.sparse: vrefs += [(a.sparse.indices, 'bufferView'), (a.sparse.values, 'bufferView')]
        vrefs += [(i, 'bufferView') for i in g.images if i.bufferView is not None]
        used = sorted({getattr(o, k) for o, k in vrefs})
        out, views, vm = bytearray(), [], {}
        for new, old in enumerate(used):
            while len(out) % 4: out.append(0)
            data = self.view(old)
            bv = g.bufferViews[old]
            views.append(G.BufferView(buffer=0, byteOffset=len(out), byteLength=len(data),
                                      byteStride=bv.byteStride, target=bv.target))
            out += data
            vm[old] = new
        for o, k in vrefs: setattr(o, k, vm[getattr(o, k)])
        while len(out) % 4: out.append(0)
        g.bufferViews = views
        g.buffers = [G.Buffer(byteLength=len(out))]
        self.blob, self.replaced = bytes(out), {}

    def save(self, path):
        self.collect()
        self.g.set_binary_blob(self.blob)
        self.g.save_binary(path)


def drop_shells(glb):
    for n in glb.g.nodes:
        if n.name == 'hair': n.mesh, n.skin = None, None


def driven_targets():
    """Expressions pilotees par js/expressions.js et js/rig.js (formes Left/Right comprises)."""
    js = open(os.path.join(PROTO, 'js', 'expressions.js'), encoding='utf-8').read()
    names = set(re.findall(r"\b([a-z]+[A-Z][A-Za-z]*)\s*:\s*[0-9.]", js))
    names |= set(re.findall(r"'(eye[A-Za-z]+)'", js))
    out = set()
    for n in names:
        out.add(n)
        if not n.endswith(('Left', 'Right')): out |= {n + 'Left', n + 'Right'}
    return out


def drop_targets(glb, spec):
    g = glb.g
    for m in g.meshes:
        names = (m.extras or {}).get('targetNames')
        if not names: continue
        drop = set(names) - driven_targets() if spec == 'unused' else set(spec.split(','))
        keep = [i for i, n in enumerate(names) if n not in drop]
        for p in m.primitives: p.targets = [p.targets[i] for i in keep]
        if m.weights: m.weights = [m.weights[i] for i in keep]
        m.extras['targetNames'] = [names[i] for i in keep]
        print(json.dumps({'mesh': m.name, 'targets': len(keep), 'dropped': sorted(set(names) - set(m.extras['targetNames']))}))


def reencode(glb, spec):
    g = glb.g
    for item in spec.split(','):
        mat, s = item.split('=')
        scale = float(s.split('@')[1]) if '@' in s else 1.0
        fmt, _, q = s.split('@')[0].partition(':')
        material = next(m for m in g.materials if m.name == mat)
        tex = g.textures[material.pbrMetallicRoughness.baseColorTexture.index]
        src = image_source(tex)
        img = g.images[src]
        im = Image.open(io.BytesIO(glb.view(img.bufferView)))
        im.load()
        if scale != 1.0:
            im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        buf = io.BytesIO()
        if fmt == 'jpeg':
            im.convert('RGB').save(buf, 'JPEG', quality=int(q or 90), subsampling=0 if int(q or 90) >= 90 else 2, optimize=True)
            mime = 'image/jpeg'
        elif fmt in ('webp', 'webpl'):
            im.save(buf, 'WEBP', quality=int(q or 90), lossless=fmt == 'webpl', method=6)
            mime = 'image/webp'
        elif fmt == 'png':
            im.save(buf, 'PNG', optimize=True)
            mime = 'image/png'
        else:
            raise SystemExit(f'format inconnu : {fmt}')
        glb.replaced[img.bufferView] = buf.getvalue()
        img.mimeType = mime
        if mime == 'image/webp':
            tex.extensions = {**(tex.extensions or {}), 'EXT_texture_webp': {'source': src}}
            tex.source = None
            for key in ('extensionsUsed', 'extensionsRequired'):
                setattr(g, key, sorted(set(getattr(g, key) or []) | {'EXT_texture_webp'}))
        print(json.dumps({'material': mat, 'format': fmt, 'quality': q or None, 'size': [im.width, im.height],
                          'kb': round(len(buf.getvalue()) / 1024, 1)}))


def signature(path):
    g = G.GLTF2().load(path)
    morph = {}
    for n in g.nodes:                                       # maillage porte par le noeud ou par un enfant (gltfpack)
        if not n.name: continue
        meshes = [n.mesh] if n.mesh is not None else [g.nodes[c].mesh for c in n.children or [] if not g.nodes[c].name and g.nodes[c].mesh is not None]
        for mi in meshes:
            names = (g.meshes[mi].extras or {}).get('targetNames')
            if names: morph[n.name] = names
    return {
        'nodes': sorted(n.name for n in g.nodes if n.name),
        'joints': [g.nodes[j].name for s in g.skins for j in s.joints],
        'targets': morph,
        'materials': sorted(m.name for m in g.materials),
    }


def check(src, dst, a):
    s, d = signature(src), signature(dst)
    if a.drop_shells: s['materials'].remove('hair-shells')
    if a.drop_targets: s['targets'] = d['targets'] if set(d['targets']) == set(s['targets']) else s['targets']
    bad = [k for k in s if s[k] != d[k]]
    if bad:
        for k in bad: print(f'DIFFERENT {k}\n  avant {s[k]}\n  apres {d[k]}', file=sys.stderr)
        raise SystemExit('noms modifies : ' + ', '.join(bad))
    return {'nodes': len(d['nodes']), 'joints': len(d['joints']), 'targets': {k: len(v) for k, v in d['targets'].items()}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--drop-shells', action='store_true')
    ap.add_argument('--drop-targets')
    ap.add_argument('--tex')
    ap.add_argument('--tex-file')
    ap.add_argument('--pack')
    a = ap.parse_args()
    if os.path.abspath(a.dst) == os.path.abspath(os.path.join(PROTO, 'models', 'character-01-ict.glb')):
        raise SystemExit('refus : le personnage valide ne doit jamais etre ecrase')
    os.makedirs(os.path.dirname(os.path.abspath(a.dst)), exist_ok=True)
    glb = Glb(a.src)
    if a.drop_shells: drop_shells(glb)
    if a.drop_targets: drop_targets(glb, a.drop_targets)
    if a.tex_file:
        for item in a.tex_file.split(','):
            mat, path = item.split('=', 1)
            material = next(m for m in glb.g.materials if m.name == mat)
            img = glb.g.images[image_source(glb.g.textures[material.pbrMetallicRoughness.baseColorTexture.index])]
            glb.replaced[img.bufferView] = open(path, 'rb').read()
            img.mimeType = 'image/png' if path.lower().endswith('.png') else 'image/jpeg'
    if a.tex: reencode(glb, a.tex)
    if a.pack:
        with tempfile.TemporaryDirectory() as tmp:
            mid = os.path.join(tmp, 'stage.glb')
            glb.save(mid)
            cmd = [GLTFPACK, '-i', mid, '-o', a.dst, '-kn', '-km', '-ke', *a.pack.split()]
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode: raise SystemExit(r.stderr or r.stdout)
    else:
        glb.save(a.dst)
    info = check(a.src, a.dst, a)
    print(json.dumps({'dst': a.dst, 'bytes': os.path.getsize(a.dst), **info}))


if __name__ == '__main__':
    main()
