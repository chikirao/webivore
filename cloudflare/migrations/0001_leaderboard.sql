-- WEBIVORE leaderboard. A "site" is a distinct hostname cleared to 100%.
-- Players are anonymous: a nickname plus a bearer secret kept in the browser.
-- Only salted hashes of the secret, network and browser traits are stored.

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  nickname_key TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX players_device ON players (device_hash, created_at);
CREATE INDEX players_ip ON players (ip_hash, created_at);

-- A run is opened when a captured level starts and closed once on completion.
-- Server-side timestamps bound how quickly a level can be "finished".
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  host TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  pieces_max INTEGER NOT NULL,
  min_seconds REAL NOT NULL,
  ip_hash TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  player_id TEXT,
  finished_at INTEGER,
  seconds REAL,
  pieces INTEGER
);
CREATE INDEX runs_ip ON runs (ip_hash, started_at);
CREATE INDEX runs_player ON runs (player_id, finished_at);

-- One row per player, site and UTC day: the daily board.
CREATE TABLE meals (
  player_id TEXT NOT NULL,
  host TEXT NOT NULL,
  day TEXT NOT NULL,
  first_at INTEGER NOT NULL,
  best_seconds REAL NOT NULL,
  pieces INTEGER NOT NULL,
  PRIMARY KEY (player_id, host, day)
);
CREATE INDEX meals_day ON meals (day, player_id);

-- One row per player and site: the all-time board.
CREATE TABLE player_sites (
  player_id TEXT NOT NULL,
  host TEXT NOT NULL,
  first_at INTEGER NOT NULL,
  best_seconds REAL NOT NULL,
  pieces INTEGER NOT NULL,
  PRIMARY KEY (player_id, host)
);
