# ウィジェットモード（Document Picture-in-Picture）設計書

ダッシュボードに「ウィジェット化」ボタンを追加し、押すと**常に最前面の小窓**（Document Picture-in-Picture, Chrome/Edge 116+）がポップアウトする。CodexBar の「見なくても視界に入る」体験の Web 版代替。本書は実装への契約。設計のみ→オーナー承認→実装（architect 直接・worktree 隔離）の流れ。

> 現 main: `14d8399`（クリーン）。usage-limits 機能（`/api/usage`・UsageBar 等）はマージ済みで前提として利用する。

## 目的・スコープ

小窓に**レート枠**と**エージェント稼働ランプ**だけを常時表示し、ターミナル作業中でも視界の隅で残量とエージェントの生死を把握できるようにする。

### 対象（オーナー指定・これだけ）
1. **レート枠表示**: Claude/Codex のセッション枠・週次枠（既存 `/api/usage` のデータ。使用率で緑/黄/赤）。
2. **エージェント稼働ランプ**: 既存ダッシュボードと同じ ⬤/○（直近 60 秒に活動があれば ⬤・既存 WS のデータ）。

### 非ゴール
- ログ・活動フィード・コスト集計・エージェント編集などは**含めない**（通常ダッシュボードで見る）。
- **サーバ変更なし**（新規 API・DB・WS メッセージは追加しない）。本機能は**クライアント専用**。
- モデル別枠の詳細表示・リセットのライブ秒刻み（分粒度で十分）。
- PiP 内でのインタラクション（クリックで絞り込み等）。表示専用。

### 前提（現状コードの把握）
- `useActivities()`（`hooks/useWebSocket.ts`）は**呼び出しごとに新規 WS 接続**を張る（モジュール単一接続ではない）。→ 二重呼び出し＝二重接続になるため、ウィジェットは**既存接続を共有**する設計にする。
- エージェント稼働判定は `AgentList.tsx` にあり「エージェントごとの最新 activity が現在から 60 秒以内なら active」。5 秒ごとの `useNow` で再評価。
- レート枠は `UsageBar.tsx` が `/api/usage` を 45 秒ポーリング。使用率の重大度色は `severityClass`（<70 ok / 70–90 warn / >90 err）。
- 色トークンは `global.css` の CSS 変数（`--bg/--panel/--border/--accent/--ok/--warn/--err/--inactive/--text/--muted/--mono/--sans`）。テーマは `document.documentElement` の `data-theme` 属性で切替（`applyTheme`）。
- ルートは `main.tsx` の単一 `createRoot(#root)`。

## Document PiP API 概要（設計の土台）
- 検出: `'documentPictureInPicture' in window`（未対応＝Firefox/Safari 系）。
- 起動: `const pipWindow = await window.documentPictureInPicture.requestWindow({ width, height })` → **空の document を持つ別 Window**。ユーザー操作（クリック）起点でのみ呼べる。
- **同一オリジン・同一 JS 実行コンテキスト**（opener の realm で動く）。→ React の同一ツリーから**ポータルで描画**でき、状態・WS・フックを共有できる。
- スタイルは**空**なので、opener の `document.styleSheets` を PiP 側へ**コピー注入**する必要がある。
- 同時に 1 つのみ。閉じ検知は PiP 側 `pagehide`。opener タブが閉じると PiP も自動で閉じる。

---

## アーキテクチャ

### データ取得: 共有する（React Portal・独立取得しない）＝採用

**決定: ウィジェットは Dashboard の React ツリーから `createPortal(<Widget/>, pipWindow.document.body)` で描画し、既存の WS・usage ポーリングを共有する。**

