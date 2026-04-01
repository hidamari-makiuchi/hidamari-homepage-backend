-- レンタルスペース予約
CREATE TABLE IF NOT EXISTS public.rental_bookings (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id     UUID    NOT NULL REFERENCES public.rental_spaces(id) ON DELETE CASCADE,
  booking_date DATE    NOT NULL,
  start_hour   INT     NOT NULL CHECK (start_hour >= 0 AND start_hour <= 23),
  end_hour     INT     NOT NULL CHECK (end_hour >= 1 AND end_hour <= 24),
  guest_name   TEXT    NOT NULL,
  guest_phone  TEXT    NOT NULL,
  guest_email  TEXT    NOT NULL,
  purpose      TEXT    NOT NULL DEFAULT '',
  status       TEXT    NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'cancelled')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_hours_order CHECK (end_hour > start_hour)
);

ALTER TABLE public.rental_bookings ENABLE ROW LEVEL SECURITY;

-- ゲスト予約のため SELECT・INSERT は誰でもOK
CREATE POLICY "rental_bookings_select_all" ON public.rental_bookings FOR SELECT USING (true);
CREATE POLICY "rental_bookings_insert_all" ON public.rental_bookings FOR INSERT WITH CHECK (true);
-- 更新・削除は認証ユーザーのみ（管理者）
CREATE POLICY "rental_bookings_update_auth" ON public.rental_bookings FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "rental_bookings_delete_auth" ON public.rental_bookings FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_rental_bookings_space_date ON public.rental_bookings (space_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_rental_bookings_status ON public.rental_bookings (status);
