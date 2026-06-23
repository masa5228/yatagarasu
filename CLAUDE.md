# Yatagarasu

Claude Codeのエージェント群をリアルタイムで監視するローカル開発ダッシュボード。OSS（MIT）。

## このファイルの使い方

- **設計・仕様**: Sonnetセッションで決定済み。このCLAUDE.mdが引き継ぎ書
- **実装**: このディレクトリで起動したOpusが担当
- 実装開始前に全文を読むこと

---

## プロジェクト概要

- Claude Codeのフック経由でエージェントの活動データを受信
- エージェントを登録（名前・役割・説明）してダッシュボードで状態監視
- 「ログを見せるだけ」の既存ツールと違い、「チームメンバー表のようにエージェントを管理する」差別化ポイントがある
- ターミナルの横に並べて使うローカル開発補助ツール

**ブランド名**: Yatagarasu（八咫烏）  
**CLIコマンド**: `yata`  
**配布**: `npm install -g yatagarasu` → `yata start`

---

## 技術スタック

| 役割 | 技術 |
|------|------|
| フック受信・APIサーバー | Node.js + Express |
| データ保存 | SQLite（better-sqlite3）|
| リアルタイム通信 | WebSocket（ws）|
| フロントエンド | React + Vite + TypeScript |
| スタイリング | CSS Modules（インラインスタイル不使用）|
| 配布 | npm package（グローバルインストール）|

---

## ディレクトリ構成

```
src/
  server/
    index.ts          # Expressサーバー・WebSocketサーバー起動
    routes/
      hooks.ts        # POST /api/hook  ← Claude Codeフックの受信口
      agents.ts       # CRUD /api/agents
      activities.ts   # GET /api/activities
    db/
      index.ts        # SQLite接続・マイグレーション
      schema.ts       # テーブル定義
  client/
    pages/
      Dashboard.tsx   # メイン画面（エージェント一覧＋活動フィード）
      Agents.tsx      # エージェント管理画面
      Setup.tsx       # フック設定ウィザード（MVP2）
    components/
      AgentList.tsx
      ActivityFeed.tsx
      ActivityDetail.tsx  # ツール詳細展開（MVP2）
      SessionGroup.tsx    # セッション別グルーピング（MVP2）
    hooks/
      useWebSocket.ts
    lib/
      api.ts
bin/
  yata.ts             # CLIエントリーポイント（yata start）
```

---

## DB設計

### agents
```sql
id           text primary key   -- uuid
name         text unique not null
role         text not null      -- 役割（表示用）
description  text
color        text               -- アクセントカラー（hex）
created_at   integer            -- unixtime
```

### activities
```sql
id           text primary key   -- uuid
agent_name   text not null      -- agent_type from hook payload
session_id   text not null      -- session_id from hook payload
tool_name    text not null
tool_input   text               -- JSON文字列
tool_result  text               -- JSON文字列（PostToolUseのみ）
hook_event   text not null      -- PreToolUse | PostToolUse
timestamp    integer not null   -- unixtime
```

---

## UI設計

### レイアウト（全体）

```
┌─────────────────────────────────────────────────────────┐
│  ◈ Yatagarasu                    Session #4  ⬤ Live    │
├─────────────────┬───────────────────────────────────────┤
│                 │                                        │
│  AGENTS         │  Activity Feed                         │
│  ─────────────  │  ───────────────────────────────────  │
│                 │                                        │
│  ⬤ researcher  │  14:32:01  researcher  WebSearch       │
│    調査係        │            "Mastra framework 2026"    │
│                 │                                        │
│  ○ git-hub      │  14:31:45  git-hub     push_files     │
│    Git/GitHub   │            articles/2026-06-23-...    │
│                 │                                        │
│  ○ file-steward │  14:31:20  researcher  WebFetch       │
│    ファイル整理   │            https://mastra.ai/docs    │
│                 │                                        │
│  ＋ Register    │                                        │
└─────────────────┴───────────────────────────────────────┘
```

