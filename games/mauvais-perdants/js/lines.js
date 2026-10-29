// Répliques locales de Gonzague Stentor, présentateur de « Mauvais Perdants ».
// Toujours disponibles, sans réseau : l'IA (si elle répond à temps) ne fait que
// remplacer une réplique déjà affichée.
//
// Personnage : vedette de plateau persuadée d'être la raison pour laquelle le public
// regarde. Vouvoie le public, tutoie les candidats. Arrogant, théâtral, jaloux du
// talent des autres, ravi de leurs échecs. Il juge les COUPS : lenteur, erreurs,
// excès de confiance, réponses absurdes, chutes au classement. Jamais l'identité, le
// corps, l'origine, le genre, la religion, l'orientation ou le handicap de personne.
// Formulations neutres : le jeu ignore le genre des joueurs (« à la dernière place », pas
// « dernier »). Le présentateur, lui, parle de lui au masculin.
//
// Chaque réplique : c => texte | null (null = ne s'applique pas à ce contexte).
// Drapeaux : h = « Sans pitié » seulement, s = « Pièces rapportées » seulement,
// x = grossièretés (option explicite du salon). Sans drapeau : les deux intensités.

const L = (fn, flags = '') => ({ fn, flags });

export const LINES = {
  welcome: [
    L(c => `Bonsoir, je suis Gonzague Stentor, et ce soir, comme tous les soirs, je suis la meilleure chose qui vous soit arrivée.`),
    L(c => `${c.n} candidats, cinq manches, zéro excuse. Le tableau d'affichage est prêt à vous juger. Moi aussi.`),
    L(c => `Bonsoir, bonsoir. ${c.n} candidats ce soir. J'ai vu les dossiers : je suggère qu'on baisse un peu les attentes.`),
    L(c => `Bienvenue dans Mauvais Perdants, l'émission qui fabrique des mauvais perdants. Le classement ne pardonne rien, et moi encore moins.`),
    L(c => `${c.n} candidats. Statistiquement, l'un d'entre vous va gagner. Les autres vont apprendre l'humilité en direct.`),
    L(c => `Installez-vous. Cinq manches, un seul vainqueur, et beaucoup de choses que vous regretterez d'avoir dites avant.`),
    L(c => `Mesdames et messieurs, voici ce soir… ce qu'on avait sous la main. Applaudissez quand même, c'est gratuit.`, 'h'),
    L(c => `Je vois des visages pleins d'espoir. C'est mignon. On va arranger ça en cinq manches.`, 'h'),
    L(c => `Bonsoir à tous ! Je promets d'être juste. Juste méchant, mais juste.`, 's'),
    L(c => `Cinq manches pour briller. Ou pour vous ridiculiser avec constance. Les deux font de l'audience.`),
  ],
  solo_welcome: [
    L(c => `${c.P}, seul face à moi. Cinq manches, et à chaque fois mon score à battre. Je joue très bien. Surtout contre les autres.`),
    L(c => `Un duel, ${c.P} ? Contre Gonzague Stentor ? J'admire le courage. Je doute du reste.`),
    L(c => `Entraînement privé avec le maître. ${c.P}, prends des notes : je ne répéterai pas.`, 's'),
    L(c => `Personne n'a voulu jouer avec toi, ${c.P} ? Ne t'en fais pas, moi, je suis payé pour.`, 'h'),
  ],
  solo_win: [
    L(c => `${c.P} fait ${c.label}, mieux que mes ${c.ref}. Je conteste. Pour la forme.`),
    L(c => `${c.label}. Tu m'as battu, ${c.P}. J'étais distrait par ma propre élégance.`),
    L(c => `${c.P} passe devant moi avec ${c.label}. Le chronomètre doit être mal réglé.`, 'h'),
    L(c => `Bravo, ${c.label} contre mes ${c.ref}. Ne le répète à personne.`),
  ],
  solo_lose: [
    L(c => `${c.label} pour toi, ${c.ref} pour moi. ${c.P}, la hiérarchie est respectée.`),
    L(c => `${c.P} fait ${c.label}. Moi, ${c.ref}. Tu t'entraînes, c'est bien. Continue. Longtemps.`),
    L(c => `${c.label} ? J'ai fait ${c.ref} en racontant une anecdote. ${c.P}, c'est vexant pour toi.`, 'h'),
    L(c => `Raté, ${c.P} : ${c.label} contre ${c.ref}. Recommence, je ne me lasse pas de gagner.`),
  ],
  solo_tie: [
    L(c => `Égalité, ${c.P}. Toi et moi au même niveau. C'est la chose la plus flatteuse qui te soit arrivée.`),
  ],
  solo_absent: [
    L(c => `${c.P} n'a rien joué. Victoire par forfait pour moi. Je la prends quand même.`),
  ],
  solo_final_win: [
    L(c => `${c.P} me bat, ${c.total} points contre ${c.gtotal}. Je demande une revanche. Immédiatement.`),
    L(c => `${c.total} à ${c.gtotal}. ${c.P}, tu es prêt pour de vrais adversaires. Enfin, presque.`),
  ],
  solo_final_lose: [
    L(c => `${c.gtotal} à ${c.total}, Gonzague l'emporte. ${c.P}, l'entraînement continue. La revanche est à un clic.`),
    L(c => `Je gagne ${c.gtotal} à ${c.total}. ${c.P}, ne le prends pas mal : je gagne contre tout le monde.`),
  ],
  lobby: [
    L(c => `Salon ouvert. J'attends des candidats. Des vrais, si possible.`),
    L(c => `Bienvenue dans les coulisses. Partagez le code, et préparez vos excuses.`),
    L(c => `Le plateau est prêt, les projecteurs chauffent. Il ne manque que des gens à humilier.`, 'h'),
  ],
  lobby_join: [
    L(c => `${c.P} arrive. Un candidat de plus, une victime de plus.`, 'h'),
    L(c => `${c.P} nous rejoint. Bienvenue. Profite, c'est le seul moment sans classement.`),
    L(c => `Voici ${c.P}. Pas encore de score, donc pas encore de honte. Profite.`),
    L(c => `${c.P} entre en scène. Le niveau moyen du salon vient de bouger. Je ne dirai pas dans quel sens.`),
    L(c => c.n >= 4 && `${c.P} complète la troupe : ${c.n} candidats. Ça va saigner.`),
  ],
  rematch: [
    L(c => `Une revanche ? Évidemment. Personne ne quitte mon plateau sur une humiliation pareille. Enfin, presque personne.`),
    L(c => `On efface tout et on recommence. Sauf ma mémoire. Ma mémoire, elle, garde tout.`),
    L(c => c.champ && `${c.champ}, ton titre est remis en jeu. Profite de ces dernières secondes de gloire.`),
    L(c => c.last && `${c.last} réclame une revanche. Quel courage. Ou quelle mémoire courte.`, 'h'),
    L(c => `Nouveau tirage, nouvelles manches, mêmes candidats. Ça s'appelle l'acharnement, et j'adore ça.`),
  ],
  intro: [
    L(c => `Manche ${c.no} : ${c.title}. ${c.hint}`),
    L(c => `Manche ${c.no}, ${c.title}. Lisez les règles : elles sont courtes, même pour vous.`),
    L(c => c.leader && `Manche ${c.no}, ${c.title}. ${c.leader} est en tête, et je trouve ça franchement suspect.`),
    L(c => c.last && c.no > 1 && `${c.title}. ${c.last}, c'est peut-être ta manche. Je dis ça pour être gentil, je n'y crois pas.`, 'h'),
  ],
  intro_final: [
    L(c => `Dernière manche, ${c.title}. Points DOUBLÉS. Tout le monde peut encore gagner, ou perdre avec panache.`),
    L(c => `${c.title}, manche décisive : chaque place vaut double. C'est maintenant qu'on découvre qui avait du cran.`),
    L(c => c.leader && `Dernière manche, points doublés. ${c.leader}, ton avance vient de devenir très fragile. Savoure.`, 'h'),
  ],
  intro_game: [
    L(c => c.g === 'gong' && `Le Gong. Un panneau, un doigt, et votre dignité suspendue à quelques millisecondes.`),
    L(c => c.g === 'gong' && `Le Gong. Celui qui touche avant le vert sera publiquement humilié. Par moi.`),
    L(c => c.g === 'tir' && `Le Stand de tir. Vingt cibles. Elles ne bougent pas, elles. Vous n'avez aucune excuse.`),
    L(c => c.g === 'tir' && `Stand de tir. Visez bien : chaque tir à côté, je le compte, et je m'en souviendrai.`),
    L(c => c.g === 'dictee' && `La Dictée. Une phrase, un clavier. Ceux qui tapent avec deux doigts, c'est le moment de prier.`),
    L(c => c.g === 'chemin' && `Le Chemin. Des cases s'allument, vous les répétez. Un poisson rouge y arrive. Prouvez-le.`),
    L(c => c.g === 'chemin' && `Le Chemin. Une erreur et c'est terminé. Comme votre carrière, si vous en aviez une sur ce plateau.`, 'h'),
    L(c => c.g === 'numeros' && `Les Numéros. Retenez où ils sont avant qu'ils disparaissent. C'est simple. Enfin, pour moi.`),
    L(c => c.g === 'damier' && `Le Damier. Une seconde pour mémoriser, une éternité pour regretter.`),
    L(c => c.g === 'coffre' && `Le Coffre. Un nombre, une seconde, et votre mémoire face à son pire ennemi : vous.`),
    L(c => c.g === 'dejavu' && `Déjà vu ? Des mots défilent. Vous les avez vus ou pas ? Ça paraît facile. Ça ne l'est pas.`),
    L(c => c.g === 'bac' && `Le Petit Bac. Une lettre, quatre cases. Le correcteur est impitoyable, et moi je lis tout à voix haute.`),
    L(c => c.g === 'bac' && `Le Petit Bac. Je vous préviens : « truc » n'est pas un animal, et « machin » n'est pas un pays.`),
    L(c => c.g === 'calcul' && `Calcul express. Des opérations de primaire. Je répète : de primaire. Ne me décevez pas.`),
    L(c => c.g === 'calcul' && `Calcul express. Une erreur coûte un point. Taper au hasard, c'est payer pour perdre.`),
    L(c => c.g === 'nuage' && `Le Nuage. Combien de points ? Personne ne compte, tout le monde ment. Approchez-vous de la vérité.`),
    L(c => c.g === 'prix' && `L'Étiquette. Combien ça coûte ? Vous allez découvrir que vous ne faites jamais vos courses.`),
    L(c => c.g === 'encre' && `L'Encre. Le mot dit une chose, la couleur en dit une autre. Comme vous, en fait.`),
    L(c => c.g === 'chrono' && `Le Chrono caché. Vous prétendez avoir le sens du temps. Vous êtes en retard à tout.`),
    L(c => c.g === 'intrus' && `L'Intrus. Un seul signe n'est pas comme les autres. Vous le reconnaîtrez : c'est le seul qui ne vous ressemble pas.`),
    L(c => c.g === 'anagramme' && `Le Mot brouillé. Des lettres en vrac, comme vos arguments. Remettez-les en ordre.`),
    L(c => c.g === 'metronome' && `Le Métronome. Quatre battements, puis le silence. Tenez le rythme. Je sais, c'est dur sans moi pour vous guider.`),
  ],
  round_win: [
    L(c => `${c.P} gagne la manche. Je note, je souligne, et je fais semblant de ne pas être impressionné.`),
    L(c => `${c.P}, en tête avec ${c.label}. Ne t'habitue pas, le public n'aime pas les favoris.`, 'h'),
    L(c => `${c.P} remporte la manche, ${c.label}. Je suis jaloux et je le vis très mal.`),
    L(c => `${c.P} gagne avec ${c.label}. Je n'applaudis pas, mais intérieurement, je m'incline légèrement.`),
    L(c => `Victoire de ${c.P}. Ça n'arrivera sans doute plus, alors prenez une photo.`, 'h'),
    L(c => `${c.P} en tête de manche avec ${c.label}. Les autres, vous avez vu comment on fait ? Non ? Ça se voit.`),
    L(c => `${c.P}, ${c.label}. Pas mal. Pas mal du tout. Je déteste ça.`, 's'),
    L(c => c.streak >= 2 && `${c.P} gagne encore. ${c.streak} manches d'affilée. À ce stade, c'est de l'acharnement contre ses amis.`),
    L(c => c.wasLast && `${c.P}, dernière place la manche d'avant, première maintenant. Personne ne l'avait vu venir, surtout pas ${c.P}.`),
  ],
  round_last: [
    L(c => `${c.P}, ${c.label}. Ce n'est pas une contre-performance, c'est une signature.`),
    L(c => `Dernière place pour ${c.P}. Un cri dans le public. C'était moi. De joie.`, 'h'),
    L(c => `${c.P} finit à la dernière place. Le régisseur me demande si on peut refaire la prise. J'ai dit non, c'était parfait.`),
    L(c => `${c.P} termine à la dernière place, ${c.label}. Une performance à montrer dans les écoles. Comme contre-exemple.`),
    L(c => `${c.P}, dernière place avec ${c.label}. Tu as raté l'objectif avec une constance remarquable.`),
    L(c => `${c.P} ferme la marche. Quelqu'un devait s'y coller, et tu t'y es collé avec cœur. Merci pour ce sacrifice.`, 's'),
    L(c => `${c.P}, ${c.label}. J'ai vu des plantes vertes plus compétitives, et elles n'avaient pas de doigts.`, 'h'),
    L(c => `Dernière place : ${c.P}. Je ne vais pas me moquer. Non, je plaisante, évidemment que je vais me moquer.`, 'h'),
    L(c => `${c.P}, à la dernière place. C'était tellement mauvais que j'ai cru à une stratégie. Ce n'en était pas une.`, 'h'),
    L(c => c.again && `${c.P}, encore à la dernière place. À ce rythme, on va te la réserver, avec ton nom dessus.`),
    L(c => `${c.P}, dernière place. Putain, même le régisseur a détourné les yeux.`, 'hx'),
    L(c => `${c.P} en dernière place. Bon. Ça arrive. Deux fois de suite, ça commencerait à faire une habitude.`, 's'),
  ],
  gong_last: [
    L(c => `${c.P}, ${c.label} de moyenne. Tu as réagi si lentement que j'ai eu le temps de vieillir pendant ton tour.`),
    L(c => `${c.P} : ${c.label}. Le signal est passé, a pris un café, et tu n'avais toujours pas bougé.`, 'h'),
    L(c => c.falses >= 2 && `${c.P}, ${c.falses} faux départs. L'impatience, c'est bien. Attendre le signal, c'est mieux.`),
  ],
  gong_win: [
    L(c => `${c.P}, ${c.label} de moyenne. Ce n'est plus un réflexe, c'est de l'anticipation légale.`),
    L(c => c.best && c.best < 230 && `${c.P} a sorti un ${c.best} ms sur un signal. Je soupçonne un pacte avec l'électricité.`),
  ],
  tir_last: [
    L(c => c.miss >= 5 && `${c.P}, ${c.miss} tirs à côté. Les cibles sont en sécurité avec toi, c'est déjà ça.`),
    L(c => `${c.P}, ${c.label}. Chaque cible a eu le temps de se demander si tu allais venir.`, 'h'),
  ],
  tir_win: [
    L(c => c.miss === 0 && `${c.P}, zéro tir raté. Chirurgical. Je n'aime pas les chirurgiens, ils me rappellent mes factures.`),
  ],
  dictee_last: [
    L(c => `${c.P}, ${c.label}. Tu tapes comme on écrit une lettre de démission : lentement, avec regret.`),
    L(c => !c.done && `${c.P} n'a même pas fini la phrase. Elle faisait une ligne. Une seule.`, 'h'),
  ],
  memory_last: [
    L(c => `${c.P}, ${c.label}. La mémoire, c'est comme un muscle. Le tien est en arrêt maladie.`),
    L(c => `${c.P}, ${c.label}. Ta mémoire a la capacité d'un ticket de caisse.`, 'h'),
    L(c => `${c.P} s'arrête à ${c.label}. On retiendra surtout que tu n'as rien retenu.`),
    L(c => `${c.P}, ${c.label}. Ce n'est pas un trou de mémoire, c'est un chantier.`, 'h'),
  ],
  memory_win: [
    L(c => `${c.P}, ${c.label}. Une mémoire pareille, c'est presque inquiétant. Je surveillerai ce que tu racontes sur moi.`),
  ],
  coffre_fail: [
    L(c => c.want && c.got !== null && `${c.P} a tapé ${c.got || 'rien du tout'} au lieu de ${c.want}. C'est un code, pas une suggestion.`),
  ],
  calcul_last: [
    L(c => c.bad >= 3 && `${c.P}, ${c.bad} réponses fausses. Tu as inventé des mathématiques, mais personne ne les a validées.`),
    L(c => `${c.P}, ${c.label}. La calculatrice de ton téléphone a honte pour toi.`, 'h'),
  ],
  nuage_last: [
    L(c => `${c.P}, ${c.label}. Tu n'as pas compté les points, tu leur as donné un ordre de grandeur, et encore.`),
  ],
  bac_last: [
    L(c => `${c.P}, ${c.label} au Petit Bac. Une lettre, quatre cases, et toi qui regardes l'écran comme une porte fermée.`),
  ],
  tiny_gap: [
    L(c => `${c.A} devant ${c.B} d'un rien : ${c.gap}. Je n'ai pas vu la différence, mais le tableau, si.`),
    L(c => `${c.gap} entre ${c.A} et ${c.B}. Un cheveu. Et ce cheveu, ${c.B}, va te hanter.`, 'h'),
    L(c => `${c.A} et ${c.B} séparés par ${c.gap}. Je sens une rancune naître en direct.`),
  ],
  tie: [
    L(c => `${c.A} et ${c.B} à égalité parfaite. Partagez les points, pas les rancunes.`),
    L(c => `Égalité entre ${c.A} et ${c.B}. Le tableau refuse de choisir. Moi, je choisis : vous êtes aussi moyens l'un que l'autre.`, 'h'),
  ],
  boast_fail: [
    L(c => `${c.P} avait annoncé « Facile ». ${c.rank}e place. Tu avais promis du génie ; nous avons surtout assisté à une démonstration.`),
    L(c => `${c.P} a fanfaronné et finit à la ${c.rank}e place. Moins trois points. La modestie aurait coûté moins cher.`),
    L(c => `« Facile », disait ${c.P}. Je propose qu'on encadre cette phrase à côté du classement.`, 'h'),
    L(c => `${c.P} a fait le malin et le paie : moins trois. Bordel, quelle chute.`, 'hx'),
  ],
  boast_win: [
    L(c => `${c.P} avait dit « Facile », et c'était facile. Plus trois. Je déteste quand les arrogants ont raison, ça me fait de la concurrence.`),
    L(c => `${c.P} annonce, ${c.P} gagne. Plus trois points. Je retire tout ce que je n'ai pas encore dit.`),
  ],
  absent: [
    L(c => `${c.P} n'a rien envoyé. Le chrono, lui, est passé sans t'attendre.`),
    L(c => `${c.P} n'a rien joué. Zéro point. Une stratégie audacieuse : ne pas jouer pour ne pas perdre. Ça ne marche pas.`),
    L(c => `Pas de réponse de ${c.P}. On espère que tout va bien. Le classement, lui, ne s'inquiète pas.`, 's'),
  ],
  exploit: [
    L(c => `Attention. ${c.P}, ${c.label}. C'est le genre de score qu'on regarde deux fois. Je l'ai regardé trois fois. Il est vrai.`),
    L(c => `${c.P}, ${c.label}. Je suis censé détester tout le monde, mais là, chapeau.`),
  ],
  leader_change: [
    L(c => `Nouveau leader : ${c.P}. ${c.O}, on t'a vu en tête. On t'a vu. C'était bien. C'est fini.`),
    L(c => `${c.P} prend la tête ! ${c.O} vient de perdre sa place, et franchement, ça lui va bien.`),
    L(c => `Changement en tête : ${c.P} passe devant ${c.O}. Le classement vient d'assister à une tentative d'assassinat.`),
    L(c => `${c.O} était en tête. Était. ${c.P} a pris le trône, et ce n'était pas du vol, c'était du talent.`),
    L(c => `${c.O}, tu viens de perdre la première place. Garde ton calme. Ou ne le garde pas, c'est meilleur pour l'audience.`, 'h'),
  ],
  leader_holds: [
    L(c => `${c.P} garde la tête. Personne ne lui conteste rien. C'est presque triste pour les autres.`),
    L(c => `${c.P} reste en tête avec ${c.total} points. Les autres, il serait temps de vous réveiller.`),
    L(c => c.gap >= 10 && `${c.P} a ${c.gap} points d'avance. À ce stade, ce n'est plus une course, c'est une promenade.`),
    L(c => c.gap <= 2 && `${c.P} en tête, mais de ${c.gap} point${c.gap > 1 ? 's' : ''}. Autant dire rien du tout.`),
  ],
  comeback: [
    L(c => `${c.P} remonte de la ${c.from}e à la ${c.to}e place. Incroyable remontée. J'ai cru à un bug, c'était du jeu.`),
    L(c => `${c.P}, ${c.from}e il y a une manche, ${c.to}e maintenant. Les autres, regardez derrière vous.`),
  ],
  drop: [
    L(c => `${c.P} dégringole de la ${c.from}e à la ${c.to}e place. Une chute libre, sans parachute ni talent.`, 'h'),
    L(c => `${c.P} perd ${c.to - c.from} places. Ce n'est pas grave. Si, un peu.`, 's'),
  ],
  before_final: [
    L(c => `Avant la dernière manche, ${c.P} mène avec ${c.total} points. Points doublés au prochain tour : tout peut encore basculer.`),
    L(c => c.gap <= 8 && `${c.gap} points séparent ${c.P} de ${c.O}. La dernière manche vaut double. Vous sentez cette odeur ? C'est la panique.`),
  ],
  bac_weird: [
    L(c => `${c.P} propose « ${c.answer} » en ${c.cat}. Le jury a refusé. Moi, j'ai ri, puis j'ai eu de la peine.`),
    L(c => `« ${c.answer} » pour ${c.cat}. ${c.P}, j'ai relu trois fois et je ne comprends toujours pas.`, 'h'),
    L(c => `${c.P} tente « ${c.answer} ». Audacieux. Faux, mais audacieux.`),
  ],
  bac_bold: [
    L(c => `Personne d'autre n'a trouvé « ${c.answer} ». Validé : dix points pour ${c.P}, et mon admiration, ce qui est plus rare.`),
    L(c => `« ${c.answer} », validé, et personne d'autre n'y a pensé. ${c.P}, tu vas finir par me faire de l'ombre.`),
  ],
  final_win: [
    L(c => `${c.P} remporte le titre ce soir, ${c.total} points. Applaudissez. Pas trop fort, ça monterait à la tête.`),
    L(c => `${c.P} remporte le tournoi avec ${c.total} points. Félicitations. Les autres, vous avez maintenant le droit officiel d'être de mauvais perdants.`),
    L(c => `Victoire de ${c.P}, ${c.total} points. Je suis heureux pour toi. Non. Mais c'est mérité.`),
    L(c => c.gap >= 15 && `${c.P} gagne avec ${c.gap} points d'avance. Ce n'était pas un tournoi, c'était une démonstration.`),
    L(c => c.gap <= 3 && `${c.P} gagne de ${c.gap} point${c.gap > 1 ? 's' : ''}. Un souffle. ${c.O}, tu vas y repenser en te brossant les dents.`),
    L(c => c.shared && `Victoire partagée entre ${c.P}. Égalité parfaite, même au départage. Vous me décevez ensemble.`),
  ],
  final_last: [
    L(c => `Et en dernière place, ${c.P}. Je ne dirai rien. Le tableau parle à ma place, et il est cruel.`),
    L(c => `${c.P} termine à la dernière place. Une revanche s'impose, ne serait-ce que pour la dignité.`),
    L(c => `${c.P}, dernière place du tournoi. C'est honteux. Magnifiquement honteux.`, 'h'),
    L(c => `${c.P} finit à la dernière place. Pas de panique : la revanche est à un clic. L'humiliation aussi.`, 's'),
  ],
  tiebreak: [
    L(c => `Égalité en tête entre ${c.names}. Personne ne repart ex æquo de mon plateau : départage, et vite.`),
    L(c => `${c.names} à égalité parfaite. C'est d'un ennui. Une dernière épreuve, et que le meilleur gagne.`),
    L(c => `Mort subite ! ${c.names}, une épreuve, quelques secondes, et toute la gloire au bout.`),
  ],
  judging: [
    L(() => `Les réponses sont verrouillées. Le correcteur relit tout, sans pitié et sans favoritisme. Comme moi, mais en mieux élevé.`),
    L(() => `Correction en cours. Si vous avez écrit n'importe quoi, c'est le moment de prier.`),
  ],
  jury: [
    L(() => `Le correcteur ne répond pas. Pas grave : c'est vous le jury. Refusez ce qui ne tient pas debout, soyez honnêtes.`),
    L(() => `Le correcteur a pris sa pause. Vous jugez entre vous, et je vous regarde. Il faut deux refus pour faire tomber une réponse.`),
    L(() => `Pas de correcteur ce soir : la justice est entre vos mains. Ça va mal se passer, et j'ai hâte.`),
  ],
  vote: [
    L(() => `Quelques réponses font débat. Votez. Il faut au moins deux refus, et la majorité, pour en faire tomber une.`),
    L(() => `Le correcteur hésite. Moi jamais, mais on ne me demande pas mon avis. À vous de trancher.`),
    L(() => `Réponses douteuses à l'écran. Votez avec honnêteté. Ou avec rancune, c'est votre affaire.`),
  ],
};

// Mots crus : seulement si le salon a coché l'option. Sinon, toute réplique « x » est écartée.
export function pickLine(type, ctx, { roast = 'soft', crude = false, used = [] } = {}, random = Math.random) {
  const list = LINES[type];
  if (!list) return null;
  const hard = roast === 'hard';
  const candidates = [];
  list.forEach((line, k) => {
    const f = line.flags;
    if (f.includes('h') && !hard) return;
    if (f.includes('s') && hard) return;
    if (f.includes('x') && !crude) return;
    let text = null;
    try { text = line.fn(ctx); } catch (_) { text = null; }
    if (!text) return;
    candidates.push({ id: `${type}.${k}`, text, w: (f.includes('x') ? 1.5 : 1) * (f.includes('h') || f.includes('s') ? 1.3 : 1) });
  });
  if (!candidates.length) return null;
  const fresh = candidates.filter(c => !used.includes(c.id));
  const pool = fresh.length ? fresh : candidates;
  const total = pool.reduce((a, c) => a + c.w, 0);
  let x = random() * total;
  for (const c of pool) { x -= c.w; if (x <= 0) return { id: c.id, text: c.text }; }
  return { id: pool[pool.length - 1].id, text: pool[pool.length - 1].text };
}
