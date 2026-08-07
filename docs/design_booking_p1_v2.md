# 直接予約基盤 P1 設計書 v2 — 「店構えは自社・エンジンはBeds24」

> 作成: 2026-08-08（v1の全決定を統合・現行仕様のみ記載。経緯・廃止案は v1 = design_booking_p1.md 参照）
> 対象: yah.homes-v2（Astro + Firebase Hosting/Functions/Firestore/Auth）
> ステータス: 設計確定・実装前（着工は発注者の号令で MS1 から）

## 1. 原則

1. **在庫・料金・OTA同期の唯一の真実 = Beds24**（フルスクラッチしない）。予約UI・決済・顧客データ・計測 = 自社。
2. **運営会社の業務は変えない**。直販予約はBeds24上で他OTAと同じ見え方。ゲスト連絡はBeds24統合インボックスに一本化。
3. **価格は3面同一の単一ソース**（Beds24）。直販チャネルは既存の **-2%設定を引き継ぐ**。/api/quote は必ず直販チャネル料金を読む。
4. 段階導入（MS1→4）。各段は次の土台・捨てる作業なし。

## 2. 事業KPI

- 直販比率: 現状≈0% → 12ヶ月35% → 18ヶ月50%。直販1予約 ≈ ¥15,000 の手数料回収。
- 積み上げ: ①広告着地を自社予約へ（+17〜25%）②リピーター直販クーポン（+8〜12%）③指名検索（+3〜5%）④室内QR（+2〜3%）。
- OTAは敵にしない: OTA=新規獲得の広告費15%。新規はOTA・2回目から直販。

## 3. ページ構成（2ページ・Expand廃止 2026-08-08決定）

```
/properties/{slug}/   売るページ（棟ごと・写真/設備/レビュー/ミニウィジェット）
        │ CTA（棟・日付・人数をURLパラメータで引き継ぎ）
        ▼
/book/                選択: 日付×人数（カレンダー）→ 棟カード×2（空き・総額即表示）→「この棟で進む」
        ▼
/book/checkout        確定: 予約サマリ＋トラストストリップ → Google認証 → 電話番号 → Stripe決済（埋込）→ 完了
```

- **予約状態は常にURLパラメータ保持**（WebView外部ブラウザ誘導・戻るボタン・リロードのすべてで状態復元）。
- 確定ページに「棟を変更」リンク（パラメータ付きで/book/へ戻る）。
- 棟が5に増えても /book/ は無変更・/properties/ を足すだけ。
- ミニ予約ウィジェット（/properties/）: PC=右カラムsticky・SP=下部固定バー。カレンダーJSは触れてから遅延ロード。

## 4. /book/ UX仕様

- **カレンダー空き先読み**: 日付ピッカーに満室日を選択前からグレーアウト（availabilityを表示月＋翌月先読み・5分キャッシュ）。両棟満室日のみグレー。
- **総額先出し**: 「2泊6名 合計¥98,000（清掃料込み）」。内訳は畳み。手数料後出し禁止。
- **通貨並記**: 総額直下に ≈NT$/HK$/₩/฿/US$（言語別・日次固定レート・「≈」概算明示・請求はJPY）。
- **キャンセルポリシー1行**: 料金直下に「◯月◯日まで無料キャンセル」（実日付・全文はリンク）。
- **トラストストリップ**（決済直前）: 「★4.77（47件）・◯月◯日まで無料キャンセル・運営: ボンファイア株式会社」。
- **sticky総額（SP）**: 棟選択後〜決済完了まで画面下部に総額固定表示。
- **満室時**: availability既読データから直近の空き日程を代替提案。
- 偽の緊急性・クロスセル物量・パスワード式登録は置かない。本当に残り1棟の時だけ「残り1棟」表示可。

## 5. 認証・会員化（必須・Google一本）

