# 🐦‍⬛ Yatagarasu（八咫烏）

> Claude Code のエージェント群をリアルタイムで監視する、ローカル開発ダッシュボード

[![CI](https://github.com/masa5228/yatagarasu/actions/workflows/ci.yml/badge.svg)](https://github.com/masa5228/yatagarasu/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-00ff9d.svg)](LICENSE)

Claude Code のフック経由でエージェントの活動を受信し、ターミナルの横に並べて使うダッシュボードです。
「ログを流すだけ」の既存ツールと違い、**エージェントを名前・役割つきで登録して "チームメンバー表" のように管理**できるのが差別化ポイントです。

![Dashboard](docs/screenshots/dashboard.png)

---

## ✨ 特徴

- **リアルタイム活動フィード** — フックで届くツール呼び出しを WebSocket で即時表示（`tail -f` 的に下から積み上がる）
- **エージェント管理** — 名前・役割・説明・アクセントカラーを登録。直近60秒の活動有無で稼働状態（⬤ / ○）を可視化
- **ツール詳細ビュー** — ログ行クリックで `tool_input` / `tool_result` を整形 JSON で展開
- **セッション絞り込み** — `session_id` 単位でフィードをフィルター
- **セットアップウィザード** — フック設定 JSON を自動生成。**エージェント名を指定すると `?agent=` 付きフック**を出力し、役割別にエージェントを分けて表示できる
- **ローカル完結** — データは `~/.yatagarasu/` の SQLite に保存。外部送信なし

---

## 📦 インストール

```bash
# npm 公開後
npm install -g yatagarasu
yata start

# ソースから
git clone https://github.com/masa5228/yatagarasu.git
cd yatagarasu
npm install
npm run build
npm start
```

`yata start` 後、ブラウザで **http://localhost:3847** を開きます（ポート 3847 = 八咫烏の語呂合わせ）。

---

## 🚀 使い方

### 1. 起動

```bash
yata start              # デフォルトポート 3847
yata start --port 4000  # ポート変更
```

### 2. フックを結線する（Setup ウィザード）

ダッシュボードの **Setup** タブを開き、フック設定 JSON を生成して `~/.claude/settings.json`
（Windows: `%USERPROFILE%\.claude\settings.json`）の `hooks` にマージします。

![Setup Wizard](docs/screenshots/setup-wizard.png)

生成される設定はこの形です（エージェント名 `researcher` を指定した例）:

```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": ".*", "hooks": [{ "type": "command",
      "command": "curl -s -X POST \"http://localhost:3847/api/hook?agent=researcher\" -H \"Content-Type: application/json\" -d @-" }] }],
    "PostToolUse": [{ "matcher": ".*", "hooks": [{ "type": "command",
      "command": "curl -s -X POST \"http://localhost:3847/api/hook?agent=researcher\" -H \"Content-Type: application/json\" -d @-" }] }]
  }
}
```

> 💡 **エージェント別に分けたいとき**: 役割ごとに Claude を動かすなら、それぞれの設定で `?agent=` の名前を変えてください。ダッシュボード上で別エージェントとして並びます。Claude Code の標準フックには エージェント識別子が含まれないため、この `?agent=` クエリで識別子を補います。

### 3. 監視する

Claude Code を操作すると、左サイドバーで稼働状態、右ペインで活動ログがリアルタイムに更新されます。
ログ行をクリックすると入力／結果の詳細が展開されます。

![Activity Detail](docs/screenshots/activity-detail.png)

---

## ⚙️ 設定

| 項目 | デフォルト | 変更方法 |
|------|-----------|---------|
| ポート | `3847` | `yata start --port <N>` |
| DB ファイル | `~/.yatagarasu/yatagarasu.sqlite` | 環境変数 `YATA_DB_PATH`（`:memory:` 可） |

---

## 🛠️ 開発

```bash
npm install
npm run dev        # API(3847) + Vite(5173, /api・/ws を proxy)
npm run typecheck  # サーバー/クライアント両方の型チェック
npm run build      # サーバー(tsc) + クライアント(vite) をビルド
```

### テスト

```bash
npm test           # Vitest（29テスト）
npm run test:watch
npm run test:coverage
```

DB層・HTTP ルート（フック受信／エージェント CRUD／活動一覧）・WebSocket 配信・ウィザード生成ロジックを
Vitest + supertest でカバーしています（サーバーコアは stmts 95% / funcs 100%）。
push / PR で GitHub Actions が typecheck・カバレッジ・ビルドを実行します。

> ℹ️ テストは Node 22 以上が必要です（WebSocket クライアントに Node 組み込みの `WebSocket` を使用）。

---

## 🧱 技術スタック

| 役割 | 技術 |
|------|------|
| フック受信・API サーバー | Node.js + Express |
| データ保存 | SQLite（better-sqlite3）|
| リアルタイム通信 | WebSocket（ws）|
| フロントエンド | React + Vite + TypeScript |
| スタイリング | CSS Modules |
| テスト | Vitest + supertest |

---

## 📁 プロジェクト構成

```
bin/yata.ts            # CLI エントリ（yata start）
src/
  server/
    index.ts           # createApp() / startServer()
    routes/            # hooks・agents・activities
    db/                # SQLite 接続・スキーマ
    ws.ts              # WebSocket 配信ハブ
  client/
    pages/             # Dashboard・Agents・Setup
    components/        # AgentList・ActivityFeed・ActivityDetail
    hooks/・lib/       # useWebSocket・api・hookSnippet
tests/                 # Vitest テスト
```

---

## 🗺️ ロードマップ

- [x] **MVP1** — フック受信サーバー / リアルタイム活動フィード / エージェント登録
- [x] **MVP2** — セットアップウィザード / ツール詳細ビュー / セッション別グルーピング
- [ ] npm 公開
- [ ] エージェント別カラーのフィード反映・通知・履歴の検索など

---

## 📄 ライセンス

[MIT](LICENSE) © masa5228
