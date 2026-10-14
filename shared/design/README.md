# Base de design de GameHub

Langage visuel du hub (`index.html`, V3, octobre 2026), à reprendre pour l'admin et
l'enveloppe des jeux. Rien n'est importé d'ici : le hub reste un fichier autonome.

## Direction : épuré, les affiches pour seule couleur

Le hub est une page claire et calme : une marque discrète, une question, des filtres
en texte, et neuf affiches de jeu posées sur un fond neutre, chacune suivie de sa
légende (nom, nombre de joueurs). Rien d'autre ne porte de couleur : ce sont les jeux
qui donnent l'énergie. La distribution des cartes à l'ouverture reste la signature,
en plus sobre.

Historique : V1 noir et or, V2 graphite et carton (jugée fade), V3 table bleu nuit
en perspective (vivante, mais chargée). Trois pistes V3 et la comparaison
typographique sont dans `.design-shots/v3-explorations/`. Pour la V4, un fond clair
et un fond sombre ont été comparés (`v4-light-desktop.png`, `v4-dark-desktop.png`) :
le clair a été retenu, plus épuré, et la V1 avait été jugée trop sombre.

## Couleurs

| Rôle | Valeur | Usage |
| --- | --- | --- |
| `--bg` | `#F5F6F8` | fond, gris neutre (pas beige) |
| `--surface` / `--surface2` | `#FFFFFF` / `#EDEFF3` | panneaux, admin |
| `--text` | `#0E1016` | texte, filtre actif, boutons principaux |
| `--muted` | `#686D79` | texte secondaire |
| `--brand` | `#FF5A3C` | un seul point : le point central du dé du logo |
| `--focus` | `#2F5BE3` | focus clavier |
| `--back` | `#111318` | dos des cartes |

Chaque carte porte la couleur de son jeu (`--c`), utilisée seulement pour le voile
de transition vers le jeu.

## Typographie

**Instrument Sans**, une seule famille : 600 pour la marque, le titre et les noms,
400–500 pour le reste. Titre `clamp(34px, 3.4vw, 50px)` serré (−0,04 em), noms des
jeux 17 px, joueurs 13,5 px.

## Cartes

`a.game-card` (lien réel, `class="game-card" href=…` lu par `tools/check-links.js`)
> `.media` (`.shade` ombre, `.c3d` > `.front` [affiche + `.cap` (`.name`, `.players`)
+ `.glint`] et `.back` dos).

- L'affiche remplit la carte (3:4, coins de 24 px, ombre profonde) ; le nom et le
  nombre de joueurs sont posés dessus, sur un fondu sombre. Taille du nom liée à la
  largeur de la carte (requête de conteneur) : toujours sur une ligne.
- Desktop 5 par rangée (5 + 4, rangée incomplète centrée), tablette 3, mobile 2
  colonnes avec Banqueroll en large. Les neuf cartes tiennent en 1440 × 900.

## Affiches

`games/<jeu>/cover.webp`, 720 × 960 (3:4), 30 à 70 Ko (450 Ko les neuf). Générées
avec Gemini (modèle Pro, outil « Créer une image ») et validées une à une par
l'utilisateur, en octobre 2026. Sources en pleine taille (1792 × 2400) sur la machine
de travail, hors dépôt.

Style commun, à garder pour toute nouvelle affiche : nature morte cinématographique
et photoréaliste, un objet du jeu sur une vieille table en bois sombre, fond très
sombre, un projecteur en haut à gauche dont le faisceau traverse une légère fumée,
sujet gros dans le cadre, relief fin, aucune lettre ni logo. Coller une affiche
validée dans Gemini comme référence (« même style que cette image ») ; ne jamais
citer de nom de marque dans la consigne (Gemini échoue). Recadrage centré en 3:4,
puis WebP qualité 84.

## Mode sombre

Bouton soleil/lune dans l'en-tête. Par défaut, le réglage de l'appareil
(`prefers-color-scheme`) ; le choix est mémorisé (`localStorage`, clé `gh-theme`) et
posé avant le premier affichage. Sombre : `--bg #0D0B12` (noir légèrement violet),
`--surface #17141F`, texte `#F3F1F7`, `--muted #9A95A8` ; les cartes gagnent un
liseré clair très discret pour se détacher.

## Mouvement

| Séquence | Durée | Détail |
| --- | --- | --- |
| Ouverture | ~2 s | en-tête en fondu ; paquet face cachée ; chaque carte décolle en arc, se retourne en vol, se pose avec un léger dépassement ; l'affiche arrive dans le noir et s'allume comme sous un projecteur, avec un reflet qui la traverse |
| Survol | 0,4 s | la carte monte, s'incline sous le pointeur, reflet qui suit la souris |
| Filtre | 0,38 s | les jeux écartés s'effacent, rien ne bouge |
| Tirage | ~1,6 s | retournement, mélange, une carte revient avec un liseré, les autres s'effacent |
| Vers un jeu | 1,15 s | la page s'efface, la carte gagne le centre en grandissant, fait un tour complet (on voit son dos au dé), s'avance, fondu au noir |

Cartes cliquables pendant toute l'ouverture. Ctrl, Maj, clic du milieu :
comportement natif. Retour arrière : page intacte. `prefers-reduced-motion` : aucune
de ces animations, tirage immédiat.

## Contrats conservés

Liens `games/<jeu>/`, `id="card-<id>"`, masquage par `hub/hidden` (appliqué à tout
élément `data-game`), vérification d'âge (`hub/settings/ageGate`,
`sessionStorage.age_ok`), présence `hub/online`, compteur `hub/stats/visits`, admin
Google (`shared/firebase.js`) et son panneau.
