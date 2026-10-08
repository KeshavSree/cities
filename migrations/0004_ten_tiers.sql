-- Extend the XP ladder without changing earned XP, brick balances or saved designs.
INSERT INTO level_thresholds(level,xp) VALUES (21,11500),(22,12600),(23,13750),(24,14950),(25,16200),(26,17500),(27,18850),(28,20250),(29,21700),(30,23200);
DROP TRIGGER tier_construction;
UPDATE buildings SET level=(SELECT MAX(level) FROM level_thresholds WHERE xp<=buildings.xp);
UPDATE buildings SET segments=json_array(json_extract(segments,'$[0]'),json_extract(segments,'$[1]'),json_extract(segments,'$[2]'),json_extract(segments,'$[3]'),json_extract(segments,'$[4]'),json_extract(segments,'$[5]'),json_extract(segments,'$[6]'),json_extract(segments,'$[7]'),json_extract(segments,'$[8]'),json_extract(segments,'$[9]'));
CREATE TRIGGER initialize_segments AFTER INSERT ON buildings BEGIN
 UPDATE buildings SET segments=json_array(json_extract(segments,'$[0]'),json_extract(segments,'$[1]'),json_extract(segments,'$[2]'),json_extract(segments,'$[3]'),json_extract(segments,'$[4]'),json_extract(segments,'$[5]'),json_extract(segments,'$[6]'),json_extract(segments,'$[7]'),json_extract(segments,'$[8]'),json_extract(segments,'$[9]')) WHERE user_id=NEW.user_id;
END;
CREATE TRIGGER tier_construction AFTER UPDATE OF level ON buildings WHEN NEW.level>OLD.level BEGIN
 INSERT OR IGNORE INTO construction_events(event_key,user_id,milestone,x,z)
 SELECT 'build:'||NEW.user_id||':'||level,NEW.user_id,level,NEW.x,NEW.z FROM level_thresholds
 WHERE level IN (4,7,10,13,16,19,22,25,28) AND level>OLD.level AND level<=NEW.level;
END;
