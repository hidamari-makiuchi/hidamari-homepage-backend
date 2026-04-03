import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const EVENT_CATEGORIES = ["health", "exercise", "consultation", "social"] as const;
type EventCategory = (typeof EVENT_CATEGORIES)[number];

function isEventCategory(s: unknown): s is EventCategory {
  return typeof s === "string" && EVENT_CATEGORIES.includes(s as EventCategory);
}

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
    // GET: 一覧取得（認証不要）。クエリ start_date, end_date で日付範囲指定可能
    if (req.method === "GET") {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const url = new URL(req.url);
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");

      let query = supabase
        .from("events")
        .select("id, title, date, time, location, category, price, image_url, description, created_at")
        .order("date", { ascending: true })
        .order("time", { ascending: true });

      if (startDate) query = query.gte("date", startDate);
      if (endDate) query = query.lte("date", endDate);

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ data }, 200);
    }

    // POST / PATCH / DELETE は認証必須
    // ゲートウェイの厳密な JWT チェックを避けるため、ユーザー JWT は X-User-Token で受け取る（Authorization には anon key が送られる想定）
    const userToken = req.headers.get("X-User-Token") ?? req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!userToken) {
      return jsonResponse({ error: "Authorization or X-User-Token required" }, 401);
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

    // POST: 新規登録
    if (req.method === "POST") {
      let body: {
        title: string;
        date: string;
        time: string;
        location?: string;
        category: string;
        price?: number | null;
        image_url?: string | null;
        description?: string | null;
      };
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }
      if (!body?.title || typeof body.title !== "string") {
        return jsonResponse({ error: "title is required (string)" }, 400);
      }
      if (!body?.date || typeof body.date !== "string") {
        return jsonResponse({ error: "date is required (string, YYYY-MM-DD)" }, 400);
      }
      if (!body?.time || typeof body.time !== "string") {
        return jsonResponse({ error: "time is required (string)" }, 400);
      }
      if (!isEventCategory(body?.category)) {
        return jsonResponse(
          { error: `category must be one of: ${EVENT_CATEGORIES.join(", ")}` },
          400
        );
      }
      const price = body.price != null && Number.isFinite(Number(body.price)) ? Number(body.price) : null;
      const { data, error } = await supabase
        .from("events")
        .insert({
          title: body.title,
          date: body.date,
          time: body.time,
          location: body.location ?? "陽だまり",
          category: body.category,
          price,
          image_url: body.image_url ?? null,
          description: body.description ?? null,
          user_id: user.id,
        })
        .select("id, title, date, time, location, category, price, image_url, description, created_at")
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ data }, 201);
    }

    // PATCH: 更新
    if (req.method === "PATCH") {
      let body: {
        id: string;
        title?: string;
        date?: string;
        time?: string;
        location?: string;
        category?: string;
        price?: number | null;
        image_url?: string | null;
        description?: string | null;
      };
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }
      if (!body?.id || typeof body.id !== "string") {
        return jsonResponse({ error: "id is required (UUID string)" }, 400);
      }
      if (body.category !== undefined && !isEventCategory(body.category)) {
        return jsonResponse(
          { error: `category must be one of: ${EVENT_CATEGORIES.join(", ")}` },
          400
        );
      }
      const updates: Record<string, unknown> = {};
      if (body.title !== undefined) updates.title = body.title;
      if (body.date !== undefined) updates.date = body.date;
      if (body.time !== undefined) updates.time = body.time;
      if (body.location !== undefined) updates.location = body.location;
      if (body.category !== undefined) updates.category = body.category;
      if (body.price !== undefined) {
        updates.price = body.price != null && Number.isFinite(Number(body.price)) ? Number(body.price) : null;
      }
      if (body.image_url !== undefined) updates.image_url = body.image_url;
      if (body.description !== undefined) updates.description = body.description;
      if (Object.keys(updates).length === 0) {
        return jsonResponse({ error: "No fields to update" }, 400);
      }
      const { data, error } = await supabase
        .from("events")
        .update(updates)
        .eq("id", body.id)
        .select("id, title, date, time, location, category, price, image_url, description, created_at")
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
      const { error } = await supabase.from("events").delete().eq("id", id);
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
