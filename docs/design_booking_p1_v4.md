# 直接予約基盤 P1 設計書 v4 — 「店構えは自社・エンジンはBeds24」

> 作成: 2026-08-08（正本。経緯・廃止案・レビュー記録は v1〜v3 参照）
> 対象: yah.homes-v2（Astro + Firebase Hosting/Functions/Firestore/Auth）
> ステータス: 設計確定。着工は発注者の号令で MS1 から（MS0は並行）

## 1. 原則

1. **在庫・料金・OTA同期の正 = Beds24**。予約UI・決済・顧客データ・計測 = 自社。
2. **運営会社の通常業務は変えない**。直販予約はBeds24上で他OTAと同じ見え方・ゲスト連絡はBeds24統合インボックス。直販固有の例外業務は1枚のRunbook（役割・判断上限・SLA・エスカレーション先）で処理する。
3. **価格は3面同一の単一ソース**（Beds24）。直販は既存の-2%チャネル設定を引き継ぐ。
4. **Beds24とStripeの間に原子的コミットはない**。予約・決済・取消は状態機械＋補償処理で実装する（§8）。
5. 段階導入。各段は次の土台・捨てる作業なし。

## 2. 事業KPI

- 直販比率 0% → 12ヶ月35% → 18ヶ月50%。直販1予約 ≈ ¥15,000 の手数料回収。
- 積み上げ: ①広告着地の自社化 ②リピーター直販クーポン ③指名検索 ④室内QR。
- 週次運転指標: 直販GBV／ファネル転換率／quote・Beds24作成成功率・整合差異件数／リピーター比率・同意率。
- OTAは敵にしない: OTA=新規獲得の広告費15%。新規はOTA・2回目から直販。

## 3. ページ構成（2ページ）

```
/properties/{slug}/   売るページ（写真/設備/レビュー/ミニウィジェット）
        │ 棟・日付・人数をURLパラメータ引き継ぎ
        ▼
/book/                選択: 日付×人数 → 棟カード×2（空き・総額即表示）→「この棟で進む」
        ▼
/book/checkout        確定: サマリ＋トラスト → Google認証 → 電話番号 → 最終確認画面 → Stripe決済（埋込）→ 完了
```

- 予約状態は常にURLパラメータ保持（非機微値のみ: 棟・日付・人数・言語）。リロード・外部ブラウザ開き直しで復元。
- 最終確認画面: 決済前に事業者・総額・支払時期・宿泊日・キャンセル規約を一覧表示（特商法の最終確認画面要件）。
- ミニウィジェット: PC=右カラムsticky・SP=下部固定バー。カレンダーJSは接触後遅延ロード。
- 棟が増えても /book/ は無変更・/properties/ を足すだけ。

## 4. /book/ UX

- **カレンダー空き先読み**: 満室日を選択前からグレーアウト（表示月＋翌月・5分キャッシュ）。キャッシュは表示専用・確定直前にサーバー側で再検証（§8）。
- **総額先出し**: 「2泊6名 合計¥98,000（清掃料込み）」・内訳は畳み・手数料後出し禁止。
- **通貨並記**: 総額直下に ≈NT$/HK$/₩/฿/US$（言語別・日次固定レート・概算明示・請求はJPY）。
- **キャンセルポリシー1行**: 実日付「◯月◯日◯時まで無料キャンセル」。判定はJST・サーバー時刻。予約時に `freeCancelUntilAt`・`policyVersion` を確定保存し、画面・メール・Beds24の表示を一致させる。
- **トラストストリップ**（決済直前）: ★評価・無料キャンセル期限・運営者名。
- **sticky総額（SP）**: 棟選択後〜決済完了まで下部固定。
- **満室・価格変動時**: 「価格または空室状況が変わりました」＋直近の空き日程を代替提案。
- 偽の緊急性・クロスセル・パスワード式登録は置かない。

### 4.5 checkout のCS・マーケ仕様

