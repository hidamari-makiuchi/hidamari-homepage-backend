-- カレンダー表示用イベント
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '陽だまり',
  category TEXT NOT NULL CHECK (category IN ('health','exercise','consultation','social')),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- 閲覧は誰でもOK（公開HP用）
CREATE POLICY "events_select_all" ON public.events FOR SELECT USING (true);
-- 挿入は認証済みユーザーのみ
CREATE POLICY "events_insert_auth" ON public.events FOR INSERT WITH CHECK (auth.uid() = user_id);
-- 更新は認証済みユーザーのみ
CREATE POLICY "events_update_auth" ON public.events FOR UPDATE USING (auth.uid() = user_id);
-- 削除は認証済みユーザーのみ
CREATE POLICY "events_delete_auth" ON public.events FOR DELETE USING (auth.uid() = user_id);

-- 日付範囲での取得用インデックス
CREATE INDEX IF NOT EXISTS idx_events_date ON public.events (date);
