# 使用量・レート制限・ローカルコスト表示 設計書

CodexBar（steipete/CodexBar, MIT, Swift製 macOS アプリ）の3機能を Yatagarasu（Node.js/Express/React/TypeScript）へ再実装するための基本設計。本書は Codex 実装への契約であり、曖昧さを残さないことを目的とする。

> **ステータス**: オーナー承認済み。実機検証（4項目）完了し、本書は**確定仕様**を反映済み（2026-07-06）。CodexBar のドキュメントは古い箇所があったため、以下はすべて**本マシン（Windows 11 / codex-cli 0.142.3）での実測**に基づく。

## オーナー決定事項（本設計の前提）

1. **Codex経路**: RPC主＋HTTPフォールバックの二段構え。実機検証の結果 **RPC は Windows で安定動作を確認**したため RPC を主経路とする。RPC が実行時に不安定化した場合の HTTP 単独切替は勝手に行わず、検証結果と推奨を添えて報告する。
2. **コストキャッシュ**: `~/.yatagarasu/` へのサイドカー JSON 永続化を採用（`cost-cache.json`）。
3. **コスト表示**: **トークン数のみ**。$換算・単価表は今回スコープ外（`pricing.ts` は作らない・UI に $ を出さない）。

## 目的・スコープ

ターミナル横に常駐するローカルダッシュボードに、Claude / Codex の**サブスクリプション残量（レート制限枠）**と**ローカルログから集計したトークン消費**を可視化する。「あと何回叩けるか」「いつリセットされるか」「どのモデルでどれだけトークンを使ったか」を一目で把握できるようにする。

### 対象3機能

1. **Claude 使用量・レート制限表示**: `~/.claude/.credentials.json` の OAuth トークンで Anthropic 使用量 API を叩き、5時間枠・週次枠・モデル別枠の使用率とリセット時刻を表示。
2. **Codex レート制限表示**: `codex app-server` の JSON-RPC でセッション枠（primary）/週次枠（secondary）を取得して表示。
3. **ローカルコスト集計**: `~/.claude/projects/**/*.jsonl` と `~/.codex/sessions/**/*.jsonl` をスキャンし、トークン消費をモデル別・日別に集計。既存 Stats ページに統合表示。

### 非ゴール

- $換算・単価表・課金額表示（オーナー決定3によりスコープ外）。
- Web スクレイピング経路（cookie/WebView）、Admin API、claude-swap、pi セッション、Extra usage（`extra_usage`/`spend`）。
- トークンの自動リフレッシュ実装（Claude HTTP 経路。MVP では失効時に「再ログイン要」表示に留める。Codex は RPC 経路のため codex 本体がリフレッシュを吸収）。
- 既存 DB スキーマの変更（コスト集計はメモリ内 + サイドカー JSON で完結）。

### 前提（実機で確認済み）

| 項目 | 実測結果 |
|---|---|
| `~/.claude/.credentials.json` | 存在。`claudeAiOauth.scopes` に `user:profile` あり（使用量 API 可）。`subscriptionType="pro"` |
| `~/.codex/auth.json` | 存在。`OPENAI_API_KEY=null` / `tokens.{id_token,access_token,refresh_token,account_id}` / `last_refresh` |
| `~/.claude/projects/**/*.jsonl` | 存在（125 ファイル） |
| `~/.codex/sessions/YYYY/MM/DD/*.jsonl` | 存在（45 ファイル） |
| `codex` | PATH 上（npm shim）。`codex-cli 0.142.3` / `Logged in using ChatGPT` / `forced_login_method=chatgpt` |
| app-server RPC | **Windows で疎通確認済み**（下記「機能2」に実測レスポンス） |

---

## アーキテクチャ概要

### 全体データフロー

```
┌──────────────── サーバ（既存 Express プロセス内） ────────────────┐
│  usage/poller.ts  ── 定期ポーリング（既定 60s）──────────┐        │
│    ├─ claudeUsage.fetch()  → api.anthropic.com/oauth/usage │        │
│    └─ codexUsage.fetch()   → codex app-server (JSON-RPC)   │        │
│         ↓ マッピング（純粋関数）                            │        │
│    in-memory snapshot（%・リセット時刻・plan・status のみ）│        │
│         ↑ 秘匿情報（トークン）は保持しない                  │        │
│                                                            │        │
│  usage/costScanner.ts ── オンデマンド + 60s 最小間隔 ──────┤        │
│    ├─ scanClaudeCost()  ~/.claude/projects/**/*.jsonl      │        │
│    └─ scanCodexCost()   ~/.codex/sessions/**/*.jsonl       │        │
│         ↓ 増分読み（offset/mtime） + ~/.yatagarasu/サイドカー│       │
│    in-memory cost summary（モデル別・日別トークン）        │        │
│                                                            │        │
│  routes/usage.ts  GET /api/usage  → snapshot 返却 ─────────┤        │
│  routes/cost.ts   GET /api/cost   → cost summary 返却 ─────┘        │
└────────────────────────────────────────────────────────────────────┘
                      ↑ クライアントが interval でポーリング
┌──────────────── クライアント（React） ────────────────┐
│  Dashboard 上部  → <UsageBar/>   （機能1・2：レート枠）│
│  Stats ページ    → <CostPanel/>  （機能3：トークン）  │
└────────────────────────────────────────────────────────┘
```

