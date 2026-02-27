-- homepage/public/images の画像を gallery_photos に登録するシード用 SQL
--
-- src について:
--   ここでは「画像の場所」を表す URL/パス（/images/xxx.jpg）を入れています。
--   base64（data:image/jpeg;base64,...）を入れても動作しますが、
--   画像が大きいとDBが膨らむため、通常は URL で持つ運用が推奨です。
--   本番では src をフルURL（例: https://your-site.vercel.app/images/xxx.jpg）にしても可。
--
-- 実行前に auth.users に少なくとも1件ユーザーが存在すること。

INSERT INTO public.gallery_photos (src, alt, caption, sort_order, user_id)
SELECT v.src, v.alt, v.caption, v.sort_order, u.id
FROM (VALUES
  ('/images/gallery-1.jpg', '陽だまりの室内での健康相談の様子', 'あたたかい雰囲気の中で、健康相談を行っています', 1),
  ('/images/gallery-2.jpg', '健康体操の様子', 'みんなで楽しく健康体操', 2),
  ('/images/gallery-3.jpg', '血圧測定の様子', '血圧測定など、気軽に健康チェック', 3),
  ('/images/gallery-4.jpg', '陽だまりの外観', '地域に根ざした、あたたかい居場所', 4),
  ('/images/gallery-5.jpg', '地域の方とのお茶会', 'お茶を飲みながら、ゆっくりお話し', 5),
  ('/images/gallery-6.jpg', '健康教室の様子', '健康に関する学びの場を提供しています', 6)
) AS v(src, alt, caption, sort_order)
CROSS JOIN (SELECT id FROM auth.users LIMIT 1) u;

-- ※ 事前に auth.users に1件以上ユーザーが必要です。
-- ※ 重複実行すると同じ6件が追加されます。最初だけ実行するか、実行前に TRUNCATE public.gallery_photos; を検討してください。
