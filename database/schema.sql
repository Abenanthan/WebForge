-- =====================================================================
-- WebForge database schema
-- Target: MySQL 8.0+ / MariaDB 10.4+ (XAMPP)   Engine: InnoDB   Charset: utf8mb4
-- Re-runnable: drops and recreates the database.
-- =====================================================================

DROP DATABASE IF EXISTS webforge;
CREATE DATABASE webforge CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE webforge;

-- ---------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(80)  NOT NULL,
    email           VARCHAR(190) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('student','admin') NOT NULL DEFAULT 'student',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at   TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Learning catalogue
-- ---------------------------------------------------------------------
CREATE TABLE concepts (
    id          SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug        VARCHAR(60)  NOT NULL,
    title       VARCHAR(120) NOT NULL,
    category    ENUM('html','css','js','dom','ajax','php','sql','react','routing') NOT NULL,
    lab_path    VARCHAR(120) NOT NULL COMMENT 'Frontend route of the lab that teaches this concept',
    UNIQUE KEY uq_concepts_slug (slug),
    KEY idx_concepts_category (category)
) ENGINE=InnoDB;

CREATE TABLE experiments (
    id          SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug        VARCHAR(80)  NOT NULL,
    module      VARCHAR(40)  NOT NULL,
    title       VARCHAR(120) NOT NULL,
    concept_id  SMALLINT UNSIGNED NOT NULL,
    UNIQUE KEY uq_experiments_slug (slug),
    KEY idx_experiments_module (module),
    CONSTRAINT fk_experiments_concept FOREIGN KEY (concept_id) REFERENCES concepts(id)
) ENGINE=InnoDB;

