# Backend（Supabase）

ギャラリー・カレンダーイベント用のSupabaseバックエンドです。

## セットアップ

```bash
cd backend
npx supabase start
```

マイグレーションは `supabase start` 時に自動適用されます。

### 管理者ユーザーの登録

管理者画面でログインするユーザーは **Supabase ダッシュボード（Authentication → Users）** で作成します。メール/パスワードでユーザーを追加してください。

### ギャラリー用 Storage バケット

`config.toml` に `[storage.buckets.gallery]` を定義済みです。`supabase start` でバケットが作成され、マイグレーション `20250225200000_storage_gallery_bucket_policies.sql` で認証ユーザーのアップロード・公開読み取りのポリシーを設定します。本番で Supabase を利用する場合は、Dashboard の Storage でバケット `gallery`（public）を作成し、同様の RLS ポリシーを設定してください。

## ギャラリー

### テーブル `gallery_photos`

| カラム      | 型        | 説明           |
|------------|-----------|----------------|
| id         | UUID      | 主キー         |
| src        | TEXT      | 画像URL        |
| alt        | TEXT      | 代替テキスト   |
| caption    | TEXT      | 説明文         |
| sort_order | INT       | 表示順（昇順） |
| user_id    | UUID      | 登録者（auth.users） |
| created_at | TIMESTAMPTZ | 作成日時     |

- **閲覧**: 誰でも可能（RLSで SELECT 許可）
- **登録・更新・削除**: 認証ユーザーのみ（自分のレコードのみ）

### ギャラリー API（Edge Function `gallery`）

同一エンドポイントで GET / POST / PATCH / DELETE を扱います。

```bash
# ローカルで関数を起動（supabase start 済みであること）
npx supabase functions serve gallery
```

- **GET**: 認証不要（ログイン不要）。ホームページのフロントから anon key のみで呼び出し可能。表示順で一覧取得。
- **POST / PATCH / DELETE**: 認証必須（`Authorization: Bearer <ユーザーJWT>`）。RLS により自分のレコードのみ操作可能。

#### GET — 一覧取得（表示順・認証不要）

フロントからは anon key を付けて呼び出します（ユーザーログイン不要）。

```bash
curl "http://127.0.0.1:54321/functions/v1/gallery" \
  -H "Authorization: Bearer <ANON_KEY>"
```

レスポンス例:

```json
{
  "data": [
    {
      "id": "uuid",
      "src": "https://...",
      "alt": "説明",
      "caption": "キャプション",
      "sort_order": 0,
      "created_at": "2025-02-25T..."
    }
  ]
}
```

#### POST — 新規登録

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/gallery" \
  -H "Authorization: Bearer <ユーザーJWT>" \
  -H "Content-Type: application/json" \
  -d '{"src":"https://example.com/photo.jpg","alt":"説明","caption":"キャプション","sort_order":0}'
```

- **`src`** 必須（文字列）。**URL をそのまま受け取ります。** 画像バイナリは受け取らず、すでにどこかで配信されている画像の「場所」を渡す想定です。
- `alt`, `caption`, `sort_order` は任意（省略時は `""` / `0`）。
- レスポンス: 作成された1件（`201`）。

**アップロード画面を作る場合の流れ（何が `src` にセットされるか）**

1. ユーザーが画面でファイルを選択し「アップロード」する。
2. **まず画像を Supabase Storage などにアップロード**し、**公開 URL を取得**する。  
   （例: `https://<project>.supabase.co/storage/v1/object/public/images/abc123.jpg`）
3. その **URL を `src` にして**、`POST /functions/v1/gallery` を呼ぶ。  
   body: `{ "src": "取得したURL", "alt": "...", "caption": "...", "sort_order": 0 }`
4. DB の `gallery_photos.src` には、**2 で取得した URL** がそのまま保存される。

つまり「画像ファイルのアップロード」は Storage（または別の配信先）で行い、gallery の POST には **その結果の URL だけ** を渡す形になります。Edge Function はファイルを受け取らず、URL の登録だけを行います。

#### PATCH — 更新

```bash
curl -X PATCH "http://127.0.0.1:54321/functions/v1/gallery" \
  -H "Authorization: Bearer <ユーザーJWT>" \
  -H "Content-Type: application/json" \
  -d '{"id":"<photo-uuid>","caption":"新しいキャプション","sort_order":1}'
```

