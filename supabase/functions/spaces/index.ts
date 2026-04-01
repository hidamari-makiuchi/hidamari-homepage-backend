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
    // GET: 一覧取得
    // X-User-Token なし → is_available=true のみ返す
    // X-User-Token あり（管理者） → 全件返す
    if (req.method === "GET") {
      const userToken = req.headers.get("X-User-Token");
      const supabase = createClient(supabaseUrl, supabaseAnonKey);

      let query = supabase
        .from("rental_spaces")
        .select("id, name, description, capacity, area_sqm, price_per_hour, photo_url, is_available, sort_order, created_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (!userToken) {
        query = query.eq("is_available", true);
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
        name: string;
        description?: string;
        capacity?: number;
        area_sqm?: number;
        price_per_hour?: number;
        photo_url?: string;
        is_available?: boolean;
        sort_order?: number;
      };
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }
      if (!body?.name || typeof body.name !== "string") {
        return jsonResponse({ error: "name is required (string)" }, 400);
      }
      const { data, error } = await supabase
        .from("rental_spaces")
        .insert({
          name: body.name,
          description: body.description ?? "",
          capacity: body.capacity ?? 1,
          area_sqm: body.area_sqm ?? 0,
          price_per_hour: body.price_per_hour ?? 0,
          photo_url: body.photo_url ?? "",
          is_available: body.is_available ?? true,
          sort_order: body.sort_order ?? 0,
          user_id: user.id,
        })
        .select("id, name, description, capacity, area_sqm, price_per_hour, photo_url, is_available, sort_order, created_at")
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ data }, 201);
    }

    // PATCH: 更新
    if (req.method === "PATCH") {
      let body: {
        id: string;
        name?: string;
        description?: string;
        capacity?: number;
        area_sqm?: number;
        price_per_hour?: number;
        photo_url?: string;
        is_available?: boolean;
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
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.capacity !== undefined) updates.capacity = body.capacity;
      if (body.area_sqm !== undefined) updates.area_sqm = body.area_sqm;
      if (body.price_per_hour !== undefined) updates.price_per_hour = body.price_per_hour;
      if (body.photo_url !== undefined) updates.photo_url = body.photo_url;
      if (body.is_available !== undefined) updates.is_available = body.is_available;
      if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
      if (Object.keys(updates).length === 0) {
        return jsonResponse({ error: "No fields to update" }, 400);
      }
      const { data, error } = await supabase
        .from("rental_spaces")
        .update(updates)
        .eq("id", body.id)
        .select("id, name, description, capacity, area_sqm, price_per_hour, photo_url, is_available, sort_order, created_at")
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
      const { error } = await supabase.from("rental_spaces").delete().eq("id", id);
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
