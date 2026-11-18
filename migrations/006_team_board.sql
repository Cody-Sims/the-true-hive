CREATE TABLE team_tasks (
  id text PRIMARY KEY CHECK (id ~ '^TH-(0[1-9]|[1-9][0-9]|100)$'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  assignee text CHECK (assignee IN ('cody', 'logan')),
  status text NOT NULL CHECK (status IN ('backlog', 'ready', 'doing', 'waiting', 'review', 'done')),
  priority text NOT NULL CHECK (priority IN ('P0', 'P1', 'P2')),
  epic text NOT NULL CHECK (char_length(epic) BETWEEN 1 AND 120),
  board_rank smallint NOT NULL CHECK (board_rank BETWEEN 1 AND 100),
  detail jsonb NOT NULL CHECK (jsonb_typeof(detail) = 'object' AND octet_length(detail::text) <= 8192),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by text CHECK (char_length(updated_by) BETWEEN 1 AND 160)
);

REVOKE ALL ON team_tasks FROM PUBLIC;