- `id` 必須。更新するフィールドのみ送る（`src`, `alt`, `caption`, `sort_order`）。
- 自分のレコード以外は 404。

#### DELETE — 削除

```bash
# クエリで id を指定
curl -X DELETE "http://127.0.0.1:54321/functions/v1/gallery?id=<photo-uuid>" \
  -H "Authorization: Bearer <ユーザーJWT>"

# または JSON body で id を指定
curl -X DELETE "http://127.0.0.1:54321/functions/v1/gallery" \
  -H "Authorization: Bearer <ユーザーJWT>" \
  -H "Content-Type: application/json" \
  -d '{"id":"<photo-uuid>"}'
```

---

**PostgREST（テーブル直接）** で操作する場合:

```bash
curl "http://127.0.0.1:54321/rest/v1/gallery_photos?select=id,src,alt,caption,sort_order,created_at&order=sort_order.asc" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json"
```

画像ファイルは Supabase Storage にアップロードし、その公開 URL を `src` に保存する運用が一般的です。

---

## イベント（カレンダー）

### テーブル `events`

| カラム      | 型        | 説明 |
|------------|-----------|------|
| id         | UUID      | 主キー |
| title      | TEXT      | タイトル |
| date       | DATE      | 日付（YYYY-MM-DD） |
| time       | TEXT      | 時間 |
| location   | TEXT      | 場所（省略時は `陽だまり`） |
| category   | TEXT      | `health` / `exercise` / `consultation` / `social` のいずれか |
| user_id    | UUID      | 登録者（auth.users） |
| created_at | TIMESTAMPTZ | 作成日時 |

- **閲覧**: 誰でも可能（RLSで SELECT 許可）
- **登録・更新・削除**: 認証ユーザーのみ（自分のレコードのみ）

### イベント API（Edge Function `events`）

同一エンドポイントで GET / POST / PATCH / DELETE を扱います。

```bash
npx supabase functions serve events
```

- **GET**: 認証不要（ログイン不要）。ホームページのフロントから anon key のみで呼び出し可能。一覧取得。クエリ `start_date`, `end_date` で日付範囲指定可能（カレンダー表示向け）。
- **POST / PATCH / DELETE**: 認証必須（`Authorization: Bearer <ユーザーJWT>`）。RLS により自分のレコードのみ操作可能。

#### GET — 一覧取得（認証不要）

フロントからは anon key を付けて呼び出します（ユーザーログイン不要）。

```bash
# 全件
curl "http://127.0.0.1:54321/functions/v1/events" \
  -H "Authorization: Bearer <ANON_KEY>"

# 日付範囲（カレンダー用）
curl "http://127.0.0.1:54321/functions/v1/events?start_date=2025-02-01&end_date=2025-02-28" \
  -H "Authorization: Bearer <ANON_KEY>"
```

レスポンス例:

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "ヨガ",
      "date": "2025-02-25",
      "time": "10:00",
      "location": "陽だまり",
      "category": "exercise",
      "created_at": "2025-02-25T..."
    }
  ]
}
```

#### POST — 新規登録

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/events" \
  -H "Authorization: Bearer <ユーザーJWT>" \
  -H "Content-Type: application/json" \
  -d '{"title":"ヨガ","date":"2025-02-25","time":"10:00","location":"陽だまり","category":"exercise"}'
```

- `title`, `date`, `time`, `category` 必須。`location` は任意（省略時は `陽だまり`）。
- `category` は `health` / `exercise` / `consultation` / `social` のいずれか。
- レスポンス: 作成された1件（`201`）。

#### PATCH — 更新

```bash
curl -X PATCH "http://127.0.0.1:54321/functions/v1/events" \
  -H "Authorization: Bearer <ユーザーJWT>" \
  -H "Content-Type: application/json" \
  -d '{"id":"<event-uuid>","title":"ヨガ（変更）","time":"11:00"}'
```

- `id` 必須。更新するフィールドのみ送る（`title`, `date`, `time`, `location`, `category`）。
- 自分のレコード以外は 404。

#### DELETE — 削除

```bash
curl -X DELETE "http://127.0.0.1:54321/functions/v1/events?id=<event-uuid>" \
  -H "Authorization: Bearer <ユーザーJWT>"
```

- `id` はクエリパラメータまたは JSON body で指定。
