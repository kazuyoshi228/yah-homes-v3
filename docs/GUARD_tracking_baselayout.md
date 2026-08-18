# 【保護】BaseLayout.astro の計測ブロックを壊さないための指示

**作成**: 2026-08-18
**対象ファイル**: `src/layouts/BaseLayout.astro`（計測タグのブロック・現状 L131〜L215 付近）
**この文書の目的**: 同じ事故を三度起こさないため。**このファイルの計測ブロックを触る前に必ず読むこと。**

---

## 起きた事故（2026-08-16 → 08-18・2日間の計測全損）

Metaピクセルを追加する際、GA4初期化スクリプトに `define:vars={{ metaPixelId: ... }}` を付けた。

**Astro は `define:vars` を使うと、そのスクリプトを IIFE でラップする。**
その結果 `function gtag()` がグローバルに出なくなり、他ファイルから呼んでいる

```js
window.gtag?.("event", "availability_requested", {...})
```

が**すべて無音で不発**になった（`?.` のせいでエラーも出ない）。

### 被害

| 失われたもの | 期間 |
|---|---|
| `availability_requested` / `availability_result_viewed` | 8/16〜8/18 |
| `begin_checkout` / `checkout_viewed` / `dates_selected` | 同上 |
| `click_airbnb` / `click_booking_com`（手渡し） | 同上 |
| checkout の `gtag('get', 'client_id')` | 同上 → **purchase が Unassigned になっていた真因** |

「直販サイトの詰まりが見えない」という状態の正体は、詰まりではなく**目隠し**だった。

### 修正（コミット 55a4569）

```js
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
window.gtag = gtag;   // ← これ。絶対に消さない
```

---

## 触るときの鉄則

### 1. `window.gtag = gtag;` を消さない・移動しない
`define:vars` を使っている限り必須。この1行が無いと、**サイト全体のカスタムイベントが静かに全滅する**。エラーも警告も出ないので、GA4を見るまで気づけない。

### 2. `define:vars` を安易に増やさない
値を1つ渡すために IIFE ラップの副作用を受け入れることになる。
**代替案**: `<script is:inline>` の外側に `<meta>` や `data-` 属性で値を置き、スクリプト側で読む。

### 3. 実行時ホストガード `TRACK` を外さない
```js
var TRACK = location.hostname === "yah.homes" || location.hostname === "www.yah.homes";
```
これが無いと、プレビューチャネル（`*.web.app`）のテスト操作が本番GA4に混入する。
2026-08 実測でテスト決済 `purchase` 5件・¥196,400 が本番に混ざった。

### 4. `isPrivatePage`（/admin・/account の計測除外）を外さない
発注者自身の管理作業が計測され、「日本が最多国」という誤った指標を生んでいた。

### 5. `window.fbq && fbq(...)` の形を崩さない
`fbq` は未初期化のことがある。直接呼ぶと例外で**以降のクリック計測が止まる**。

### 6. `click_airbnb` は `Lead` ではなく `OutboundBookingClick` を送る
OTAへの流出を Meta の Lead（直販の見込み）と混ぜると、広告最適化が「OTAへ逃がす人」を優良と学習する。

---

## 変更したら必ず実行する検証

ビルド成果物とブラウザの両方で見る。**「ビルドが通った」は検証ではない。**

```bash
# ① 成果物に必須の3点が入っているか
grep -c "window.gtag = gtag" dist/zh/index.html   # 1 であること
grep -c "location.hostname === \"yah.homes\"" dist/zh/index.html  # 1
grep -c "window.fbq && fbq" dist/zh/index.html    # 1以上

# ② 管理画面には計測が無いこと
grep -c "G-VJ5DDRML79" dist/admin/menu/index.html  # 0 であること
```

**③ ブラウザのコンソールで（最重要）**
```js
typeof window.gtag   // "function" であること。"undefined" なら壊れている
```

**④ デプロイ後、翌日のGA4で確認**
`availability_requested` / `click_airbnb` が 0 になっていないか。0なら即ロールバック。

---

## デプロイ手順（必ずこれを使う）

```bash
scripts/safe-deploy.sh preview   # プレビューで確認
scripts/safe-deploy.sh live      # 本番へ
```

素の `npm run build` でデプロイしないこと。`BOOK_PREVIEW=1` が無いと予約ページが生成されず、
171ページ→151ページになって**直販サイトが404になる**（2026-08-17 に実際に起こした）。

---

## 関連

- `docs/spec_tracking_cleanup_and_meta_pixel.md` — Metaピクセル設置の仕様
- `docs/spec_direct_booking_conversion_switch.md` — 直販CV切替
- `scripts/safe-deploy.sh` — 安全デプロイ（BOOK_PREVIEW強制・必須ページ検証）
- コミット `ceee986`（ピクセル設置・事故の原因）／`55a4569`（修正）