```
Dashboard（データ所有）
  ├─ useActivities()  … 既存の唯一の WS 接続（activities, connected）
  ├─ agents（既存 /api/agents）
  ├─ useUsage()       … /api/usage を 1 本だけポーリング（新規・UsageBar から抽出）
  │
  ├─ <UsageBar snapshot={usage} />          （ページ内・presentational 化）
  └─ useDocumentPip()
        └─ pipWindow && createPortal(
             <Widget usage={usage} agents={agents} activities={activities} />,
             pipWindow.document.body)
```

**なぜ共有（ポータル）か:**
- PiP は opener の JS 実行コンテキストで動くため、ポータルなら**同一 React ツリー**に居続け、activities/usage の更新が自動で PiP にも反映される。
- WS を二重に張らない（別ルート方式だと 2 本目の WS＝init で直近 100 件が再送・以後も二重受信）。usage ポーリングも 1 本で済む。
- 状態のドリフト（本体と小窓で表示がずれる）が原理的に起きない。

**却下: PiP 側で独立 `createRoot` ＋ 独立フェッチ.** WS/ポーリングが二重化し、両者の同期に手当てが要る。同一 JS コンテキストの利点を捨てる。

### サーバ影響: なし
新規エンドポイント・DB・WS メッセージ・スキーマ変更なし。`/api/usage`・既存 WS（`/ws`）・`/api/agents` を読むだけ。

### 既存コンポーネントへの影響（増分・低リスク）
- `UsageBar` を**presentational 化**（`snapshot: UsageSnapshot | null` を prop で受ける・自前フェッチを `useUsage` に移す）。挙動は不変。
- `Dashboard` が `useUsage()` を持ち、UsageBar と Widget に渡す。ウィジェット化ボタンとポータルを配置。
- 稼働判定ロジックを純粋関数へ抽出（`AgentList` と Widget で共有・`AgentList` の挙動は不変）。

---

## インターフェース / データ構造

### 共有ユーティリティ（純粋関数・抽出）
`src/client/lib/usage.ts`:
```ts
export type Severity = 'ok' | 'warn' | 'err';
export function usageSeverity(percent: number): Severity; // <70 ok / 70–90 warn / >90 err
export function countdown(resetsAt: number | null, nowSec: number): string; // "↺ 2h13m" 等
```
`src/client/lib/agentStatus.ts`:
```ts
export interface AgentStatus { name: string; role: string; color?: string; active: boolean; }
export function computeAgentStatus(
  agents: Agent[], activities: Activity[], nowSec: number, colorMap: Map<string,string>,
): AgentStatus[]; // 最新 activity が nowSec-60 以内なら active
```
（`UsageBar`・`AgentList` もこれらを使うよう置換。severity/countdown は現行と同一ロジックを移設するだけ。）

### usage 共有フック
`src/client/hooks/useUsage.ts`:
```ts
export function useUsage(): UsageSnapshot | null; // /api/usage を REFRESH_MS でポーリング（UsageBar 内実装を移設）
```

### PiP ライフサイクル・フック
`src/client/hooks/useDocumentPip.ts`:
```ts
export interface DocumentPip {
  supported: boolean;
  pipWindow: Window | null;
  open: () => Promise<void>;   // requestWindow → copyStyles → syncTheme → setState
  close: () => void;           // pipWindow?.close()
}
export function useDocumentPip(opts?: { width?: number; height?: number }): DocumentPip;
```
- `supported = typeof window !== 'undefined' && 'documentPictureInPicture' in window`。
- `open()`: 既に開いていれば no-op。`requestWindow({width,height})` → `copyStyles(document, pip.document)` → `syncTheme(pip.document)` → `pip.document.title='Yatagarasu'` → `pip.addEventListener('pagehide', onClose)` → `setPipWindow(pip)`。
- `onClose`: リスナ解除 → `setPipWindow(null)`。
- アンマウント時: リスナ解除・`pipWindow?.close()`。
- **スタイルコピーは open() 内で命令的に 1 回**（`useEffect` に入れない＝StrictMode 二重実行で二重コピーしない）。