1. **ハウスルール同意**チェック1つ（パーティー不可・定員厳守・屋外カメラ）。同意日時・UID・文言版を保存（紛争時の反証）。
2. **マーケ同意opt-in**。`consents` に目的・文言版・日時・撤回を保存。全販促メールに解除導線・suppression list。保存期間は特定電子メール法要件（専門家確認）。
3. **電話番号=国番号ピッカー＋形式検証**（言語から初期値）。
4. **宿泊代表者欄**（任意1フィールド）。
5. **FAQ3問**（駐車場／チェックイン時刻／人数と追加料金）。
6. **予約言語の保存**。
7. **完了画面=タイムライン**: ✅予約確定（番号YH-XXXX）→📧3日前に入室案内→🔑当日15:00〜 ＋ .ics登録。完了画面は照会表示・確定根拠はサーバー状態のみ。
8. **到着予定時刻**: 3日前メールのリンク→/accountで選択→運営会社へ通知（予約時には聞かない）。

## 5. 認証（必須・Google一本）

- 「Googleで続ける」1タップのみ。パスワード・メールリンクなし。決済直前配置=信頼シグナル。認証後は氏名/メール自動充填。
- 全予約がUID付きでFirestoreに紐づく（クーポン・リピーター判定・/accountの土台）。
- **WebView対策**: UA判定でバナー「Safari/Chromeで開く」誘導＋Googleボタン非活性（理由明示）。URLパラメータで復元。
- WebView（IG/LINE/Naver）×iOS/Android×主要言語の実機認証テストをMS3デモ段階で実施。稼働後は認証離脱を監視（目安3割超で「ゲスト続行」追加を再検討）。
- Kakao/NaverログインはOIDCで将来追加。

## 6. 予約管理 /account（P1必須）

- Googleログイン → 予約一覧・詳細（棟・日付・総額・キャンセル期限）。
- **キャンセルセルフサービス**: 期限内=ボタン1つでキャンセルSaga起動（§8）。期限後は「メールで相談」。
- 日程変更は依頼フォーム（当面人力）。到着予定時刻の選択→運営会社通知。
- **入室案内の再表示**（メール不達時の救済）。

## 7. マイルストーンとGit運用

| MS | 内容 | Done / 進行条件 |
|---|---|---|
| MS0 責任・規約 | §13の決定事項を文書化（実装と並行） | 発注者・運営会社・専門家の承認 |
| MS1 スパイク＋ミラー | Webhook→Firestoreミラー。実機検証: propid/room/offer・-2%適用位置・POST /bookingsの外部参照/重複・取消API・Webhookペイロード | ミラー稼働＋API不明点がテストで閉じる |
| MS2 表示 | /book/ UI＋availability/quote API＋ミニウィジェット | 日付×人数→棟と総額が即表示 |
| MS3 決済 | 状態機械・operationsログ・webhook_eventsキュー・bookCreate/stripeWebhook・自動メール（一次送信者=Beds24）・最終確認画面 | §8の障害シナリオをテストで通過 |
| MS3.5 /account | 一覧＋キャンセルSaga | 返金→取消→通知が収束・例外は有人キューへ |
| MS3.9 限定本番 | 1棟・限定トラフィック・実決済・ロールバック演習 | 連続運用で整合差異ゼロ・運営会社承認 |
| MS4 全面切替 | 広告着地差し替え・noindex解除・毎日突合 | 2週間ハイパーケアで異常なし |

**Git**: `dev`=本番デプロイ元／`feature/book-p1`=P1作業（MSごとの承認でdevへマージ）。コミット粒度=1コミット1決定・docsは実装と分離。
**デモ**: `book-demo` チャンネル固定（URL不変・`--expires 30d`・再デプロイ延長）。本番ビルドは `BOOK_PREVIEW=1` ゲートで/book/を生成しない。MS3本番URLテストはBasic認証+noindex。
**⚠ デモのバックエンドは本番共有**（Firestore/Functions/Auth）。決済=Stripe test mode・書込=Beds24検証用物件のガードを外さない。
**⚠ App Check×チャンネル**: チャンネルURLをreCAPTCHA Enterprise許可ドメインに登録しないと予約フローがブロックされる。
**Functions例外**: featureから上げてよいのは読み取り専用のみ。書き込み系はtest構成でのみデプロイ・本番切替はMS3.9承認後。
**Stripeはtest/live分離**・検証用Webhook/メール宛先を用意。ロールバック演習は処理中予約・PaymentIntent・広告URL・計測を含む。

## 8. 技術仕様（Firebase / Cloud Functions）