- 「Googleで続ける」1タップのみ（Firebase Auth・partners管理画面の基盤流用）。メールリンク認証・パスワードは採用しない。
- 位置づけ=**信頼シグナル**。決済直前に配置。認証後は氏名・メール自動充填（追加入力は電話番号程度）。
- 全予約がUID付きでFirestoreに紐づく（D1クーポン・リピーター判定・予約管理の土台）。
- **WebView対策**: Instagram/LINE等のin-appブラウザではGoogle OAuth不可（disallowed_useragent）→ UA判定でバナー「Safari/Chromeで開く」誘導＋Googleボタン非活性（理由明示）。URLパラメータ保持により開き直しても入力復元。
- ファネル計測で認証離脱を監視（異常時=目安3割超で「ゲスト続行」追加を検討する保険）。
- Kakao/Naverログイン（韓国）はFirebase OIDCで将来追加・P1見送り。

## 6. 予約管理 /account（P1必須）

- Googleログイン → 自分の予約一覧・詳細（棟・日付・総額・キャンセルポリシー）。
- **キャンセルセルフサービス**: 7日前まで=ボタン1つ（Stripe自動返金→Beds24取消→カレンダー解放→ゲスト+bookings@へメール）。以降は「メールで相談」。
- 日程変更は変更依頼フォーム（処理は当面人力・自動化はP2）。

## 7. マイルストーン

| MS | 内容 | 目安 | Done |
|---|---|---|---|
| MS1 | Beds24 Webhook→Firestoreミラー・物件構成の実データ確認 | 1〜3日 | 全チャネル予約がFirestoreに入る |
| MS2 | /book/ UI＋availability/quote API＋②ミニウィジェット | 1週 | 日付×人数→棟と総額が即表示 |
| MS3 | /book/checkout（認証+Stripe+POST /bookings+失敗時自動返金）＋Beds24自動メール4通×5言語 | 1〜2週 | テスト予約がBeds24に立ち決済完結 |
| MS3.5 | /account（一覧・キャンセルセルフサービス） | 3〜5日 | 返金→取消まで自動 |
| MS4 | カットオーバー: iframe撤去・広告着地差し替え・認証/noindex解除確認 | 1〜2日 | 全導線が自社予約へ |

- ブランチ: `feature/book-p1`。デモ=Hosting preview channel（本番ビルドは `BOOK_PREVIEW=1` ゲートで/book/を生成しない）。MS3の本番URLテストはBasic認証+noindex。
- トークン: 発注者がBeds24パネルで自力発行。read（既存claude-teiten）=MS1〜2／**write別発行=MS3時**（最小権限分離）。

## 8. Firebase / Cloud Functions 技術仕様

すべて yah-homes / asia-northeast1。**実行SA=yah-homes@appspot を明示**（gen2既定のcompute SAは共有権限と不一致になる）。

| 関数 | trigger | 認証 | secrets | 概要 |
|---|---|---|---|---|
| bookingApi | GET | 公開（CORS自社） | BEDS24_TOKEN | availability/quote・5分キャッシュ・直販-2%チャネル・429バックオフ |
| beds24Webhook | POST | URLトークン | WEBHOOK_KEY | 予約イベント→`GET /bookings/{id}`で正データ再取得→`bookings_mirror` upsert |
| bookCreate | POST | verifyIdToken | BEDS24_TOKEN_WRITE, STRIPE_SECRET_KEY, SMTP_* | 下記シーケンス |
| stripeWebhook | POST | Stripe署名 | STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY | 決済状態確定・孤児オーソリ自動解放 |
| accountApi | GET/POST | verifyIdToken（本人UID） | STRIPE_SECRET_KEY, BEDS24_TOKEN_WRITE, SMTP_* | 一覧／cancel=7日前判定→refund→Beds24取消→メール |

**bookCreate シーケンス（決済と予約の整合性）**:
1. verifyIdToken→入力検証（quote再計算で金額改ざん防止）
2. `bookings` に pending 先行作成（Idempotency-Key=クライアントUUID）
3. Stripe PaymentIntent（**manual capture**・金額はサーバ側quote）
4. Beds24 `POST /bookings` 成功で beds24Id 保存
5. **Beds24成功後に capture** → confirmed → 確認メール（ゲスト+contact@mail.yah.homes）
6. 失敗系は全パターンでオーソリ解放。取りこぼしは stripeWebhook が孤児オーソリ検出→解放。障害時は【予約エラー】メール必須（沈黙禁止）

