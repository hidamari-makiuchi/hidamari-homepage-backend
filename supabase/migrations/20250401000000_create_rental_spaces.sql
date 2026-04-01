-- レンタルスペース
CREATE TABLE IF NOT EXISTS public.rental_spaces (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT    NOT NULL,
  description    TEXT    NOT NULL DEFAULT '',
  capacity       INT     NOT NULL DEFAULT 1,
  price_per_hour INT     NOT NULL DEFAULT 0,
  photo_url      TEXT    NOT NULL DEFAULT '',
  is_available   BOOLEAN NOT NULL DEFAULT true,
  sort_order     INT     NOT NULL DEFAULT 0,
  user_id        UUID    NOT NULL REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rental_spaces ENABLE ROW LEVEL SECURITY;

-- 閲覧は誰でもOK
CREATE POLICY "rental_spaces_select_all" ON public.rental_spaces FOR SELECT USING (true);
-- 登録・更新・削除は認証ユーザーのみ
CREATE POLICY "rental_spaces_insert_auth" ON public.rental_spaces FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rental_spaces_update_auth" ON public.rental_spaces FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "rental_spaces_delete_auth" ON public.rental_spaces FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_rental_spaces_sort_order ON public.rental_spaces (sort_order);
CREATE INDEX IF NOT EXISTS idx_rental_spaces_is_available ON public.rental_spaces (is_available);
