-- Nearby rewards follow each level gained, including creation at level one.
-- Existing XP, balances and ledger keys are preserved.
DROP TRIGGER IF EXISTS new_construction;
DROP TRIGGER IF EXISTS tier_construction;

-- Placing a new tower is its first level-up: 0 -> 1.
CREATE TRIGGER new_construction AFTER INSERT ON buildings BEGIN
 INSERT OR IGNORE INTO construction_events(event_key,user_id,milestone,x,z)
 VALUES('build:'||NEW.user_id||':1',NEW.user_id,1,NEW.x,NEW.z);
END;

CREATE TRIGGER level_up_construction AFTER UPDATE OF level ON buildings
WHEN NEW.level>OLD.level BEGIN
 INSERT OR IGNORE INTO construction_events(event_key,user_id,milestone,x,z)
 SELECT 'build:'||NEW.user_id||':'||level,NEW.user_id,level,NEW.x,NEW.z
 FROM level_thresholds WHERE level>OLD.level AND level<=NEW.level;
END;
