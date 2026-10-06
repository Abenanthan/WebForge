-- =====================================================================
-- Upgrade an existing WebForge database (installed before Phase 11)
-- without losing data. Safe to run more than once.
--   mysql -u root < database/upgrade-phase11.sql
-- Fresh installs do not need this: schema.sql already contains it.
-- =====================================================================
USE webforge;

CREATE TABLE IF NOT EXISTS rate_limit_hits (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    bucket          VARCHAR(40)  NOT NULL COMMENT 'e.g. register, trace-save',
    subject         VARCHAR(64)  NOT NULL COMMENT 'IP address or user:<id>',
    hit_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_rate_bucket_subject_time (bucket, subject, hit_at)
) ENGINE=InnoDB;
