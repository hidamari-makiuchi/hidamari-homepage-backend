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
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const url = new URL(req.url);
      const currentOnly = url.searchParams.get("current") === "1";

      if (currentOnly) {
        // 公開日を過ぎたもののうち直近1件のみ（公開用表示）
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const { data, error } = await supabase
          .from("greetings")
          .select("id, title, content, photo_url, publish_date, created_at")
          .lte("publish_date", today)
          .order("publish_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ data: data ?? null }, 200);
      }

      const { data, error } = await supabase
        .from("greetings")
        .select("id, title, content, photo_url, publish_date, sort_order, created_at")
        .order("sort_order", { ascending: true })
        .order("publish_date", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ data }, 200);
    }

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

    if (req.method === "POST") {
      let body: {
        title: string;
        content?: string;
        photo_url?: string;
        publish_date?: string;
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
      const publishDate = body.publish_date ?? new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("greetings")
        .insert({
          title: body.title,
          content: body.content ?? "",
          photo_url: body.photo_url ?? "",
          publish_date: publishDate,
          sort_order: body.sort_order ?? 0,
          user_id: user.id,
        })
        .select("id, title, content, photo_url, publish_date, sort_order, created_at")
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ data }, 201);
    }

    if (req.method === "PATCH") {
      let body: {
        id: string;
        title?: string;
        content?: string;
        photo_url?: string;
        publish_date?: string;
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
      if (body.title !== undefined) updates.title = body.title;
      if (body.content !== undefined) updates.content = body.content;
      if (body.photo_url !== undefined) updates.photo_url = body.photo_url;
      if (body.publish_date !== undefined) updates.publish_date = body.publish_date;
      if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
      if (Object.keys(updates).length === 0) {
        return jsonResponse({ error: "No fields to update" }, 400);
      }
      const { data, error } = await supabase
        .from("greetings")
        .update(updates)
        .eq("id", body.id)
        .select("id, title, content, photo_url, publish_date, sort_order, created_at")
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      if (!data)
        return jsonResponse({ error: "Not found or forbidden" }, 404);
      return jsonResponse({ data }, 200);
    }

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
      const { error } = await supabase.from("greetings").delete().eq("id", id);
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
