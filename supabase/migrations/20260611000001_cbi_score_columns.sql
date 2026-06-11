-- CBI dimension scores are averages on a 0–100 scale and can reach exactly
-- 100, which overflows numeric(4,2) (max 99.99). Widen to numeric(5,2).
ALTER TABLE public.assessments
  ALTER COLUMN exhaustion_score TYPE numeric(5,2),
  ALTER COLUMN cynicism_score TYPE numeric(5,2),
  ALTER COLUMN efficacy_score TYPE numeric(5,2),
  ALTER COLUMN total_score TYPE numeric(5,2);
