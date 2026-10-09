-- Preserve likes and their timestamps while allowing residents to like themselves.
CREATE TABLE tower_likes_with_self (
  voter_id TEXT NOT NULL REFERENCES users(id),
  tower_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  PRIMARY KEY(voter_id,tower_id)
);
INSERT INTO tower_likes_with_self(voter_id,tower_id,created_at)
  SELECT voter_id,tower_id,created_at FROM tower_likes;
DROP TABLE tower_likes;
ALTER TABLE tower_likes_with_self RENAME TO tower_likes;
CREATE INDEX likes_tower ON tower_likes(tower_id);
