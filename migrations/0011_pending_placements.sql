CREATE TABLE pending_placements (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  inviter_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
