import { assertEquals } from "jsr:@std/assert";
import { handler } from "./index.ts";

const BASE_URL = "http://localhost:54321";
const ANON_KEY = "test-anon-key";
const VALID_TOKEN = "valid-user-jwt";

const MOCK_USER = { id: "user-uuid", email: "admin@test.com", role: "authenticated" };

const MOCK_EVENT = {
  id: "event-uuid-1",
  title: "健康講座",
  date: "2024-03-01",
  time: "10:00",
  location: "陽だまり",
  category: "health",
  price: null,
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
        return new Response(JSON.stringify(single ?? MOCK_EVENT), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "PATCH") {
        return new Response(JSON.stringify(single ?? MOCK_EVENT), {
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
  const req = new Request(`${BASE_URL}/functions/v1/events`, { method: "OPTIONS" });
  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

// --- GET ---

test("GET: イベント一覧を返す", async () => {
  mockFetch({ rows: [MOCK_EVENT] });
  const req = new Request(`${BASE_URL}/functions/v1/events`);
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.data, [MOCK_EVENT]);
});

test("GET: start_date / end_date クエリが渡せる", async () => {
  mockFetch({ rows: [MOCK_EVENT] });
  const req = new Request(
    `${BASE_URL}/functions/v1/events?start_date=2024-03-01&end_date=2024-03-31`,
  );
  const res = await handler(req);
  assertEquals(res.status, 200);
});

test("GET: DB エラー時は 400", async () => {
  mockFetch({ dbError: "DB error" });
  const req = new Request(`${BASE_URL}/functions/v1/events`);
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(typeof body.error, "string");
});

// --- POST ---

test("POST: 認証なしは 401", async () => {
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Test", date: "2024-03-01", time: "10:00", category: "health" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

test("POST: 無効なトークンは 401", async () => {
  mockFetch({ authOk: false });
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": "bad-token" },
    body: JSON.stringify({ title: "Test", date: "2024-03-01", time: "10:00", category: "health" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

test("POST: title なしは 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ date: "2024-03-01", time: "10:00", category: "health" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "title is required (string)");
});

test("POST: date なしは 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ title: "Test", time: "10:00", category: "health" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "date is required (string, YYYY-MM-DD)");
});

test("POST: time なしは 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ title: "Test", date: "2024-03-01", category: "health" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "time is required (string)");
});

test("POST: 無効な category は 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({
      title: "Test",
      date: "2024-03-01",
      time: "10:00",
      category: "unknown",
    }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "category must be one of: health, exercise, consultation, social");
});

test("POST: 正常データで 201 を返す", async () => {
  mockFetch({ single: MOCK_EVENT });
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({
      title: "健康講座",
      date: "2024-03-01",
      time: "10:00",
      category: "health",
    }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 201);
  assertEquals(body.data.title, MOCK_EVENT.title);
});

test("POST: price が数値で渡せる", async () => {
  const eventWithPrice = { ...MOCK_EVENT, price: 500 };
  mockFetch({ single: eventWithPrice });
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({
      title: "有料講座",
      date: "2024-03-01",
      time: "14:00",
      category: "exercise",
      price: 500,
    }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 201);
  assertEquals(body.data.price, 500);
});

test("POST: 不正な JSON は 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: "not-json",
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "Invalid JSON body");
});

// --- PATCH ---

test("PATCH: 認証なしは 401", async () => {
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "event-uuid-1", title: "Updated" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

test("PATCH: id なしは 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ title: "Updated" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "id is required (UUID string)");
});

test("PATCH: 無効な category は 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ id: "event-uuid-1", category: "invalid" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "category must be one of: health, exercise, consultation, social");
});

test("PATCH: 更新フィールドなしは 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ id: "event-uuid-1" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "No fields to update");
});

test("PATCH: 正常データで 200 を返す", async () => {
  const updated = { ...MOCK_EVENT, title: "Updated Event" };
  mockFetch({ single: updated });
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ id: "event-uuid-1", title: "Updated Event" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.data.title, "Updated Event");
});

// --- DELETE ---

test("DELETE: 認証なしは 401", async () => {
  const req = new Request(`${BASE_URL}/functions/v1/events?id=event-uuid-1`, {
    method: "DELETE",
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

test("DELETE: id なしは 400", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
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
  const req = new Request(`${BASE_URL}/functions/v1/events?id=event-uuid-1`, {
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
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "X-User-Token": VALID_TOKEN },
    body: JSON.stringify({ id: "event-uuid-1" }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.message, "Deleted");
});

// --- Method not allowed ---

test("PUT: 405 を返す", async () => {
  mockFetch({});
  const req = new Request(`${BASE_URL}/functions/v1/events`, {
    method: "PUT",
    headers: { "X-User-Token": VALID_TOKEN },
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 405);
  assertEquals(body.error, "Method not allowed");
});
