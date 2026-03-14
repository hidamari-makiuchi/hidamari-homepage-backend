-- イベントに単価（円）を追加。NULL の場合は表示しない
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS price INTEGER NULL;

COMMENT ON COLUMN public.events.price IS '単価（円）。NULL の場合は非表示';