CREATE TABLE experiment_runs (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NOT NULL,
    experiment_id   SMALLINT UNSIGNED NOT NULL,
    status          ENUM('success','error') NOT NULL,
    input_json      JSON NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_runs_user_time (user_id, created_at),
    KEY idx_runs_experiment (experiment_id),
    CONSTRAINT fk_runs_user       FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE,
    CONSTRAINT fk_runs_experiment FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_progress (
    user_id             INT UNSIGNED NOT NULL,
    concept_id          SMALLINT UNSIGNED NOT NULL,
    mastery             TINYINT UNSIGNED NOT NULL DEFAULT 0,
    experiments_done    INT UNSIGNED NOT NULL DEFAULT 0,
    last_activity_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, concept_id),
    CONSTRAINT chk_progress_mastery CHECK (mastery <= 100),
    CONSTRAINT fk_progress_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    CONSTRAINT fk_progress_concept FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Project workspace
-- ---------------------------------------------------------------------
CREATE TABLE projects (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    title       VARCHAR(120) NOT NULL,
    type        ENUM('web','canvas','jsx') NOT NULL DEFAULT 'web',
    description VARCHAR(500) NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_projects_user_updated (user_id, updated_at),
    CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE project_files (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id  INT UNSIGNED NOT NULL,
    filename    VARCHAR(80) NOT NULL,
    language    ENUM('html','css','javascript','jsx','png') NOT NULL,
    content     MEDIUMTEXT NOT NULL,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_project_files_name (project_id, filename),
    CONSTRAINT fk_project_files_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Execution Trace
-- ---------------------------------------------------------------------
CREATE TABLE traces (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    trace_uid   CHAR(36)    NOT NULL,
    user_id     INT UNSIGNED NOT NULL,
    module      VARCHAR(40)  NOT NULL,
    label       VARCHAR(160) NOT NULL,
    status      ENUM('success','error') NOT NULL,
    total_ms    DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_traces_uid (trace_uid),
    KEY idx_traces_user_time (user_id, created_at),
    KEY idx_traces_user_module (user_id, module),
    CONSTRAINT fk_traces_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE trace_steps (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    trace_id    BIGINT UNSIGNED NOT NULL,
    seq         SMALLINT UNSIGNED NOT NULL,
    layer       ENUM('ui','dom','event','validation','network','server','database','state','render','router') NOT NULL,
    name        VARCHAR(120) NOT NULL,
    started_ms  DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Offset from trace start',
    duration_ms DECIMAL(10,2) NOT NULL DEFAULT 0,
    status      ENUM('success','error') NOT NULL DEFAULT 'success',
    detail_json JSON NULL,
    UNIQUE KEY uq_trace_steps_seq (trace_id, seq),
    CONSTRAINT fk_trace_steps_trace FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Assessments
-- ---------------------------------------------------------------------
CREATE TABLE quizzes (
    id          SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug        VARCHAR(80)  NOT NULL,
    title       VARCHAR(120) NOT NULL,
    description VARCHAR(300) NOT NULL,
    concept_id  SMALLINT UNSIGNED NOT NULL,
    difficulty  ENUM('beginner','intermediate','advanced') NOT NULL DEFAULT 'beginner',
    UNIQUE KEY uq_quizzes_slug (slug),
    CONSTRAINT fk_quizzes_concept FOREIGN KEY (concept_id) REFERENCES concepts(id)
) ENGINE=InnoDB;

CREATE TABLE quiz_questions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    quiz_id         SMALLINT UNSIGNED NOT NULL,
    position        TINYINT UNSIGNED NOT NULL,
    type            ENUM('mcq','true_false','output','find_error','match') NOT NULL,
    prompt          VARCHAR(500) NOT NULL,
    code_snippet    TEXT NULL,
    explanation     VARCHAR(800) NOT NULL,
    concept_id      SMALLINT UNSIGNED NOT NULL COMMENT 'Concept recommended when answered wrongly',
    payload_json    JSON NULL COMMENT 'Answer key for non-option types; never sent to client before grading',
    UNIQUE KEY uq_questions_position (quiz_id, position),
    CONSTRAINT fk_questions_quiz    FOREIGN KEY (quiz_id)    REFERENCES quizzes(id)  ON DELETE CASCADE,
    CONSTRAINT fk_questions_concept FOREIGN KEY (concept_id) REFERENCES concepts(id)
) ENGINE=InnoDB;

CREATE TABLE question_options (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    question_id INT UNSIGNED NOT NULL,
    position    TINYINT UNSIGNED NOT NULL,
    label       VARCHAR(300) NOT NULL,
    is_correct  BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE KEY uq_options_position (question_id, position),
    CONSTRAINT fk_options_question FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE quiz_attempts (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NOT NULL,
    quiz_id         SMALLINT UNSIGNED NOT NULL,
    score           SMALLINT UNSIGNED NOT NULL,
    max_score       SMALLINT UNSIGNED NOT NULL,
    duration_sec    INT UNSIGNED NULL,
    submitted_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_attempts_user_time (user_id, submitted_at),
    CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users(id)   ON DELETE CASCADE,
    CONSTRAINT fk_attempts_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE attempt_answers (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    attempt_id  INT UNSIGNED NOT NULL,
    question_id INT UNSIGNED NOT NULL,
    answer_json JSON NOT NULL,
    is_correct  BOOLEAN NOT NULL,
    UNIQUE KEY uq_answers_attempt_question (attempt_id, question_id),
    CONSTRAINT fk_answers_attempt  FOREIGN KEY (attempt_id)  REFERENCES quiz_attempts(id)  ON DELETE CASCADE,
    CONSTRAINT fk_answers_question FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Lab sandboxes (data the user experiments on; isolated per user)
-- ---------------------------------------------------------------------
CREATE TABLE lab_contacts (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    name        VARCHAR(80)  NOT NULL,
    email       VARCHAR(190) NOT NULL,
    age         TINYINT UNSIGNED NULL,
    city        VARCHAR(80)  NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_lab_contacts_user (user_id),
    CONSTRAINT fk_lab_contacts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE lab_files (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    filename    VARCHAR(48) NOT NULL,
    size_bytes  INT UNSIGNED NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_lab_files_name (user_id, filename),
    CONSTRAINT fk_lab_files_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
