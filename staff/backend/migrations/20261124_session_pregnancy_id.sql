-- Pregnancy episodes (stage 2): kick counter and contraction timer sessions record their pregnancy.
-- Additive and re-runnable (MariaDB IF NOT EXISTS). No FK; NULL = no ongoing pregnancy / older session.

ALTER TABLE kick_counter_sessions
    ADD COLUMN IF NOT EXISTS pregnancy_id INT NULL,
    ADD INDEX IF NOT EXISTS idx_kick_sessions_pregnancy (pregnancy_id);

ALTER TABLE contraction_sessions
    ADD COLUMN IF NOT EXISTS pregnancy_id INT NULL,
    ADD INDEX IF NOT EXISTS idx_contraction_sessions_pregnancy (pregnancy_id);
