# 直接予約基盤 P1 設計書 v3 — 「店構えは自社・エンジンはBeds24」

> 作成: 2026-08-08（v2に厳格レビューの採用項目を反映。経緯はv1・v2参照）
> 対象: yah.homes-v2（Astro + Firebase Hosting/Functions/Firestore/Auth）
> ステータス: **アーキテクチャ確定・詳細設計中**（MS3着工条件=§8の状態機械のテスト実証・§13の決定事項クローズ）

## 1. 原則

1. **在庫・料金・OTA同期の唯一の真実 = Beds24**。予約UI・決済・顧客データ・計測 = 自社。
2. **運営会社の通常業務は変えない**。直販予約はBeds24上で他OTAと同じ見え方。ゲスト連絡はBeds24統合インボックスに一本化。**直販固有の例外業務は1枚のRunbook**（役割・判断上限・一次回答SLA・エスカレーション先）で処理できる状態にする（「変更ゼロ」は例外業務には適用しない）。
3. **価格は3面同一の単一ソース**（Beds24）。直販は既存の**-2%設定を引き継ぐ**。/api/quote は直販チャネル料金を読む。
4. **Beds24とStripeの間に原子的コミットは存在しない**。予約・決済・取消はすべて**状態機械＋補償処理**として実装する（§8）。
5. 段階導入。各段は次の土台・捨てる作業なし。

## 2. 事業KPI

- 直販比率: 現状≈0% → 12ヶ月35% → 18ヶ月50%。直販1予約 ≈ ¥15,000 の手数料回収（※限界利益ベースの再計算を§13-9で実施）。
- 積み上げ: ①広告着地を自社予約へ ②リピーター直販クーポン ③指名検索 ④室内QR。
- 週次で見る運転指標: 直販GBV／ファネル転換率（閲覧→日付→棟→認証→決済→確定）／quote成功率・Beds24作成成功率・整合差異件数／リピーター比率・マーケ同意率。
- OTAは敵にしない: OTA=新規獲得の広告費15%。新規はOTA・2回目から直販。

## 3. ページ構成（2ページ）

```
/properties/{slug}/   売るページ（棟ごと・写真/設備/レビュー/ミニウィジェット）
        │ CTA（棟・日付・人数をURLパラメータ引き継ぎ）
        ▼
/book/                選択: 日付×人数（カレンダー）→ 棟カード×2（空き・総額即表示）→「この棟で進む」
        ▼
/book/checkout        確定: 予約サマリ＋トラストストリップ → Google認証 → 電話番号 → 最終確認画面 → Stripe決済（埋込）→ 完了
```

- 予約状態は常にURLパラメータ保持（WebView外部ブラウザ誘導・戻る・リロードで状態復元）。
- **最終確認画面（法定・新設）**: 決済実行前に 事業者・総額・支払時期・提供時期（宿泊日）・キャンセル規約 を一覧表示（通販の最終確認画面要件）。
- 確定ページに「棟を変更」リンク。棟が増えても /book/ は無変更。
- ミニウィジェット: PC=右カラムsticky・SP=下部固定バー・カレンダーJSは接触後遅延ロード。

## 4. /book/ UX仕様

- **カレンダー空き先読み**: 満室日を選択前からグレーアウト（表示月＋翌月先読み・5分キャッシュ）。キャッシュは**表示専用**であり購入可能性の保証ではない（確定直前の再検証は§8）。
- **総額先出し**: 「2泊6名 合計¥98,000（清掃料込み）」・内訳は畳み・手数料後出し禁止。
- **通貨並記**: ≈NT$/HK$/₩/฿/US$（言語別・日次固定レート・概算明示・請求はJPY）。
- **キャンセルポリシー1行**: 実日付で「◯月◯日◯時まで無料キャンセル」。**判定は物件タイムゾーン（JST）・サーバー時刻**で行い、予約時に `freeCancelUntilAt`（日時）と `policyVersion` を確定保存。画面・メール・Beds24の表示を一致させる。
- **トラストストリップ**（決済直前）: ★評価・無料キャンセル期限・運営者名。
- **sticky総額（SP）**: 棟選択後〜決済完了まで下部固定。
- **満室・価格変動時**: 「価格または空室状況が変わりました」と明示し、availability既読データから直近の空き日程を代替提案。
- 偽の緊急性・クロスセル物量・パスワード式登録は置かない。

