CREATE TABLE invitation_redemptions (
  token TEXT NOT NULL REFERENCES invitations(token),
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX invitation_redemptions_token ON invitation_redemptions(token);
INSERT INTO invitation_redemptions(token,user_id,created_at)
  SELECT token,used_by,created_at FROM invitations WHERE used_by IS NOT NULL;
-- Preserve relationships created by legacy local demo seeding.
CREATE TRIGGER legacy_invitation_insert AFTER INSERT ON invitations WHEN NEW.used_by IS NOT NULL BEGIN
  INSERT OR IGNORE INTO invitation_redemptions(token,user_id,created_at) VALUES(NEW.token,NEW.used_by,NEW.created_at);
END;
CREATE TRIGGER legacy_invitation_update AFTER UPDATE OF used_by ON invitations WHEN NEW.used_by IS NOT NULL BEGIN
  INSERT OR IGNORE INTO invitation_redemptions(token,user_id) VALUES(NEW.token,NEW.used_by);
END;
