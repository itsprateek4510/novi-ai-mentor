-- m3_goals.legacy_goal_id uniqueness -- enforces the 1:1 legacy-goal -> m3-goal
-- mirror invariant. Ports novi-ai-mentor's "Fix m3 goal model" (unique=True) so the
-- schema matches the ORM model (which dropped the non-unique plain index).
--
-- Idempotent: safe against ORM create_all (model now declares unique) and against
-- an existing DB carrying the old plain index.

-- 1. Defensive dedupe: if duplicates slipped in before the constraint existed, keep
--    the earliest mirror per legacy goal first so the unique index can be created.
SET @dedup := (
    SELECT IF(
        EXISTS(
            SELECT 1 FROM information_schema.statistics
            WHERE table_schema = DATABASE() AND table_name = 'm3_goals'
              AND index_name = 'uq_m3_goals_legacy_goal_id'
        ),
        'SELECT 1',
        'DELETE t1 FROM m3_goals t1 JOIN m3_goals t2
           ON t1.legacy_goal_id = t2.legacy_goal_id AND t1.id > t2.id
         WHERE t1.legacy_goal_id IS NOT NULL'
    )
);
PREPARE stmt FROM @dedup;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Upgrade the (weak) plain index into the unique index the model requires.
SET @ddl := (
    SELECT IF(
        EXISTS(
            SELECT 1 FROM information_schema.statistics
            WHERE table_schema = DATABASE() AND table_name = 'm3_goals'
              AND index_name = 'ix_m3_goals_legacy_goal_id'
        ) AND NOT EXISTS(
            SELECT 1 FROM information_schema.statistics
            WHERE table_schema = DATABASE() AND table_name = 'm3_goals'
              AND index_name = 'uq_m3_goals_legacy_goal_id'
        ),
        'ALTER TABLE m3_goals DROP INDEX ix_m3_goals_legacy_goal_id,
                             ADD UNIQUE INDEX uq_m3_goals_legacy_goal_id (legacy_goal_id)',
        'SELECT 1'
    )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;