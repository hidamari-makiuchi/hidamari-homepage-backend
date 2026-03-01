-- 代表挨拶（タイトル・内容・写真）
CREATE TABLE IF NOT EXISTS public.greetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.greetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "greetings_select_all" ON public.greetings FOR SELECT USING (true);
CREATE POLICY "greetings_insert_auth" ON public.greetings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "greetings_update_auth" ON public.greetings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "greetings_delete_auth" ON public.greetings FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_greetings_sort_order ON public.greetings (sort_order);
