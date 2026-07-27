# 設計書: 週次定点観測レポート自動化 — v0.1（承認待ち）

- 作成: 2026-07-22
- 状態: **ドラフト（承認待ち・実装未着手）**
- 目的: 「GA4・Search Console・Ads を毎週開いてスクショ→共有」の手作業を、毎週月曜 JST 9:00 の自動メールレポートに置き換える。

## 1. 配信

- **トリガー**: Cloud Functions v2 `onSchedule("every monday 09:00", { timeZone: "Asia/Tokyo" })`
- **配信先**: kazuyoshi.yamada@bonfire.co.jp（既存 SMTP = contact@mail.yah.homes で送信）
- **形式**: プレーンテキストメール（先週分 vs 前週分の比較つき）。件名: `【yah.homes週報】M/D〜M/D 実ユーザー◯◯・TW CPA¥◯◯`

## 2. レポート項目（定点4点チェックに対応）

| # | 項目 | ソース | 内容 |
|---|---|---|---|
| 1 | 実ユーザー数 | GA4 Data API | user_engagement 発生ユーザー（bot除外レンズ）・国別上位5・前週比 |
| 2 | 韓国bot判定 | GA4 Data API | KR × Direct のセッション数と engagement率（率が極端に低ければ「bot継続」と自動判定） |
| 3 | CTA位置別 | GA4 Data API | `booking_cta_click` イベントの `cta_location` 別クリック数（hero / after_compare 等）・前週比 |
| 4 | 広告（台湾CPA・香港初速） | **Google Ads は API を使わない**（下記） | キャンペーン別 費用・クリック・CV・CPA |
| 5 | 検索流入 | Search Console API | クリック・表示回数・上位クエリ10（国別）・前週比 |

## 3. Google Ads の扱い（判断ポイント）

Google Ads API は開発者トークンの申請・審査（Basic access）が必要で、個人アカウントだと数週間かかることがある。**v1 では API を使わず、Google Ads 管理画面の「レポートのメール送信スケジュール」（標準機能・毎週月曜に CSV/PDF をメール）を併用する**。

- 自動メール2通（本レポート + Ads純正レポート）が月曜朝に並んで届く構成
- 将来 API トークンが取れたら1通に統合（v2）

→ **代替案**: どうしても1通にまとめたい場合は Ads API 申請から始める（+2〜4週間）。

## 4. 認証・権限（ユーザー側の作業が2点）

Functions のサービスアカウント `yah-homes@appspot.gserviceaccount.com` に閲覧権限を付与:

1. **GA4**: プロパティ（www.yah.homes を見ている方）の管理 → プロパティのアクセス管理 → 上記SAを「閲覧者」で追加
2. **Search Console**: yah.homes プロパティ → 設定 → ユーザーと権限 → 上記SAを「制限付き」で追加

（API キーや Secret の追加は不要。SA の標準認証で GA4 Data API / SC API を呼ぶ）

## 5. 実装

- `functions/src/index.ts` に `weeklyReport` を追加（onSchedule・secrets: SMTP_USER/SMTP_PASS）
- 依存追加: `@google-analytics/data`・`googleapis`（SC用）
- GA4 プロパティID・SC サイトURLは定数で保持
- 期間: 先週月曜〜日曜（JST）と、その前週の同曜日比較
- 失敗時: エラー内容を同じ宛先にメール（沈黙させない）

## 6. マイルストーン

- W1: GA4/SC 権限付与（ユーザー）→ 関数実装・手動実行テスト（`--only functions:weeklyReport` + テスト用HTTP無し・Cloud Scheduler の「今すぐ実行」で確認）
- W2: 初回自動配信（月曜9:00）を確認 → Ads純正レポートのスケジュール設定（ユーザー・5分）

## 7. やらないこと（v1）

- スクリーンショット生成・PDF化（テキストで足りる。見た目が欲しくなったらv2）
- Ads API 連携（§3）
- ダッシュボード化（Looker Studio は別途無料で作れるが、プッシュ型のメールが「見に行かなくていい」点で優先）
