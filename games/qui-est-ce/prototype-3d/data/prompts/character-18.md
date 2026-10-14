# Étienne (character-18) — consignes photo

Personnage fictif, 72 ans. Visage : peau claire, rides profondes, sourcils broussailleux. Coiffure : cheveux blancs courts, dégarnis sur les tempes. Pilosité : barbe blanche courte et moustache.

Attributs de jeu : genre = homme, age = senior, cheveux = gris, coupe = court, yeux = marron, lunettes, barbe, moustache.

Accessoires 3D ajoutés plus tard (lunettes) : **jamais sur les photos**.

## Mode d'emploi

1. Ouvrir une **nouvelle conversation** Gemini (génération d'images, gratuite).
2. Coller la consigne 1 (face). Recommencer jusqu'à un visage crédible, neutre, bouche fermée.
3. Dans la **même conversation**, coller les consignes 2 à 5 une par une : la même personne doit être reconnaissable.
4. Enregistrer chaque image en JPEG, pleine résolution, dans `characters/character-18/refs/` sous les noms indiqués (le pipeline en tire un carré central de 1024 px : la tête doit y tenir entière).
5. Lancer `python tools/pipeline/build_character.py character-18`.

Refuser une image si : sourire ou bouche ouverte, accessoire, cheveux coupés par le cadre, fond non uni,
ombre dure, tête penchée, regard ailleurs (vues de face et de trois-quarts), oreille cachée (profils).

## 1. face → `front.jpg`

```text
A fictional 72-year-old man (not a real or famous person), brown eyes, short straight grey hair, a short neat beard and moustache. Details (French): visage peau claire, rides profondes, sourcils broussailleux ; coiffure cheveux blancs courts, dégarnis sur les tempes ; pilosite barbe blanche courte et moustache. Photorealistic studio portrait photograph, square 1:1 format. Plain light grey seamless paper background, no texture, no props. Soft diffused frontal key light with a gentle fill, no hard shadows, no rim light, neutral white balance. Framing: head and top of the shoulders, the top of the head fully inside the frame with a little space above, the face centred. The subject wears a plain charcoal grey crew-neck knit sweater. Neutral relaxed expression, mouth closed, lips together, no smile, eyes open. Natural skin with visible pores, no makeup effect, no retouching, no jewellery, no glasses, no hat, no hair accessory. Sharp focus on the eyes, 85 mm lens look. Pose: facing the camera straight on, head level, looking directly into the lens.
```

## 2. trois-quarts gauche → `three-quarter-left.jpg`

```text
Same person, same sweater, same background, same lighting and same framing as the previous image. Only the pose changes: head turned 45 degrees so that the face points towards the left side of the image, the subject's left ear visible, eyes following the head. Keep the identical face, hair and skin.
```

## 3. trois-quarts droite → `three-quarter-right.jpg`

```text
Same person, same sweater, same background, same lighting and same framing as the previous image. Only the pose changes: head turned 45 degrees so that the face points towards the right side of the image, the subject's right ear visible, eyes following the head. Keep the identical face, hair and skin.
```

## 4. profil gauche → `profile-left.jpg`

```text
Same person, same sweater, same background, same lighting and same framing as the previous image. Only the pose changes: exact side profile, the subject faces to the left of the image, 90 degrees, ear fully visible. Keep the identical face, hair and skin.
```

## 5. profil droit → `profile-right.jpg`

```text
Same person, same sweater, same background, same lighting and same framing as the previous image. Only the pose changes: exact side profile, the subject faces to the right of the image, 90 degrees, ear fully visible. Keep the identical face, hair and skin.
```
