// Repliques locales du presentateur : toujours disponibles, sans reseau.
// Fonctions pures. Chaque replique recoit un contexte et renvoie un texte,
// ou null quand elle ne s'applique pas (ex. pas de citation a ressortir).
//
// Ton : le roasteur sans pitie. Sec, mechant, insultant pour faire rager (clown,
// pigeon, mytho, cheh...), une punchline plutot que des mots d'ado. Il vise les
// CHOIX, le hasard et ce que les joueurs ont ecrit. Jamais d'insulte raciste,
// homophobe, sexiste ou validiste, rien de sexuel. Formulations neutres : le jeu
// ignore le genre. Il ne dit pas aux joueurs de jouer : le chrono s'en charge.

import { de } from './board.js';

const $ = n => `${Math.abs(Math.round(n)).toLocaleString('fr-FR')} $`;
const q = s => `« ${s} »`;
const cash = n => `${n < 0 ? '−' : ''}${$(n)}`;   // solde : garde le signe moins

export const LINES = {
  rent: [
    c => c.intensity >= 2 && `${c.P} avait ${$(c.before)}. ${c.city} vient d’en prendre ${$(c.amt)}. T’es pas un joueur, t’es une perfusion pour ${c.O}.`,
    c => `${c.P} paie ${$(c.amt)} à ${c.O}. Tu bosses pour ${c.O} maintenant, sans le salaire.`,
    c => `${c.P} découvre le marché locatif de ${c.city}. Proprio : ${c.O}. Trêve hivernale : pas pour les clowns.`,
    c => c.paidTo >= 2 && `${c.paidTo}e loyer ${de(c.P)} pour ${c.O}. C’est plus un loyer, c’est un abonnement premium sans résiliation.`,
    c => c.paidTo >= 3 && `${c.paidTo}e loyer de suite pour ${c.O}. ${c.P}, à ce stade c’est pas de la malchance, c’est un fan-club.`,
    c => c.cash < 0 && `${c.P} est à découvert de ${$(c.cash)}. Ta banque a déjà rangé ton dossier dans « pertes et profits ».`,
    c => c.full && !c.lvl && `Groupe complet, loyer doublé. ${c.O} a compris le capitalisme. ${c.P} le finance, comme un bon pigeon.`,
    c => c.lvl >= 2 && `${c.lvl} bâtiments à ${c.city}. ${c.P} vient de payer l’étage du dessus. Merci pour le marbre, boloss.`,
    c => c.boost && `Loyer TRIPLÉ. ${c.O} avait un tuyau. ${c.P} avait un pion et zéro neurone.`,
    c => c.quote && `${c.P} disait ${q(c.quote.text)}${c.quote.ago}. ${$(c.amt)} plus tard : mytho démasqué.`,
    c => c.quote && /remontada|revanche|vengeance|attend/i.test(c.quote.text) && `${c.P} annonçait ${q(c.quote.text)}. La remontada, mais en descente. Comme le PSG avant 2025.`,
    c => c.karma && `${c.P} disait ${q(c.karma.text)} à propos ${de(c.O)}. Et là ${c.O} encaisse ${$(c.amt)} sur ton dos. Cheh.`,
    c => c.ratio >= 0.5 && `${c.P} lâche la moitié de son cash à ${c.city}. Même Ponzi aurait eu un peu de peine pour toi.`,
    c => c.intensity >= 2 && `${$(c.amt)} disparus. Ton banquier vient de te bloquer sur tous les réseaux, ${c.P}.`,
    c => c.intensity >= 3 && `${$(c.amt)} pour une nuit à ${c.city}. Même un Airbnb à Paris pendant les JO c’était moins l’arnaque. T’es guez, ${c.P}.`,
    c => c.amt < 40 && `${$(c.amt)}. C’est pas un loyer, c’est un pourboire. ${c.O} se sent insulté, et à raison.`,
    c => c.chatty && `${c.P} est le plus bavard du chat et le plus généreux en loyers. Moins de blabla, plus de cerveau.`,
    c => `${c.P} paie ${$(c.amt)}. Skill issue. Énorme skill issue.`,
  ],
  buy: [
    c => c.completes && `Groupe ${c.group} complet pour ${c.P}. Les autres, sortez le RIB et pleurez en silence.`,
    c => c.completes && `${c.P} rafle tout le groupe ${c.group}. Les loyers doublent, les amitiés meurent. Masterclass d’enflure.`,
    c => c.completes && c.mock && `${c.mock.who} disait ${q(c.mock.text)}. ${c.P} vient de compléter un groupe. ${c.mock.who}, tu peux ranger ta grande bouche.`,
    c => c.cash < 100 && `${c.P} achète ${c.city} et garde ${cash(c.cash)}. Le flair d’un pigeon, la gestion d’un ministre du Budget.`,
    c => c.cash < 100 && `${c.city} achetée, compte vidé. ${c.P} part all-in comme un crypto-bro en 2021. On connaît la fin.`,
    c => c.amt >= 400 && `${c.city} pour ${$(c.amt)}. ${c.P} s’achète un trophée qui ne rapportera que des regrets.`,
    c => c.props >= 6 && `${c.P} possède ${c.props} propriétés. C’est plus un joueur, c’est un fonds d’investissement avec un pion.`,
    c => `${c.P} achète ${c.city}. Décision ferme, comme une négociation menée à 2 h du mat’ après trois Red Bull.`,
    c => `${c.city} change de proprio. ${c.P} a la confiance d’un vendeur de formations en trading. Méfiance.`,
    c => `${c.P} achète ${c.city}. Au prime ou au fond du trou : réponse dans trois tours.`,
  ],
  build: [
    c => c.lvl === 3 && `Trois bâtiments à ${c.city}. C’est plus un chantier, c’est un piège à pigeons. Évitez la zone, ou priez.`,
    c => `${c.P} pose un bâtiment à ${c.city}. Loyer à ${$(c.rent)}. Les voisins font semblant de ne rien voir, comme la moitié du carnet d’adresses d’Epstein.`,
    c => `Chantier ouvert à ${c.city}. ${c.P} investit, les autres comptent leurs centimes comme des rats.`,
  ],
  sell: [
    c => `${c.P} revend ${c.city} à 80 %. La banque garde 20 % et un fou rire.`,
    c => c.before < 0 && `${c.P} vend ${c.city} pour boucher les trous. Le rêve immobilier finit en vide-grenier.`,
    c => `${c.P} brade ${c.city}. Même Vinted refuserait l’annonce.`,
  ],
  jail: [
    c => `${c.P} en cellule. Enfin une case à ta hauteur.`,
    c => `${c.P} voulait conquérir le plateau. Conquête du jour : 9 m² et un codétenu qui ronfle.`,
    c => c.intensity >= 2 && `${c.P} en prison pour trois tours. Sarkozy en est sorti plus vite, et lui avait de vrais avocats.`,
    c => c.jailCount >= 2 && `${c.jailCount}e séjour en prison pour ${c.P}. La carte de fidélité est méritée, on prépare un discours.`,
    c => c.quote && `${c.P} disait ${q(c.quote.text)}${c.quote.ago}. À répéter au parloir, les gardiens adorent les mythos.`,
    c => `${c.P} au trou. Seule case sans loyer à payer : ta meilleure affaire de la partie, bravo champion.`,
  ],
  bail: [
    c => `${c.P} paie la caution et ressort. La justice est rapide quand on a du liquide. Demandez aux potes d’Epstein.`,
    c => `150 $ et la porte s’ouvre. ${c.P} vient de découvrir le coupe-file judiciaire des riches.`,
  ],
  card: [
    c => c.key === 'crypto' && `Le memecoin ${de(c.P)} a pumpé. Préparez-vous à un TED talk sur la blockchain. Coupez-lui le micro, vite.`,
    c => c.key === 'scooter' && `${c.P} se fait flasher en trottinette. On tient enfin l’ennemi public numéro un. Quelle honte.`,
    c => c.key === 'birthday' && `Tout le monde paie l’anniversaire ${de(c.P)}. Le cadeau le plus forcé depuis le pot de départ du collègue que tout le monde déteste.`,
    c => c.key === 'round' && `${c.P} offre une tournée générale. Acheter des amis : la seule stratégie qui te restait.`,
    c => c.amt > 0 && `${c.P} gagne ${$(c.amt)} grâce à une carte. Zéro talent, 100 % de bol. Profite, ça ne se reproduira pas.`,
    c => c.amt < 0 && `${$(c.amt)} envolés sur une carte Chance. ${c.P} et le hasard, c’est une relation toxique. Faut voir un psy.`,
  ],
  dilemma: [
    c => c.key === 'faust' && c.choice === 'A' && `${c.P} vend son prochain tour pour 500 $. Faust avait négocié, toi t’as signé sans lire, comme les CGU.`,
    c => c.key === 'double' && c.choice === 'A' && c.coin === 'win' && `Pile ! ${c.P} double la mise et se prend pour un trader. La suite : un docu Netflix sur ta chute.`,
    c => c.key === 'double' && c.choice === 'A' && c.coin !== 'win' && `Face. 400 $ cramés sur une pièce. ${c.P}, c’est pas du courage, c’est de la bêtise en 4K.`,
    c => c.key === 'double' && c.choice === 'B' && `${c.P} prend 100 $ et s’enfuit. Le courage d’un comptable un vendredi à 16 h 59.`,
    c => c.key === 'loan' && c.choice === 'A' && `${c.P} encaisse 700 $ et laisse un adversaire se servir. Prêt toxique signé les yeux fermés, ça give pyramide de Ponzi.`,
    c => c.key === 'robin' && c.choice === 'A' && `${c.P} pique 150 $ au plus riche. Robin des Bois, version huissier sous Red Bull.`,
    c => c.key === 'robin' && c.choice === 'B' && `${c.P} donne 100 $ et rejoue. La générosité, tant qu’elle est rentable.`,
    c => c.key === 'insider' && c.choice === 'A' && `${c.P} paie pour un tuyau boursier. L’AMF prend des notes. Moi aussi, et je balance tout.`,
    c => c.key === 'taxman' && c.choice === 'A' && `${c.P} paie le fisc rubis sur l’ongle. Bercy t’adore. Bercy est bien le seul.`,
    c => c.key === 'taxman' && c.choice === 'B' && `${c.P} sacrifie un bien plutôt que payer. L’évasion fiscale, version stagiaire.`,
    c => `${c.P} a choisi. Deux options, et t’as trouvé la plus nulle. Respect, sincèrement.`,
  ],
  wheel: [
    c => c.key === 'jackpot' && `JACKPOT. ${c.P} prend 1 000 $. Je n’ai jamais vu une table détester quelqu’un aussi vite.`,
    c => c.key === 'jackpot' && `1 000 $ sur un tour de roue. ${c.P} va nous vendre une formation « deviens riche en cliquant ». Bloquez ce compte.`,
    c => c.key === 'jackpot' && c.mock && `${c.mock.who} disait ${q(c.mock.text)}. ${c.P} vient de toucher le jackpot. Cheh, ${c.mock.who}. Gros cheh.`,
    c => c.key === 'minus500' && `La roue arrache 500 $ à ${c.P}. Elle a choisi la violence, et franchement elle a eu raison.`,
    c => c.key === 'minus500' && c.wheelLosses >= 2 && `${c.P} et la roue : ${c.wheelLosses} défaites. C’est plus de la malchance, c’est une relation toxique.`,
    c => c.key === 'jail' && `La roue envoie ${c.P} en prison. Même le hasard a porté plainte contre toi.`,
    c => c.key === 'fire' && `Liquidation ! ${c.P} brade ${c.city || 'son patrimoine'}. Black Friday chez les loseurs.`,
    c => c.key === 'swap' && `Échange forcé. Tout le monde se réveille avec la maison de quelqu’un d’autre. Personne n’est content. Parfait.`,
    c => c.key === 'nothing' && `La roue a tourné quatre secondes pour dire RIEN. ${c.P}, c’est ta vie résumée en une animation.`,
    c => c.key === 'triple' && `Le prochain loyer encaissé par ${c.P} sera triplé. Je sens les larmes arriver chez quelqu’un. Pas chez moi.`,
    c => c.key === 'reroll' && `Relance offerte à ${c.P}. Le hasard t’accorde une deuxième chance de tout rater.`,
    c => c.key === 'plus300' && `300 $ pour ${c.P}. Pas de quoi frimer. Ça va frimer quand même, je le sens.`,
    c => c.key === 'teleport' && `Téléportation pour ${c.P}. Même la roue ne supportait plus ta tête.`,
    c => c.key === 'raid' && `La roue autorise ${c.P} à faire ses courses chez les voisins. Fermez vos portes, comptez vos couverts.`,
  ],
  steal: [
    c => `${c.P} rafle ${c.city} à ${c.O}. Payé cher, mais payé. ${c.O} n’a rien vu venir, comme d’hab.`,
  ],
  seize: [
    c => `${c.O} se sert chez ${c.P} et repart avec ${c.city}. Prêt toxique, créancier ravi, pigeon plumé.`,
  ],
  swap: [
    c => `Échange conclu, 100 $ chacun. ${c.P} et ${c.O} se congratulent. Dans trois tours, l’un des deux pleure. Indice : le plus naze.`,
  ],
  auction: [
    c => c.over && `${$(c.amt)} pour ${c.city} ? ${c.P} ne fait pas une enchère, ${c.P} fait un don. Quel pigeon.`,
    c => c.over && `${$(c.amt)} pour une case qui en vaut ${$(c.price)}. Même la banque a envoyé un « t’es sûr ? ».`,
    c => c.cheap && `${c.P} rafle ${c.city} pour ${$(c.amt)}. Propre. Je commençais à douter que tu aies un cerveau.`,
    c => c.cheap && `${c.city} pour ${$(c.amt)}. Les autres dormaient. ${c.P}, non.`,
    c => `${c.P} remporte ${c.city} aux enchères. Le marché a parlé, et il bégaie.`,
  ],
  // Enchere absurde en cours, avant meme la fin.
  bid: [
    c => `${$(c.amt)} ? Pour ${$(c.price)} de valeur ? ${c.P} ne fait pas une enchère. ${c.P} fait un don.`,
    c => `${c.P} mise ${$(c.amt)} sur ${c.city}. Quelqu’un peut lui dire que c’est pas le Téléthon ?`,
  ],
  trade: [
    c => `Échange accepté entre ${c.P} et ${c.O}. Quelqu’un vient de se faire arnaquer, et je sais qui.`,
  ],
  bankrupt: [
    c => `${c.P} fait faillite. Rideau. Les propriétés retournent à la banque, la dignité reste introuvable.`,
    c => `${c.P} n’a plus un rond. On t’enterre avec ton relevé de compte, c’est tout ce qui te reste.`,
    c => c.quote && `${c.P} disait ${q(c.quote.text)}${c.quote.ago}. Ce furent les dernières paroles d’un joueur solvable.`,
    c => c.boast && `Mesdames et messieurs, ${c.P} avait annoncé ${q(c.boast.text)}. Faillite. On encadre ce moment, on l’affiche dans le hall.`,
  ],
  win: [
    c => `${c.P} gagne avec ${$(c.net)}. Applaudissez, ou au moins faites semblant, bande de pigeons.`,
    c => `C’est fini. ${c.P} gagne. Les autres peuvent retourner pleurer sur leur Livret A.`,
    c => c.mock && `${c.mock.who} disait ${q(c.mock.text)}. ${c.P} vient de gagner la partie. Je laisse ça là. Je laisse ça LÀ.`,
    c => `${c.P} gagne. Les autres, vous avez servi de décor. Merci, et au revoir.`,
  ],
  afk: [
    c => `${c.P} n’a pas joué. Réflexion intense ou sieste en cours, impossible à dire. Tour suivant.`,
    c => `${c.P} laisse filer son tour. Présent physiquement, absent mentalement.`,
    c => c.afkCount >= 2 && `${c.P}, encore personne au clavier. La partie est confiée à un fantôme, et le fantôme joue mieux.`,
  ],
  begin: [
    c => `Bonsoir bande de clowns et bienvenue dans Banqueroll ! ${c.n} joueurs, une banque, zéro pitié. ${c.P}, à toi l’honneur de perdre en premier.`,
    c => `Les marchés ouvrent. ${c.P} commence. Que le moins fauché gagne, les autres finiront en story « j’ai tout perdu ».`,
  ],
  leader: [
    c => `Nouveau leader : ${c.P}. Profite, ce genre de trône dure environ deux tours.`,
    c => `${c.P} passe en tête. Les autres viennent de trouver leur ennemi commun. Cheh d’avance.`,
  ],
  event: [
    c => c.amt > 0 && `${c.P} touche ${$(c.amt)} sans rien foutre. Le rêve. Le scandale. La politique française, en fait.`,
    c => c.amt < 0 && `${c.P} paie ${$(c.amt)} d’imprévu. Chez ${c.P}, l’imprévu c’est un mode de vie.`,
  ],
  // Debut de tour (au plus un tour sur trois) : une pique sur la situation, jamais un « joue ».
  turn: [
    c => c.last && `${c.P}, dernière place avec ${cash(c.cash)}. Même le Livret A a plus d’ambition que toi.`,
    c => c.first && `${c.P} est en tête. Toute la table prie pour que tu tombes sur leurs rues. Ce serait justice.`,
    c => c.cash < 200 && `${c.P} à ${cash(c.cash)}. Chaque case est un piège, chaque loyer une menace. Ça sent la fin de mois depuis le 3.`,
    c => c.quote && `${c.P}, tu disais ${q(c.quote.text)}. On attend toujours la preuve, mytho.`,
    c => `Au tour ${de(c.P)}. Statistiquement, ça va mal se passer.`,
    c => `Au tour ${de(c.P)}. Le seul suspense, c’est combien ça va te coûter.`,
  ],
  // Le chrono s'egrene (au plus un tour sur trois) : une seule pique, pas un compte a rebours.
  pressure12: [
    c => `${c.P}, ${c.left} secondes. T’es en train de lire les CGU du dé ?`,
    c => `Tic-tac, ${c.P}. ${c.left} secondes. Le chat te juge en silence. Moi, bruyamment.`,
    c => `${c.left} secondes, ${c.P}. Même un Ehpad un dimanche réagit plus vite.`,
  ],
  pressure5: [
    c => `${c.left} secondes. Même ton Wi-Fi a plus de réflexes que toi, ${c.P}.`,
    c => `${c.left}… ${c.P}, même les dossiers Epstein sont sortis plus vite.`,
  ],
  roll1: [
    c => `Un 1. ${c.P} lance le dé avec la puissance d’un soupir de lundi matin.`,
    c => `1 case. ${c.P} avance comme un dossier à la Sécu.`,
    c => `Un 1. Même un escargot sous anxiolytiques irait plus loin.`,
  ],
  six: [
    c => `6 ! ${c.P} rejoue. Le hasard récompense même les touristes.`,
    c => `6. ${c.P} rejoue. Même une horloge cassée a raison deux fois par jour.`,
  ],
  // Le presentateur interpelle dans le chat.
  chat: [
    c => c.paid > 0 && `Je t’entends, ${c.P}. Et contrairement à toi, j’ai pas lâché ${$(c.paid)} de loyer aujourd’hui, clown.`,
    c => c.cash !== undefined && `Avec ${cash(c.cash)} en poche, ${c.P}, t’es en position de négocier avec… personne.`,
    c => c.last && `${c.P}, t’es en dernière position. Je réponds par pitié, mais je réponds.`,
    c => c.first && `${c.P} est en tête et veut causer au présentateur. Le melon pousse plus vite que le patrimoine.`,
    c => c.whyMock && `Parce que ${c.target || 'certains'} me fournit du contenu gratuit. Je serais bête de refuser.`,
    c => `Le présentateur ne prend pas parti, ${c.P}. Il humilie tout le monde, équitablement.`,
    c => c.question && `Bonne question, ${c.P}. Mauvais interlocuteur. Demande à ChatGPT, lui il est payé pour être gentil.`,
    c => c.shutUp && `Me taire ? ${c.P}, je suis payé à la vanne. Toi, tu paies au loyer.`,
    c => c.quote && `${c.P}, tu disais ${q(c.quote.text)}${c.quote.ago}. Je garde tout. C’est mon métier.`,
    c => `${c.P}, t’as écrit ça avec tes pouces ou avec tes pieds ?`,
  ],
  // Reaction spontanee a une pique ou une vantardise dans le chat.
  taunt: [
    c => c.cash !== undefined && `${c.P} fait le malin à ${cash(c.cash)}. Je note, je ressortirai ça au pire moment.`,
    c => `Archivé, ${c.P}. Ce genre de phrase vieillit plus mal qu’un tweet de 2012.`,
    c => `${c.P} provoque. Le dé, lui, n’a pas d’amis. Toi non plus, visiblement.`,
    c => c.boastNow && `${c.P} annonce la couleur. J’ai déjà écrit la vanne pour la chute.`,
  ],
};

