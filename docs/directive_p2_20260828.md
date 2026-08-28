# 指示書: yah.OS P2改善（レビュー2026-08-28の残件）

- 状態: **指示書のみ・未着工**。各カードスレッドが自分の番で消化する（P0/P1は共有部スレッドで実施済み → review_yah_os_20260828.md）
- 原則: 壊れてはいない改善なので急がない。**自分の担当カードを触るついでに該当項目を消化**し、この文書の表に済を付ける
- ゲート: 変更後は必ず `node check-hardcoded.mjs && node smoke.mjs` → push → CI緑 → 本番200確認（従来どおり）

## 担当の割り振り

| # | 項目 | 担当 | 状態 |
|---|---|---|---|
| 1 | bootData移行（カードごと） | 各カードスレッド | 未 |
| 2 | topbar＋認証UIの共通化 initAuthUI() | 共有部スレッド | 未 |
| 3 | 消し込みの楽観更新 | メンテナンスカード | 未 |
| 4 | ナビ改名＋「準備中」表示 | 共有部スレッド（os-nav.js） | 未 |
| 5 | a11y最低限（focus-visible・行tabindex・ドットaria） | 共有部スレッド（os.css/os-nav.js） | 未 |
| 6 | escの統一（niwaの弱体版是正） | 共有部スレッド | 未 |
| 7 | os.css末尾の上書き群を基底へ畳む | 共有部スレッド | 未 |
| 8 | PROP_LABEL直書き→properties.labelから導出 | 各カードスレッド（overview系APIに同梱） | 未 |

## 各項目の仕様

### 1. bootData移行（1カード15分）
os-core.js の `bootData({ cacheKey, fetch, render, status })` へ寄せる。自前の「キャッシュ描画→フェッチ→無条件innerHTML総入替」を廃止。**内容が同じなら再描画しない**のが目的（ちらつき根治）。renderは既存関数をそのまま渡してよい。1カードずつ・混ぜてコミットしない。

### 2. initAuthUI()（共有部）
全ページに複製されている「login-btnのonAuthStateChanged＋クリックでsignIn/signOut」を os-core.js の `initAuthUI()` に1本化。ページ側は `initAuthUI(); onAuthStateChanged(auth, u => { if (u) load(); })` だけ残す。P1の未ログインバナーと二重にならないよう、バナー注入は initAuthUI 内へ統合してよい。

### 3. 消し込みの楽観更新（メンテナンス）
`advance` 成功後に `api("overview")` 全取得→全再描画をやめ、DATA内の該当ジョブの status だけ書き換えて renderClearing() のみ再実行。裏で overview を取り直して差分があれば上書き。失敗時は元に戻して notify。

### 4. ナビ改名（共有部・os-nav.js の CARDS が正本）
- 財務 → 月次収支／費用 → 光熱費・固定費／chat → ゲストチャット（他も名前と中身のズレがあれば同時に）
- **data-key（health の card 文字列・ドット紐付け）は変えない**。表示ラベルのみ変更。サーバ側 health.ts の add() 第1引数と突き合わせてから着手
- ファイルの無い項目（?empty=）はクリック時に遷移せず「準備中」をその場に表示

### 5. a11y最低限（共有部）
- os.css に `:focus-visible { outline: 2px solid #6ea8fe; outline-offset: 2px; }` を共通定義
- クリック可能な表の行（today-row等のbutton化済みは対象外）に tabindex="0"＋Enter発火
- ナビのドットに `aria-label="状態: 正常/要対応/未判定"` を applyHealth 内で付与

### 6. escの統一（共有部）
niwa.html が持つ弱いエスケープ関数を os-core.js の esc と同じ実装（`<>&"` 全置換）に揃える。niwa は os-core を import しない設計（業者向け公開ページ）なので、**関数本体をコピーで揃える**＋両者に「相手も直せ」のコメントを残す。

### 7. os.css末尾の整理（共有部）
「可読性底上げ（2026-08-27）」末尾ブロックの上書きを、対応する基底セレクタへ畳む。**見た目が1pxも変わらないこと**が合格条件——畳む前後で主要ページのスクリーンショット比較をすること。フォント下限0.72remのCI検査は維持。

### 8. PROP_LABEL の導出化（各カード）
各ページの `PROP_LABEL = { kiyokawa: "清川", ... }` 直書きを廃止し、overview系APIのレスポンスに `props: [{id, label}]` を同梱してそこから引く。サーバ側は propertySummary が既に持っているので露出のみ。棟の追加（六本松2027-02・大手門2027-05）で直し漏れが出る前に。

## やらないこと（据え置き・レビューどおり）
- BigQuery移行・ビルド導入・フレームワーク化（小規模適正の既定方針）
- 消し込みの完全Undo（engine側の逆操作が必要。P1の「詳細から戻す」で足りている）
