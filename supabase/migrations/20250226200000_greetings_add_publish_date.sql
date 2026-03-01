-- 代表挨拶に公開日を追加（その日以降に表示、直近1件を表示するため）
ALTER TABLE public.greetings
  ADD COLUMN IF NOT EXISTS publish_date DATE NOT NULL DEFAULT CURRENT_DATE;

COMMENT ON COLUMN public.greetings.publish_date IS '公開日。この日以降、公開日を過ぎたもののうち直近1件が表示対象';

CREATE INDEX IF NOT EXISTS idx_greetings_publish_date ON public.greetings (publish_date DESC);
