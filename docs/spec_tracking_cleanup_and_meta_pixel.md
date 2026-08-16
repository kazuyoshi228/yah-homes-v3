# 仕様書: 計測タグの汚染除去 ＋ Metaピクセル設置

**作成**: 2026-08-15
**対象**: `src/layouts/BaseLayout.astro`（1ファイル）
**状態**: 承認待ち（未実装）
**関連**: `docs/spec_direct_booking_conversion_switch.md`（直販CV切替の前提条件）

---

## 1. 背景 — 3つの問題を1箇所で解決する

現在 GA4（G-VJ5DDRML79）のタグは `BaseLayout.astro` の `<head>` に静的に置かれ、**すべてのページ・すべてのホスト**で発火している。その結果:

### 問題A: デモ環境が本番データに混入（実測・8/3〜8/9）
- `yah-homes--book-demo-*.web.app` が本番GA4に送信
- テスト決済 `purchase` **5件・イベント値 ¥196,400**
- `Page Not Found` **36表示・24ユーザー**（8/6にゼロから突発＝デモ作業開始と一致）
- **GA4が自動で `purchase` をキーイベント化するため、`Purchasers` オーディエンスまで生成されている**

### 問題B: 管理画面が本番データに混入（実測・8/8〜8/14）
表示回数の第2位が管理画面。以下すべて発注者自身の作業:
```
管理メニュー 57 / My Page 43 / メッセージ 19 / 定型メール管理 15
管理画面 15 / メールテンプレート 9 / 直販予約管理 9 / 管理者台帳 7 …
```
これが「日本が最多国（785イベント）」の正体。エンゲージメント率・直帰率・国別構成をすべて歪めている。

### 問題C: Metaピクセルが未設置
- 実測: サイトに `fbq` 参照 **0箇所**
- 6月にInstagram広告へ **¥101,300** を投下したが、ピクセルが無いため:
  - 目標が「プロフィールへのアクセス」（¥14.9/件・6,816件）にしかできなかった
  - サイト訪問者を**リターゲティングできない**
- 現在も月1,000人以上がサイトに来ているが、**全員取り逃がしている**

**なぜ今やるか**: 直販サイトのCV切替（`purchase` を Google Ads の主要コンバージョンにする）の**前提条件**。汚染したままインポートすると、入札アルゴリズムが「発注者の管理作業」と「テスト決済」を優良コンバージョンとして学習する。

---

## 2. 変更内容

`BaseLayout.astro` の計測ブロックを、**2つのガードの内側**に入れ、Metaピクセルを追加する。

### 2-1. 本番ホスト以外では計測しない（問題A）

ビルド成果物は本番とプレビューチャネルで同一のため、**ビルド時には区別できない**。よって**実行時にホスト名で判定**する。

```
許可するホスト: yah.homes / www.yah.homes
それ以外（*.web.app・localhost 等）では gtag / fbq を一切初期化しない
```

### 2-2. 管理・マイページでは計測しない（問題B）

`BaseLayout.astro` は `Astro.url.pathname` を参照できる。以下に前方一致するパスでは計測ブロックを**出力しない**（HTMLに存在させない）。

```
/admin        … 管理画面20ページ（SiteLayout の adminNav 経由）
/account      … My Page（src/pages/[...locale]/account.astro・全言語）
```

**注意**: 言語プレフィックスが付く（`/ja/account/` 等）ため、判定は「パスに `/admin` または `/account` を含む」で行う。

### 2-3. Metaピクセルを追加（問題C）

GA4と同じガードの内側に設置する。イベントは最小構成で開始:

| Metaイベント | 発火タイミング | 備考 |
|---|---|---|
| `PageView` | 全ページ（ガード内） | 標準 |
| `ViewContent` | 物件ページ・予約ページ | リターゲティングの母集団 |
| `Lead` | 既存の `click_airbnb` / `click_booking_com` と同時 | 手渡し＝見込み客 |
| `InitiateCheckout` | 予約フロー開始時 | 直販サイト公開後 |

`Purchase` は**当面クライアントから送らない**。理由はGA4と同じで、離脱・広告ブロック・重複でCVが歪むため。サーバー側（Conversions API）で送るのが正しく、これは**別フェーズ**とする（§6参照）。

---

## 3. 実装イメージ（BaseLayout.astro）

現行 L124-136 付近の計測ブロックを、以下の構造に置き換える。

