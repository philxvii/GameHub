"""Controle de la distribution des 24 personnages (data/roster.json).

    python tools/pipeline/check_roster.py [data/roster.json]

Verifie : 24 personnages, identifiants uniques ; chaque reponse possible (attribut oui-non
vrai, ou valeur d'un attribut a choix) concerne entre 3 et 12 personnages, jamais un seul ;
aucune paire de personnages indiscernable ; signale les paires qui ne different que par un
attribut (fragiles a l'oeil). Mesure le nombre moyen de questions oui / non pour isoler un
personnage, en posant a chaque fois la question qui coupe le groupe restant le plus pres de
la moitie (strategie gloutonne), et le meme nombre si l'on joue au hasard parmi les
questions utiles. Code de sortie 1 si une regle n'est pas tenue.
"""
import itertools
import json
import os
import random
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
MIN, MAX = 3, 12


def questions(roster):
    """Liste de (libelle, predicat) : une question oui / non par reponse possible."""
    qs = []
    for key, spec in roster['attributs'].items():
        if spec['type'] == 'oui-non':
            qs.append((key, lambda c, k=key: bool(c['attributs'][k])))
        else:
            for v in spec['valeurs']:
                qs.append((f'{key}={v}', lambda c, k=key, v=v: c['attributs'][k] == v))
    return qs


def depth(group, qs, pick, rnd):
    """Nombre de questions pour isoler chaque personnage du groupe (somme)."""
    if len(group) <= 1: return 0
    useful = [q for q in qs if 0 < sum(q[1](c) for c in group) < len(group)]
    if not useful: raise ValueError('indiscernables : ' + ', '.join(c['id'] for c in group))
    q = pick(useful, group, rnd)
    yes = [c for c in group if q[1](c)]
    no = [c for c in group if not q[1](c)]
    return len(group) + depth(yes, qs, pick, rnd) + depth(no, qs, pick, rnd)


def greedy(useful, group, rnd):
    return min(useful, key=lambda q: abs(2 * sum(q[1](c) for c in group) - len(group)))


def at_random(useful, group, rnd):
    return rnd.choice(useful)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(PROTO, 'data', 'roster.json')
    roster = json.load(open(path, encoding='utf-8'))
    chars = roster['personnages']
    errors, warnings = [], []
    if len(chars) != 24: errors.append(f'{len(chars)} personnages au lieu de 24')
    ids = [c['id'] for c in chars]
    if len(set(ids)) != len(ids): errors.append('identifiants en double')

    print('Repartition (personnages par reponse, attendu 3 a 12) :')
    qs = questions(roster)
    for label, pred in qs:
        n = sum(pred(c) for c in chars)
        flag = '' if MIN <= n <= MAX else '  <-- hors bornes'
        if flag: errors.append(f'{label} : {n}')
        print(f'  {label:<26} {n:>2}{flag}')
    for key, spec in roster['attributs'].items():
        if spec['type'] == 'choix':
            allowed = set(spec['valeurs']) | ({None} if spec.get('vide') else set())
            for c in chars:
                if c['attributs'][key] not in allowed: errors.append(f"{c['id']} : {key}={c['attributs'][key]!r} inconnu")
    by_sex = {g: [c for c in chars if c['attributs']['genre'] == g] for g in ('femme', 'homme')}
    print('Genre :', {g: len(v) for g, v in by_sex.items()},
          '| ages :', {a: sum(c['attributs']['age'] == a for c in chars) for a in ('jeune', 'adulte', 'senior')})

    vec = lambda c: tuple(q[1](c) for q in qs)
    for a, b in itertools.combinations(chars, 2):
        d = sum(x != y for x, y in zip(vec(a), vec(b)))
        if d == 0: errors.append(f"indiscernables : {a['id']} et {b['id']}")
        elif d <= 2: warnings.append(f"{a['prenom']} / {b['prenom']} ne different que par {d} reponse(s)")

    try:
        g = depth(chars, qs, greedy, None) / len(chars)
        rnd = random.Random(1)
        r = statistics.mean(depth(chars, qs, at_random, rnd) / len(chars) for _ in range(200))
        print(f'Questions pour isoler un personnage : {g:.2f} en moyenne (strategie gloutonne), '
              f'{r:.2f} (questions utiles au hasard) ; minimum theorique log2(24) = 4,58')
    except ValueError as e:
        errors.append(str(e))
    for w in warnings: print('  attention :', w)
    for e in errors: print('ERREUR :', e)
    print('OK' if not errors else f'{len(errors)} erreur(s)')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
