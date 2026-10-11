-- Credit real residents who already completed signup and tower placement.
-- Existing unlock receipts and balances are preserved; the exclusive reward is free.
INSERT OR IGNORE INTO theme_unlocks(user_id,theme,cost)
SELECT i.inviter_id,'cyberpunk',0
FROM invitation_redemptions r
JOIN invitations i ON i.token=r.token
JOIN users joined ON joined.id=r.user_id AND joined.is_demo=0
JOIN buildings placed ON placed.user_id=r.user_id
JOIN buildings inviter ON inviter.user_id=i.inviter_id
GROUP BY i.inviter_id
HAVING COUNT(DISTINCT r.user_id)>=3;