### ポーリング／キャッシュ戦略

- **サーバ側でポーリングし、メモリ内スナップショットに保持。** クライアントは軽量な `GET /api/usage` を読むだけ。理由: (a) 認証情報をサーバ側に閉じ込めブラウザにトークンを露出しない、(b) 全クライアントで 1 フェッチ共有、(c) レート枠は分オーダー更新で高頻度不要。
- **ポーリング間隔**: 既定 60 秒、最小 30 秒（`YATA_USAGE_POLL_MS` で調整可・下限クランプ）。Claude と Codex は独立実行、片方の失敗が他方を止めない。
- **失敗時**: 直前の成功スナップショットを保持しつつ `status` を降格（`ok`→`error`/`expired`）。
- **認証情報が無い場合**: 該当プロバイダは `status:'disabled'`。ファイル/コマンド存在チェックは数分おきに再評価し、後からログインしても再起動不要で有効化。
- **コスト集計**: 増分スキャン（追記専用前提の offset キャッシュ）+ `~/.yatagarasu/cost-cache.json` サイドカー永続化（ウォーム再起動で即応答）。60s 最小リフレッシュ間隔。DB スキーマ非変更。

### WebSocket 配信の要否 → **不要（MVP）**

既存 WS（`/ws`）は活動フィード専用で変更しない。レート枠・コストは分オーダー更新のため**クライアント側 interval ポーリング**で十分（Stats ページが既に `REFRESH_MS=15000` でポーリング）。UsageBar は 30–60s、CostPanel は 60s。将来 `broadcastUsage()` を足す余地だけ残す。

### API エンドポイント設計

| メソッド | パス | 返却 | 備考 |
|---|---|---|---|
| GET | `/api/usage` | `UsageSnapshot`（claude/codex 各 `ProviderUsage`） | 秘匿情報を含まない。常に 200 |
| GET | `/api/cost` | `CostSummary`（モデル別・日別） | 常に 200。`?days=`（1–365, 既定 30） |

`createApp()`（`src/server/index.ts`）に 2 ルートを追加。既存 `/api/stats`（活動集計）は**無改変**で分離。

---

## インターフェース / データ構造

`src/server/usage/types.ts`（クライアント `src/client/types.ts` にも複製）:

```ts
export type ProviderStatus = 'ok' | 'disabled' | 'expired' | 'error';

export interface RateWindow {
  label: string;              // "5h" | "week" | モデル名
  usedPercent: number;        // 0..100 の整数（使用率）
  resetsAt: number | null;    // 絶対 unixtime 秒（両プロバイダともここに正規化）
}

export interface ProviderUsage {
  provider: 'claude' | 'codex';
  status: ProviderStatus;
  plan?: string;              // Claude: subscriptionType / Codex: rateLimits.planType
  session?: RateWindow;       // Claude: limits[session] / Codex: primary
  weekly?: RateWindow;        // Claude: limits[weekly_all] / Codex: secondary
  models?: RateWindow[];      // Claude: weekly_scoped / Codex: rateLimitsByLimitId
  updatedAt: number;          // 取得成功時刻（unixtime 秒）
  error?: string;             // 非秘匿の短い理由。status!=ok 時のみ
}

export interface UsageSnapshot { claude: ProviderUsage; codex: ProviderUsage; }
```

コスト集計（$ なし・トークンのみ）:

```ts
export interface TokenBreakdown {
  inputTokens: number;        // 非キャッシュ入力
  cachedInputTokens: number;  // キャッシュ読取入力
  cacheCreationTokens: number;// キャッシュ生成入力（Claude のみ。Codex は 0）
  outputTokens: number;
  reasoningTokens: number;    // Codex reasoning_output_tokens（Claude は 0）
  totalTokens: number;
}

export interface ModelCost extends TokenBreakdown {
  provider: 'claude' | 'codex';
  model: string;              // ログの生値（"claude-sonnet-4-6" / "gpt-5.5" 等）
}

export interface DailyTokens {
  date: string;               // "YYYY-MM-DD"（ローカルタイム）
  totalTokens: number;
}

export interface CostSummary {
  updatedAt: number;
  windowDays: number;
  byModel: ModelCost[];       // 窓内モデル別合計（totalTokens 降順）
  daily: DailyTokens[];       // 窓内日別（昇順、欠損日 0 埋め）
}
```

