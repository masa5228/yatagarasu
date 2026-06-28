# リードセッション識別 設計書

## 目的・スコープ

`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 環境において、**司令塔（オーケストレーター＝トップ階層）の
Claude Code リードセッション**がダッシュボード上で `agent_name = "default"` に落ち、指揮者として
識別できない不具合を解消する。

- **ゴール**: リードセッションがダッシュボードで識別可能になる（generic な `default` に埋もれない）。
  かつ、サブエージェント別の識別を**一切壊さない**。
- **非ゴール**: セットアップウィザード(`hookSnippet.ts`)のUI拡張、`~/.claude/settings.json` の自動編集。

対象ファイル: `src/server/routes/hooks.ts`（名前解決ロジック）。
DB スキーマ・WebSocket 配信・自動仮登録・エージェント CRUD は**変更しない**。

## 根本原因

`src/server/routes/hooks.ts` の名前解決:

```ts
const agentName = queryAgent ?? body.agent_type ?? body.agent_name ?? 'default';
```

- サブエージェントは起動時のチームメンバー名が hook payload（`body.agent_type` / `body.agent_name`）に
  乗るため正しく識別される。
- トップ階層のリードセッションは名前を持たないため `body.agent_type` も `body.agent_name` も無く、
  グローバルフック（`~/.claude/settings.json` の matcher `.*`、`?agent=` クエリ無し）経由のため
  `queryAgent` も無い。結果 `'default'` に落ちる。
- グローバルフックに安易に `?agent=X` を足すと `queryAgent` が**最優先**のため、
  サブエージェントの活動まで全部 X に塗り潰され、エージェント別識別が壊れる。

## 採用アプローチ: 最低優先度の新クエリ `?fallback=`

解決順序を以下に変更する（`?agent=` の最優先＝強制指定の契約は**不変**。末尾に `queryFallback` を追加）:

```
queryAgent ?? body.agent_type ?? body.agent_name ?? queryFallback ?? 'default'
```

| ソース | クエリ/フィールド | 優先度 | 意味 | 変更 |
|---|---|---|---|---|
| `queryAgent` | `?agent=` | 最優先 | 強制指定（ウィザード生成の個別フック用） | 不変 |
| `body.agent_type` | payload | 高 | チームメンバー名（サブエージェント） | 不変 |
| `body.agent_name` | payload | 中 | チームメンバー名（別表記） | 不変 |
| `queryFallback` | `?fallback=` | **低（新規）** | 他で識別できない時だけ効くラベル | **追加** |
| 既定 | — | 最低 | `'default'` | 不変 |

### なぜこの順序でゴールを満たすか

グローバルフックの `curl` 末尾に `?fallback=<ラベル>` を付けた場合:

- **リードセッション**: `?agent=` 無し・`body.agent_type/agent_name` 無し → `queryFallback`（= ラベル）が効く。
  → ダッシュボードで `<ラベル>` として識別可能。
- **サブエージェント**: `body.agent_type`（= 自分の名前）が `queryFallback` より高優先 → 自分の名前を維持。
  → グローバル `?fallback` で塗り潰されない。

### なぜ reorder 案でなくこの案か（設計判断の記録）

代替の reorder 案（`body.agent_type ?? body.agent_name ?? queryAgent ?? 'default'`）は
`?agent=` の意味を「強制」→「フォールバック」に**逆転**させる。既存テスト
`uses ?agent= query as the highest-priority agent name` の意図が偽になり書き換えが必要で、
文書化済み契約を壊す。本案は**純粋な追加のみ**で `?agent=` の契約を保ち、既存テスト全てを無改変で通す
（後方互換を最優先）。

## インターフェース / データ構造

`hooks.ts` の inline 名前解決を、テスト可能な**純粋関数**に抽出して export する。

```ts
export function resolveAgentName(
  query: { agent?: unknown; fallback?: unknown },
  body: { agent_type?: unknown; agent_name?: unknown },
): string;
```

- 各ソースは「空文字・空白のみ・文字列以外」を `undefined` 相当として正規化し、`??` で繋ぐ
  （空白だけのラベルが agent 名にならないようにする堅牢化）。
- 戻り値が解決された `agentName`。ルートハンドラはこの関数を呼ぶだけにする。
- 既存の `ensureAgent(agentName)`（自動仮登録）・`insertActivity` ・`broadcastActivity` の呼び出しは
  そのまま維持する。

正規化の基準: `typeof v === 'string' && v.trim().length > 0` を満たす時のみ採用、それ以外は `undefined`。

## 制約 / 非機能要件

- TypeScript strict、既存コーディング規約（コメントは原則書かない）に従う。
- DB スキーマ・既存 API・WebSocket・自動仮登録の挙動を変えない。後方互換を保つ。
- `?fallback=` で渡されたラベルも未登録なら既存どおり `ensureAgent` で自動仮登録される
  （role="未設定" の仮エージェントとして登場し、後で Agents 画面から編集可能）。
- レスポンスは従来どおり常に `200 { ok: true }`。

## テスト方針

vitest。`hooks.ts` の名前解決ロジックに**新規ユニットテスト**を追加すること。

### A. `resolveAgentName` 純粋関数の直接ユニットテスト（新規ファイル想定: `tests/resolveAgentName.test.ts`）

1. `?agent=` は body.agent_type より優先（強制指定の契約維持）:
   `resolveAgentName({ agent: 'forced' }, { agent_type: 'sub' }) === 'forced'`
2. **【核】サブエージェントは `?fallback` で塗り潰されない**:
   `resolveAgentName({ fallback: 'concierge' }, { agent_type: 'researcher' }) === 'researcher'`
3. **【核】リードは `?fallback` で識別される**:
   `resolveAgentName({ fallback: 'concierge' }, {}) === 'concierge'`
4. `body.agent_name` は `?fallback` より優先:
   `resolveAgentName({ fallback: 'x' }, { agent_name: 'sub' }) === 'sub'`
5. 何も無ければ `'default'`:
   `resolveAgentName({}, {}) === 'default'`
6. 空白/空文字の正規化: `resolveAgentName({ agent: '   ' }, { agent_type: 'sub' }) === 'sub'`

### B. supertest 結合テスト（`tests/hooks.test.ts` に追記）

7. `POST /api/hook?fallback=concierge` + body `{}` → activity の `agent_name === 'concierge'`、
   かつ `concierge` が自動仮登録される。
8. `POST /api/hook?fallback=concierge` + body `{ agent_type: 'researcher' }` →
   `agent_name === 'researcher'`（サブエージェント識別維持）。
9. `?agent=` と `?fallback=` 両方 + body に agent_type → `?agent=` が勝つ。

### C. 既存テストの非回帰

`tests/hooks.test.ts` / `tests/hookSnippet.test.ts` の既存ケースを**無改変で**全て通すこと。
`npm test`（vitest）がグリーンであることを確認する。

## 受け入れ基準

- [ ] 名前解決順序が `queryAgent ?? body.agent_type ?? body.agent_name ?? queryFallback ?? 'default'` になっている。
- [ ] `resolveAgentName` が純粋関数として export され、ルートはそれを呼ぶだけになっている。
- [ ] 上記テスト A の核2本（#2, #3）を含む新規ユニットテストが追加され、緑。
- [ ] supertest 結合テスト（B の #7, #8, #9）が追加され、緑。
- [ ] 既存テスト全て（hooks / hookSnippet / db / agents / activities / ws）が無改変で緑。
- [ ] DB スキーマ・WebSocket・自動仮登録・エージェント CRUD は未変更。
- [ ] `~/.claude/settings.json` は変更しない（`?fallback=` 付与は提案として報告に残す）。