### 4.5 checkout のCS・マーケ仕様

1. **ハウスルール同意**: 決済直前にチェック1つ。同意日時・UID・文言バージョンを保存（紛争時の反証材料）。
2. **マーケ同意opt-in**: 「□ お得な情報・クーポンを受け取る」。`consents` に目的・チャネル・文言版・取得日時・取得画面・撤回日時を保存。全販促メールに解除導線・解除者はsuppression listで配信抑止。保存期間は特定電子メール法の要件に従う（詳細はG0で専門家確認）。
3. **電話番号=国番号ピッカー＋形式検証**（言語から初期値推定）。
4. **宿泊代表者欄**（任意1フィールド）。
5. **FAQ3問**（駐車場／チェックイン時刻／人数と追加料金・畳み表示）。
6. **予約言語の保存**（自動メール・CS・インボックス対応言語の判定）。
7. **完了画面=タイムライン**: ✅予約確定（予約番号YH-XXXX）→📧3日前に入室案内→🔑当日15:00〜 ＋ .icsカレンダー登録。完了画面は**状態照会の表示**であり確定根拠にしない（確定はサーバー側・§8）。
8. **到着予定時刻**: 3日前メールのリンク→/accountで選択→運営会社へ通知（予約時には聞かない）。

## 5. 認証・会員化（必須・Google一本）

- 「Googleで続ける」1タップのみ。パスワード・メールリンクは採用しない。位置づけ=信頼シグナル・決済直前配置・認証後は氏名/メール自動充填。
- 全予約がUID付きでFirestoreに紐づく（D1クーポン・リピーター判定・/accountの土台）。
- **WebView対策**: UA判定でバナー「Safari/Chromeで開く」誘導＋Googleボタン非活性（理由明示）。URLパラメータで開き直し復元。
- **受け入れ基準に昇格（v3）**: WebView（Instagram/LINE/Naver）・iOS/Android・主要言語別の**実機認証テストをMS3のデモ段階で実施**。離脱監視は稼働後（目安3割超で「ゲスト続行」追加を再検討）。
- Kakao/Naverログインは将来OIDCで追加・P1見送り。

## 6. 予約管理 /account（P1必須）

- Googleログイン → 予約一覧・詳細（棟・日付・総額・freeCancelUntilAt・policyVersion）。
- **キャンセルセルフサービス**: 期限内=ボタン1つ → §8のキャンセルSagaを起動（同期処理にしない）。期限後は「メールで相談」。
- 日程変更は変更依頼フォーム（当面人力）。到着予定時刻の選択→運営会社通知。

## 7. マイルストーン（v3改訂）

| MS | 内容 | Done / 次へ進む条件 |
|---|---|---|
| **MS0 責任・規約確定** | §13の決定事項（契約当事者・MoR・規約・名簿要件・RACI）を文書化 | 発注者・運営会社・（法務確認要のもの）専門家の承認 |
| **MS1 連携スパイク＋ミラー** | Webhook→Firestoreミラー稼働。**実機検証: propid/room/offer構成・直販-2%の適用位置・POST /bookingsの外部参照/重複挙動・取消APIの挙動・Webhookペイロード** | 全チャネル予約がFirestoreに入る＋API不明点がテスト結果で閉じる |
| **MS2 表示** | /book/ UI＋availability/quote API＋ミニウィジェット | 日付×人数→棟と総額が即表示 |
| **MS3 決済（整合性基盤込み）** | 状態機械・operationログ・webhook_eventsキュー・bookCreate/stripeWebhook・自動メール（一次送信者=Beds24）・最終確認画面 | **§8のP0障害シナリオ（capture失敗・関数停止・timeout・Webhook重複）を自動/手動テストで通過** |
| **MS3.5 予約管理** | /account＋キャンセルSaga | 返金→取消→通知が収束・例外は有人キューへ |
| **MS3.9 限定本番** | 1棟・限定トラフィック（feature flag）で実決済・監視・ロールバック演習 | 連続運用で整合差異ゼロ・運営会社承認 |
| **MS4 全面切替** | iframe撤去済→広告着地差し替え・noindex解除・毎日突合 | 2週間ハイパーケアで異常なし |

