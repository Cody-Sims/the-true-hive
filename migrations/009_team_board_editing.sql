ALTER TABLE team_tasks
  DROP CONSTRAINT team_tasks_id_check,
  ADD CONSTRAINT team_tasks_id_check
    CHECK (id ~ '^TH-(0[1-9]|[1-9][0-9]|100|[a-f0-9]{32})$'),
  ALTER COLUMN board_rank TYPE integer,
  DROP CONSTRAINT team_tasks_board_rank_check,
  ADD CONSTRAINT team_tasks_board_rank_check CHECK (board_rank > 0),
  ADD COLUMN archived boolean NOT NULL DEFAULT false;
