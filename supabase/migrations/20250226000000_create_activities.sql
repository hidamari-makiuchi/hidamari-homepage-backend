-- 陽だまりの活動（トップ・イベント・イベントブログ）
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('top', 'event', 'event_blog')),
  sort_order INT NOT NULL DEFAULT 0,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- 閲覧は誰でもOK
CREATE POLICY "activities_select_all" ON public.activities FOR SELECT USING (true);
-- 登録・更新・削除は認証ユーザーのみ
CREATE POLICY "activities_insert_auth" ON public.activities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "activities_update_auth" ON public.activities FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "activities_delete_auth" ON public.activities FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_activities_type ON public.activities (type);
CREATE INDEX IF NOT EXISTS idx_activities_sort_order ON public.activities (sort_order);
