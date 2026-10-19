-- Compteurs agrégés uniquement : aucune ligne par visite, aucune IP, aucun identifiant.
CREATE TABLE IF NOT EXISTS counters (
  hour  INTEGER NOT NULL,   -- heure UTC (époque / 3600000)
  scope TEXT    NOT NULL,   -- 'all' ou l'identifiant d'une page (jeu)
  dim   TEXT    NOT NULL,   -- page | entry | country | city | device | browser | os | ref
  key   TEXT    NOT NULL,   -- valeur de la dimension
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hour, scope, dim, key)
) WITHOUT ROWID;

-- Point représentatif d'une ville (estimation Cloudflare, arrondie à 0,1° ≈ 10 km). Un point par ville,
-- jamais par visiteur ; purgé avec les compteurs.
CREATE TABLE IF NOT EXISTS places (
  key TEXT PRIMARY KEY,     -- 'FR|Lyon'
  lat REAL NOT NULL,
  lon REAL NOT NULL
) WITHOUT ROWID;