**設計原則**: `usedPercent` に統一（0–100 整数）。`resetsAt` は**必ず絶対 unixtime 秒**に正規化してから返す（Claude=ISO文字列→parse、Codex=既に unix 秒）。プロバイダ間でトークン内訳の意味を `TokenBreakdown` に正規化（下記コスト節参照）。

---

## データ取得仕様：プロバイダ別（すべて実測確定）

### 機能1: Claude 使用量（OAuth HTTP・subprocess 不要）

**認証情報の読み取り** (`readClaudeCredentials()`): パス `join(homedir(), '.claude', '.credentials.json')`。無ければ `status:'disabled'`。

確定スキーマ:
```
{ mcpOAuth: {...}, claudeAiOauth: {
    accessToken, refreshToken,
    expiresAt,          // ミリ秒 epoch
    scopes,             // 例: ["user:file_upload","user:inference","user:mcp_servers","user:profile","user:sessions:claude_code"]
    subscriptionType,   // "pro" 等 → plan
    rateLimitTier       // plan フォールバック
} }
```
- `claudeAiOauth.scopes` に `user:profile` が無ければ使用量 API 不可 → `status:'expired'`＋error。
- `expiresAt`（ms）が現在時刻より過去なら `status:'expired'`（MVP は自動リフレッシュしない）。

**API 呼び出し** (`fetchClaudeUsage(accessToken)`):
- `GET https://api.anthropic.com/api/oauth/usage`
- ヘッダ: `Authorization: Bearer <accessToken>` / `anthropic-beta: oauth-2025-04-20`
- **サブスクの使用量 read（推論トークン非消費・課金なし・API キー不使用）。** タイムアウト 10s、例外は `status:'error'` に変換。

**レスポンス（実測 HTTP 200）**:
```jsonc
{
  "five_hour": { "utilization": 41, "resets_at": "2026-07-06T18:20:00.312660+00:00",
                 "limit_dollars": null, "used_dollars": null, "remaining_dollars": null },
  "seven_day": { "utilization": 18, "resets_at": "2026-07-08T03:00:00.312678+00:00", ... },
  "seven_day_opus": null, "seven_day_sonnet": null,   // Pro では null（Max 等で値が入る）
  "limits": [
    { "kind": "session",       "group": "session", "percent": 41, "severity": "normal",
      "resets_at": "2026-07-06T18:20:00...", "scope": null, "is_active": true },
    { "kind": "weekly_all",    "group": "weekly",  "percent": 18, "severity": "normal",
      "resets_at": "2026-07-08T03:00:00...", "scope": null, "is_active": false },
    { "kind": "weekly_scoped", "group": "weekly",  "percent": 20, "severity": "normal",
      "resets_at": "...", "scope": { "model": { "id": null, "display_name": "Fable" }, "surface": null }, "is_active": false }
  ],
  "extra_usage": { "is_enabled": false, ... },   // スコープ外
  "spend": { ... },                              // スコープ外
  "member_dashboard_available": false
}
```

**マッピング** (`mapClaudeUsage(json, now)` — 純粋関数):
- **`limits[]` を優先**（構造化・severity・モデルスコープを持つ）:
  - `session` = `limits` 内 `group==="session"` → `session`（label="5h", usedPercent=percent, resetsAt=parse(resets_at)）
  - `weekly` = `kind==="weekly_all"` → `weekly`（label="week"）
  - `weekly_scoped` = `models[]`（label = `scope.model.display_name`）
- `limits` が無い旧形式は **`five_hour`/`seven_day`/`seven_day_opus`/`seven_day_sonnet`** にフォールバック（`utilization`/`resets_at`）。
- `resets_at`（ISO文字列）→ `Math.floor(Date.parse(s)/1000)`。
- `plan` = credentials の `subscriptionType`（無ければ `rateLimitTier`）。
- 欠損/null フィールドは当該 window を省略（例外を投げない防御的実装）。

**エラー / 失効時**: HTTP 401/403 → `status:'expired'`（"re-auth: claude /login"）。その他 4xx/5xx・タイムアウト → `status:'error'`、直前スナップショット保持。トークン・本文をログに出さない。

### 機能2: Codex レート制限（`codex app-server` JSON-RPC・実測確定）

