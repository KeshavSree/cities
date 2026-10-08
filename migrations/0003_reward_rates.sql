-- Update future completion rewards without changing historical XP ledger entries.
DROP TRIGGER apply_project_contribution;
CREATE TRIGGER apply_project_contribution AFTER INSERT ON project_contributions BEGIN
 UPDATE buildings SET bricks=bricks-NEW.amount,updated_at=datetime('now') WHERE user_id=NEW.user_id;
 UPDATE public_projects SET funded=funded+NEW.amount WHERE id=NEW.project_id;
 INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description)
 SELECT 'project:'||NEW.project_id||':'||user_id,user_id,'project',200,0,'Completed a public project'
 FROM project_contributions WHERE project_id=NEW.project_id
 AND (SELECT funded>=goal FROM public_projects WHERE id=NEW.project_id)
 GROUP BY user_id HAVING SUM(amount)>=25;
END;
