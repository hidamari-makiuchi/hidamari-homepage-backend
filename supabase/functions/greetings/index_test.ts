import { assertEquals } from "jsr:@std/assert";
import { handler } from "./index.ts";

const BASE_URL = "http://localhost:54321";
const ANON_KEY = "test-anon-key";
const VALID_TOKEN = "valid-user-jwt";

const MOCK_USER = { id: "user-uuid", email: "admin@test.com", role: "authenticated" };

const MOCK_GREETING = {
  id: "greeting-uuid-1",
  title: "代表挨拶",
  content: "ようこそ陽だまりへ",
  photo_url: "https://example.com/photo.jpg",
  publish_date: "2024-01-01",
  sort_order: 0,
  created_at: "2024-01-01T00:00:00Z",
};

Deno.env.set("SUPABASE_URL", BASE_URL);
Deno.env.set("SUPABASE_ANON_KEY", ANON_KEY);

function test(name: string, fn: () => Promise<void>) {
  Deno.test({ name, sanitizeOps: false, sanitizeResources: false, fn });
}

/**
 * maybeSingle() は Accept: application/vnd.pgrst.object+json を送る。
 * データなし時は 406 を返すと supabase-js が { data: null, error: null } に変換する。
 * singleRow === null の場合は 406 を返す。
 */
function mockFetch(opts: {
  authOk?: boolean;
  rows?: unknown[];
  singleRow?: unknown; // undefined = use MOCK_GREETING, null = no data (maybeSingle)
  dbError?: string;
} = {}) {
  const { authOk = true, rows = [], singleRow, dbError } = opts;

  globalThis.fetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const urlStr = url.toString();
    const method = init?.method?.toUpperCase() ?? "GET";

    if (urlStr.includes("/auth/v1/user")) {
      if (authOk) {
        return new Response(JSON.stringify(MOCK_USER), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr.includes("/rest/v1/")) {
      if (dbError) {
        return new Response(
          JSON.stringify({ message: dbError, code: "42P01", details: null, hint: null }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      if (method === "DELETE") return new Response(null, { status: 204 });
      if (method === "POST") {
        return new Response(JSON.stringify(singleRow ?? MOCK_GREETING), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "PATCH") {
        return new Response(JSON.stringify(singleRow ?? MOCK_GREETING), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // GET: singleRow が null → no data (406), 設定済み → 単一オブジェクト, undefined → 配列
      if (singleRow === null) {
        return new Response(
          JSON.stringify({
            message: "JSON object requested, multiple (or no) rows returned",
            code: "PGRST116",
            details: "The result contains 0 rows",
            hint: null,
          }),
          { status: 406, headers: { "Content-Type": "application/json" } },
        );
      }
      if (singleRow !== undefined) {
        return new Response(JSON.stringify(singleRow), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Range": `0-${Math.max(0, (rows as unknown[]).length - 1)}/${rows.length}`,
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  };
}

// --- OPTIONS ---

test("OPTIONS: CORS ヘッダーを返す", async () => {
  const req = new Request(`${BASE_URL}/functions/v1/greetings`, { method: "OPTIONS" });
  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

// --- GET (一覧) ---

test("GET: 挨拶一覧を返す", async () => {
  mockFetch({ rows: [MOCK_GREETING] });
  const req = new Request(`${BASE_URL}/functions/v1/greetings`);
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.data, [MOCK_GREETING]);
});

test("GET: DB エラー時は 400", async () => {
  mockFetch({ dbError: "DB error" });
  const req = new Request(`${BASE_URL}/functions/v1/greetings`);
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(typeof body.error, "string");
});

// --- GET ?current=1 ---

test("GET: current=1 で最新の挨拶を返す", async () => {
  mockFetch({ singleRow: MOCK_GREETING });
  const req = new Request(`${BASE_URL}/functions/v1/greetings?current=1`);
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.data.id, MOCK_GREETING.id);
});

test("GET: current=1 でデータなしは null を返す", async () => {
  mockFetch({ singleRow: null });
  const req = new Request(`${BASE_URL}/functions/v1/greetings?current=1`);
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.data, null);
});

// --- POST ---

test("POST: 認証なしは 401", async () => {
  const req = new Request(`${BASE_URL}/functions/v1/greetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "挨拶" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

test("POST: 無効なトークンは 401", async () => {
  mockFetch({ authOk: false });
  const req = new Request(`${BASE_URL}/functions/v1/greetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": "bad-token" },
    body: JSON.stringify({ title: "挨拶" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

test("POST: title なしは 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/greetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ content: "内容のみ" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "title is required (string)");
});

test("POST: 不正な JSON は 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/greetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: "not-json",
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "Invalid JSON body");
});

test("POST: 正常データで 201 を返す", async () => {
  mockFetch({ singleRow: MOCK_GREETING });
  const req = new Request(`${BASE_URL}/functions/v1/greetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ title: "代表挨拶", content: "ようこそ" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 201);
  assertEquals(body.data.title, MOCK_GREETING.title);
});

test("POST: publish_date を指定できる", async () => {
  const g = { ...MOCK_GREETING, publish_date: "2025-04-01" };
  mockFetch({ singleRow: g });
  const req = new Request(`${BASE_URL}/functions/v1/greetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ title: "予告挨拶", publish_date: "2025-04-01" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 201);
  assertEquals(body.data.publish_date, "2025-04-01");
});

// --- PATCH ---

test("PATCH: 認証なしは 401", async () => {
  const req = new Request(`${BASE_URL}/functions/v1/greetings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "greeting-uuid-1", title: "Updated" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

test("PATCH: id なしは 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/greetings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ title: "Updated" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "id is required (UUID string)");
});

test("PATCH: 更新フィールドなしは 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/greetings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ id: "greeting-uuid-1" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "No fields to update");
});

test("PATCH: 正常データで 200 を返す", async () => {
  const updated = { ...MOCK_GREETING, title: "Updated Greeting" };
  mockFetch({ singleRow: updated });
  const req = new Request(`${BASE_URL}/functions/v1/greetings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ id: "greeting-uuid-1", title: "Updated Greeting" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.data.title, "Updated Greeting");
});

// --- DELETE ---

test("DELETE: 認証なしは 401", async () => {
  const req = new Request(`${BASE_URL}/functions/v1/greetings?id=greeting-uuid-1`, {
    method: "DELETE",
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

test("DELETE: id なしは 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/greetings`, {
    method: "DELETE",
    headers: { "X-User-Token": VALID_TOKEN },
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "id required (query param or JSON body)");
});

test("DELETE: クエリパラメータで id 指定", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/greetings?id=greeting-uuid-1`, {
    method: "DELETE",
    headers: { "X-User-Token": VALID_TOKEN },
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.message, "Deleted");
});

test("DELETE: JSON ボディで id 指定", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/greetings`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ id: "greeting-uuid-1" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.message, "Deleted");
});

// --- Method not allowed ---

test("PUT: 405 を返す", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/greetings`, {
    method: "PUT",
    headers: { "X-User-Token": VALID_TOKEN },
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 405);
  assertEquals(body.error, "Method not allowed");
});