すべて yah-homes / asia-northeast1。**実行SA=yah-homes@appspot を明示**（gen2既定のcompute SAは共有権限と不一致）。

| 関数 | trigger | 認証 | 概要 |
|---|---|---|---|
| bookingApi | GET | App Check＋CORS | availability/quote・5分キャッシュ・直販-2%。quoteは quoteId・明細・rate/offer識別子・失効時刻を返す |
| beds24Webhook | POST | URLトークン＋即時ACK | `webhook_events` 保存→非同期処理（受信スレッドで正データGETしない） |
| bookCreate | POST | verifyIdToken＋App Check | 検証→pending作成→PaymentIntent作成まで。履行はWebhook起点 |
| stripeWebhook | POST | Stripe署名（raw body） | `payment_intent.*` を冪等処理（eventId永続重複排除）→履行ワーカー起動 |
| bookingWorker | 内部 | 内部のみ | Beds24書込・capture・メール・状態遷移（operation ID・再試行・補償） |
| accountApi | GET/POST | verifyIdToken（本人UID） | 一覧／キャンセルSaga起動 |
| adminApi | GET/POST | verifyIdToken＋台帳照合 | /admin/bookings 用（§8-5） |

### 8-1. 状態機械

```
QUOTE_ISSUED → PAYMENT_PENDING → AUTHORIZED → RESERVATION_PENDING → CONFIRMED
                     ↓失敗            ↓作成失敗         ↓capture失敗
               PAYMENT_FAILED      VOIDED(解放)     CAPTURE_RETRY → MANUAL_REVIEW
CONFIRMED → CANCEL_REQUESTED → REFUND_PENDING → CANCELLED（失敗→MANUAL_REVIEW・有人キュー・SLA）
```

- 遷移は永続 **operation ID** を持ち、外部API（Beds24/Stripe）へIdempotency-Keyとして渡す。`operations` 台帳はappend-only。
- **stateVersion CAS**: 予約docの単調増加バージョンをFirestoreトランザクションで照合し、一致時のみ遷移実行（遅延再配信された古いタスクが最新状態を上書きできない）。
- **履行フロー**: bookCreate（PI作成まで）→ クライアント3DS確認 → `amount_capturable_updated` Webhook → bookingWorker が再見積り・再在庫確認 → Beds24 POST（外部参照=operation ID）→ 成功で capture → CONFIRMED → メール。
- **Beds24タイムアウト**: 再POST禁止。外部参照で照会→実行済みなら続行・なければ解放（照合手段はMS1で確定）。
- **キャンセルSaga**: refund→Beds24取消→カレンダー解放→通知を追跡。片方失敗は再試行→上限超過でMANUAL_REVIEW（当番通知・顧客へ処理中連絡）。
- **Beds24側の手作業変更は自動追随しない**: ミラー差分（日次定点観測が検知網を兼ねる）→MANUAL_REVIEW。自動返金しない。
- **kill switch**: `config/killSwitch` で外部副作用ジョブを一斉停止（操作=rootのみ・audit記録）。復旧・DB復元時は必ず有効化してから作業。

### 8-2. Webhook堅牢化

`webhook_events/{provider_eventId}` に payloadHash・receivedAt・processedAt・result。同一イベントは一度だけ処理。失敗はDLQ＋再実行。日次突合（定点観測相乗り）に差異件数と解消SLA。

### 8-3. Beds24認証

read=long lifeトークン（既存・定点と共用）。**書込=refresh token方式**（Secret Manager→24時間token取得・キャッシュ）。恒久write secretは置かない。

### 8-4. Firestore（クライアント直書き全面禁止）

| collection | 読み取り | 内容 |
|---|---|---|
| bookings | 本人UIDのみ | 直販予約（uid・棟・日付・金額・状態・operation/stripe/beds24 ID・policyVersion・freeCancelUntilAt・stateVersion） |
| bookings_mirror | 禁止 | 全チャネルミラー（正規化＋raw保全） |
| guests | 禁止 | 顧客台帳（主キー=ランダムguestId・emailは属性）。保持PIIは氏名・メール・電話のみ |
| consents | 禁止 | 同意証跡（マーケ・ハウスルール） |
| admin_users | 禁止 | 管理者台帳（§8-5b） |
| webhook_events / operations / audit_logs | 禁止 | 台帳（append-only） |