### ツール詳細（クリックで展開・MVP2）

```
▼  14:32:01  researcher  WebSearch
   ┌──────────────────────────────────────┐
   │ input:  "Mastra framework 2026"      │
   │ result: 8件ヒット                    │
   │         mastra.ai/docs ...           │
   └──────────────────────────────────────┘
```

### デザイン方針

- **モード**: ダークモード固定
- **背景**: `#0d0d0d`
- **アクセントカラー**: `#00ff9d`（ターミナルグリーン）
- **非アクティブ**: `#666666`
- **テキスト**: `#e5e5e5`
- **活動ログフォント**: モノスペース（JetBrains Mono / Fira Code / system-mono）
- **ラベルフォント**: サンセリフ（Inter / system-ui）
- **エージェントのステータス**: 直近60秒以内に活動あり → `⬤`（グリーン点灯）、なし → `○`（グレー）
- ログは下から積み上がる（`tail -f` 的な体験）

### インタラクション

- ログ行クリック → ツール詳細スライドイン展開（MVP2）
- 左サイドバーのエージェント名クリック → そのエージェントでフィルター
- ヘッダーのセッション表示 → セッション切り替えドロップダウン（MVP2）

---

## MVP1スコープ（最初のリリース）

**P1-1: フック受信サーバー**
- `POST /api/hook` でClaude Codeフックのstdin JSONを受信
- activitiesテーブルに保存
- `agent_name` が未登録エージェントの場合は自動で仮登録（name=agent_type、role="未設定"）

**P1-2: リアルタイム活動フィード**
- WebSocketで接続中クライアントに活動をpush
- ダッシュボードにリアルタイムで流れる
- 直近100件を表示

**P1-3: エージェント登録**
- エージェント一覧画面（名前・役割・説明・カラーを設定）
- 登録・編集・削除

**P1完了の定義**: `yata start` でサーバー起動 → ブラウザでダッシュボード表示 → フックから活動が流れてくる

---

## MVP2スコープ（次のリリース）

**P2-1: フックセットアップウィザード**
- Setup画面でフック設定スニペットを自動生成して表示
- コピーボタン付き
- `~/.claude/settings.json` に追加する形式で出力

```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:3847/api/hook -H 'Content-Type: application/json' -d @-" }] }],
    "PostToolUse": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:3847/api/hook -H 'Content-Type: application/json' -d @-" }] }]
  }
}
```

**P2-2: ツール呼び出し詳細ビュー**
- 活動ログ行クリックでtool_input / tool_resultを展開表示
- JSON整形表示（長い場合は折りたたみ）

**P2-3: セッション別グルーピング**
- ヘッダーにセッション切り替えドロップダウン
- セッションIDでactivitiesをフィルター

**P2完了の定義**: セットアップウィザードだけで導入できる・ツール詳細が見られる・セッションで絞れる

---

## CLIコマンド設計

```bash
yata start              # サーバー起動（デフォルトポート 3847）
yata start --port 4000  # ポート指定
yata agents             # 登録エージェント一覧（ターミナル出力）
yata logs               # 直近の活動ログ（ターミナル出力）
```

ポート番号 `3847`（= ヤタガラスの語呂合わせ）

---

## 実装順序

1. `bin/yata.ts`（CLIエントリー）+ Expressサーバー起動
2. DBスキーマ + SQLite初期化
3. `POST /api/hook` エンドポイント
4. WebSocketサーバー
5. React基盤（Vite設定）
6. AgentList + ActivityFeed コンポーネント
7. エージェント登録画面
8. npm package設定（`bin` フィールド・グローバルインストール対応）
9. ← **MVP1完了**
10. Setup画面（フック設定ウィザード）
11. ActivityDetail（詳細展開）
12. セッション切り替え
13. ← **MVP2完了**

---

## コーディング規約

- コメントは原則書かない
- TypeScript strict モード
- エラーハンドリングはシステム境界のみ
- ポート番号はデフォルト `3847`（設定で変更可能）