### スタイル注入（純粋・DOM 関数）
`src/client/lib/copyStyles.ts`:
```ts
export function copyStyles(source: Document, target: Document): void;
export function syncTheme(target: Document): void; // source の documentElement.dataset.theme を target へ
```
`copyStyles` 実装方針:
```ts
for (const sheet of Array.from(source.styleSheets)) {
  try {
    const cssText = Array.from(sheet.cssRules).map((r) => r.cssText).join('');
    const style = target.createElement('style');
    style.textContent = cssText;
    target.head.appendChild(style);
  } catch {
    if (sheet.href) { // クロスオリジン等で cssRules 不可 → link で参照
      const link = target.createElement('link');
      link.rel = 'stylesheet'; link.href = sheet.href;
      target.head.appendChild(link);
    }
  }
}
```
`syncTheme`: `target.documentElement.dataset.theme = document.documentElement.dataset.theme ?? ''`。（`global.css` の `:root` 変数と `:root[data-theme='oil']` 分岐がこれで効く。body 背景も global.css の `body{background:var(--bg)}` で付く。）

### Widget（presentational）
`src/client/components/Widget.tsx`:
```ts
export function Widget(props: {
  usage: UsageSnapshot | null;
  agents: Agent[];
  activities: Activity[];
}): JSX.Element;
```
- 内部で `nowSec` を 30 秒 tick（カウントダウン・active 判定の再評価）。
- usage 行（Claude/Codex・session+weekly バー・`usageSeverity` で色）と agent ランプ（`computeAgentStatus` の ⬤/○＋名前）を描画。`disabled`/`expired` は行を省略/簡略表示。

---

## UI 設計（コンパクト優先）

初期サイズ `requestWindow({ width: 340, height: 210 })`（ユーザーがリサイズ可）。OS 側 PiP クロム（タイトル=Yatagarasu）を持つので独自ヘッダは最小。

```
┌──────────────── Yatagarasu（OS PiP 枠）────────────────┐
│ Claude·pro   5h ▓▓▓░░ 38%   wk ▓░░░ 12%               │  ← 使用率バー（緑/黄/赤）
│ Codex·plus   5h ▓░░░  4%    wk ▓░░░  6%               │
│ ───────────────────────────────────────────────────── │
│ ⬤ researcher   ⬤ git-hub    ○ web-pilot               │  ← 稼働ランプ（⬤緑/○灰）
│ ○ file-steward ○ librarian   ○ config-keeper           │
└────────────────────────────────────────────────────────┘
```

- **上段=レート枠**: プロバイダ 1 行（`名 · plan` ＋ session/weekly の細バー＋%）。バー色は `usageSeverity`（`--ok/--warn/--err`）。両方 `disabled` なら上段を省略。`expired` は "re-auth" ピル。
- **下段=稼働ランプ**: `⬤`（active=`--ok`）/`○`（inactive=`--inactive`）＋エージェント名（`--mono`・エージェント色）。横 wrap、多い場合は下段のみ縦スクロール。
- 余白・フォント: `--sans`/`--mono`、`--panel` 背景、`--border` 区切り。font-size 11–12px。密度優先。
- 専用 `Widget.module.css`（既存 CSS 変数のみ・インラインスタイル不使用。バー幅の動的 `width:%` は既存 UsageBar と同様 style で可）。
- ボタン: Dashboard の feed ヘッダ（`headerRight`・Live 表示の隣）に小ボタン `⧉ Widget`。`supported` の時のみ表示。開いている間は `⧉ Widget ✕`（クリックで `close()`）にトグル。

---

## ブラウザ対応・フォールバック
- **対応（Chrome/Edge 116+）**: ボタン表示・PiP 起動。
- **未対応（Firefox/Safari 等）**: **ボタンを表示しない**（`supported=false`）。
  - `window.open` の小窓は**常に最前面にできない**（Web に always-on-top API は無い）ため、本機能の主目的「視界の隅に居続ける」を満たさない。→ `window.open` フォールバックは**実装しない**方針を推奨（コスト増に見合わない）。UI が消えるだけで通常ダッシュボードは完全に使えるため実害なし。
  - （オーナーが希望する場合のみ、別タブ/小窓の簡易フォールバックを将来追加可能と明記。）

