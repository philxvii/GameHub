// Repliques locales du presentateur : toujours disponibles, sans reseau.
// Fonctions pures. Chaque replique recoit un contexte et renvoie un texte,
// ou null quand elle ne s'applique pas (ex. pas de citation a ressortir).
//
// Ton : le commentateur insupportable qui ne peut pas se taire. Il se moque des
// CHOIX, du TIMING, du hasard et de ce que les joueurs ont ecrit. Jamais de leurs
// caracteristiques personnelles. Formulations neutres : le jeu ignore le genre.

import { de } from './board.js';

const $ = n => `${Math.abs(Math.round(n)).toLocaleString('fr-FR')} $`;
const q = s => `« ${s} »`;

export const LINES = {
  rent: [
    c => c.intensity >= 2 && `${c.P} avait ${$(c.before)}. ${c.city} vient d’en prendre ${$(c.amt)}. Mathématiquement, c’est audacieux.`,
    c => `${$(c.amt)} de loyer. ${c.O} ne dit rien. ${c.O} n’a pas besoin de parler, le compte en banque parle.`,
    c => `${c.P} découvre le marché locatif de ${c.city}. Spoiler : le propriétaire, c’est ${c.O}, et il n’y a pas de trêve hivernale.`,
    c => c.paidTo >= 2 && `${c.paidTo}e loyer ${de(c.P)} pour ${c.O}. À ce stade ce n’est plus un loyer, c’est un abonnement premium.`,
    c => c.paidTo >= 3 && `${c.P} verse ENCORE à ${c.O}. Quelqu’un peut expliquer à ${c.P} que ce n’est pas une cagnotte ?`,
    c => c.cash < 0 && `${c.P} est à découvert de ${$(c.cash)}. La banque ne dit pas « client fidèle ». La banque dit « dossier ».`,
    c => c.full && !c.lvl && `Groupe complet, loyer doublé. ${c.O} a compris le capitalisme. ${c.P} est en train de le financer.`,
    c => c.lvl >= 2 && `${c.lvl} bâtiments à ${c.city}. ${c.P} vient de payer le prochain étage. ${c.O} dit merci, sans se retourner.`,
    c => c.boost && `Loyer TRIPLÉ. ${c.O} avait un tuyau. ${c.P} avait juste un pion et beaucoup trop d’optimisme.`,
    c => c.quote && `${c.P} disait ${q(c.quote.text)}${c.quote.ago}. ${$(c.amt)} plus tard, on attend toujours.`,
    c => c.quote && /remontada|revanche|vengeance|attend/i.test(c.quote.text) && `${c.P} annonçait ${q(c.quote.text)}. Pour l’instant, on a surtout la descente.`,
    c => c.karma && `${c.P} disait ${q(c.karma.text)} à propos ${de(c.O)}. ${c.O} vient d’encaisser ${$(c.amt)} sur son dos. Le karma a un excellent timing.`,
    c => c.ratio >= 0.5 && `${c.P} laisse la moitié de son cash à ${c.city}. Même un week-end à Monaco coûte moins cher, et au moins il y a la mer.`,
    c => c.intensity >= 2 && `${$(c.amt)} disparus. Même ton portefeuille vient de demander une rupture conventionnelle, ${c.P}.`,
    c => c.intensity >= 3 && `Magnifique. Vraiment magnifique. ${$(c.amt)} pour une nuit à ${c.city}. Même la banque se demande pourquoi.`,
    c => c.amt < 40 && `${$(c.amt)}. Ce n’est pas un loyer, c’est un pourboire. ${c.O} est vexé pour la forme.`,
    c => c.chatty && `${c.P} est le plus bavard du chat et le plus généreux en loyers. Il y a peut-être un lien. Il y a sûrement un lien.`,
  ],
  buy: [
    c => c.completes && `Et voilà. ${c.P} possède tout le groupe ${c.group}. Pour les autres : bienvenue dans le marché locatif. Prévoyez des économies.`,
    c => c.completes && `${c.P} complète le groupe ${c.group}. Les loyers doublent et les amitiés se refroidissent.`,
    c => c.completes && c.mock && `${c.mock.who} disait ${q(c.mock.text)}. ${c.P} vient de compléter un groupe. Silence radio du côté ${de(c.mock.who)}.`,
    c => c.cash < 100 && `${c.P} achète ${c.city} et garde ${$(c.cash)} en poche. Tu avais deux options. Tu as choisi la troisième : la catastrophe.`,
    c => c.cash < 100 && `${c.city} achetée, compte vidé. ${c.P} joue la stratégie « tout sur une case ». J’adore, je prends les paris contre.`,
    c => c.amt >= 400 && `${c.city} pour ${$(c.amt)}. ${c.P} s’offre un trophée. Reste à voir s’il rapporte autre chose que des regrets.`,
    c => c.props >= 6 && `${c.P} possède ${c.props} propriétés. Ce n’est plus un joueur, c’est un fonds d’investissement avec un pion.`,
    c => `${c.P} achète ${c.city}. Décision ferme, comme une négociation menée à 2 h du matin.`,
    c => `${c.city} change de propriétaire. ${c.P} affiche une confiance totale, c’est souvent le premier symptôme.`,
  ],
  build: [
    c => c.lvl === 3 && `Trois bâtiments à ${c.city}. Ce n’est plus de la construction, c’est du bétonnage. Évitez la zone, ou priez.`,
    c => `${c.P} pose un bâtiment à ${c.city}. Le loyer passe à ${$(c.rent)}. Les voisins font semblant de ne pas avoir vu.`,
    c => `Chantier ouvert à ${c.city}. ${c.P} investit, les autres comptent leurs pièces.`,
  ],
  sell: [
    c => `${c.P} revend ${c.city} à 80 %. La banque remercie pour ce don de 20 %. Elle ne l’oubliera pas.`,
    c => c.before < 0 && `${c.P} vend ${c.city} pour boucher les trous. C’est beau, la fin d’un rêve immobilier.`,
  ],
  jail: [
    c => `Félicitations ${c.P}. Tu viens de devenir locataire de la seule case que personne ne veut.`,
    c => `${c.P} voulait conquérir le plateau. Conquête du jour : une cellule.`,
    c => `Fallait peut-être éviter de prendre l’autoroute vers la prison. Trois tours gratuits. Quel investissement.`,
    c => c.intensity >= 2 && `${c.P} en prison. À ce stade, même Sarkozy aurait demandé où est la sortie.`,
    c => c.jailCount >= 2 && `${c.jailCount}e séjour en prison pour ${c.P}. La carte de fidélité est méritée. On prépare un discours.`,
    c => c.quote && `${c.P} disait ${q(c.quote.text)}${c.quote.ago}. À répéter au parloir, ça fera rire les gardiens.`,
  ],
  bail: [
    c => `${c.P} paie la caution et ressort. La justice est rapide quand on a du liquide.`,
    c => `150 $ et la porte s’ouvre. ${c.P} vient de découvrir le coupe-file judiciaire.`,
  ],
  card: [
    c => c.key === 'crypto' && `Le memecoin ${de(c.P)} a monté. Toute la table va devoir écouter un avis sur la blockchain. Courage.`,
    c => c.key === 'scooter' && `${c.P} se fait flasher en trottinette. On tient enfin le criminel de la décennie.`,
    c => c.key === 'birthday' && `Tout le monde paie l’anniversaire ${de(c.P)}. Le cadeau le moins sincère de l’histoire du jeu de société.`,
    c => c.key === 'round' && `${c.P} offre une tournée générale. Personne n’est plus ami pour autant. Personne.`,
    c => c.amt > 0 && `${c.P} gagne ${$(c.amt)} grâce à une carte. Le talent ne s’invente pas. La chance, si.`,
    c => c.amt < 0 && `${$(c.amt)} envolés sur une carte Chance. ${c.P} et le hasard, c’est une relation compliquée.`,
  ],
  dilemma: [
    c => c.key === 'faust' && c.choice === 'A' && `${c.P} vend son prochain tour pour 500 $. Faust, au moins, avait négocié plus cher.`,
    c => c.key === 'double' && c.choice === 'A' && c.coin === 'win' && `Pile ! ${c.P} double la mise. Prochaine étape : se croire au casino. C’est le début de la fin.`,
    c => c.key === 'double' && c.choice === 'A' && c.coin !== 'win' && `Face. 400 $ perdus sur une pièce. Beaucoup de confiance au départ, beaucoup moins d’argent à l’arrivée. Une conférence de presse.`,
    c => c.key === 'double' && c.choice === 'B' && `${c.P} prend 100 $ et s’enfuit. Le courage d’un comptable, le panache d’un comptable.`,
    c => c.key === 'loan' && c.choice === 'A' && `${c.P} encaisse 700 $ et laisse un adversaire se servir dans ses affaires. Un prêt toxique signé les yeux fermés.`,
    c => c.key === 'robin' && c.choice === 'A' && `${c.P} prend 150 $ au plus riche. Robin des bois, version huissier.`,
    c => c.key === 'robin' && c.choice === 'B' && `${c.P} donne 100 $ et rejoue. La générosité, tant qu’elle est rentable.`,
    c => c.key === 'insider' && c.choice === 'A' && `${c.P} paie pour un tuyau boursier. Le gendarme de la Bourse aimerait un mot. Moi aussi.`,
    c => c.key === 'taxman' && c.choice === 'A' && `${c.P} paie le fisc rubis sur l’ongle. Bercy adore ce profil. Bercy est le seul.`,
    c => c.key === 'taxman' && c.choice === 'B' && `${c.P} sacrifie un bien plutôt que payer. L’optimisation fiscale, version artisanale.`,
    c => `${c.P} a choisi. Tu avais deux options. On en reparle dans trois tours, et pas en bien.`,
  ],
  wheel: [
    c => c.key === 'jackpot' && `JACKPOT. ${c.P} prend 1 000 $. Je n’ai jamais vu une table détester quelqu’un aussi vite.`,
    c => c.key === 'jackpot' && `1 000 $ sur un tour de roue. ${c.P} va maintenant nous expliquer que c’était une stratégie.`,
    c => c.key === 'jackpot' && c.mock && `${c.mock.who} disait ${q(c.mock.text)}. ${c.P} vient de toucher le jackpot. Le silence est assourdissant.`,
    c => c.key === 'minus500' && `La roue prend 500 $ à ${c.P}. Elle a choisi la violence. Elle a eu raison.`,
    c => c.key === 'minus500' && c.wheelLosses >= 2 && `${c.P} et la roue : ${c.wheelLosses} défaites. À ce stade c’est une relation toxique, il faut en parler à quelqu’un.`,
    c => c.key === 'jail' && `La roue envoie ${c.P} en prison. Même le hasard a voté contre.`,
    c => c.key === 'fire' && `Liquidation ! ${c.P} brade ${c.city || 'son patrimoine'}. Les soldes, d’habitude, c’est pour les autres.`,
    c => c.key === 'swap' && `Échange forcé. Tout le monde se réveille avec la propriété de quelqu’un d’autre. Personne n’est content. Parfait.`,
    c => c.key === 'nothing' && `La roue a tourné quatre secondes pour dire RIEN. ${c.P}, c’est ta partie résumée.`,
    c => c.key === 'triple' && `Le prochain loyer encaissé par ${c.P} sera triplé. Je sens les larmes arriver chez quelqu’un.`,
    c => c.key === 'reroll' && `Relance offerte à ${c.P}. Le hasard accorde une deuxième chance de mal faire.`,
    c => c.key === 'plus300' && `300 $ pour ${c.P}. Pas de quoi frimer. Ça va frimer quand même.`,
    c => c.key === 'teleport' && `Téléportation pour ${c.P}. Même la roue ne supportait plus de voir ce pion là.`,
    c => c.key === 'raid' && `La roue autorise ${c.P} à faire ses courses chez les voisins. Fermez vos portes.`,
  ],
  steal: [
    c => `${c.P} rafle ${c.city} à ${c.O}. Payé au prix fort, mais payé. ${c.O} n’a rien vu venir, comme d’habitude.`,
  ],
  seize: [
    c => `${c.O} se sert dans le portefeuille ${de(c.P)} et repart avec ${c.city}. Le prêt était toxique, le créancier est ravi.`,
  ],
  swap: [
    c => `Échange conclu, 100 $ chacun. ${c.P} et ${c.O} se congratulent. On verra qui rit dans trois tours. Indice : pas les deux.`,
  ],
  auction: [
    c => c.over && `${$(c.amt)} pour ${c.city} ? ${c.P} ne fait pas une enchère. ${c.P} fait un don.`,
    c => c.over && `${$(c.amt)} pour une case qui en vaut ${$(c.price)}. Même la banque aurait demandé un délai de réflexion.`,
    c => c.cheap && `${c.P} rafle ${c.city} pour ${$(c.amt)}. Ça c’était propre. Je commençais à douter de tes capacités.`,
    c => c.cheap && `${c.city} pour ${$(c.amt)}. Les autres dormaient. ${c.P}, non.`,
    c => `${c.P} remporte ${c.city} aux enchères. Le marché a parlé, et il bégaie.`,
  ],
  // Enchere absurde en cours, avant meme la fin.
  bid: [
    c => `${$(c.amt)} ? Pour ${$(c.price)} de valeur ? ${c.P} ne fait pas une enchère. ${c.P} fait un don.`,
    c => `${c.P} mise ${$(c.amt)} sur ${c.city}. Quelqu’un a dit à ${c.P} que ce n’était pas un concours de générosité ?`,
  ],
  trade: [
    c => `Échange accepté entre ${c.P} et ${c.O}. Quelqu’un vient de se faire avoir, et je sais qui.`,
  ],
  bankrupt: [
    c => `${c.P} fait faillite. Rideau. Les propriétés retournent à la banque, la dignité aussi.`,
    c => c.quote && `${c.P} disait ${q(c.quote.text)}${c.quote.ago}. Ce furent les dernières paroles d’un joueur solvable.`,
    c => c.boast && `Mesdames et messieurs, ${c.P} avait annoncé ${q(c.boast.text)}. ${c.P} vient de faire faillite. On encadre ce moment. On l’affiche dans le hall.`,
  ],
  win: [
    c => `${c.P} remporte la partie avec ${$(c.net)}. Applaudissez. Ou au moins faites semblant, c’est la tradition.`,
    c => `C’est fini. ${c.P} gagne. Les autres peuvent retourner à leur Livret A.`,
    c => c.mock && `${c.mock.who} disait ${q(c.mock.text)}. ${c.P} vient de gagner la partie. Je laisse ça là. Je laisse ça LÀ.`,
  ],
  afk: [
    c => `Et voilà. ${c.P} avait une action à faire. ${c.P} a choisi le silence. Tour suivant.`,
    c => `${c.P} n’a pas joué. Réflexion intense ou vaisselle en cours, impossible à dire.`,
    c => c.afkCount >= 2 && `${c.P}, encore personne au clavier. La partie est confiée à un fantôme, et le fantôme joue mieux.`,
  ],
  begin: [
    c => `Bonsoir et bienvenue dans Banqueroll ! ${c.n} joueurs, une banque, zéro pitié. ${c.P}, à toi l’honneur de perdre en premier.`,
    c => `Mesdames et messieurs, les marchés ouvrent. ${c.P} commence. Que le moins fauché gagne, les autres serviront d’exemple.`,
  ],
  leader: [
    c => `Nouveau leader : ${c.P}. Profites-en, ça ne dure jamais.`,
    c => `${c.P} passe en tête. Les autres viennent de trouver leur ennemi commun.`,
  ],
  event: [
    c => c.amt > 0 && `${c.P} touche ${$(c.amt)} sans rien faire. Le rêve. Le scandale.`,
    c => c.amt < 0 && `${c.P} paie ${$(c.amt)} d’imprévu. L’imprévu, chez ${c.P}, c’est presque une routine.`,
  ],
  // Debut de tour : le presentateur ne laisse personne jouer tranquille.
  turn: [
    c => c.last && `À toi ${c.P}. Dernière place, ${$(c.cash)}. L’espoir fait vivre, pas longtemps.`,
    c => c.first && `${c.P} en tête lance le dé. Les autres prient pour un 1.`,
    c => c.cash < 200 && `${c.P}, ${$(c.cash)} en poche. Chaque case est un piège, chaque loyer une menace. Bonne chance. Non, vraiment.`,
    c => c.quote && `${c.P}, tu disais ${q(c.quote.text)}. C’est le moment de le prouver. On attend.`,
    c => `${c.P}, à toi. Pas de pression. Enfin, un peu. Beaucoup, en fait.`,
  ],
  // Le chrono s'egrene : le presentateur met la pression.
  pressure12: [
    c => `${c.P}. Tu as ${c.left} secondes. La banque n’attend pas. Moi non plus.`,
    c => `${c.left} secondes, ${c.P}. Le dé ne va pas se lancer tout seul.`,
    c => `Tic-tac, ${c.P}. ${c.left} secondes. Tout le monde regarde. Tout le monde juge.`,
  ],
  pressure5: [
    c => `${c.left} secondes. C’est maintenant qu’on découvre si ${c.P} sait encore cliquer.`,
    c => `${c.left}… ${c.P}, c’est le moment. Ou jamais. Plutôt jamais, visiblement.`,
  ],
  roll1: [
    c => `Un 1. ${c.P} lance le dé avec toute la puissance d’un soupir.`,
    c => `1 case. ${c.P} avance comme une réforme : lentement et sans enthousiasme.`,
  ],
  six: [
    c => `6 ! ${c.P} rejoue. Le hasard récompense parfois n’importe qui.`,
    c => `Un 6 pour ${c.P}. Profites-en, c’est sûrement la seule bonne nouvelle du tour.`,
  ],
  // Le presentateur interpelle dans le chat.
  chat: [
    c => c.paid > 0 && `Je t’entends, ${c.P}. Et contrairement à toi, je n’ai pas payé ${$(c.paid)} de loyer aujourd’hui.`,
    c => c.cash !== undefined && `Absolument, ${c.P}. Avec ${$(c.cash)} en poche, tu es en position de négocier… avec personne.`,
    c => c.last && `${c.P}, tu es en dernière position. Je réponds par pitié, mais je réponds.`,
    c => c.first && `${c.P} est en tête et veut parler au présentateur. Le pouvoir monte vite à la tête.`,
    c => c.whyMock && `Parce que ${c.target || 'certains'} me fournit le contenu gratuitement. Je serais bête de refuser.`,
    c => `Le présentateur ne prend pas parti, ${c.P}. Il se moque de tout le monde, équitablement.`,
    c => c.question && `Bonne question, ${c.P}. La réponse est : lance le dé et prie.`,
    c => c.shutUp && `Me taire ? ${c.P}, je suis payé à la réplique. Toi, tu paies au loyer.`,
    c => c.quote && `${c.P}, tu disais ${q(c.quote.text)}${c.quote.ago}. Je garde tout. C’est mon métier.`,
  ],
  // Reaction spontanee a une pique ou une vantardise dans le chat.
  taunt: [
    c => c.cash !== undefined && `${c.P} parle beaucoup pour quelqu’un à ${$(c.cash)}. Je note. Je ressortirai ça au pire moment.`,
    c => `Archivé, ${c.P}. Ce genre de phrase vieillit très, très mal.`,
    c => `${c.P} provoque. Le dé, lui, n’a pas d’amis.`,
    c => c.boastNow && `${c.P} annonce la couleur. J’ai déjà préparé la réplique pour la chute.`,
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