**起動と伝送**（実測で確立）:
- コマンド: `codex app-server`（stdio トランスポートが既定。0.142.3 では `-s/-a` は不要。レート読取はコード実行を伴わないためサンドボックス影響なし）。
- **Windows 起動**: `spawn('codex', ['app-server'], { shell: true, env })`。`codex` は npm `.cmd` shim のため `shell:true` が必要。**子プロセス env から `OPENAI_API_KEY` を除去**（誤課金防御・実行時キー除去）。
- **伝送形式**: **改行区切り JSON（JSON Lines）**。1 メッセージ = 1 行（末尾 `\n`）。応答も 1 行 1 JSON。
- **ハンドシェイク**（実測で成功）:
  1. `→ {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"yatagarasu","title":null,"version":"<ver>"},"capabilities":null}}`
     `← {"id":1,"result":{"userAgent","codexHome","platformFamily","platformOs"}}`（認証不要）
  2. `→ {"jsonrpc":"2.0","method":"initialized"}`（通知・id 無し）
  3. `→ {"jsonrpc":"2.0","id":2,"method":"account/rateLimits/read","params":null}`（params 不要）
- **`account/read` は不要**（plan は rateLimits.planType から取得でき、email を扱わずに済む）。
- タイムアウト: initialize 15s / 各メソッド 8s。タイムアウト時は**子プロセスを kill** して reader を解放。処理後は必ず終了。

**レスポンス（実測）** — `account/rateLimits/read` の `result`:
```jsonc
{
  "rateLimits": {                    // GetAccountRateLimitsResponse.rateLimits（後方互換単一ビュー）
    "limitId": "codex", "limitName": null,
    "primary":   { "usedPercent": 1, "resetsAt": 1783363874, "windowDurationMins": 300 },   // 300分=5h
    "secondary": { "usedPercent": 1, "resetsAt": 1783523662, "windowDurationMins": 10080 }, // 10080分=7d
    "credits": null, "individualLimit": null,
    "planType": "plus",              // PlanType: free|go|plus|pro|team|business|enterprise|edu|unknown
    "rateLimitReachedType": null
  },
  "rateLimitsByLimitId": { "codex": { /* 上と同型 RateLimitSnapshot */ } },
  "rateLimitResetCredits": { "availableCount": <int> } | null
}
```
- `resetsAt` は**絶対 unixtime 秒**（実測: 1783363874 − now ≈ 5.0h、primary の 300 分窓と一致）→ 正規化不要。
- `usedPercent` は 0–100 整数。

**マッピング** (`mapCodexRateLimits(json)` — 純粋関数):
- `session` = `rateLimits.primary`（label は `windowDurationMins` から: 300→"5h"、それ以外は `${mins/60}h`）。
- `weekly` = `rateLimits.secondary`（10080→"week"）。
- `models` = `rateLimitsByLimitId` の各キー（`codex` 単一が通常。`primary` を代表として `limitId` をラベル化。任意）。
- `plan` = `rateLimits.planType`。

**エラー / 失効時**: codex 未インストール（spawn 失敗）→ `status:'disabled'`。app-server 起動失敗・RPC エラー・タイムアウト → `status:'error'`。認証失効 → `status:'expired'`（"run codex login"）。

**誤課金防御（Codex）**: 本経路はレート枠の**メタデータ read のみ**で枠自体を消費しない（CodexBar が背景常用する経路）。加えて (1) 子プロセス env から `OPENAI_API_KEY` 除去、(2) auth.json（ChatGPT OAuth）のみ、(3) `forced_login_method=chatgpt` 前提、で多層防御。**API キー経路・課金経路は含めない。**

**HTTP フォールバック（第二層・実装対象・実測確定）**: RPC が実行時に失敗した場合の代替として `GET https://chatgpt.com/backend-api/wham/usage`（`Authorization: Bearer <auth.json.tokens.access_token>`）を実装する（オーナー決定1）。実測レスポンス（HTTP 200）:
```jsonc
{
  "user_id": "...", "account_id": "...", "email": "...",   // ← PII。取得しても保存・表示・ログ出力しない
  "plan_type": "plus",
  "rate_limit": {
    "allowed": true, "limit_reached": false,
    "primary_window":   { "used_percent": 1, "limit_window_seconds": 18000,  "reset_after_seconds": 18000,  "reset_at": 1783365127 }, // 18000s=5h
    "secondary_window": { "used_percent": 1, "limit_window_seconds": 604800, "reset_after_seconds": 176535, "reset_at": 1783523661 }  // 604800s=7d
  },
  "additional_rate_limits": null, "credits": {...}, "rate_limit_reached_type": null, ...
}
```
- マッピング (`mapCodexWhamUsage(json)` — 純粋関数): `session` = `rate_limit.primary_window`（used_percent, reset_at=絶対unix秒, label は `limit_window_seconds` から 18000→"5h"）, `weekly` = `secondary_window`（604800→"week"）, `plan` = top-level `plan_type`。**`email`/`user_id`/`account_id` は読み捨て（保存・表示・ログ厳禁）**。
- フェッチャは `fetchCodexUsage()` 内で RPC を試み、失敗時のみ本 HTTP を呼ぶ（`source: 'rpc' | 'http'` を保持し UI ではデバッグ用途）。両失敗で `status:'error'`。HTTP も ChatGPT OAuth の read で**非課金**。access_token 失効時は 401 → `status:'expired'`。