## ライフサイクル / エッジケース
- **開く**: ボタン→`open()`。二重起動はガード（既に `pipWindow` があれば無視 or フォーカス）。
- **PiP を閉じた**: `pagehide`→`setPipWindow(null)`→ポータル unmount・ボタン表示戻す。
- **opener タブを閉じた**: PiP はブラウザが自動で閉じる。unmount クリーンアップでリスナ解除。
- **テーマ変更中に開いている**: open 時に `syncTheme` で同期。開いている最中のテーマ切替の反映は MVP 対象外（必要なら data-theme を監視して更新＝将来拡張）。
- **同時 1 つ**: ブラウザ仕様。設計上もシングルトン（`pipWindow` state 1 つ）。
- **StrictMode 二重描画**: open はクリック起点、スタイルコピーは命令的で冪等でなくてよい（open ごとに新規 document）。ポータル描画は state 駆動で問題なし。

---

## テスト方針

現状 vitest は `environment: 'node'` で**クライアントのコンポーネントテストは未整備**（jsdom も testing-library も無い）。本機能は DOM/PiP を扱うため、以下の方針とする。

### 追加依存（要オーナー承認・最小構成）
- devDependencies に **`jsdom`** を追加。
- DOM を要するテストファイルの先頭に `// @vitest-environment jsdom` を付け、ファイル単位で jsdom 環境に切替（グローバル config は変更しない＝既存 node テストに無影響）。
- **`@testing-library/react` は使わない**方針を推奨（PiP の命令的ロジックを純粋/DOM 関数へ抽出し、React 描画テスト無しで検証）。導入するなら別途承認。

### A. 純粋関数（node 環境）
1. `usageSeverity`: 69→ok / 70→warn / 90→warn / 91→err の境界。
2. `countdown`: 秒→"↺ Xd Yh"/"Yh Zm"/"Zm"/"now" の整形（固定 now 注入）。
3. `computeAgentStatus`: 最新 activity 60 秒以内で active、境界（59/60/61s）、未活動エージェントは inactive、色マップ反映。

### B. DOM 関数（jsdom 環境・`@vitest-environment jsdom`）
4. `copyStyles`: source に `<style>`（既知ルール）を入れ、target へコピー後 target.head に `<style>` が入り cssText を含む。`cssRules` 参照不可（href あり）の分岐は link 生成にフォールバック。
5. `syncTheme`: source の `data-theme` を target の `documentElement` に反映。

### C. PiP ライフサイクル（jsdom 環境・API モック）
- `window.documentPictureInPicture = { requestWindow: vi.fn().mockResolvedValue(fakePip) }`。
  `fakePip` = jsdom で作った別 document を持つ疑似 Window（`{ document, addEventListener, removeEventListener, close }`、document は `document.implementation.createHTMLDocument()` 由来）。
6. `supported`: API 有無で true/false。
7. `open()`: `requestWindow` が呼ばれ、`fakePip.document.head` にスタイルが注入され、`pagehide` リスナが登録され、`pipWindow` がセットされる。
8. `pagehide` 発火→`pipWindow` が null に戻る。
9. 二重 `open()` 呼び出しで `requestWindow` が 1 回のみ。

### D. 非回帰
10. 既存全テスト（現行 94）を**無改変で緑**。UsageBar/AgentList のリファクタで挙動不変（必要なら該当の既存/新規テストで担保）。`npm test`・`npm run build`・`npm run typecheck` 緑。

---

## 実装タスク分割

