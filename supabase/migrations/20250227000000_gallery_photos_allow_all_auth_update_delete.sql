-- ギャラリー: 認証済みユーザーなら誰でも更新・削除可能にする（管理者が全件操作できるように）
-- これまで: 自分の user_id のレコードのみ更新・削除可能 → 他ユーザー登録分やシードデータが編集できない

DROP POLICY IF EXISTS "photos_update_auth" ON public.gallery_photos;
DROP POLICY IF EXISTS "photos_delete_auth" ON public.gallery_photos;

CREATE POLICY "photos_update_auth" ON public.gallery_photos
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "photos_delete_auth" ON public.gallery_photos
  FOR DELETE TO authenticated
  USING (true);