---

## UI 設計

既存レイアウト: Dashboard（2ペイン: Agents | Activity Feed）+ Agents + Stats + Setup。デザインは `global.css` の CSS 変数（`--bg #0d0d0d` / `--panel #141414` / `--border` / `--accent #a06cff` / `--ok #3fb950` / `--warn #e3b341` / `--err #f85149` / `--mono` / `--sans`）準拠。CSS Modules・インラインスタイル不使用。

### 機能1・2 → Dashboard 上部の `<UsageBar/>`（新規）

配置: `Dashboard.tsx` のヘッダ直下、2ペインの上に横断ストリップ 1 本（折りたたみ可）。

```
│ Claude · pro     5h ▓▓▓▓░░░░░░ 41%  ↺4h27m   week ▓▓░░░░░░ 18% ↺1d15h │
│ Codex · plus     5h ▓░░░░░░░░░  1%  ↺5h00m   week ▓░░░░░░░  1% ↺2d02h │
```
- 各プロバイダ 1 行: `<名> · <plan>` + session バー + weekly バー。
- **バー色**: `usedPercent < 70` → `--ok`、`70–90` → `--warn`、`>90` → `--err`（status 緑/黄/赤の温存方針と整合）。
- **リセット**: `resetsAt` からクライアント側カウントダウン（"↺4h27m" / "↺1d15h"）。
- **モデル別**: 行クリック/ホバーで `models[]` を小バー展開（Claude=weekly_scoped の "Fable" 等 / Codex=codex バケット）。MVP は tooltip 可。
- **状態別**: `disabled`→行非表示（両方 disabled なら UsageBar 非表示）。`expired`→"re-auth" ピル。`error`→直近値を薄色 + "stale"。
- ポーリング: `GET /api/usage` を 30–60s（Stats 前例の `useEffect`+`setInterval`+`cancelled`）。

### 機能3 → Stats ページ内の `<CostPanel/>`（新規セクション）

配置: 既存 `Stats.tsx` のエージェント別カードグリッドの下に "Token usage (last 30d)" セクション追加。`/api/stats` は無改変、`/api/cost` を別途取得。

```
──────────────  Token usage (last 30d)  ──────────────
┌ Claude ────────────┐ ┌ Codex ─────────────┐
│ sonnet-4-6         │ │ gpt-5.5            │   ← モデル別タイル（totalTokens 主表示）
│ 1.2M tok           │ │ 3.4M tok           │      内訳(in/cached/out/reason)は tooltip
│ …                  │ │ …                  │
└────────────────────┘ └────────────────────┘
 Daily  ▁▂▅▃▇▂▁▄▆▂ …            ← 日別トークン（既存 Sparkline 流用可）
```
- モデル別タイル（主表示 = `totalTokens`、内訳 input/cached/cacheCreation/output/reasoning は tooltip）。$ は**表示しない**。
- 日別は既存 `Sparkline` 描画パターン流用可。
- ポーリング 60s。

### `src/client/lib/api.ts` 追加
```ts
getUsage: () => request<UsageSnapshot>('/api/usage'),
getCost: (days?: number) => request<CostSummary>(`/api/cost${days ? `?days=${days}` : ''}`),
```

---

## ローカルコスト集計の仕様（実測確定・$なし）

### 走査対象
- **Claude**: `join(homedir(), '.claude', 'projects')` 配下 `**/*.jsonl`（サブエージェント別含む・125 ファイル実在）。
- **Codex**: `join(homedir(), '.codex', 'sessions')` 配下 `YYYY/MM/DD/*.jsonl`（45 ファイル実在）。`CODEX_HOME` 設定時はそちら優先。

### パース仕様（実測フィールド）

