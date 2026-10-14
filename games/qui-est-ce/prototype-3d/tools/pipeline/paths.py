"""Chemins d'un personnage, partages par les scripts du pipeline.

Chaque script accepte `--id <personnage>` (defaut : character-01), retire de sys.argv par
take_id() avant de lire ses autres arguments : l'usage sans --id ne change pas.

character-01 garde ses chemins historiques (refs/, build/, build-ict/, models/) ; les autres
personnages vivent dans characters/<id>/refs/, build/<id>/ et models/<id>/.
"""
import os
import sys
from types import SimpleNamespace

PROTO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
DEFAULT = 'character-01'
ICT_SHARED = os.path.join(PROTO, 'build-ict')            # ict.npz : modele ICT commun a tous


def take_id(argv=None):
    """Retire `--id X` (ou `--id=X`) de argv (sys.argv par defaut) et renvoie X."""
    argv = sys.argv if argv is None else argv
    for i, a in enumerate(argv):
        if a == '--id':
            if i + 1 >= len(argv): raise SystemExit('--id sans valeur')
            cid = argv[i + 1]; del argv[i:i + 2]; return cid
        if a.startswith('--id='):
            del argv[i]; return a.split('=', 1)[1]
    return DEFAULT


def paths(cid=DEFAULT):
    if cid == DEFAULT:
        return SimpleNamespace(
            id=cid, refs=os.path.join(PROTO, 'refs'), refs_mv=os.path.join(PROTO, 'refs', 'mv'),
            build=os.path.join(PROTO, 'build'), ict=ICT_SHARED, fit=ICT_SHARED,
            models=os.path.join(PROTO, 'models'),
            hunyuan=os.path.join(PROTO, 'models', 'hunyuan2mv-3views-shape.glb'),
            glb=os.path.join(PROTO, 'models', 'character-01-ict.glb'),
            hair=os.path.join(PROTO, 'models', 'hair'), hair_url='models/hair/')
    refs = os.path.join(PROTO, 'characters', cid, 'refs')
    build = os.path.join(PROTO, 'build', cid)
    models = os.path.join(PROTO, 'models', cid)
    return SimpleNamespace(
        id=cid, refs=refs, refs_mv=os.path.join(refs, 'mv'),
        build=build, ict=ICT_SHARED, fit=os.path.join(build, 'ict'),
        models=models, hunyuan=os.path.join(models, 'hunyuan2mv-shape.glb'),
        glb=os.path.join(models, f'{cid}-ict.glb'),
        hair=os.path.join(models, 'hair'), hair_url=f'models/{cid}/hair/')
