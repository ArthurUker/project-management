-- RP05-T02: additive bootstrap for an explicit, independent high-risk action.
-- No role grant; no other frozen action activated; retain this row on rollback.
INSERT INTO permissions (id, code, name, module, is_high_risk, sort_order)
VALUES ('39793795-a97d-4855-bf31-63c241c2c3b4', 'milestones.delete', 'milestones.delete', 'milestones', true, 999)
ON CONFLICT (code) DO NOTHING;
