-- SATIT Orbital leaderboard. Stores only generated callsigns (no personal information).
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission TEXT NOT NULL,
  level TEXT NOT NULL,
  challenge TEXT,
  callsign TEXT NOT NULL,
  score INTEGER NOT NULL,
  stars INTEGER NOT NULL,
  design TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scores_board ON scores (mission, level, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_challenge ON scores (challenge, score DESC);
