// Aléatoire déterministe de Mini Subway : chaque flux est un entier 32 bits rangé dans
// l'état de la partie, donc sérialisable, rejouable et identique sur tous les clients.

// Hache une chaîne en graine 32 bits (FNV-1a).
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Tirage mulberry32 : avance le flux `key` de l'objet `streams` et renvoie [0, 1).
export function rand(streams, key) {
  let t = (streams[key] = (streams[key] + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (s, k, n) => Math.floor(rand(s, k) * n);

// Choix pondéré : `items` = [[valeur, poids], ...] ; poids nuls ignorés.
export function weighted(s, k, items) {
  let total = 0;
  for (const [, w] of items) total += w > 0 ? w : 0;
  if (total <= 0) return items.length ? items[0][0] : null;
  let r = rand(s, k) * total;
  for (const [v, w] of items) {
    if (w <= 0) continue;
    if ((r -= w) < 0) return v;
  }
  return items[items.length - 1][0];
}

// Graine lisible (pour l'affichage et le partage) à partir d'un entier.
export function seedLabel(n) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  let v = n >>> 0;
  for (let i = 0; i < 6; i++) { s += A[v % A.length]; v = Math.floor(v / A.length); }
  return s;
}