**Claude jsonl**（1 行 1 JSON）— assistant 行の実構造:
```jsonc
{ "type": "assistant", "requestId": "...", "timestamp": "2026-06-07T06:26:26.256Z",
  "sessionId": "...", "message": {
    "id": "...", "model": "claude-sonnet-4-6", "role": "assistant",
    "usage": { "input_tokens": 2, "cache_creation_input_tokens": 8050,
               "cache_read_input_tokens": 21990, "output_tokens": 468, ... } } }
```
- `type==="assistant"` かつ `message.usage` を持つ行のみ対象。
- **重複排除キー = `message.id + " " + requestId`**。同一キーは加算せず**最終行の usage を採用**（ストリーミング累積対策）。
- **正規化** → `TokenBreakdown`: `inputTokens = input_tokens`（既に非キャッシュ）, `cachedInputTokens = cache_read_input_tokens`, `cacheCreationTokens = cache_creation_input_tokens`, `outputTokens = output_tokens`, `reasoningTokens = 0`。
- モデル = `message.model`。日付 = 先頭 `timestamp`（ISO→ローカル日）。

**Codex jsonl** — 実構造:
```jsonc
// モデルマーカー（複数ターンで複数回・現在モデルを更新）
{ "type": "turn_context", "payload": { "model": "gpt-5.5", ... } }
// トークン計測イベント（1 ファイルに複数）
{ "type": "event_msg", "timestamp": "2026-06-28T22:42:35.674Z", "payload": {
    "type": "token_count", "info": {
      "total_token_usage": { "input_tokens":13872, "cached_input_tokens":12672,
                             "output_tokens":486, "reasoning_output_tokens":0, "total_tokens":14358 },
      "last_token_usage":  { /* 同型・当該ターンの増分 */ },
      "model_context_window": 258400 },
    "rate_limits": { ... } } }
```
- 行を順に走査し、`turn_context.payload.model` を「現在モデル」として更新（`turn_context` が権威。初期値は明示的モデル名が無いため `"unknown"`）。
- 各 `token_count` イベントは **`last_token_usage`（増分）を採用**し現在モデルへ加算。`total_token_usage` は累積のため**使わない**（合算すると重複計上になる）。
- **正規化** → `TokenBreakdown`: `cachedInputTokens = cached_input_tokens`, `inputTokens = max(0, input_tokens - cached_input_tokens)`（Codex の input はキャッシュ込みのため差し引き）, `cacheCreationTokens = 0`, `outputTokens = output_tokens`, `reasoningTokens = reasoning_output_tokens`。
- 日付 = イベント `timestamp`（ISO→ローカル日）。

パーサは壊れ行・未知形式を**スキップして継続**（1 行破損で全体を落とさない）。

### 増分スキャンとサイドカーキャッシュ
- jsonl は追記専用。ファイルごとに `{ size, mtimeMs, lastOffset, lastModel }` を保持し、変化なしはスキップ、増加時は `lastOffset` 以降の末尾差分のみ読む。
- 集計は `(provider, model, date) → TokenBreakdown` の Map として累積。
- **サイドカー永続化**（オーナー決定2）: `~/.yatagarasu/cost-cache.json` に `{ version, files: {path:{size,mtimeMs,lastOffset,lastModel}}, aggregate: [...] }` を保存。起動時に読み込み→差分のみ追いスキャンで即応答。DB スキーマは非変更。
- Codex 増分の注意: `last_token_usage` は各イベント独立の増分値なので末尾差分読みでも正しく加算できる。ただし「現在モデル」は `turn_context` 由来のため、増分再開時はファイル単位でキャッシュした `lastModel` を引き継ぐ。
- `/api/cost` は窓（既定 30 日, `?days=`）でフィルタして返す。最小リフレッシュ間隔 60s。

---

## 制約 / 非機能要件

- **秘匿情報の非永続**: OAuth トークン・access_token を DB・ログ・レスポンス・サイドカーに**一切書かない**。トークンはフェッチ毎に読み使用後破棄。サイドカーにはトークン数のみ（秘匿でない）。`/api/usage` の返却は %・リセット時刻・plan・status のみ。
- **API キー禁止・Plus 枠限定**: Codex は auth.json（ChatGPT OAuth）の read-only 再利用のみ。`OPENAI_API_KEY` を子プロセスから除去。課金経路を含めない。
- **OSS フォールバック**: 認証情報が無い環境では該当機能が静かに `disabled`（UI 非表示）。codex 未インストールでも Codex のみ無効化し他は動く。
- **既存機能非破壊**: フック監視・活動フィード・`/api/stats`・WS・DB スキーマを変更しない。追加は純粋な増分。
- **クロスプラットフォーム**: パスは `os.homedir()` + `path.join`。Codex spawn は Windows shim を `shell:true` で吸収。
- TypeScript strict、既存コーディング規約（コメント原則書かない、エラーは境界のみ）。ネットワーク/RPC は必ずタイムアウト付き、例外を `status` に変換（サーバを落とさない）。

