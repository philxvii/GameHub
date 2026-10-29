// Texte saisi par les joueurs : pseudos, réponses. Module PUR.
// Règle d'affichage : le contenu joueur passe TOUJOURS par textContent (ui/dom.js) ;
// ces fonctions bornent et normalisent, elles ne fabriquent jamais de HTML.

export const NAME_MIN = 3;
export const NAME_MAX = 16;
export const ANSWER_MAX = 32;

// Caractères de contrôle et séparateurs invisibles retirés partout.
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g;

export function cleanName(raw) {
  return String(raw == null ? '' : raw)
    .replace(INVISIBLE, '')
    .replace(/[<>]/g, '')          // la base refuse « < » de toute façon (2e couche)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

export const validName = n => typeof n === 'string' && n.length >= NAME_MIN && n.length <= NAME_MAX && n === cleanName(n);

export function cleanAnswer(raw) {
  return String(raw == null ? '' : raw)
    .replace(INVISIBLE, '')
    .replace(/[<>{}\[\]\\`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ANSWER_MAX);
}

// Sans accents, minuscules : « Éléphant » -> « elephant ». Ligatures développées.
export function fold(s) {
  return String(s || '')
    .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Articles retirés en tête pour la lettre et les doublons : « Le Lion » vaut « lion ».
const ARTICLE = /^(l['’]\s*|(le|la|les|un|une|des|du|de la|de l['’])\s+)/i;
export function stripArticle(s) {
  let t = String(s || '').trim();
  for (let i = 0; i < 2 && ARTICLE.test(t); i++) t = t.replace(ARTICLE, '').trim();
  return t;
}

// Clé de comparaison du Petit Bac : sans article, sans accents, sans espaces ni
// tirets ni apostrophes, et un « s » final retiré (« Lions » = « Lion »).
export function answerKey(s) {
  let k = fold(stripArticle(s)).replace(/[^a-z0-9]/g, '');
  if (k.length > 3 && /[^s]s$/.test(k)) k = k.slice(0, -1);
  return k;
}

// Première lettre significative : après l'article, sans accent (« Écureuil » -> « e »).
export function firstLetter(s) {
  const m = fold(stripArticle(s)).match(/[a-z]/);
  return m ? m[0] : '';
}

// Pour l'IA : la réponse est une donnée, jamais une consigne. On retire ce qui
// ressemble à une tentative de parler au modèle et on borne la longueur.
export function forPrompt(s, n = ANSWER_MAX) {
  return cleanAnswer(s).replace(/["“”«»]/g, "'").slice(0, n);
}