- ブランチ: `feature/book-p1`。デモ=preview channel（`BOOK_PREVIEW=1`ゲート）。MS3本番URLテスト=Basic認証+noindex。**Stripeはtest/live分離・検証用Webhook/メール宛先を用意**。
- ロールバック演習は表示だけでなく処理中予約・PaymentIntent・広告URL・計測を含む手順で行う。

## 8. Firebase / Cloud Functions 技術仕様（v3改訂）

すべて yah-homes / asia-northeast1。実行SA=yah-homes@appspot 明示。

| 関数 | trigger | 認証 | 概要 |
|---|---|---|---|
| bookingApi | GET | App Check＋CORS | availability/quote・5分キャッシュ・直販-2%・429バックオフ。**quoteは quoteId・料金明細・rate/offer識別子・取得時刻・失効時刻を返す** |
| beds24Webhook | POST | URLトークン＋即時ACK | イベントを `webhook_events` に保存→**非同期処理**（受信スレッドで正データGETしない） |
| bookCreate | POST | verifyIdToken＋App Check | 予約開始: 検証→pending作成→PaymentIntent作成まで（**履行はWebhook起点・§8-2**） |
| stripeWebhook | POST | Stripe署名（raw body） | `payment_intent.*` を冪等処理（eventId永続重複排除）→履行ワーカー起動 |
| bookingWorker | タスク/内部 | 内部のみ | Beds24書込・capture・メール・状態遷移の実行体（operation ID付き・再試行・補償） |
| accountApi | GET/POST | verifyIdToken（本人UID） | 一覧／キャンセルSaga起動 |
| adminApi | GET/POST | verifyIdToken＋**Custom Claims（role）** | /admin/bookings 用。§8-5の権限モデル |

### 8-1. 予約の状態機械（v3の核心）

```
QUOTE_ISSUED → PAYMENT_PENDING → AUTHORIZED → RESERVATION_PENDING → CONFIRMED
                     ↓失敗            ↓作成失敗         ↓capture失敗
               PAYMENT_FAILED      VOIDED(オーソリ解放)  CAPTURE_RETRY → MANUAL_REVIEW
CONFIRMED → CANCEL_REQUESTED → REFUND_PENDING → CANCELLED
                                      ↓失敗
                                 MANUAL_REVIEW（有人キュー・SLA付き）
```

- 各状態遷移は永続化した **operation ID** を持ち、外部API呼び出し（Beds24/Stripe）は同IDをIdempotency-Keyとして渡す。
- **フロー**: ①bookCreate=検証・pending・PI作成 ②クライアントが3DS含む決済確認 ③`amount_capturable_updated` Webhook→bookingWorkerが**確定直前の再見積り・再在庫確認**→Beds24 POST（外部参照=operation ID）→成功でcapture→CONFIRMED→メール ④各段の失敗は表の補償（オーソリ解放/Beds24取消/再試行上限→MANUAL_REVIEW＋【予約エラー】メール）。
- **Beds24タイムアウト（作成済みか不明）**: 再POST禁止。外部参照で照会→見つかれば続行・見つからなければ解放。照合手段はMS1実機検証で確定（§13-3）。
- **キャンセルSaga**: CANCEL_REQUESTED→refund実行→Beds24取消→カレンダー解放→通知、の各段を追跡。片方失敗は再試行（間隔・上限定義）→超過でMANUAL_REVIEW（当番通知・顧客へ「処理中」定型連絡・解決SLA）。
- 完了画面・/accountは**状態の照会表示**。確定の根拠はサーバー状態のみ。