---

## テスト方針

vitest（既存 67 件緑を維持）。**フェッチ層（HTTP/subprocess）とマッピング/集計層（純粋関数）を分離**し純粋関数を主にテスト。フェッチ層はインターフェース化し、ルートテストはフィクスチャ注入。実 API/実 subprocess を CI で叩かない。

### A. マッピング純粋関数（実測フィクスチャで単体テスト）
1. `mapClaudeUsage`: `limits[]`（session/weekly_all/weekly_scoped）→ session/weekly/models 写像、`resets_at` ISO→unix 秒。
2. `mapClaudeUsage`: `limits` 欠損時に `five_hour`/`seven_day`/`seven_day_opus`/`seven_day_sonnet` フォールバック。
3. `mapClaudeUsage`: null/欠損フィールドで当該 window 省略（例外なし）。plan は subscriptionType→rateLimitTier。
4. `mapCodexRateLimits`: `rateLimits.primary/secondary/planType` 写像、`windowDurationMins`→label（300→"5h", 10080→"week"）。
5. `mapCodexRateLimits`: `rateLimits` 欠損/空で空返し（例外なし）。
5b. `mapCodexWhamUsage`: `rate_limit.primary/secondary_window`（used_percent/reset_at/limit_window_seconds→label）→ session/weekly、top-level `plan_type`→plan。**PII（email/user_id/account_id）を出力に含めない**。

### B. コストスキャナ（実測匿名化フィクスチャで単体テスト）
6. Claude: `type:"assistant"`+`message.usage` のみ集計、他行無視。正規化（input/cache_read/cache_creation/output）。
7. Claude 重複排除: 同一 `message.id + requestId` を**最終値採用**（加算しない）。
8. Codex: `last_token_usage` 加算・`total_token_usage` 不使用、`turn_context.model` でモデルバケット決定。input からキャッシュ差引・reasoning 反映。
9. Codex モデル切替: ファイル内で turn_context が変わると以降の増分が新モデルに付く。
10. 増分スキャン: 追記後 `lastOffset` 以降のみ読み、合計が全量スキャンと一致（現在モデル引き継ぎ含む）。
11. 破損行スキップ: 不正 JSON があっても他行を集計し落ちない。
12. 日別バケット: ISO timestamp → 正しい `YYYY-MM-DD`、窓フィルタ動作。
13. サイドカー: 書き出し→読み込みで集計を復元、差分のみ追いスキャン。

### C. ルート結合テスト（supertest, フェイク注入）
14. `GET /api/usage`: フェイクフェッチャで claude/codex 両 `ok`。秘匿情報を含まない。
15. `GET /api/usage`: 認証情報無し → 両 `disabled`、200。
16. `GET /api/usage`: 片方 `expired`・片方 `ok` の混在。
17. `GET /api/cost`: フィクスチャログディレクトリ（注入）→ byModel/daily。
18. `GET /api/cost?days=7`: 窓フィルタ。

### D. 非回帰
19. 既存 12 テストファイルを**無改変で全緑**。`npm test` グリーン。ビルド（`tsc`/`vite build`）成功。

**テスト容易性**: パス解決・HTTP・spawn を引数/環境変数で差し替え可能に（例: `scanCost({ claudeRoot, codexRoot, cachePath })`, `fetchClaudeUsage` を `deps.httpGet` 経由, `fetchCodexUsage` を `deps.spawnRpc` 経由）。

---

## 実装タスク分割（Codex に渡す粒度）

