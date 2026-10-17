ALTER TABLE buildings ADD COLUMN decorations_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE decorations(
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('planter','bench','lamp','tree','sculpture')),
  cost INTEGER NOT NULL CHECK(cost>=0),
  request_data TEXT NOT NULL,
  x REAL,z REAL,
  rotation INTEGER NOT NULL DEFAULT 0 CHECK(rotation BETWEEN 0 AND 3),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  CHECK((x IS NULL AND z IS NULL) OR (x IS NOT NULL AND z IS NOT NULL AND abs(x)<=12 AND abs(z)<=12))
);
CREATE INDEX decorations_owner ON decorations(user_id,created_at,id);
CREATE TRIGGER decoration_purchase_guard BEFORE INSERT ON decorations BEGIN
  SELECT RAISE(ABORT,'not enough bricks') WHERE (SELECT bricks FROM buildings WHERE user_id=NEW.user_id)<NEW.cost;
  SELECT RAISE(ABORT,'decoration limit') WHERE (SELECT COUNT(*) FROM decorations WHERE user_id=NEW.user_id)>=24;
END;
CREATE TRIGGER decoration_purchase AFTER INSERT ON decorations BEGIN
  UPDATE buildings SET bricks=bricks-NEW.cost,decorations_version=decorations_version+1,updated_at=datetime('now') WHERE user_id=NEW.user_id;
END;
CREATE TRIGGER decoration_move AFTER UPDATE OF x,z,rotation ON decorations BEGIN
  UPDATE buildings SET decorations_version=decorations_version+1,updated_at=datetime('now') WHERE user_id=NEW.user_id;
END;