### 8-2. Webhook堅牢化

- `webhook_events/{provider_eventId}`: payloadHash・receivedAt・processedAt・result を保存。**同一イベントは一度だけ処理**（順不同・再送吸収）。
- 失敗イベントはDLQ（Firestoreフラグ）＋再実行手段。日次突合（beds24DailyObserver相乗り）に**差異件数と解消SLA**を追加。

### 8-3. Beds24 認証（v3修正）

- long lifeトークン=read専用（既存・定点と共用）。**書き込みは refresh token 方式**（Secret Manager保管→24時間tokenを取得・メモリキャッシュ・失効時再取得）。既存bookingApiの実装パターンを流用。恒久write secretは置かない。

### 8-4. Firestore（クライアント直書き全面禁止）

| collection | 読み取り | 内容 |
|---|---|---|
| bookings | 本人UIDのみ | 直販予約（uid・棟・日付・金額・状態・operation/stripe/beds24 ID・policyVersion・freeCancelUntilAt） |
| bookings_mirror | 禁止 | 全チャネルミラー（正規化＋raw保全） |
| guests | 禁止 | 顧客台帳。**主キー=ランダムguestId**（emailは属性・小文字正規化で検索） |
| consents | 禁止 | マーケ同意・ハウスルール同意の証跡（文言版・日時・撤回） |
| registry | 禁止 | 宿泊者名簿（§9）。**旅券画像はguestsと分離**（Storage・厳格ルール・期限削除） |
| webhook_events / operations | 禁止 | §8-1/8-2の台帳 |
| audit_logs | 禁止 | 管理操作の改ざん防止ログ（誰が・何を・いつ） |

### 8-5. 管理画面の権限モデル（/admin/bookings）

- Firebase **Custom Claims** で役割定義: `owner`（返金・全操作）／`operator`（閲覧・対応メモ・名簿閲覧）。付与・剥奪はオーナーのみ。
- **返金上限**: ¥10,000超の返金は確認ダイアログ＋audit_logs必須記録（二者承認はP2）。
- すべての金銭操作・名簿閲覧を audit_logs に記録。ログにPII・トークンを出さない（マスキング）。

### 8-6. その他

- **App Check**（reCAPTCHA Enterprise）: bookingApi・bookCreate 必須。＋IP/UID単位の簡易レート制限・Beds24 API利用量アラート。
- Secrets: BEDS24_TOKEN（read）・BEDS24_REFRESH_TOKEN_WRITE・STRIPE_SECRET_KEY・STRIPE_WEBHOOK_SECRET・WEBHOOK_KEY・SMTP_*。関数単位で限定付与。
- 障害時は必ず【予約エラー】メール（沈黙禁止）。

## 9. 運営会社まわり

- ゲスト連絡=Beds24統合インボックス一本。**トランザクションメールの一次送信者=Beds24 Auto Actions**（4通×5言語・起案は当方）。**自社からゲストへのメールは原則送らない**（bookCreate等は内部通知のみ。二重配信・文言不整合の防止）。例外を作る場合はテンプレ責任者・言語fallback・再送・不達監視を定義。
- 通知集約: contact@mail.yah.homes（Stripe紛争・名簿・システム通知）。**確認者と確認SLA（24時間以内）・障害メールと顧客メールの振り分けをRunbookに明記**。
- /admin/bookings: §8-5の権限モデル。紛争分担=事実確認は運営会社・Stripe対応はオーナー。エスカレーション権限表は運用開始時に合意。
- **宿泊者名簿（v3詳細化）**: 法的義務者=運営会社（許可名義）。①全宿泊者分の氏名・住所・職業（代表者だけでは不足）②国内住所を持たない外国人は国籍・旅券番号＋**旅券写し**③3年保存・期限後削除④未回収時の現場SOP（チェックイン時に運営会社が回収）⑤旅券画像は分離保管（§8-4 registry）。物件の営業形態・所管自治体の確定は§13-2。
- 例外業務Runbook（1枚）: カード拒否・処理中預かり・名簿未回収・取消例外・チャージバック・到着未回答の6ケース×担当・SLA。