| # | タスク | 主対象ファイル | 依存 |
|---|---|---|---|
| T1 | 型定義（`ProviderUsage`/`RateWindow`/`TokenBreakdown`/`ModelCost`/`CostSummary` 等）をサーバ・クライアント両方に | `src/server/usage/types.ts`, `src/client/types.ts` | — |
| T2 | Claude マッパー純粋関数 + フィクスチャ単体テスト（A:1–3） | `src/server/usage/claudeUsage.ts`, `tests/claudeUsage.test.ts` | T1 |
| T3 | Claude フェッチャ（credentials 読取 + OAuth HTTP, deps 注入） | `src/server/usage/claudeUsage.ts` | T2 |
| T4 | Codex マッパー純粋関数 `mapCodexRateLimits`(RPC) + `mapCodexWhamUsage`(HTTP) + 単体テスト（A:4–5,5b） | `src/server/usage/codexUsage.ts`, `tests/codexUsage.test.ts` | T1 |
| T5 | Codex フェッチャ（RPC主: app-server spawn/shell:true/OPENAI_API_KEY除去/JSON-Lines/timeout+kill）＋HTTPフォールバック（wham/usage・PII読み捨て・source保持） | `src/server/usage/codexUsage.ts` | T4 |
| T6 | ポーラ（メモリ snapshot・独立ポーリング・disabled/error 遷移） | `src/server/usage/poller.ts`, `src/server/usage/index.ts` | T3, T5 |
| T7 | `GET /api/usage` ルート + supertest（C:14–16） | `src/server/routes/usage.ts`, `tests/usage.test.ts` | T6 |
| T8 | コストスキャナ（Claude/Codex パーサ・重複排除・増分・日別・正規化）+ 単体テスト（B:6–12） | `src/server/usage/costScanner.ts`, `tests/costScanner.test.ts` | T1 |
| T9 | サイドカーキャッシュ（`~/.yatagarasu/cost-cache.json` 読み書き）+ テスト（B:13） | `src/server/usage/costCache.ts` | T8 |
| T10 | `GET /api/cost` ルート + supertest（C:17–18） | `src/server/routes/cost.ts`, `tests/cost.test.ts` | T8, T9 |
| T11 | `createApp` に 2 ルート登録・ポーラ起動配線 | `src/server/index.ts` | T7, T10 |
| T12 | `<UsageBar/>`（Dashboard 統合・色/カウントダウン/状態別・models 展開） | `src/client/components/UsageBar.tsx(+css)`, `src/client/pages/Dashboard.tsx`, `src/client/lib/api.ts` | T7 |
| T13 | `<CostPanel/>`（Stats 統合・モデルタイル/日別/内訳 tooltip） | `src/client/pages/Stats.tsx`, `src/client/components/CostPanel.tsx(+css)`, `src/client/lib/api.ts` | T10 |
| T14 | 全体非回帰（`npm test` 全緑・ビルド確認 D:19） | — | 全 |

Codex 委任の勘所: T2/T4/T8/T9（純粋関数 + フィクスチャ）が中心。T5 の spawn/framing は本設計に実測仕様を明記済みのため委任可能。フィクスチャは実ログの匿名化サンプルから作る（トークン数字は残し、本文・パス・メールは伏せる）。

---

## 受け入れ基準

- [ ] `GET /api/usage` が claude/codex の `ProviderUsage` を返し、トークン等秘匿情報を含まない。認証情報無しで `disabled`・200。
- [ ] `GET /api/cost` がモデル別・日別トークンを返す（$ 非表示）。増分スキャン + サイドカーで動作。
- [ ] Claude は OAuth HTTP で `limits[]`（→five_hour/seven_day フォールバック）から session/weekly/models を取得。API キー不使用。
- [ ] Codex は `codex app-server` の JSON-Lines RPC（initialize→initialized→account/rateLimits/read）で primary/secondary/planType を取得。`OPENAI_API_KEY` 除去。課金経路なし。
- [ ] Dashboard 上部 UsageBar（バー・緑/黄/赤・カウントダウン・状態別）。両 disabled で非表示。
- [ ] Stats ページ CostPanel（モデル別トークン・日別・内訳 tooltip）。`/api/stats` 無改変。
- [ ] 秘匿情報が DB・ログ・レスポンス・サイドカーに出ない。RPC/HTTP 失敗でサーバが落ちない。
- [ ] 新規テスト（A/B/C）緑・既存 67 件無改変で全緑・ビルド成功。DB スキーマ/WS/フック監視 未変更。

---

## 残る未確定事項（実装時に対処・軽微）

実機検証で主要な不確実性（RPC framing・Claude/Codex レスポンス構造・credentials/auth スキーマ・jsonl 形式）はすべて解消済み。残るは以下:

1. ~~Codex HTTP フォールバック~~ → **解決**: `wham/usage` 実測確定（`rate_limit.primary/secondary_window` の used_percent/reset_at/limit_window_seconds + top-level plan_type）。RPC主＋HTTPフォールバックを実装対象とする（オーナー決定1）。PII（email/user_id/account_id）は読み捨て。
2. **モデル別枠の表示範囲**: Pro では Claude の `seven_day_opus/sonnet` が null（`limits[].weekly_scoped` の "Fable" 等で代替表示）。Max 等での実データは当該環境で要確認だが、マッパーは両形式を許容するため実害なし。
3. **Codex 初期モデル**: `session_meta` に明示的なモデル名が無いため、`turn_context` 出現前のイベントは `"unknown"` バケットに入る（通常 turn_context が先行するため影響軽微）。
4. **サイドカーのスキーマ進化**: `version` フィールドで将来の形式変更に備え、旧版は破棄して再スキャン。
