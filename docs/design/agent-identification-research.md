# エージェント識別方法の改善: 事前調査（Issue #3）

調査日: 2026-07-09 ／ 対象Issue: https://github.com/masa5228/yatagarasu/issues/3

**最重要の発見**: Claude Code の各フックpayloadには v2.1.x 系で既に `agent_id`（サブエージェント固有UUID）と `agent_type`（エージェント名/型）が標準フィールドとして乗っており、**URLクエリでの `?agent=` 埋め込みは本来不要になっている**。

## 1. Claude Code フックpayloadの利用可能フィールド棚卸し

一次ソース: https://code.claude.com/docs/en/hooks

### 全イベント共通フィールド

| フィールド | 説明 |
|---|---|
| `session_id` | セッション識別子 |
| `transcript_path` | 会話JSONLファイルへのパス |
| `cwd` | 呼び出し時の作業ディレクトリ |
| `hook_event_name` | 発火イベント名 |
| `permission_mode` | `default`/`plan`/`acceptEdits`/`auto`/`dontAsk`/`bypassPermissions` |
| `prompt_id` | プロンプトUUID（v2.1.196+） |
| **`agent_id`** | **サブエージェント内のフック実行時のみ存在。サブエージェント固有UUID** |
| **`agent_type`** | セッション/サブエージェント実行時のエージェント名（`Explore`/`Plan`/`general-purpose`/カスタム名/`plugin:name:agent`） |

**判定ロジック（公式記載）**: `agent_id` が存在すればサブエージェント内実行、未設定ならメインセッション。`agent_type` はセッションレベルなら `--agent` フラグ由来、サブエージェントレベルならサブエージェント定義frontmatterの `name` 由来。

`SubagentStart`/`SubagentStop` イベントが存在し、本体と明確に区別可能。`SessionStart` にも `agent_type`（`claude --agent <name>` 起動時）が乗る。

**環境変数**: `CLAUDE_PROJECT_DIR`（常設）、`CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA`（プラグインフックのみ）、`CLAUDE_CODE_REMOTE`/`CLAUDE_CODE_BRIDGE_SESSION_ID`（v2.1.199+）。チーム関連の `--team-name`/`--agent-id`/`--agent-name` CLIフラグは環境変数として公開されておらず、フックからは参照不可。

## 2. Agent Teams機能でのname伝播

一次ソース: https://code.claude.com/docs/en/agent-teams（v2.1.178時点）

- チーム名はセッション由来で自動生成: `session-` + セッションIDの先頭8文字
- `~/.claude/teams/{team-name}/config.json` が `members` 配列を持ち、各teammateの `name`（リードが命名した人間可読名）・`agent ID`・`agent type` を含む
- `TaskCreated`/`TaskCompleted`/`TeammateIdle` フックpayloadの `team_name` は非推奨と明記。teammateの人間可読名がフックpayloadに直接乗る記載は確認できず、**`config.json` の `members` を突き合わせて `agent_id` → 人間可読名を解決する必要がある**
- 関連: https://github.com/anthropics/claude-code/issues/35447（`CLAUDE_TEAM_NAME` 等の環境変数公開要望、closed as not planned）

## 3. 類似OSSの識別手法

| プロジェクト | 識別キー | 方式 |
|---|---|---|
| [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) | `source_app`（プロジェクト単位の固定文字列、CLI引数で必須指定）+ `session_id` + `agent_id`（存在時のみ） | 「エージェント名」の概念は無く、`source_app`＋`session_id` の組で区別 |
| [hoangsonww/Claude-Code-Agent-Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor) | セッション/ツール/サブエージェント単位 | 詳細スキーマ非公開 |
| [mukul975/claude-team-dashboard](https://github.com/mukul975/claude-team-dashboard) | `team-name` + `agent-name`（ファイルパスから逆引き） | フック不使用。`~/.claude/teams/` をchokidarで監視し、`inboxes/{agent-name}.json` のファイル名からteammate名を取得 |

## 4. クエリ埋め込み以外の代替チャネル

- **OpenTelemetry**（https://code.claude.com/docs/en/agent-sdk/observability）: spanに `session.id` が標準搭載。`service.name` の上書きでエージェント区別も可能だが、現行HTTPフック受付とは別経路
- **statusLine**（https://code.claude.com/docs/en/statusline）: `session_name`（`/rename`の人間可読名）が取れる数少ない箇所だがユーザー操作依存
- **transcript_path のパース**: 可能だがフックpayloadに同等フィールドがあり二度手間

## 5. Codex側

一次ソース: https://developers.openai.com/codex/hooks

- イベント: `SessionStart`, `SubagentStart/Stop`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Pre/PostCompact`, `UserPromptSubmit`, `Stop`
- 共通フィールド: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`, `turn_id`（Codex固有）, `permission_mode`
- `SubagentStart`/`SubagentStop` に `agent_id`・`agent_type`（Stopには `agent_transcript_path` も）あり — Claude Codeと同構造
- 注意: `thread_id`/`parent_thread_id`/`depth` が乗るという情報が一部にあるが公式ドキュメントで確認できず、採用しない
- 固定名 `?agent=codex` 問題の直接解決にはならないが、`agent_id` で同一Codexの複数並列は区別可能

## 名簿キー設計の選択肢（3案比較）

### 案A: payload由来の `agent_id` を一次キーに昇格、`name`/`project` を属性化
- `(session_id, agent_id)` を実質一意キーに。`agent_id` 無し（本体セッション）は `session_id` 単独
- 長所: URLクエリ管理が不要になり `?fallback=` 依存を構造的に排除。プロジェクトは `cwd` から自動判定
- 短所: UUIDは人間に読めないため表示用name解決レイヤ（`agent_type` または team `config.json` 突き合わせ）が別途必要

### 案B: `(project_dir, session_id)` 複合キー、`name` は表示ラベル（UNIQUE制約撤廃）
- 長所: スキーマ変更が小さく、同名エージェント混在問題はこれだけでほぼ解決
- 短所: Codex固定名の衝突は残る。`session_id` の生成規則がツール間で異なり正規化が要る

### 案C: `~/.claude/teams/{team}/config.json` のファイル監視サイドチャネル追加
- 長所: Agent Teams利用時に人間可読名を最も正確に取得できる唯一の経路
- 短所: Agent Teams限定（単体サブエージェント/Codexに効かない）。実装コスト最大

### 推奨
案Bを土台に案Aの `agent_id` を併記保存し、Agent Teams対応が必要になった時点で案Cを追加チャネルとして載せる段階的移行。

## 出典

- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/agent-teams
- https://github.com/anthropics/claude-code/issues/35447
- https://github.com/disler/claude-code-hooks-multi-agent-observability
- https://raw.githubusercontent.com/disler/claude-code-hooks-multi-agent-observability/main/.claude/hooks/send_event.py
- https://github.com/hoangsonww/Claude-Code-Agent-Monitor
- https://github.com/mukul975/claude-team-dashboard
- https://code.claude.com/docs/en/agent-sdk/observability
- https://code.claude.com/docs/en/statusline
- https://developers.openai.com/codex/hooks
- https://github.com/openai/codex/issues/17478
- https://codex.danielvaughan.com/2026/04/15/codex-cli-hooks-complete-guide-events-policy-patterns/
