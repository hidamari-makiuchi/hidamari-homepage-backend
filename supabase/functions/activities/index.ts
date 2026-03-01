import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ACTIVITY_TYPES = ["top", "event", "event_blog"] as const;
type ActivityType = (typeof ACTIVITY_TYPES)[number];

function isActivityType(s: unknown): s is ActivityType {
  return typeof s === "string" && ACTIVITY_TYPES.includes(s as ActivityType);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    // GET: 一覧取得（認証不要）。クエリ type で種類フィルタ可能
    if (req.method === "GET") {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const url = new URL(req.url);
      const typeParam = url.searchParams.get("type");

      let query = supabase
        .from("activities")
        .select("id, title, description, photo_url, type, sort_order, created_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (typeParam && isActivityType(typeParam)) {
        query = query.eq("type", typeParam);
      }

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ data }, 200);
    }

    // POST / PATCH / DELETE は認証必須
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

    // POST: 新規登録
    if (req.method === "POST") {
      let body: {
        title: string;
        description?: string;
        photo_url?: string;
        type: string;
        sort_order?: number;
      };
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }
      if (!body?.title || typeof body.title !== "string") {
        return jsonResponse({ error: "title is required (string)" }, 400);
      }
      if (!isActivityType(body?.type)) {
        return jsonResponse(
          { error: `type must be one of: ${ACTIVITY_TYPES.join(", ")}` },
          400
        );
      }
      const { data, error } = await supabase
        .from("activities")
        .insert({
          title: body.title,
          description: body.description ?? "",
          photo_url: body.photo_url ?? "",
          type: body.type,
          sort_order: body.sort_order ?? 0,
          user_id: user.id,
        })
        .select("id, title, description, photo_url, type, sort_order, created_at")
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ data }, 201);
    }

    // PATCH: 更新
    if (req.method === "PATCH") {
      let body: {
        id: string;
        title?: string;
        description?: string;
        photo_url?: string;
        type?: string;
        sort_order?: number;
      };
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }
      if (!body?.id || typeof body.id !== "string") {
        return jsonResponse({ error: "id is required (UUID string)" }, 400);
      }
      if (body.type !== undefined && !isActivityType(body.type)) {
        return jsonResponse(
          { error: `type must be one of: ${ACTIVITY_TYPES.join(", ")}` },
          400
        );
      }
      const updates: Record<string, unknown> = {};
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
      if (body.photo_url !== undefined) updates.photo_url = body.photo_url;
      if (body.type !== undefined) updates.type = body.type;
      if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
      if (Object.keys(updates).length === 0) {
        return jsonResponse({ error: "No fields to update" }, 400);
      }
      const { data, error } = await supabase
        .from("activities")
        .update(updates)
        .eq("id", body.id)
        .select("id, title, description, photo_url, type, sort_order, created_at")
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      if (!data)
        return jsonResponse({ error: "Not found or forbidden" }, 404);
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
      const { error } = await supabase.from("activities").delete().eq("id", id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ message: "Deleted" }, 200);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
