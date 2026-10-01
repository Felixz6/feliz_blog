-- Additive only. Do not drop tables on application rollback.
CREATE TABLE IF NOT EXISTS rum_navigations (
  environment TEXT NOT NULL CHECK(environment IN ('local','preview','production')),
  navigation_id TEXT NOT NULL,
  identity_json TEXT NOT NULL,
  navigation_started_at INTEGER NOT NULL,
  quarantined INTEGER NOT NULL DEFAULT 0 CHECK(quarantined IN (0,1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(environment,navigation_id)
);
CREATE INDEX IF NOT EXISTS rum_navigation_window ON rum_navigations(environment,navigation_started_at,navigation_id);
CREATE TABLE IF NOT EXISTS rum_revisions (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  environment TEXT NOT NULL,
  navigation_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 0),
  content_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  UNIQUE(environment,navigation_id,revision),
  FOREIGN KEY(environment,navigation_id) REFERENCES rum_navigations(environment,navigation_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS rum_conflicts (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  environment TEXT NOT NULL,
  navigation_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('identity','revision')),
  content_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  UNIQUE(environment,navigation_id,revision,content_json),
  FOREIGN KEY(environment,navigation_id) REFERENCES rum_navigations(environment,navigation_id) ON DELETE CASCADE
);
