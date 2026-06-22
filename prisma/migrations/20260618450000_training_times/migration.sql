-- Set the training session times: Michelle Tue–Fri 12:30 PM; Marie & Sharyn 5:30 PM.
UPDATE "TrainingSchedule" SET "cadence" = 'tue-fri', "time" = '12:30 PM' WHERE "id" = 'ts_mich';
UPDATE "TrainingSchedule" SET "time" = '5:30 PM' WHERE "id" = 'ts_marie';
UPDATE "TrainingSchedule" SET "time" = '5:30 PM' WHERE "id" = 'ts_shar';
