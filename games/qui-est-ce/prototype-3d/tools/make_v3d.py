"""Genere games/qui-est-ce/v3d/index.html a partir du plateau (board.html) : meme page, mais
entree du jeu (maintenance du site en tete, mode en ligne Firebase actif), sans dupliquer le
balisage. Les ressources (css, js, modeles, roster) restent dans prototype-3d (<base href>).

    python tools/make_v3d.py
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__)); PROTO = os.path.normpath(os.path.join(HERE, '..'))
src = open(os.path.join(PROTO, 'board.html'), encoding='utf-8').read()
head = ('<meta charset="utf-8">\n'
        '<!-- GENERE par prototype-3d/tools/make_v3d.py a partir de board.html : ne pas modifier a la main. -->\n'
        '<base href="../prototype-3d/">\n'
        '<script src="../../../shared/maintenance.js"></script>\n'
        '<script>window.QE_ONLINE = true;</script>')
assert src.count('<meta charset="utf-8">') == 1
out = src.replace('<meta charset="utf-8">', head)
dst = os.path.normpath(os.path.join(PROTO, '..', 'v3d', 'index.html')); os.makedirs(os.path.dirname(dst), exist_ok=True)
open(dst, 'w', encoding='utf-8', newline='\n').write(out)
print(os.path.relpath(dst, PROTO))
