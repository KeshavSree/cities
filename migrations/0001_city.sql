PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL, github_id TEXT UNIQUE, username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', avatar TEXT,
  github_url TEXT, website TEXT, school TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, github_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE buildings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  x INTEGER NOT NULL, z INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 1 CHECK(level >= 1),
  resources INTEGER NOT NULL DEFAULT 0 CHECK(resources >= 0),
  style TEXT NOT NULL DEFAULT 'terrace', color TEXT NOT NULL DEFAULT 'sand',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(x, z)
);
CREATE TABLE metrics (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  commits INTEGER NOT NULL DEFAULT 0, prs INTEGER NOT NULL DEFAULT 0,
  reviews INTEGER NOT NULL DEFAULT 0,
  credited_commits INTEGER NOT NULL DEFAULT 0,
  credited_prs INTEGER NOT NULL DEFAULT 0, credited_reviews INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT
);
CREATE INDEX metrics_due ON metrics(synced_at);
CREATE TABLE daily_claims (
  user_id TEXT NOT NULL REFERENCES users(id), day TEXT NOT NULL,
  PRIMARY KEY(user_id, day)
);
CREATE TABLE invitations (
  token TEXT PRIMARY KEY, inviter_id TEXT NOT NULL REFERENCES users(id),
  used_by TEXT UNIQUE REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX invitations_owner ON invitations(inviter_id, created_at);
CREATE TABLE sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY, invite TEXT, code_verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
);
