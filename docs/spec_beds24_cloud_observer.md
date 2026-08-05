# 仕様書: Beds24クラウド定点観測（Cloud Functions日次実行）

> v0.2（2026-08-05）／status: **承認待ち**（v0.1レビュー反映: シートID修正・sugimoto除外は入れない=現行beds24-daily.mjsと同一ロジック・Sheets API有効化を移行手順に追加・BEDS24_TOKEN は bookingApi 用 BEDS24_REFRESH_TOKEN_* とは別物）
> 目的: 現在Mac上で動いている日次観測（beds24-daily.mjs）をFirebase Cloud Functionsへ移設し、**PCの起動状態と無関係に毎朝8:00 JSTに実行**→シート自動記入→結果メール通知まで完結させる。
> 関連: scripts/beds24-daily.mjs（ロジックの原型・移植元）／databook_beds24_202608.md（KPI定義）

## 1. 構成

```
Cloud Scheduler（毎日 08:00 JST）
   ▼
Cloud Function: beds24DailyObserver（yah-homesプロジェクト・asia-northeast1・Node.js）
   ├ ① Beds24 API v2 GET /bookings（過去90日〜18ヶ月先・キャンセル込み）
   ├ ② Firestore beds24_state/{latest} と差分照合（予約ID単位: 新規/キャンセル/変更）
   ├ ③ 定点観測シートへ記入（当日行の B/C/E/F=組数泊数・I/K=先付け残高）
   ├ ④ サマリメール送信（新規・キャンセルの明細＋先付け残高＋特記）
   └ ⑤ 状態スナップショットをFirestoreへ保存
```

## 2. 各ステップ仕様

### ① Beds24取得
- エンドポイント: `GET https://beds24.com/api/v2/bookings?arrivalFrom=<today-90d>&arrivalTo=<today+550d>&includeCancelled=true&pageSize=200`（ページネーション追従）
- 認証: read専用 long life token（bookings/bookings-personal/inventory/properties のREADのみ・発行済み）
- 除外: status=black・ゲスト名に「オーナー/yamada/工事/テスト」を含む予約

### ② 差分判定（beds24-daily.mjsと同一ロジック）
- 新規 = 前回スナップショットに無いID かつ status∈{new, confirmed}
- キャンセル = 前回activeだったIDが status=cancelled に変化
- 泊数変更（日程変更）= 同IDでarrival/departureが変化 → 「変更」として報告

### ③ シート記入
- 対象: 定点観測スプレッドシート（ID: 1DxniZSvdzb5s4Zjt_6MYgWkkFq7q7HlCxyIUZn6hMfk）
- 当日（JST）の`M/D`行を検索し B/C（清川 組/泊・ネット）・E/F（高砂）・I/K（先付け残高泊）を記入。J列（%式）には触れない
- 認可: **シートをFunctionsのデフォルトサービスアカウント（yah-homes@appspot.gserviceaccount.com）に編集者共有**——鍵ファイルの配布なしで認可が完結する

### ④ メール通知
- 既存のSMTP基盤を流用（SMTP_USER=contact@mail.yah.homes・問い合わせフォームで稼働実績あり）
- 宛先: kazuyoshi.yamada@bonfire.co.jp／件名: `【定点】M/D 清川+X組Y泊・高砂+Z組W泊・先付けN泊(P%)`
- 本文: 新規予約明細（棟・チェックイン・泊数・名前・チャネル・国）・キャンセル明細・先付け残高（棟別+率）・特記（適正帯28〜33%逸脱・3泊以上の大型・キャンセル塊）
- **エラー時も必ずメール**（件名【定点エラー】＋エラー内容）——沈黙障害を作らない

### ⑤ 状態保存
- Firestore `beds24_state/latest`: { bookings: {id: {status, arrival, nights, prop}}, updatedAt }
- 履歴用に `beds24_state/daily/{YYYY-MM-DD}` へ日次スナップショットも保存（将来のブッキングカーブ分析の生データになる）

## 3. シークレット管理

| シークレット | 保管先 |
|---|---|
| Beds24トークン | Firebase Secret Manager `BEDS24_TOKEN`（コードに書かない） |
| SMTPパスワード | 既存のFunctions設定を流用 |
| Sheets認可 | 鍵なし（デフォルトSAへのシート共有方式） |

## 4. 非機能

- 費用: Cloud Scheduler 1ジョブ+日次1実行＝**無料枠内**（月数円以下）
- リージョン: asia-northeast1（既存seoserver等と同居）
- 失敗リトライ: Scheduler側で1回リトライ・それでも失敗ならエラーメール
- 冪等性: 同日2回実行されても、差分はID照合なので二重計上しない（シートは同日行を上書き）

## 5. 移行手順（承認後）

1. Google Sheets API を yah-homes プロジェクトで有効化（コンソール・課金なし）
Secret登録（BEDS24_TOKEN・※bookingApi用の既存 BEDS24_REFRESH_TOKEN_* とは別物）・シートへSA共有
2. functionsへ実装（beds24-daily.mjsを移植・メール追加）→ `pnpm check`
3. デプロイ（**別途デプロイ承認を得てから**）→ 手動トリガーで1回テスト実行→メール受信確認
4. 翌朝の自動実行を確認後、**Macのスケジュールタスク beds24-daily-teiten を削除**（二重記入防止）
5. ローカルの beds24-daily.mjs は手動検証用として残置

## 6. 受け入れ基準

- [ ] 毎朝8:00±5分にメールが届く（Mac電源オフでも）
- [ ] シートの当日行に組数/泊数/先付けが正しく入る（手動実行分と一致）
- [ ] キャンセル・日程変更が明細に出る
- [ ] エラー時にエラーメールが届く（トークン失効を手動で試験）

## 7. やらないこと（スコープ外）

- Beds24への書き込み（トークン自体がread専用）
- リアルタイム通知（Webhook）——必要になったら別仕様（本Functionに受け口を足す拡張は容易）
- 月次分析（国別・リードタイム）の自動生成——日次スナップショットが溜まった後の第2弾