**属性別SSOT**: 在庫・料金・日程=Beds24／支払・返金・紛争=Stripe／同意・操作履歴=自社／**宿泊者名簿・旅券=運営会社（当社は保有しない・§9）**。差異時は正側を基準に、自社からの自動上書き・自動返金はしない。

### 8-5. /admin/bookings 権限モデル

- 役割: `owner`（返金・全操作）／`operator`（閲覧・対応メモ）。**判定はリクエスト毎に admin_users をFirestore照合**（Claimsのみだと剥奪後最大1時間旧権限が残るため）。
- 返金¥10,000超は確認ダイアログ必須。全金銭操作を audit_logs に記録。ログにPII・トークンを出さない。

### 8-5b. 管理者台帳 /admin/users（先行実装可）

- `admin_users/{email}`: name・role・通知フラグ3種（partners/定点/直販予約）。
- rootオーナー=コード固定・削除不可。台帳編集=rootのみ。メンバーは各admin画面へGoogleログイン可能。
- 通知メール（partnersApply・定点・bookCreate）は root＋該当フラグONメンバーへ送信（ハードコード宛先廃止）。

### 8-6. 保護

- **App Check**（reCAPTCHA Enterprise）: bookingApi・bookCreate 必須＋IP/UID単位レート制限＋Beds24 API利用量アラート。
- Secrets: BEDS24_TOKEN（read）・BEDS24書込refresh token・STRIPE_SECRET_KEY・STRIPE_WEBHOOK_SECRET・WEBHOOK_KEY・SMTP_*。関数単位で限定付与。
- 障害時は必ず【予約エラー】メール（沈黙禁止）。

## 9. 運営会社まわり

- ゲスト連絡=Beds24統合インボックス一本。**トランザクションメールの一次送信者=Beds24 Auto Actions**（4通×5言語: 予約確認/入室案内/当日/お礼+クーポン。起案は当方）。自社からゲストへのメールは原則送らない（内部通知のみ）。
- 通知集約=contact@mail.yah.homes（Stripe紛争・システム通知）。確認者と24時間SLA・振り分けをRunbookに明記。
- 紛争分担: 事実確認=運営会社／Stripe対応=オーナー。エスカレーション権限表は運用開始時に合意。
- **宿泊者名簿（A案）**: 収集・保有は運営会社の既存フロー（Airbnbゲストと同じ扱い・直販予約の連絡先はBeds24に載る）。**当社システムは名簿・旅券を保有しない**。運営会社に収集手段がない場合のみB案（当社フォーム収集・分離保管・旅券画像は公開ACL絶対禁止/署名付きURLのみ）を発動。
- 例外業務Runbook（1枚）: カード拒否・処理中・名簿未回収・取消例外・チャージバック・到着未回答 ×担当・SLA。

## 10. 計測（GA4標準eコマース）

`view_item` → `begin_checkout`（棟選択後）→ `login`（認証成功）→ `add_payment_info`（決済情報送信時）→ `purchase`（**サーバー確定後にMeasurement Protocol送信**・transaction_id=内部予約番号・重複排除。クライアントからは送らない）。
Google Ads: purchase をプライマリCVへ・click_airbnb はセカンダリへ。gclid/UTMを予約レコードに保存しFirestoreで突合。経営KPIの正は内部台帳（GA4/広告はファネル改善の補助）。

## 11. テスト戦略（5層）

| 層 | 対象 | 手段 |
|---|---|---|
| 1 ユニット | 状態遷移表（全状態×全イベント）・期限判定（JST境界）・quote検証・CAS | node単体テスト |
| 2 エミュレータ | bookCreate→Webhook→Worker・firestore.rules | Firebase Emulator Suite |
| 3 外部実機 | Stripe test mode＋CLI再送／**Beds24検証用物件**（書込・取消・Webhook・重複。本物件への書込はMS3.9まで禁止） | Stripe CLI／Beds24パネル |
| 4 障害注入 | capture失敗・関数停止・timeout・重複を `config/faultInjection` で発生→収束確認 | 手動チェックリスト |
| 5 E2E | URL復元・カレンダーグレーアウト・sticky総額・最終確認画面・テストカード決済通し・5言語スモーク。認証=Authエミュレータ | Playwright |

