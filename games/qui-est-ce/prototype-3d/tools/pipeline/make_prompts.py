"""Consignes photo de chaque personnage (data/prompts/<id>.md) a partir de data/roster.json.

    python tools/pipeline/make_prompts.py

Les 5 vues reprennent celles de refs/ (personnage 01) : face, trois-quarts gauche et droite,
profils gauche et droit ; meme fond gris clair uni, meme lumiere de studio douce, meme pull
gris a col rond, cadrage tete et haut des epaules, 1024 x 1024. L'utilisateur colle les
consignes dans Gemini (gratuit), dans l'ordre, dans une seule conversation.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))

VIEWS = [
    ('front', 'face', 'facing the camera straight on, head level, looking directly into the lens'),
    # « gauche » comme dans refs/ : le visage pointe vers la gauche de l'image (oreille gauche du sujet visible).
    ('three-quarter-left', 'trois-quarts gauche', "head turned 45 degrees so that the face points towards the left side of the image, the subject's left ear visible, eyes following the head"),
    ('three-quarter-right', 'trois-quarts droite', "head turned 45 degrees so that the face points towards the right side of the image, the subject's right ear visible, eyes following the head"),
    ('profile-left', 'profil gauche', "exact side profile, the subject faces to the left of the image, 90 degrees, ear fully visible"),
    ('profile-right', 'profil droit', "exact side profile, the subject faces to the right of the image, 90 degrees, ear fully visible"),
]

COMMON = ("Photorealistic studio portrait photograph, square 1:1 format. Plain light grey seamless paper background, "
          "no texture, no props. Soft diffused frontal key light with a gentle fill, no hard shadows, no rim light, "
          "neutral white balance. Framing: head and top of the shoulders, the top of the head fully inside the frame "
          "with a little space above, the face centred. The subject wears a plain charcoal grey crew-neck knit sweater. "
          "Neutral relaxed expression, mouth closed, lips together, no smile, eyes open. Natural skin with visible pores, "
          "no makeup effect, no retouching, no jewellery, no glasses, no hat, no hair accessory. Sharp focus on the eyes, "
          "85 mm lens look.")

EN = {
    'homme': 'man', 'femme': 'woman',
    'noir': 'black', 'brun': 'dark brown', 'blond': 'blond', 'roux': 'red', 'gris': 'grey',
    'marron': 'brown', 'bleu': 'blue', 'vert': 'green',
}


def describe(c):
    a, ap = c['attributs'], c['apparence']
    parts = [f"A fictional {c['age']}-year-old {EN[a['genre']]} (not a real or famous person)",
             f"{EN[a['yeux']]} eyes"]
    if a['coupe'] == 'chauve':
        parts.append('completely bald head')
    else:
        curls = 'curly' if a['cheveux_boucles'] else 'straight'
        length = {'court': 'short', 'mi-long': 'shoulder-length', 'long': 'long'}[a['coupe']]
        parts.append(f"{length} {curls} {EN[a['cheveux']]} hair")
    if a['barbe'] and a['moustache']: parts.append('a short neat beard and moustache')
    elif a['barbe']: parts.append('a short neat beard without a distinct moustache')
    elif a['moustache']: parts.append('a moustache, cheeks and chin clean-shaven')
    elif a['genre'] == 'homme': parts.append('clean-shaven')
    # Details du visage en francais (Gemini les comprend) : teint, traits, coiffure precise.
    details = f"Details (French): visage {ap['visage']} ; coiffure {ap['coiffure']}" + (f" ; pilosite {ap['pilosite']}" if ap['pilosite'] else '')
    return ', '.join(parts) + '. ' + details + '.'


def page(c):
    a, ap = c['attributs'], c['apparence']
    acc = [k for k in ('lunettes', 'chapeau', 'boucles_oreilles') if a[k]]
    lines = [
        f"# {c['prenom']} ({c['id']}) — consignes photo",
        '',
        f"Personnage fictif, {c['age']} ans. Visage : {ap['visage']}. Coiffure : {ap['coiffure']}."
        + (f" Pilosité : {ap['pilosite']}." if ap['pilosite'] else ''),
        '',
        'Attributs de jeu : ' + ', '.join(k.replace('_', ' ') if v is True else f'{k} = {v}' for k, v in a.items() if v not in (False, None)) + '.',
        '',
    ]
    if acc:
        lines += [f"Accessoires 3D ajoutés plus tard ({', '.join(acc).replace('_', ' ')}) : **jamais sur les photos**.", '']
    lines += [
        '## Mode d\'emploi',
        '',
        '1. Ouvrir une **nouvelle conversation** Gemini (génération d\'images, gratuite).',
        '2. Coller la consigne 1 (face). Recommencer jusqu\'à un visage crédible, neutre, bouche fermée.',
        '3. Dans la **même conversation**, coller les consignes 2 à 5 une par une : la même personne doit être reconnaissable.',
        f"4. Enregistrer chaque image en JPEG, pleine résolution, dans `characters/{c['id']}/refs/` sous les noms indiqués"
        " (le pipeline en tire un carré central de 1024 px : la tête doit y tenir entière).",
        f"5. Lancer `python tools/pipeline/build_character.py {c['id']}`.",
        '',
        'Refuser une image si : sourire ou bouche ouverte, accessoire, cheveux coupés par le cadre, fond non uni,',
        'ombre dure, tête penchée, regard ailleurs (vues de face et de trois-quarts), oreille cachée (profils).',
        '',
    ]
    for i, (name, fr, pose) in enumerate(VIEWS, 1):
        if i == 1:
            text = f"{describe(c)} {COMMON} Pose: {pose}."
        else:
            text = (f"Same person, same sweater, same background, same lighting and same framing as the previous image. "
                    f"Only the pose changes: {pose}. Keep the identical face, hair and skin.")
        lines += [f"## {i}. {fr} → `{name}.jpg`", '', '```text', text, '```', '']
    return '\n'.join(lines)


def main():
    roster = json.load(open(os.path.join(PROTO, 'data', 'roster.json'), encoding='utf-8'))
    out = os.path.join(PROTO, 'data', 'prompts')
    os.makedirs(out, exist_ok=True)
    for c in roster['personnages']:
        with open(os.path.join(out, c['id'] + '.md'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(page(c))
    print(f"{len(roster['personnages'])} fiches dans {os.path.relpath(out, PROTO)}")


if __name__ == '__main__':
    main()
