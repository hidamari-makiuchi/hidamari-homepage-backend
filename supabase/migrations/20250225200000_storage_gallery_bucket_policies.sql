-- ギャラリーバケット用 Storage ポリシー
-- 事前に config.toml の [storage.buckets.gallery] または Dashboard でバケット "gallery" を作成すること。
-- 認証ユーザー: アップロード・更新・削除可能。公開読み取り。

CREATE POLICY "gallery_authenticated_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'gallery');

CREATE POLICY "gallery_authenticated_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'gallery');

CREATE POLICY "gallery_authenticated_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'gallery');

CREATE POLICY "gallery_public_select"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'gallery');