実施: MS1=層3／MS2=層1+2+選択E2E／MS3=フル（テストファースト）／**デプロイ前にE2E一式**（10分以内規模）／MS3.9=人間＋実カード。

## 12. 受け入れ基準

- [ ] LCPモバイル2.5s未満（JS段階ロード: 初期=日付ピッカーのみ→Auth=認証到達時→Stripe=checkout時）
- [ ] パラメータ引き継ぎ・状態復元／カレンダーグレーアウト／最終確認画面の法定表示
- [ ] 障害シナリオ（capture失敗・関数停止・timeout・Webhook重複・二重送信）が定義状態に収束し、二重請求・未収確定・無通知が発生しない
- [ ] 同一棟同一日程の直販競合＋OTA更新で1件のみ確定・敗者はオーソリ解放
- [ ] キャンセル: 期限境界・返金失敗・取消失敗・二重クリックで金額/在庫/通知/監査が一致・例外はSLA内に有人キュー
- [ ] 他人予約IDの参照拒否・権限外の返金拒否・Webhook偽装拒否・ログにsecret/PIIなし
- [ ] WebView×OS×言語の実機認証テスト通過
- [ ] 全チャネルが bookings_mirror に記録・日次突合の差異ゼロ・Runbookのみで復旧可能・iframe版ロールバック演習済み
- [ ] purchase重複なし・GA4/Ads/Firestoreの件数差異を説明できる

### 12.5 セキュリティ実装チェックリスト

- [ ] stripeWebhook所有権照合（PI IDが自社pending予約と金額まで一致してから履行）
- [ ] 権限判定はリクエスト毎のFirestore台帳照合（Claims失効ラグ対策）
- [ ] SPF/DKIMアラインメント＋DMARC（p=quarantine〜）確認（mail.yah.homes・Beds24送信分）
- [ ] corsOrigin 正規表現の先頭末尾アンカー確認
- [ ] kill switch操作=rootのみ・audit記録
- [ ] beds24Webhook URLトークンのローテーション手順をRunbookへ
- [ ] /admin/* に X-Frame-Options: DENY
- [ ] 管理者台帳の保存前メール確認表示（typo防止）

## 13. 要決定事項（MS0でクローズ）

| # | 決定事項 | 担当 |
|---|---|---|
| 1 | 契約当事者・MoR。**方針決定済（A案）: 当社Stripe維持＋代理受領構造**（当社=予約受付・代金の代理受領者／Airstar=役務提供者。運営委託契約に代理受領条項・月次精算に直販行・特商法に両者を明記。5棟化時にStripe Connect再検討）→ 面談合意＋専門家確認で確定 | 経営・法務確認 |
| 2 | 物件の営業形態・所管自治体・宿泊税・**名簿の既存収集フローと直販ゲストへの適用可否（A案成立条件）** | 運営・法務確認 |
| 3 | Beds24のrate/offer選択・-2%適用位置・書込の外部参照/重複検知・取消API挙動 | Tech（MS1実機） |
| 4 | 障害パターンの収束先（§8-1の最終承認） | Tech |
| 5 | メール一次送信者=Beds24の最終確認・言語/再送/不達の責任 | 運営・CRM |
| 6 | 管理画面の役割・返金上限・承認要否 | 経営・運営 |
| 7 | 障害通知の確認者・SLA・夜間休日の対応範囲 | 運営・Tech |
| 8 | 特商法・規約・キャンセル規約・プライバシー通知の整合 | 法務確認 |
| 9 | KPIの分母・期間・ベースライン・¥15,000/予約の限界利益再計算 | 経営 |

## 14. バックログ（規模トリガー付き・P1では実装しない）

| 項目 | トリガー |
|---|---|
| 金銭サブレジャー・日次/月次照合の厳格化 | 直販 月10件超 |
| 設定ドリフト検知・契約テスト・障害注入演習の定常化 | 5棟化 or 直販比率35% |
| break-glass権限・四半期DB復元演習 | 運用人員2人超 |
| 不正利用の多層防御（クーポン多重・在庫拘束Bot・返金二者承認） | クーポン施策開始時 |
| Firestore復旧Runbook（kill switch→外部再照合→差分append取込） | MS3.9までに文書化のみ |
