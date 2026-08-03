# 仕様書: click_airbnb の CTA位置ラベル欠落修正（(not set) 解消）

- 日付: 2026-08-03 ／ status: **承認済み・着工**（2026-08-03 発注者「同梱して着工してください」）
- 目的: GA4 click_airbnb の cta_location が「(not set)/空欄」のクリック（直近実測で全体の約22%）を計測可能にする。CTA効果判定（位置別・手渡し率）の前提整備。
- 方式: BaseLayout のクリック委譲トラッキングは data-cta-location 属性を読むだけなので、未タグのアンカーに属性を追加するのみ。

## 変更箇所

1. **PropertiesSection.astro**（トップ物件カード）
   - L130 rating-badge → `data-cta-location="property_card_rating"`
   - L137 Airbnbボタン → `data-cta-location="property_card"`
   - L140 Booking.comボタン → `data-cta-location="property_card"`（同梱分）
2. **BookingConversion.astro**（/booking/ 一覧）
   - L61/L65 .bk-btn → `data-cta-location="booking_page"`（物件はpropertyパラメータで分離済み）
3. **PropertyDetail.astro**（施設ページ）
   - L118 .pd-review → `data-cta-location="property_detail"`
4. **BaseLayout.astro**（同梱分・1行）
   - click_booking_com イベントに `cta_location: ctaLocation` を追加

## ラベル一覧（追加後）

hero / footer_cta / after_summary / after_compare / after_review / article_footer（既存）＋ property_card / property_card_rating / booking_page / property_detail（本仕様）

## 変更しないもの

トラッキングJSの判定ロジック・InlineBookingCta の型union・イベント名・GA4側設定（cta_locationカスタムディメンション登録済み）

## 検証

build成功 → 各ボタンDOMに属性付与を確認 → デプロイ翌日以降 GA4 で (not set) 比率が数%以下に低下

## デプロイ

承認後: astro build → firebase deploy --only hosting → git push（鉄則0-2）
