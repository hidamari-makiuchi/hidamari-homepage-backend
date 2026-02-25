-- ギャラリー用: 画像URL・説明文・表示順を管理
CREATE TABLE IF NOT EXISTS public.gallery_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  src TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;

-- 閲覧は誰でもOK
CREATE POLICY "photos_select_all" ON public.gallery_photos FOR SELECT USING (true);
-- 登録・更新・削除は認証ユーザーのみ
CREATE POLICY "photos_insert_auth" ON public.gallery_photos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "photos_update_auth" ON public.gallery_photos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "photos_delete_auth" ON public.gallery_photos FOR DELETE USING (auth.uid() = user_id);

-- 表示順で取得しやすくするインデックス
CREATE INDEX IF NOT EXISTS idx_gallery_photos_sort_order ON public.gallery_photos (sort_order);