const tierOf = text => (/disait|annonçait|tu disais|avait annoncé/.test(text) ? 2
  : /\de loyer de|défaites|séjour|fidélité|bavard|fonds d’investissement/.test(text) ? 1 : 0);

// Choisit une replique applicable, en evitant celles utilisees recemment.
// Les repliques qui s'appuient sur la memoire (citations, running gags) passent devant.
export function pickLine(type, ctx, recent = [], rng = Math.random) {
  const list = LINES[type] || [];
  const options = [];
  list.forEach((fn, i) => {
    let text = null;
    try { text = fn(ctx); } catch (e) { text = null; }
    if (text) options.push({ id: `${type}:${i}`, text, tier: tierOf(text) });
  });
  if (!options.length) return null;
  const fresh = options.filter(o => !recent.includes(o.id));
  const pool = fresh.length ? fresh : options;
  // Priorite : ce que les joueurs ont ECRIT, puis les running gags chiffres, puis le reste.
  const quotes = pool.filter(o => o.tier === 2);
  const gags = pool.filter(o => o.tier === 1);
  const finalPool = quotes.length && rng() < 0.8 ? quotes : (quotes.length || gags.length) && rng() < 0.75 ? (gags.length ? gags : quotes) : pool;
  return finalPool[Math.floor(rng() * finalPool.length)];
}
