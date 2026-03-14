import { assertEquals } from "jsr:@std/assert";
import { handler } from "./index.ts";

const BASE_URL = "http://localhost:54321";
const ANON_KEY = "test-anon-key";
const VALID_TOKEN = "valid-user-jwt";

const MOCK_USER = { id: "user-uuid", email: "admin@test.com", role: "authenticated" };

const MOCK_PHOTO = {
  id: "photo-uuid-1",
  src: "https://example.com/photo.jpg",
  alt: "テスト写真",
  caption: "キャプション",
  sort_order: 0,
  created_at: "2024-01-01T00:00:00Z",
};

Deno.env.set("SUPABASE_URL", BASE_URL);
Deno.env.set("SUPABASE_ANON_KEY", ANON_KEY);

function test(name: string, fn: () => Promise<void>) {
  Deno.test({ name, sanitizeOps: false, sanitizeResources: false, fn });
}

function mockFetch(opts: {
  authOk?: boolean;
  rows?: unknown[];
  single?: unknown;
  dbError?: string;
} = {}) {
  const { authOk = true, rows = [], single = null, dbError } = opts;

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
        return new Response(JSON.stringify(single ?? MOCK_PHOTO), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "PATCH") {
        return new Response(JSON.stringify(single ?? MOCK_PHOTO), {
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
  const req = new Request(`${BASE_URL}/functions/v1/gallery`, { method: "OPTIONS" });
  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

// --- GET ---

test("GET: ギャラリー一覧を返す", async () => {
  mockFetch({ rows: [MOCK_PHOTO] });
  const req = new Request(`${BASE_URL}/functions/v1/gallery`);
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.data, [MOCK_PHOTO]);
});

test("GET: 空のリストを返す", async () => {
  mockFetch({ rows: [] });
  const req = new Request(`${BASE_URL}/functions/v1/gallery`);
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.data, []);
});

test("GET: DB エラー時は 400", async () => {
  mockFetch({ dbError: "relation 'gallery_photos' does not exist" });
  const req = new Request(`${BASE_URL}/functions/v1/gallery`);
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(typeof body.error, "string");
});

// --- POST ---

test("POST: 認証なしは 401", async () => {
  const req = new Request(`${BASE_URL}/functions/v1/gallery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ src: "https://example.com/photo.jpg" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

test("POST: 無効なトークンは 401", async () => {
  mockFetch({ authOk: false });
  const req = new Request(`${BASE_URL}/functions/v1/gallery`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": "bad-token" },
    body: JSON.stringify({ src: "https://example.com/photo.jpg" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

test("POST: src なしは 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/gallery`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ alt: "Photo alt" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "src is required (string)");
});

test("POST: 不正な JSON は 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/gallery`, {
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
  mockFetch({ single: MOCK_PHOTO });
  const req = new Request(`${BASE_URL}/functions/v1/gallery`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({
      src: "https://example.com/photo.jpg",
      alt: "テスト",
      caption: "キャプション",
    }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 201);
  assertEquals(body.data.src, MOCK_PHOTO.src);
});

// --- PATCH ---

test("PATCH: 認証なしは 401", async () => {
  const req = new Request(`${BASE_URL}/functions/v1/gallery`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "photo-uuid-1", alt: "Updated" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

test("PATCH: id なしは 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/gallery`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ alt: "Updated" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "id is required (UUID string)");
});

test("PATCH: 更新フィールドなしは 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/gallery`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ id: "photo-uuid-1" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "No fields to update");
});

test("PATCH: 正常データで 200 を返す", async () => {
  const updated = { ...MOCK_PHOTO, alt: "Updated Alt" };
  mockFetch({ single: updated });
  const req = new Request(`${BASE_URL}/functions/v1/gallery`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ id: "photo-uuid-1", alt: "Updated Alt" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.data.alt, "Updated Alt");
});

test("PATCH: sort_order のみ更新できる", async () => {
  const updated = { ...MOCK_PHOTO, sort_order: 5 };
  mockFetch({ single: updated });
  const req = new Request(`${BASE_URL}/functions/v1/gallery`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ id: "photo-uuid-1", sort_order: 5 }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.data.sort_order, 5);
});

// --- DELETE ---

test("DELETE: 認証なしは 401", async () => {
  const req = new Request(`${BASE_URL}/functions/v1/gallery?id=photo-uuid-1`, {
    method: "DELETE",
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

test("DELETE: id なしは 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/gallery`, {
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
  const req = new Request(`${BASE_URL}/functions/v1/gallery?id=photo-uuid-1`, {
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
  const req = new Request(`${BASE_URL}/functions/v1/gallery`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ id: "photo-uuid-1" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.message, "Deleted");
});

// --- Method not allowed ---

test("PUT: 405 を返す", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/gallery`, {
    method: "PUT",
    headers: { "X-User-Token": VALID_TOKEN },
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 405);
  assertEquals(body.error, "Method not allowed");
});
