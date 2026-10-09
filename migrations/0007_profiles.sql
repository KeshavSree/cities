ALTER TABLE users ADD COLUMN bio_customized INTEGER NOT NULL DEFAULT 0;

-- Keep image bytes outside neighborhood snapshots; residents share only the URL.
CREATE TABLE profile_photos (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  image BLOB NOT NULL,
  version TEXT NOT NULL
);