| # | タスク | 主対象ファイル | 依存 |
|---|---|---|---|
| W1 | 純粋関数抽出 `usageSeverity`/`countdown` ＋テスト（A:1–2）。UsageBar から移設し UsageBar は import に置換 | `src/client/lib/usage.ts`, `tests/usage.client.test.ts` | — |
| W2 | `computeAgentStatus` 抽出＋テスト（A:3）。AgentList をこれを使うよう置換（挙動不変） | `src/client/lib/agentStatus.ts`, `src/client/components/AgentList.tsx`, `tests/agentStatus.test.ts` | — |
| W3 | `useUsage` フック抽出（UsageBar のポーリングを移設） | `src/client/hooks/useUsage.ts` | W1 |
| W4 | UsageBar を presentational 化（`snapshot` prop 受け取り・自前フェッチ削除）。Dashboard が `useUsage()` を持ち UsageBar に渡す | `src/client/components/UsageBar.tsx`, `src/client/pages/Dashboard.tsx` | W3 |
| W5 | `copyStyles`/`syncTheme` ＋テスト（B:4–5, jsdom） | `src/client/lib/copyStyles.ts`, `tests/copyStyles.test.ts` | — |
| W6 | `useDocumentPip` フック（open/close/pagehide/supported）＋テスト（C:6–9, jsdom・API モック） | `src/client/hooks/useDocumentPip.ts`, `tests/documentPip.test.ts` | W5 |
| W7 | `Widget`（レート枠＋稼働ランプ・compact）＋ CSS | `src/client/components/Widget.tsx(+module.css)` | W1, W2 |
| W8 | Dashboard 統合: ウィジェット化ボタン（supported 時のみ・トグル）＋ `createPortal(<Widget/>, pipWindow.document.body)` | `src/client/pages/Dashboard.tsx` | W4, W6, W7 |
| W9 | `jsdom` devDep 追加・非回帰（既存94緑＋新規）・build・typecheck | `package.json`, — | 全 |

（実装は architect 直接・worktree 隔離。Codex は Windows 書込不可のため使わない。）

## 受け入れ基準
- [ ] 対応ブラウザで Dashboard に「⧉ Widget」ボタンが出て、押すと最前面小窓が開く。未対応ブラウザではボタン非表示。
- [ ] 小窓に Claude/Codex のレート枠（session/weekly・使用率で緑/黄/赤）とエージェント稼働ランプ（⬤/○・60秒基準）が表示され、本体と同じデータでライブ更新される。
- [ ] WS 接続・usage ポーリングが**二重化しない**（ポータルで既存を共有）。
- [ ] 小窓を閉じる/opener タブを閉じるとクリーンに後片付けされ、ボタン状態が戻る。
- [ ] CSS 変数トークンでダークテーマ整合。スタイルは PiP へ注入され崩れない。
- [ ] サーバ（API/DB/WS）**無変更**。既存 94 テスト無改変で緑＋新規テスト緑＋build＋typecheck 緑。

## リスク・未確定事項
1. **jsdom 追加の可否**: クライアント DOM テストのため `jsdom` devDep を足す（testing-library は使わない最小方針）。→ 承認要。
2. **スタイルコピーの取りこぼし**: Vite dev は CSS を `<style>` 注入、build は `<link>` 済み CSS。`copyStyles` は cssRules 優先＋href フォールバックで両対応するが、**dev サーバ特有の HMR スタイル**は実機で目視確認要（本番 build では単一 CSS のため確実）。
3. **PiP 内 React ポータルの teardown 警告**: `pagehide`→state null の順で unmount するが、稀にドキュメント破棄と競合し警告が出る可能性。実機で確認し、必要なら unmount タイミングを調整。
4. **テーマのライブ同期**: 開いている最中のテーマ切替反映は MVP 非対象（open 時同期のみ）。要望次第で data-theme 監視を追加。
5. **`requestWindow` のユーザー操作要件**: クリックハンドラ内で呼ぶ必要あり（満たす設計）。テストではモックのため無関係。
