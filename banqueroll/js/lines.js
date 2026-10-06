// Repliques locales du presentateur : toujours disponibles, sans reseau.
// Fonctions pures. Chaque replique recoit un contexte et renvoie un texte,
// ou null quand elle ne s'applique pas (ex. pas de citation a ressortir).
//
// Cible : les choix, le timing, le hasard, ce que les joueurs ont ecrit.
// Jamais leurs caracteristiques personnelles.

import { de } from './board.js';

const $ = n => `${Math.abs(Math.round(n)).toLocaleString('fr-FR')} $`;
const q = s => `« ${s} »`;

export const LINES = {
  rent: [
    c => c.intensity >= 2 && `${c.P} avait ${$(c.before)}. ${c.city} vient d’en prendre ${$(c.amt)}. Mathématiquement, c’est audacieux.`,
    c => `${$(c.amt)} de loyer. ${c.O} ne dit rien, mais ${c.O} sourit très fort.`,
    c => `${c.P} découvre le marché locatif de ${c.city}. Spoiler : le propriétaire, c’est ${c.O}.`,
    c => c.paidTo >= 2 && `${c.paidTo}e loyer ${de(c.P)} pour ${c.O}. À ce stade ce n’est plus un loyer, c’est un abonnement.`,
    c => c.paidTo >= 3 && `${c.P} verse encore à ${c.O}. Quelqu’un peut expliquer à ${c.P} que ce n’est pas une cagnotte en ligne ?`,
    c => c.cash < 0 && `${c.P} est à découvert de ${$(c.cash)}. La banque appelle ça « un client fidèle ».`,
    c => c.full && !c.lvl && `Groupe complet, loyer doublé : ${c.O} a compris le capitalisme, ${c.P} est en train de le subir.`,
    c => c.lvl >= 2 && `${c.lvl} bâtiments à ${c.city}. ${c.P} vient de financer le prochain étage. ${c.O} remercie.`,
    c => c.boost && `Loyer TRIPLÉ. ${c.O} avait un tuyau, ${c.P} avait juste un pion.`,
    c => c.quote && `${c.P} disait ${q(c.quote.text)}${c.quote.ago}. ${$(c.amt)} plus tard, on attend toujours.`,
    c => c.karma && `${c.P} disait ${q(c.karma.text)} à propos ${de(c.O)}. ${c.O} vient d’encaisser ${$(c.amt)} sur son dos. Le karma a un excellent timing.`,
    c => c.ratio >= 0.5 && `${c.P} laisse la moitié de son cash à ${c.city}. Même un week-end à Monaco coûte moins cher.`,
    c => c.intensity >= 2 && `${$(c.amt)} disparus. Même ton portefeuille vient de demander une pause, ${c.P}.`,
    c => c.amt < 40 && `${$(c.amt)}. Ce n’est pas un loyer, c’est un pourboire.`,
    c => c.chatty && `${c.P} est le plus bavard du chat et le plus généreux en loyers. Il y a peut-être un lien.`,
  ],
  buy: [
    c => c.completes && `Et voilà. ${c.P} possède tout le groupe ${c.group}. Pour les autres : bienvenue dans le marché locatif.`,
    c => c.completes && `${c.P} complète le groupe ${c.group}. Les loyers doublent et les amitiés se refroidissent.`,
    c => c.completes && c.mock && `${c.mock.who} disait ${q(c.mock.text)}. ${c.P} vient de compléter un groupe. Silence radio du côté ${de(c.mock.who)}.`,
    c => c.cash < 100 && `${c.P} achète ${c.city} et garde ${$(c.cash)} en poche. La stratégie « tout sur une case », on adore.`,
    c => c.amt >= 400 && `${c.city} pour ${$(c.amt)}. ${c.P} s’offre un trophée. Reste à voir s’il rapporte.`,
    c => c.props >= 6 && `${c.P} possède ${c.props} propriétés. Ce n’est plus un joueur, c’est un fonds d’investissement.`,
    c => `${c.P} achète ${c.city}. Décision ferme, comme une négociation menée à 2 h du matin.`,
    c => `${c.city} change de propriétaire. ${c.P} affiche une confiance totale, c’est souvent mauvais signe.`,
  ],
  build: [
    c => c.lvl === 3 && `Trois bâtiments à ${c.city}. Ce n’est plus de la construction, c’est du bétonnage. Évitez la zone.`,
    c => `${c.P} pose un bâtiment à ${c.city}. Le loyer passe à ${$(c.rent)}. Les voisins prennent note.`,
    c => `Chantier ouvert à ${c.city}. ${c.P} investit, les autres prient.`,
  ],
  sell: [
    c => `${c.P} revend ${c.city} à 80 %. La banque remercie pour ce don de 20 %.`,
    c => c.before < 0 && `${c.P} vend ${c.city} pour boucher les trous. C’est la fin du rêve immobilier.`,
  ],
  jail: [
    c => `Félicitations ${c.P}. Tu viens de devenir locataire de la seule case que personne ne veut.`,
    c => `${c.P} voulait conquérir le monde. Conquête du jour : une cellule.`,
    c => c.intensity >= 2 && `${c.P} en prison. À ce stade, même Sarkozy aurait demandé où était la porte de sortie.`,
    c => c.jailCount >= 2 && `${c.jailCount}e séjour en prison pour ${c.P}. La carte de fidélité est méritée.`,
    c => c.quote && `${c.P} disait ${q(c.quote.text)}${c.quote.ago}. À répéter au parloir.`,
  ],
  bail: [
    c => `${c.P} paie la caution et ressort. La justice est rapide quand on a du liquide.`,
    c => `150 $ et la porte s’ouvre. ${c.P} vient de découvrir le pass coupe-file.`,
  ],
  card: [
    c => c.key === 'crypto' && `Le memecoin ${de(c.P)} a monté. Toute la table va devoir écouter son avis sur la blockchain.`,
    c => c.key === 'scooter' && `${c.P} se fait flasher en trottinette. On tient le criminel de la décennie.`,
    c => c.key === 'birthday' && `Tout le monde paie l’anniversaire ${de(c.P)}. Le cadeau le moins sincère de l’histoire.`,
    c => c.key === 'round' && `${c.P} offre une tournée générale. Personne ne l’aime plus pour autant.`,
    c => c.amt > 0 && `${c.P} gagne ${$(c.amt)} grâce à une carte. Le talent ne s’invente pas, la chance si.`,
    c => c.amt < 0 && `${$(c.amt)} envolés sur une carte Chance. ${c.P} et le hasard, c’est compliqué.`,
  ],
  dilemma: [
    c => c.key === 'faust' && c.choice === 'A' && `${c.P} vend son prochain tour pour 500 $. Faust, au moins, avait négocié plus cher.`,
    c => c.key === 'double' && c.choice === 'A' && c.coin === 'win' && `Pile ! ${c.P} double la mise. Prochaine étape : se croire au casino. C’est le début de la fin.`,
    c => c.key === 'double' && c.choice === 'A' && c.coin !== 'win' && `Face. ${c.P} perd 400 $ sur une pièce. Une conférence de presse : beaucoup de confiance au départ, beaucoup moins d’argent à la fin.`,
    c => c.key === 'double' && c.choice === 'B' && `${c.P} prend 100 $ et s’enfuit. Prudence de comptable, panache de comptable.`,
    c => c.key === 'loan' && c.choice === 'A' && `${c.P} encaisse 700 $ et laisse un adversaire se servir. Un prêt toxique signé les yeux fermés.`,
    c => c.key === 'robin' && c.choice === 'A' && `${c.P} prend 150 $ au plus riche. Robin des bois, version huissier.`,
    c => c.key === 'robin' && c.choice === 'B' && `${c.P} donne 100 $ et rejoue. La générosité, quand elle est rentable.`,
    c => c.key === 'insider' && c.choice === 'A' && `${c.P} paie pour un tuyau boursier. Le gendarme de la Bourse aimerait un mot.`,
    c => c.key === 'taxman' && c.choice === 'A' && `${c.P} paie le fisc rubis sur l’ongle. Bercy adore ce profil.`,
    c => c.key === 'taxman' && c.choice === 'B' && `${c.P} sacrifie un bien plutôt que payer. L’optimisation fiscale, version artisanale.`,
    c => `${c.P} a choisi. On en reparle dans trois tours, et pas en bien.`,
  ],
  wheel: [
    c => c.key === 'jackpot' && `JACKPOT. ${c.P} prend 1 000 $. Je n’ai jamais vu une table détester quelqu’un aussi vite.`,
    c => c.key === 'jackpot' && `1 000 $ sur un tour de roue. ${c.P} va nous expliquer que c’était une stratégie.`,
    c => c.key === 'jackpot' && c.mock && `${c.mock.who} disait ${q(c.mock.text)}. ${c.P} vient de toucher le jackpot. Le silence est assourdissant.`,
    c => c.key === 'minus500' && `La roue prend 500 $ à ${c.P}. Elle a choisi la violence, et elle a bien fait.`,
    c => c.key === 'minus500' && c.wheelLosses >= 2 && `${c.P} et la roue : ${c.wheelLosses} défaites. À ce stade c’est une relation toxique.`,
    c => c.key === 'jail' && `La roue envoie ${c.P} en prison. Même le hasard a voté contre.`,
    c => c.key === 'fire' && `Liquidation ! ${c.P} brade ${c.city || 'son patrimoine'}. Les soldes, c’est d’habitude pour les autres.`,
    c => c.key === 'swap' && `Échange forcé. Tout le monde se réveille avec la propriété de quelqu’un d’autre. Personne n’est content, c’est parfait.`,
    c => c.key === 'nothing' && `La roue a tourné quatre secondes pour dire RIEN. ${c.P}, c’est ta vie résumée.`,
    c => c.key === 'triple' && `Le prochain loyer encaissé par ${c.P} sera triplé. Ça va pleurer.`,
    c => c.key === 'reroll' && `Relance offerte à ${c.P}. Le hasard accorde une deuxième chance de mal faire.`,
    c => c.key === 'plus300' && `300 $ pour ${c.P}. Pas de quoi frimer. Ça va frimer quand même.`,
    c => c.key === 'teleport' && `Téléportation pour ${c.P}. Même la roue ne supportait plus de voir ce pion là.`,
    c => c.key === 'raid' && `La roue autorise ${c.P} à faire ses courses chez les voisins. Ça va mal finir.`,
  ],
  steal: [
    c => `${c.P} rafle ${c.city} à ${c.O}. Payé au prix fort, mais payé. ${c.O} n’a rien vu venir.`,
  ],
  seize: [
    c => `${c.O} se sert dans le portefeuille ${de(c.P)} et repart avec ${c.city}. Le prêt était toxique, le créancier est ravi.`,
  ],
  swap: [
    c => `Échange conclu, 100 $ chacun. ${c.P} et ${c.O} se congratulent. On verra qui rit dans trois tours.`,
  ],
  auction: [
    c => c.over && `${$(c.amt)} pour ${c.city} ? ${c.P}, même la banque aurait demandé un délai de réflexion.`,
    c => c.cheap && `${c.P} rafle ${c.city} pour ${$(c.amt)}. Les autres dormaient, visiblement.`,
    c => `${c.P} remporte ${c.city} aux enchères. Le marché a parlé, et il bégaie.`,
  ],
  trade: [
    c => `Échange accepté entre ${c.P} et ${c.O}. Quelqu’un vient de se faire avoir, et je sais qui.`,
  ],
  bankrupt: [
    c => `${c.P} fait faillite. Rideau. Ses propriétés retournent à la banque, sa dignité aussi.`,
    c => c.quote && `${c.P} disait ${q(c.quote.text)}${c.quote.ago}. Ce furent ses dernières paroles de joueur solvable.`,
  ],
  win: [
    c => `${c.P} remporte la partie avec ${$(c.net)}. Applaudissez, ou au moins faites semblant.`,
    c => `C’est fini. ${c.P} gagne. Les autres peuvent retourner à leur Livret A.`,
    c => c.mock && `${c.mock.who} disait ${q(c.mock.text)}. ${c.P} vient de gagner la partie. Je laisse ça là.`,
  ],
  afk: [
    c => `${c.P} n’a pas joué. Réflexion intense ou vaisselle en cours, impossible à dire.`,
    c => c.afkCount >= 2 && `${c.P}, encore personne au clavier. La partie est confiée à un fantôme.`,
  ],
  begin: [
    c => `Bonsoir et bienvenue dans Banqueroll ! ${c.n} joueurs, une banque, zéro pitié. ${c.P}, à toi l’honneur de perdre en premier.`,
    c => `Mesdames et messieurs, les marchés ouvrent. ${c.P} commence. Que le moins fauché gagne.`,
  ],
  leader: [
    c => `Nouveau leader : ${c.P}. Profites-en, ça ne dure jamais.`,
    c => `${c.P} passe en tête. Les autres viennent de trouver leur ennemi commun.`,
  ],
  event: [
    c => c.amt > 0 && `${c.P} touche ${$(c.amt)} sans rien faire. Le rêve.`,
    c => c.amt < 0 && `${c.P} paie ${$(c.amt)} d’imprévu. L’imprévu, c’est un peu son style.`,
  ],
  // Le presentateur interpelle dans le chat.
  chat: [
    c => c.paid > 0 && `Je t’entends, ${c.P}. Et contrairement à toi, je n’ai pas payé ${$(c.paid)} de loyer aujourd’hui.`,
    c => c.cash !== undefined && `Absolument, ${c.P}. Avec ${$(c.cash)} en poche, tu es en position de négocier… avec personne.`,
    c => c.last && `${c.P}, tu es en dernière position. Je réponds par pitié, mais je réponds.`,
    c => c.first && `${c.P} est en tête et veut parler au présentateur. Le pouvoir monte vite à la tête.`,
    c => `Le présentateur ne prend pas parti, ${c.P}. Il se moque de tout le monde équitablement.`,
    c => c.question && `Bonne question, ${c.P}. La réponse est : lance le dé et prie.`,
    c => c.quote && `${c.P}, tu disais ${q(c.quote.text)}${c.quote.ago}. Je garde tout. C’est mon métier.`,
  ],
  // Reaction spontanee a une pique dans le chat.
  taunt: [
    c => c.cash !== undefined && `${c.P} parle beaucoup pour quelqu’un à ${$(c.cash)}. Je note, je ressortirai ça au bon moment.`,
    c => `Archivé, ${c.P}. Ce genre de phrase vieillit rarement bien.`,
    c => `${c.P} provoque. Le dé, lui, n’a pas d’amis.`,
  ],
};

// Choisit une replique applicable, en evitant celles utilisees recemment.
// Les repliques qui s'appuient sur la memoire (citations, running gags) passent devant.
export function pickLine(type, ctx, recent = [], rng = Math.random) {
  const list = LINES[type] || [];
  const options = [];
  list.forEach((fn, i) => {
    let text = null;
    try { text = fn(ctx); } catch (e) { text = null; }
    if (text) options.push({ id: `${type}:${i}`, text, memory: /disait|\de loyer de|défaites|séjour|fidélité|bavard|fonds d’investissement/.test(text) });
  });
  if (!options.length) return null;
  const fresh = options.filter(o => !recent.includes(o.id));
  const pool = fresh.length ? fresh : options;
  const memoryFirst = pool.filter(o => o.memory);
  const finalPool = memoryFirst.length && rng() < 0.75 ? memoryFirst : pool;
  return finalPool[Math.floor(rng() * finalPool.length)];
}
