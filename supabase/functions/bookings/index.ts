import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-token",
};

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const isAvailabilityCheck = url.searchParams.get("availability") === "1";

      // 空き確認用: ?availability=1&space_id=xxx&date=yyyy-MM-dd → 認証不要
      if (isAvailabilityCheck) {
        const spaceId = url.searchParams.get("space_id");
        const date = url.searchParams.get("date");
        if (!spaceId || !date) {
          return jsonResponse({ error: "space_id and date are required" }, 400);
        }
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const { data, error } = await supabase
          .from("rental_bookings")
          .select("start_hour, end_hour, status")
          .eq("space_id", spaceId)
          .eq("booking_date", date)
          .neq("status", "cancelled");
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ data }, 200);
      }

      // 管理者用: 認証必須、全フィールド返す
      const userToken =
        req.headers.get("X-User-Token") ??
        req.headers.get("Authorization")?.replace("Bearer ", "");
      if (!userToken) {
        return jsonResponse(
          { error: "Authorization or X-User-Token required" },
          401
        );
      }
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } },
      });
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(userToken);
      if (authError || !user) {
        return jsonResponse({ error: "Invalid or expired token" }, 401);
      }

      let query = supabase
        .from("rental_bookings")
        .select("id, space_id, booking_date, start_hour, end_hour, guest_name, guest_phone, guest_email, purpose, status, created_at")
        .order("booking_date", { ascending: true })
        .order("start_hour", { ascending: true });

      const statusParam = url.searchParams.get("status");
      if (statusParam) query = query.eq("status", statusParam);
      const spaceParam = url.searchParams.get("space_id");
      if (spaceParam) query = query.eq("space_id", spaceParam);
      const dateParam = url.searchParams.get("date");
      if (dateParam) query = query.eq("booking_date", dateParam);

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ data }, 200);
    }

    // POST: ゲスト予約（認証不要）
    if (req.method === "POST") {
      let body: {
        space_id: string;
        booking_date: string;
        start_hour: number;
        end_hour: number;
        guest_name: string;
        guest_phone: string;
        guest_email: string;
        purpose?: string;
      };
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      // バリデーション
      if (!body?.space_id || typeof body.space_id !== "string")
        return jsonResponse({ error: "space_id is required" }, 400);
      if (!body?.booking_date || typeof body.booking_date !== "string")
        return jsonResponse({ error: "booking_date is required" }, 400);
      if (typeof body.start_hour !== "number" || body.start_hour < 0 || body.start_hour > 23)
        return jsonResponse({ error: "start_hour must be 0-23" }, 400);
      if (typeof body.end_hour !== "number" || body.end_hour < 1 || body.end_hour > 24)
        return jsonResponse({ error: "end_hour must be 1-24" }, 400);
      if (body.end_hour <= body.start_hour)
        return jsonResponse({ error: "end_hour must be greater than start_hour" }, 400);
      if (!body?.guest_name || typeof body.guest_name !== "string")
        return jsonResponse({ error: "guest_name is required" }, 400);
      if (!body?.guest_phone || typeof body.guest_phone !== "string")
        return jsonResponse({ error: "guest_phone is required" }, 400);
      if (!body?.guest_email || typeof body.guest_email !== "string")
        return jsonResponse({ error: "guest_email is required" }, 400);

      const supabase = createClient(supabaseUrl, supabaseAnonKey);

      // 重複チェック: 同一スペース・同一日・キャンセル以外の予約と時間が重なる場合は 409
      const { data: conflicts, error: conflictError } = await supabase
        .from("rental_bookings")
        .select("id")
        .eq("space_id", body.space_id)
        .eq("booking_date", body.booking_date)
        .neq("status", "cancelled")
        .lt("start_hour", body.end_hour)
        .gt("end_hour", body.start_hour);

      if (conflictError) return jsonResponse({ error: conflictError.message }, 400);
      if (conflicts && conflicts.length > 0) {
        return jsonResponse({ error: "この時間帯はすでに予約されています" }, 409);
      }

      const { data, error } = await supabase
        .from("rental_bookings")
        .insert({
          space_id: body.space_id,
          booking_date: body.booking_date,
          start_hour: body.start_hour,
          end_hour: body.end_hour,
          guest_name: body.guest_name,
          guest_phone: body.guest_phone,
          guest_email: body.guest_email,
          purpose: body.purpose ?? "",
          status: "pending",
        })
        .select("id, space_id, booking_date, start_hour, end_hour, guest_name, status, created_at")
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ data }, 201);
    }

    // PATCH / DELETE は認証必須
    const userToken =
      req.headers.get("X-User-Token") ??
      req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!userToken) {
      return jsonResponse(
        { error: "Authorization or X-User-Token required" },
        401
      );
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(userToken);
    if (authError || !user) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    // PATCH: ステータス変更
    if (req.method === "PATCH") {
      let body: { id: string; status: string };
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }
      if (!body?.id || typeof body.id !== "string") {
        return jsonResponse({ error: "id is required (UUID string)" }, 400);
      }
      if (!["pending", "approved", "cancelled"].includes(body.status)) {
        return jsonResponse(
          { error: "status must be one of: pending, approved, cancelled" },
          400
        );
      }
      const { data, error } = await supabase
        .from("rental_bookings")
        .update({ status: body.status })
        .eq("id", body.id)
        .select("id, space_id, booking_date, start_hour, end_hour, guest_name, guest_phone, guest_email, purpose, status, created_at")
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      if (!data) return jsonResponse({ error: "Not found or forbidden" }, 404);
      return jsonResponse({ data }, 200);
    }

    // DELETE: 削除
    if (req.method === "DELETE") {
      let id: string | null = null;
      const contentType = req.headers.get("Content-Type") ?? "";
      if (contentType.includes("application/json")) {
        try {
          const body = await req.json();
          id = body?.id ?? null;
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }
      }
      if (!id) {
        const url = new URL(req.url);
        id = url.searchParams.get("id");
      }
      if (!id) {
        return jsonResponse(
          { error: "id required (query param or JSON body)" },
          400
        );
      }
      const { error } = await supabase.from("rental_bookings").delete().eq("id", id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ message: "Deleted" }, 200);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
}

if (import.meta.main) {
  Deno.serve(handler);
}
