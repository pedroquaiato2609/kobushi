-- Lembrete passa a ser por pasta/categoria (não um único horário global).
ALTER TABLE principle_folders
  ADD COLUMN reminder_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN reminder_times    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN reminder_weekdays int[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  ADD COLUMN reminder_channels text[] NOT NULL DEFAULT '{}';

DROP TABLE principle_schedule;