## 10. 計測（v3修正）

- `view_item`（/properties/）→ `begin_checkout`（**棟選択後**）→ `login`（認証成功）→ `add_payment_info`（**決済情報送信時**）→ `purchase`。
- **`purchase` はサーバー確定（CONFIRMED）後に Measurement Protocol で送信**（transaction_id=内部予約番号・重複排除）。クライアント側では送らない（離脱・広告ブロック・重複対策）。
- Google Ads: purchase をプライマリCVへ・click_airbnb はセカンダリへ。gclid/UTMを予約レコードに保存し広告→予約をFirestoreで突合。

## 11. 受け入れ基準（v3拡充）

**UX**: LCPモバイル2.5s未満（JS段階ロード）／パラメータ引き継ぎ・状態復元／カレンダー先読みグレーアウト／最終確認画面の法定表示。
**整合性**: Beds24成功後capture失敗・capture成功後関数停止・Beds24タイムアウト・Webhook重複/順不同・二重送信——**各シナリオで定義状態に収束し、二重請求・未収確定・無通知が発生しない**／同一棟同一日程の直販競合＋OTA更新で1件のみ確定・敗者はオーソリ解放。
**取消**: 期限境界の直前直後・返金失敗・取消失敗・二重クリックで金額/在庫/通知/監査ログが一致・例外はSLA内に有人キューへ。
**セキュリティ**: 他人予約IDの参照拒否・権限外の返金拒否・Webhook偽装拒否・ログにsecret/PIIなし。
**認証**: WebView（IG/LINE/Naver）×iOS/Android×主要言語の実機テスト通過。
**運用**: 全チャネルが bookings_mirror に記録／日次突合の差異ゼロ／Runbookのみで当番が復旧できる／iframe版へのロールバック手順を演習済み。
**計測**: purchase重複なし・GA4/Ads/Firestoreの件数差異を説明できる。

## 12. 運用・監視

- 毎朝の定点観測（稼働中）に直販件数・整合差異件数を追加（beds24DailyObserver拡張）。
- MANUAL_REVIEW キュー: 発生時に即メール・24時間以内の解決SLA・/admin/bookings で処理。

## 13. 要決定事項（MS0でクローズ・担当と決定ログ付き）

| # | 決定事項 | 担当 |
|---|---|---|
| 1 | 宿泊契約の当事者・StripeのMerchant of Record・領収書発行者・紛争最終責任者。**方針決定（2026-08-08・A案）: 当社Stripe維持＋代理受領構造** — 当社=予約受付・代金の代理受領者／Airstar=宿泊役務の提供者。運営委託契約に代理受領条項を1条追加（OTAと同構造）・月次精算はOTA帳票に直販行を追加・特商法ページに「販売事業者=ボンファイア／役務提供=運営会社」を明記。面談でAirstar合意→専門家確認で確定。（5棟化・直販50%時はStripe Connectへの移行を再検討） | 経営・法務確認 |
| 2 | 物件の営業形態（旅館業/民泊区分）・所管自治体・宿泊税・名簿必要項目と回収責任者 | 運営・法務確認 |
| 3 | Beds24のrate/offer選択・-2%の適用位置・書込の外部参照/重複検知・取消APIの挙動 | Tech（MS1実機） |
| 4 | 各障害パターンの収束先（§8-1の表の最終承認） | Tech |
| 5 | 通知メールの一次送信者=Beds24の最終確認・各メールの言語/再送/不達の責任 | 運営・CRM |
| 6 | 管理画面の役割・返金上限額・承認要否 | 経営・運営 |
| 7 | 障害通知の確認者・確認SLA・夜間休日の対応範囲 | 運営・Tech |
| 8 | 特商法・規約・キャンセル規約・プライバシー通知の整合（専門家レビュー） | 法務確認 |
| 9 | KPIの分母・期間・ベースライン・¥15,000/予約の限界利益再計算 | 経営 |
