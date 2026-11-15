-- SATIT Orbital v2 features: server-issued seeds, daily challenge, replays and classrooms.
-- Still no personal information: only generated callsigns and random codes are stored.
-- Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
ALTER TABLE scores ADD COLUMN seed INTEGER;
ALTER TABLE scores ADD COLUMN decisions TEXT;
ALTER TABLE scores ADD COLUMN daily TEXT;
ALTER TABLE scores ADD COLUMN class TEXT;

-- One-time seeds handed out before an open run starts, so the server (not the browser) picks the emergencies.
CREATE TABLE IF NOT EXISTS issued_seeds (
  id TEXT PRIMARY KEY,
  seed INTEGER NOT NULL,
  mission TEXT NOT NULL,
  level TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_issued_seeds_at ON issued_seeds (issued_at);

-- Classrooms: a random code plus the SHA-256 of the teacher key. No names, no free text.
CREATE TABLE IF NOT EXISTS classes (
  code TEXT PRIMARY KEY,
  teacher_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scores_daily ON scores (daily, mission, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_class ON scores (class);
