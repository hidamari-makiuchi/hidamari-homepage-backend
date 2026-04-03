-- eventsテーブルに画像URLと詳細説明を追加
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS description TEXT;

-- イベント画像用ストレージバケット
INSERT INTO storage.buckets (id, name, public)
VALUES ('events-images', 'events-images', true)
ON CONFLICT (id) DO NOTHING;

-- 認証済みユーザーがアップロード可能
CREATE POLICY "events_images_insert_auth"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'events-images' AND auth.role() = 'authenticated');

-- 公開読み取り
CREATE POLICY "events_images_select_all"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'events-images');

-- 認証済みユーザーが削除可能
CREATE POLICY "events_images_delete_auth"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'events-images' AND auth.role() = 'authenticated');
