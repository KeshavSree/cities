-- Preserve existing progression and convert the old resource balance to bricks.
ALTER TABLE buildings ADD COLUMN xp INTEGER NOT NULL DEFAULT 0 CHECK(xp>=0);
ALTER TABLE buildings ADD COLUMN bricks INTEGER NOT NULL DEFAULT 0 CHECK(bricks>=0);
ALTER TABLE buildings ADD COLUMN segments TEXT NOT NULL DEFAULT '[null,null,null,null]';
CREATE TABLE level_thresholds(level INTEGER PRIMARY KEY,xp INTEGER NOT NULL UNIQUE);
INSERT INTO level_thresholds(level,xp) VALUES (1,0),(2,100),(3,250),(4,450),(5,700),(6,1000),(7,1350),(8,1750),(9,2200),(10,2700),(11,3250),(12,3850),(13,4500),(14,5200),(15,5950),(16,6750),(17,7600),(18,8500),(19,9450),(20,10450);
UPDATE buildings SET level=MIN(level,20),bricks=resources;
UPDATE buildings SET xp=(SELECT xp FROM level_thresholds WHERE level=buildings.level);
CREATE TABLE xp_events(
 event_key TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),
 source TEXT NOT NULL,xp INTEGER NOT NULL CHECK(xp>=0),bricks INTEGER NOT NULL DEFAULT 0 CHECK(bricks>=0),
 description TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE INDEX xp_events_user ON xp_events(user_id,created_at);
INSERT INTO xp_events(event_key,user_id,source,xp,bricks,description)
 SELECT 'migration:'||user_id,user_id,'migration',xp,0,'Existing level preserved' FROM buildings;
CREATE TABLE tower_likes(voter_id TEXT NOT NULL REFERENCES users(id),tower_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT(datetime('now')),PRIMARY KEY(voter_id,tower_id),CHECK(voter_id<>tower_id));
CREATE INDEX likes_tower ON tower_likes(tower_id);
CREATE TABLE construction_events(event_key TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),
 milestone INTEGER NOT NULL,x INTEGER NOT NULL,z INTEGER NOT NULL,processed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX construction_pending ON construction_events(processed);
CREATE TABLE public_projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,x REAL NOT NULL,z REAL NOT NULL,
 goal INTEGER NOT NULL CHECK(goal>0),funded INTEGER NOT NULL DEFAULT 0 CHECK(funded>=0 AND funded<=goal),description TEXT NOT NULL);
INSERT INTO public_projects(id,name,kind,x,z,goal,description) VALUES
 ('riverside-commons','Riverside commons','park',3.5,.5,600,'A shared garden, trees and a gathering pavilion.'),
 ('makers-square','Makers square','plaza',-4.5,-3.5,900,'A public plaza with a sculpture and community seating.');
CREATE TABLE project_contributions(id TEXT PRIMARY KEY NOT NULL,project_id TEXT NOT NULL REFERENCES public_projects(id),
 user_id TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL CHECK(amount>0),created_at TEXT NOT NULL DEFAULT(datetime('now')));
CREATE INDEX contributions_project ON project_contributions(project_id,user_id);
CREATE TRIGGER apply_xp AFTER INSERT ON xp_events BEGIN
 UPDATE buildings SET xp=xp+NEW.xp,bricks=bricks+NEW.bricks,updated_at=datetime('now') WHERE user_id=NEW.user_id;
 UPDATE buildings SET level=(SELECT MAX(level) FROM level_thresholds WHERE xp<=buildings.xp) WHERE user_id=NEW.user_id;
END;
CREATE TRIGGER new_construction AFTER INSERT ON buildings BEGIN
 INSERT OR IGNORE INTO construction_events(event_key,user_id,milestone,x,z) VALUES('build:'||NEW.user_id||':1',NEW.user_id,1,NEW.x,NEW.z);
END;
CREATE TRIGGER tier_construction AFTER UPDATE OF level ON buildings WHEN NEW.level>OLD.level BEGIN
 INSERT OR IGNORE INTO construction_events(event_key,user_id,milestone,x,z)
 SELECT 'build:'||NEW.user_id||':'||level,NEW.user_id,level,NEW.x,NEW.z FROM level_thresholds
 WHERE level IN (5,9,13,17) AND level>OLD.level AND level<=NEW.level;
END;
CREATE TRIGGER apply_project_contribution AFTER INSERT ON project_contributions BEGIN
 UPDATE buildings SET bricks=bricks-NEW.amount,updated_at=datetime('now') WHERE user_id=NEW.user_id;
 UPDATE public_projects SET funded=funded+NEW.amount WHERE id=NEW.project_id;
 INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description)
 SELECT 'project:'||NEW.project_id||':'||user_id,user_id,'project',120,0,'Completed a public project'
 FROM project_contributions WHERE project_id=NEW.project_id
 AND (SELECT funded>=goal FROM public_projects WHERE id=NEW.project_id)
 GROUP BY user_id HAVING SUM(amount)>=25;
END;
INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description) SELECT 'demo-tier:demo-maya',b.user_id,'demo',MAX(0,5200-b.xp),0,'Sample tier progression' FROM buildings b JOIN users u ON u.id=b.user_id WHERE u.id='demo-maya' AND u.is_demo=1;
INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description) SELECT 'demo-tier:demo-sam',b.user_id,'demo',MAX(0,8500-b.xp),0,'Sample tier progression' FROM buildings b JOIN users u ON u.id=b.user_id WHERE u.id='demo-sam' AND u.is_demo=1;
INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description) SELECT 'demo-tier:demo-asha',b.user_id,'demo',MAX(0,4500-b.xp),0,'Sample tier progression' FROM buildings b JOIN users u ON u.id=b.user_id WHERE u.id='demo-asha' AND u.is_demo=1;
INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description) SELECT 'demo-tier:demo-leo',b.user_id,'demo',MAX(0,7600-b.xp),0,'Sample tier progression' FROM buildings b JOIN users u ON u.id=b.user_id WHERE u.id='demo-leo' AND u.is_demo=1;
INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description) SELECT 'demo-tier:demo-ida',b.user_id,'demo',MAX(0,2700-b.xp),0,'Sample tier progression' FROM buildings b JOIN users u ON u.id=b.user_id WHERE u.id='demo-ida' AND u.is_demo=1;
UPDATE construction_events SET processed=1 WHERE user_id IN ('demo-maya','demo-sam','demo-asha','demo-leo','demo-ida');
