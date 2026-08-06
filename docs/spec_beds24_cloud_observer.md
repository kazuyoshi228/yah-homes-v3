# 仕様書: Beds24クラウド定点観測（Cloud Functions日次実行）

> v0.3（2026-08-05）／status: **承認待ち**
> 変更履歴: v0.3=週次スコアカードメール（月曜8:00）・GA4 Data API連携・Google Adsスクリプト連携（adsタブ）を追加／v0.2=シートID修正・Sheets API有効化手順・トークン命名整理／v0.1=初版
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

## 6.5 週次スコアカードメール（v0.3追加・毎週月曜 8:00 JST）

日次と同じFunction基盤に第2のスケジュール（`beds24WeeklyReport`）を追加。

### 内容
1. **週間サマリ**: 新規予約 X組Y泊（棟別）・キャンセル・先付け残高の週間推移（前週比）
2. **国別スコアカード**: 国籍別新規予約（Beds24のcountry+名前分類）× click_airbnb国別（GA4）× 広告費（adsタブ）→ 市場別のCV単価・判定コメント（例: 台湾◎維持／SG様子見・8月末ゲート）
3. **手渡し→予約比率**: 週次 click_airbnb × 新規予約の比率（基準帯23〜28%からの乖離を警告）
4. 特記: 先付け率の適正帯（28〜33%）逸脱・3泊以上の大型・キャンセル塊

### データソース3系統
| ソース | 経路 | 事前準備 |
|---|---|---|
| Beds24 | 既存（日次と同じトークン） | なし |
| GA4（click_airbnb 国別/日別） | **GA4 Data API**・FunctionsのSAで認証 | GA4プロパティ(www.yah.homes)のアクセス管理にSAを**閲覧者**として追加（1回） |
| Google Ads（費用/クリック/CV） | **Google Adsスクリプト**が毎日、定点シート「ads」タブへ書き込み→Functionが読む | Adsスクリプト設置（コピペ・毎日実行スケジュール・初回承認1回）。Ads APIは審査が重いため**採用しない** |

### adsタブ仕様
- 列: 日付, キャンペーン名, 費用, クリック, CV(click_airbnb), CPA
- Adsスクリプトが毎日1回追記（前日分）。シート共有は既存のSA共有でカバー

## 7. やらないこと（スコープ外）

- Beds24への書き込み（トークン自体がread専用）
- リアルタイム通知（Webhook）——必要になったら別仕様（本Functionに受け口を足す拡張は容易）
- 月次分析（国別・リードタイム）の自動生成——日次スナップショットが溜まった後の第3弾
- Google Ads APIの直接接続（Adsスクリプトで代替・審査コスト回避）
