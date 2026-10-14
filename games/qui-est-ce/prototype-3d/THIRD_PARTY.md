# Données et bibliothèques tierces du prototype

| Fichier | Origine | Licence |
| --- | --- | --- |
| `build-ict/ict.npz` | dérivé du modèle « ICT Face Model Light » d'[ICT-FaceKit](https://github.com/USC-ICT/ICT-FaceKit) (USC Institute for Creative Technologies), converti par `tools/character-ict/prepare.py` | MIT (voir le dépôt d'origine) |
| `tools/models/face_landmarker.task` | [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) (Google) | Apache 2.0 |
| Three.js r186 (chargé depuis jsdelivr, non copié) | [three.js](https://github.com/mrdoob/three.js) | MIT |
| `meshoptimizer` (installé dans `build/tools/`, non versionné) | [meshoptimizer](https://github.com/zeux/meshoptimizer) (Arseny Kapoulkine) | MIT |

Les photos de `refs/` représentent un personnage fictif généré par IA pour ce projet.
Les maillages de `models/` sont produits par les scripts de `tools/` à partir de ces données.