```astro
---
// 計測を出力しないパス（管理画面・マイページ）
const p = Astro.url.pathname;
const isPrivatePage = p.includes("/admin") || p.includes("/account");
const META_PIXEL_ID = "＜要発行＞";
---
{!isPrivatePage && (
  <>
    <link rel="preconnect" href="https://www.googletagmanager.com" crossorigin />
    <script is:inline async fetchpriority="low" src="https://www.googletagmanager.com/gtag/js?id=G-VJ5DDRML79"></script>
    <script is:inline define:vars={{ pixelId: META_PIXEL_ID }}>
      // 本番ホスト以外（プレビューチャネル *.web.app・localhost）では計測しない。
      // ビルド成果物が同一のため、実行時のホスト名で判定する。
      var TRACK = location.hostname === "yah.homes" || location.hostname === "www.yah.homes";

      window.dataLayer = window.dataLayer || [];
      function gtag() { dataLayer.push(arguments); }
      if (TRACK) {
        gtag("js", new Date());
        gtag("config", "G-VJ5DDRML79");
      }
      // …（既存の utm/gclid 保持処理はそのまま。TRACK に関係なく動かしてよい）…

      // Meta Pixel（GA4と同じガードの内側）
      if (TRACK && pixelId) {
        !function(f,b,e,v,n,t,s){/* 標準スニペット */}(window,document,"script",
          "https://connect.facebook.net/en_US/fbevents.js");
        fbq("init", pixelId);
        fbq("track", "PageView");
      }
    </script>
  </>
)}
```

**既存のイベント送信箇所**（L165〜の `click_airbnb` 等）にも `if (TRACK)` を効かせる。`gtag` が未設定でもエラーにはならないが、`fbq` は未定義だと落ちるため、**`window.fbq && fbq(...)` の形で呼ぶ**こと。

```js
gtag("event", "click_airbnb", {...});
window.fbq && fbq("track", "Lead", { content_name: property });
```

---

## 4. 事前に必要なもの（発注者側）

1. **Metaピクセルの発行** — Meta Business Suite → イベントマネージャ → データソース → ウェブ → ピクセル作成。発行された**ピクセルID（15〜16桁の数字）**を共有
2. **プライバシーポリシーの追記** — 現行 `/legal/privacy/` にGoogle Analyticsの記載はあるが、Metaピクセルの記載が無い。「広告配信の最適化のためMeta Platforms社のピクセルを使用する」旨と、オプトアウト方法を追記する（法務上の必要事項）

---

## 5. 検証手順（実装後・デプロイ前後）

| # | 確認 | 期待 |
|---|---|---|
| 1 | 本番 `https://yah.homes/zh/` のHTML | `fbevents.js` と `G-VJ5DDRML79` が**存在する** |
| 2 | 本番 `https://yah.homes/ja/account/` のHTML | 計測タグが**存在しない** |
| 3 | 本番 `https://yah.homes/admin/menu/` のHTML | 計測タグが**存在しない** |
| 4 | プレビュー `*.web.app` をブラウザで開く | コンソールで `dataLayer` に config が入らない・`fbq` 未定義 |
| 5 | Meta イベントマネージャ | `PageView` がリアルタイムに届く |
| 6 | GA4 リアルタイム | 従来どおり `page_view` が届く（**壊していないこと**の確認） |
| 7 | 3日後のGA4 | 管理画面のページタイトルが**消えている**・`purchase` がテストで増えない |

**特に⑥が重要**: GA4の既存計測を壊すと、広告の最適化と週次レポートが同時に止まる。

---

## 6. この仕様で「やらないこと」

- **Meta Conversions API（サーバー側 `Purchase` 送信）** — GA4の `sendPurchaseEvent()` と同型で実装できるが、直販サイトの本番決済が動いてから。別仕様とする
- **同意管理バナー（CMP）** — 現在の主要市場（台湾・香港・韓国・タイ・日本）では必須ではない。EU圏への配信を始める場合は別途必要
- **既存のGA4イベント設計の変更** — 今回は「どこで発火するか」を絞るだけで、イベント名・パラメータは一切変えない

---

## 7. リスクと巻き戻し

| リスク | 対策 |
|---|---|
| ホスト名判定のミスでGA4が本番でも止まる | §5の⑥で必ず確認。止まっていたら即ロールバック |
| `fbq` 未定義でJSエラー→ 手渡しイベントが送られなくなる | 必ず `window.fbq && fbq(...)` の形で呼ぶ |
| 管理画面の判定が広すぎて公開ページも除外される | `/admin` `/account` の前方一致のみ。記事URL（`/guides/`）に影響しないことを確認 |

**巻き戻し**: 1コミットで完結する変更のため、`git revert` → 再ビルド → デプロイで即座に戻せる。

---

## 8. 期待される効果

1. **直販CV切替のブロッカーが外れる** — 汚染のないデータでAdsにコンバージョンをインポートできる
2. **GA4の数字が実態を表すようになる** — 現在「日本が最多国」だが、実際の日本からの見込み客は10人程度
3. **リターゲティングの母集団が溜まり始める** — 月1,000人以上。広告を出さなくても資産になる
4. **6月のInstagram広告の資産（IG接触者6,816人）と組み合わせられる** — Meta のカスタムオーディエンスは接触から365日有効なので、2027年6月まで利用可能

**試算（Metaリターゲティング）**: CPC ¥130・手渡し率50%とすると手渡し1人 ¥260（Google広告は¥458）。予約1件あたり約¥3,700で、OTA手数料 ¥20,000 を大きく下回る。