**Firestore**（クライアント直書き全面禁止）:

| collection | 読み取り | 内容 |
|---|---|---|
| bookings | 本人UIDのみ | 直販予約（uid・棟・日付・金額・stripe/beds24 ID・status） |
| bookings_mirror | 禁止（admin経由） | 全チャネルミラー（channel・国・金額を正規化・raw保全） |
| guests | 禁止 | 顧客台帳（email小文字キー・リピート判定）＋名簿事項 |

**Secrets**: 既存=BEDS24_TOKEN・SMTP_USER/PASS／新規=BEDS24_TOKEN_WRITE・STRIPE_SECRET_KEY・STRIPE_WEBHOOK_SECRET・WEBHOOK_KEY

**Webhook欠落対策**: 夜間に `GET /bookings`（更新日フィルタ）で日次突合（beds24DailyObserverに相乗り可）。

## 9. 運営会社まわり

- **ゲスト連絡はBeds24統合インボックス一本**（OTA+直販を同一画面・業務変更なし）。直販ゲスト向け自動メール4通×5言語（予約確認/チェックイン案内/当日/お礼+クーポン）はBeds24 Auto Actionsに登録（MS3並行・起案は当方）。
- **通知メールボックスは既存の contact@mail.yah.homes に集約**（2026-08-08決定・新設なし）: Stripe紛争通知・名簿送付・システム通知の宛先。運営会社担当への転送を設定（Airstar合意事項③）。
- **/admin/bookings**: 予約一覧・金銭操作（オーナー限定）・名簿閲覧・対応メモ。メッセージ機能なし。
- **紛争分担**: 事実確認=運営会社／Stripe対応=オーナー。エスカレーション権限表（銭湯代¥2,000×人数・¥10,000まで現場判断等）は運用開始時に合意。
- **宿泊者名簿**（法的義務者=運営会社）: 予約時は最小・名簿事項はチェックイン前の自動メールで追補→Firestore保存→運営会社へ自動送付。保存3年。
- Airstar合意事項（面談）: ①直販分の対応費用（現行運用費内 or 件数課金）②名簿受け渡し形式③contact@mail.yah.homes の運営会社への転送設定。

## 10. 計測（GA4標準eコマースに統一）

`view_item`（/properties/）→ `begin_checkout`（/book/）→ `add_payment_info`（checkout到達・+`login` method=google）→ `purchase`（value・currency=JPY・transaction_id=beds24BookingId）。
Google Ads: `purchase` をプライマリCVへ昇格・click_airbnb はセカンダリへ降格。cta_location体系は流用。広告→予約の突合はFirestore側でも可能。

## 11. 受け入れ基準

- [ ] /book/ 初期表示 LCP モバイル実測 2.5s 未満（JS段階ロード: 初期=日付ピッカーのみ→Auth=認証到達時→Stripe=checkout時）
- [ ] ②→③で日付・人数・棟の引き継ぎ（再入力ゼロ）／URLリロード・外部ブラウザ開き直しで状態復元
- [ ] カレンダーが満室日を選択前にグレーアウト
- [ ] 全チャネル予約が bookings_mirror に自動記録
- [ ] テスト決済: 成功・Beds24書込失敗（オーソリ解放）・二重送信（冪等）の3系が仕様どおり
- [ ] /account でキャンセル→返金→Beds24取消→メールまで自動
- [ ] GA4ファネルが切れる・Ads プライマリCV切替済み
- [ ] 運営会社の作業手順書に変更ゼロ／iframe版へ5分で戻せる

## 12. 要確認（実装前）

1. 清川・高砂は同一propid内の部屋か別propidか（MS1実データで確定・照会形に反映）
2. Beds24 Webhookのペイロード形式（プラン差・MS1冒頭で確認）
3. §9のAirstar合意3点（面談）
