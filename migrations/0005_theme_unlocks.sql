-- Architectural themes are permanent resident-owned unlocks. The price paid is
-- stored with the receipt so future balancing never changes an earlier purchase.
CREATE TABLE theme_unlocks(
  user_id TEXT NOT NULL REFERENCES users(id),
  theme TEXT NOT NULL,
  cost INTEGER NOT NULL CHECK(cost>=0),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  PRIMARY KEY(user_id,theme)
);
CREATE INDEX theme_unlocks_user ON theme_unlocks(user_id,created_at);
CREATE TRIGGER theme_unlock_balance BEFORE INSERT ON theme_unlocks BEGIN
  SELECT RAISE(ABORT,'not enough bricks')
    WHERE (SELECT bricks FROM buildings WHERE user_id=NEW.user_id)<NEW.cost;
END;
CREATE TRIGGER spend_theme_unlock AFTER INSERT ON theme_unlocks BEGIN
  UPDATE buildings SET bricks=bricks-NEW.cost,updated_at=datetime('now') WHERE user_id=NEW.user_id;
END;
