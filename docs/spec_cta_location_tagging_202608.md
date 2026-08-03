# 仕様書: click_airbnb の CTA位置ラベル欠落修正（(not set) 解消）

**日付**: 2026-08-03
**status**: ドラフト（承認待ち・実装未着手）
**目的**: GA4 click_airbnb の cta_location が「(not set)/空欄」になっているクリック（直近実測で全体の約22%）を計測可能にする。CTA効果判定（位置別・手渡し率）の前提整備。
**方式**: 既存の BaseLayout クリック委譲トラッキングは `data-cta-location` 属性を読むだけなので、**未タグのアンカーに属性を追加するのみ**。JS・型・イベント設計の変更なし。

---

## 変更箇所（3ファイル・属性追加のみ）

### 1. `src/components/home/PropertiesSection.astro` — トップページの物件カード（最有力の未計測源）

- **L130** レーティングバッジのリンク:
  ```html
  <a href={p.airbnb} ... class="rating-badge" data-cta-location="property_card_rating">
  ```
- **L137** 「Airbnbで予約」ボタン:
  ```html
  <a href={p.airbnb} ... class="btn-booking" data-cta-location="property_card">
  ```

### 2. `src/components/BookingConversion.astro` — /booking/ 一覧ページの予約ボタン

- **L61**（清川）・**L65**（高砂）の `.bk-btn`:
  ```html
  <a href={AIRBNB_LINKS.kiyokawa} ... class="bk-btn" data-cta-location="booking_page">
  ```
  ※高砂側も同じ `booking_page`（物件は property パラメータで既に分離済みのため）

### 3. `src/components/PropertyDetail.astro` — 施設ページ（/booking/kiyokawa 等）のレビューバッジ/VIEW ON AIRBNB

- **L118** `.pd-review` リンク:
  ```html
  <a href={p.airbnbUrl} ... class="pd-review" data-cta-location="property_detail">
  ```

## ラベル一覧（追加後の全体像）

| cta_location | 場所 | 備考 |
|---|---|---|
| hero | トップHero | 既存 |
| footer_cta | トップ下部CTA | 既存 |
| after_summary / after_compare / after_review / article_footer | 記事内 | 既存 |
| **property_card / property_card_rating** | トップ物件カード | 本仕様で追加 |
| **booking_page** | /booking/ 一覧 | 本仕様で追加 |
| **property_detail** | 施設ページ | 本仕様で追加 |

## 変更しないもの

- BaseLayout.astro のトラッキングJS（属性を読む実装は既存のまま）
- InlineBookingCta.astro の ctaLocation 型 union（コンポーネント経由でない生アンカーへの属性追加のため型変更不要）
- イベント名・パラメータ設計・GA4側の設定（カスタムディメンション cta_location は登録済み）

## 検証手順

1. `pnpm build`（または `astro build`）成功
2. ローカルまたは本番で各ボタンの DOM に `data-cta-location` が付与されていることを確認（トップ物件カード×2種・/booking/×2・/booking/kiyokawa×1）
3. デプロイ翌日以降、GA4 の click_airbnb × cta_location で `(not set)` 比率が数%以下に低下していること

## デプロイ

- 承認後: `astro build` → `firebase deploy --only hosting --project yah-homes` → `git push`（鉄則0-2）
- 同梱推奨（別途承認済みなら）: 施設ページの事実修正（洗濯機 2026年4月統一・チェックイン時刻表記統一・SUPERHOST表記の確認）
