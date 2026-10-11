CREATE TABLE github_calendars (user_id TEXT PRIMARY KEY REFERENCES users(id), calendar TEXT NOT NULL, fetched_at TEXT NOT NULL DEFAULT(datetime('now')));
