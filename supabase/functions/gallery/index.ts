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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    // GET: 表示順で一覧取得（認証不要）
    if (req.method === "GET") {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await supabase
        .from("gallery_photos")
        .select("id, src, alt, caption, sort_order, created_at")
        .order("sort_order", { ascending: true });

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
      let body: { src: string; alt?: string; caption?: string; sort_order?: number };
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }
      if (!body?.src || typeof body.src !== "string") {
        return jsonResponse({ error: "src is required (string)" }, 400);
      }
      const { data, error } = await supabase
        .from("gallery_photos")
        .insert({
          src: body.src,
          alt: body.alt ?? "",
          caption: body.caption ?? "",
          sort_order: body.sort_order ?? 0,
          user_id: user.id,
        })
        .select("id, src, alt, caption, sort_order, created_at")
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ data }, 201);
    }

    // PATCH: 更新
    if (req.method === "PATCH") {
      let body: {
        id: string;
        src?: string;
        alt?: string;
        caption?: string;
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
      const updates: Record<string, unknown> = {};
      if (body.src !== undefined) updates.src = body.src;
      if (body.alt !== undefined) updates.alt = body.alt;
      if (body.caption !== undefined) updates.caption = body.caption;
      if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
      if (Object.keys(updates).length === 0) {
        return jsonResponse({ error: "No fields to update" }, 400);
      }
      const { data, error } = await supabase
        .from("gallery_photos")
        .update(updates)
        .eq("id", body.id)
        .select("id, src, alt, caption, sort_order, created_at")
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
      const { error } = await supabase
        .from("gallery_photos")
        .delete()
        .eq("id", id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ message: "Deleted" }, 200);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
