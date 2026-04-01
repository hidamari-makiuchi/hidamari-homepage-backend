-- rental_spaces に面積カラムを追加
ALTER TABLE public.rental_spaces
  ADD COLUMN IF NOT EXISTS area_sqm INT NOT NULL DEFAULT 0;
