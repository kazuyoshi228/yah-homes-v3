# 直販メッセージのAI応答 v1（設計書・P1着工中）

- 起票: 2026-08-18（発注者との対話から）
- 状態: **P1＋P2実装完了（2026-08-19・ブランチ messages-ai）・デプロイは承認待ち**。§6の残りは④（Airstarへの説明）のみ
- 前提: chat.yah.homes で Vertex AI（Gemini・asia-northeast1）による自動応答が本番稼働中。
  同一Firebaseプロジェクト・同一SSoT（property_facts）のため、その資産を流用する。

## 1. 目的

1. **24時間返信の実効化** — My Page メッセージへの一次応答をAIが担い、Airstarの負担と
   返信リードタイムを下げる（サイトの約束「24時間以内返信」の裏付け）
2. **予約文脈つきの回答** — メッセージは予約に紐づく本人のため、棟・日程・人数・
   名簿提出状況を踏まえた回答ができる（匿名チャットより一段深い）
3. 事実の正本は SSoT（property_facts／チャット用情報／RAG）。**回答の数字をプロンプトに直書きしない**

## 2. 構成

```
ゲスト送信（My Page /account → messagesApi・既存 threads）
  → functions: aiDraftReply（新設）
      入力: スレッド履歴＋予約コンテキスト（bookings: 棟/日程/人数/registeredAt/言語）
      注入: property_facts＋chatInfo＋RAG（メッセージ専用インデックスを別立て・下記）
      モデル: Vertex AI Gemini（chat側と同系・asia-northeast1）
      判定: エスカレーション条件（chat側の規則を流用）
  → モード（正本: settings/messagesAi ＝SSoTとは分離・編集口は /admin/messages-ai・未設定は off に倒す安全側）
      ※P1でも /admin/messages-ai の最小版（モード切替 off/draft のみ）を作る。実績表示の拡充はP2
      "draft" : AI下書きを thread に保存 → /admin/messages に下書きカード（編集して送信/破棄）
      "auto-limited": FAQ的トピックのみ自動送信＋運営へ控え通知。他は draft に落とす
      "off"  : 何もしない（現行どおり）
```

## 2-2. 顧客メッセージ用情報（新設・2026-08-18 発注者指示）

- 正本: `property_facts/{prop}.messageInfo`（チャット用情報と同構造の q/a/cat 行）
- 編集画面: `/admin/properties/{施設}/#message`（サイドバーに「顧客メッセージ用情報」を新設。
  チャット用情報と同じエディタを共用＝分類見出し・行追加・Excelコピー/CSV出力・
  URL由来のprop導出・Owner編集/全員閲覧をそのまま流用）
- 用途: メッセージAI専用の運用Q&A（予約後ゲスト向け: 名簿・変更/返金の案内文・
  トラブル一次対応など）。チャット用情報とは注入先が別（チャット=chatInfo／メッセージAI=messageInfo）
- 実装はP1に含める（下記フェーズ表を更新）

## 2-3. 設定・実績ページ /admin/messages-ai（2026-08-18 発注者判断）

- **adminメニューの「システム管理」カテゴリに置く独立項目**（表記は「メッセージAI」のみ・
  2026-08-19 発注者指示）。設定（モード・時間帯）＋下書き採用率などの実績＋将来のログ閲覧を1画面に集約
- 設定の正本は Firestore **`settings/messagesAi`（SSoTとは分離）** — property_facts／meta は
  「宿・運営の事実」の正本であり、機能スイッチを混ぜない。未設定（ドキュメント無し）は off（fail-closed）
- 免責文言はコード定数（5言語・§9）。編集可能にしたくなったら mail_templates 化（P3）。実績は ai_drafts の集計＝派生値（保存正本を持たない）
- 物件別の「事実・文面」である顧客メッセージ用情報（§2-2）は従来どおり物件情報側（#message）に残す

## 3. 安全設計（fail-closed・既存原則の踏襲）

- **絶対に出さない**: キーボックス暗証番号・他ゲスト情報・決済情報（チャットと同一の禁止リスト）
- **必ず人間へ**（auto-limited でも自動送信しない）: 返金・キャンセル・日程/人数変更・クレーム・
  名簿内容・金銭全般・本人確認
- 自動送信には免責フッター（5言語）:「AIによる自動応答です。内容はスタッフも確認します」
- 生成失敗・SSoT不読時は何も送らず、従来どおり運営通知のみ（誤答より無応答）
- 全応答を thread に記録（既存構造）＋ audit。notifyMessage（運営への通知メール）は従来どおり維持

## 4. 実装フェーズ

| フェーズ | 内容 | 規模 |
|---|---|---|
| P1 | aiDraftReply（draftモード）＋ /admin/messages の下書きカード＋**顧客メッセージ用情報（#message・messageInfo）**＋ /admin/messages-ai 最小版（モード切替）＋採用ログ | 約1.5日 |
| P2 | auto-limited モード（トピック判定・免責フッター・時間帯条件）＋実績表示拡充 — **実装済み（§9）** | +0.5日 |
| P3 | 運用データを見て自動範囲の拡大を判断（本設計の範囲外） | — |

- **RAGはメッセージ専用に別立て**（2026-08-18 発注者判断）: chat側インデックスを呼ばず、
  独自インデックスを持つ。リポジトリ間依存を作らず、予約後ゲスト向けに収録を
  チューニング（名簿手順・変更/返金手続き・入室トラブルを厚く）
- ズレ防止の条件: **ソース定義（同期対象URLリスト）は共有**し、両インデックスは同じ定義から
  日次生成する。インデックスは派生物であり正本はページ（SSoT駆動）＝二重の正本にはならない
- プロンプトに事実の数字を書かない原則は共通（全てSSoT注入）

## 5. コスト・計測

- モデルは Gemini Flash 系（chat と同じ）。1通あたり1円未満想定
- 計測: 下書き採用率（無編集送信/編集送信/破棄）・自動送信率・エスカレーション率を
  mail_logs 同様の軽量ログに記録 → P2/P3 の判断材料

## 6. 未決事項（更新: 2026-08-19）

1. ~~開始モード~~ → **draft で確定**（P1着工承認に伴い。auto-limited はP2で改めて判断）
2. ~~自動送信の免責文言~~ → **5言語で実装済み（§9・変更希望があれば指示）**
3. ~~時間条件の要否~~ → **機能として実装済み**（/admin/messages-ai で設定・両方空欄=常時）
4. Airstar への説明タイミング（下書き運用は運営フローに直結）— **デプロイ前に必要（唯一の残未決）**

## 7. 適用範囲と「会話AIの共通型」（2026-08-19 発注者との議論を反映）

- **本設計は顧客（予約ゲスト）専用**。外部委託業者とのやり取りは対象外 —
  業者側は yah.OS 業者ディスパッチ（spec_yah_os_vendor_dispatch_v1・email ベース）が担う。
  業者にポータル/Auth ログインを要求すると採用が死ぬため、器を共用しない（チャネル=email 維持）。
- ただし両者は**同じ型の2インスタンス**:
  「受信 → AIが文脈注入で理解 → 下書き/限定自動 → 例外は人間へ → ログ・採用率計測」。
  エスカレーション原則・禁止リスト機構（暗証番号NGは共通）・draft/auto モード・採用率計測の
  設計を共有し、コードも同じ形に書いて将来の括り出しを安価にする。
- 収束先: 運営側の画面。/admin/messages-ai の実績画面が将来ゲスト側と業者側を並べる
  統合受信箱へ育ち得る（データは既定DB／os DB の分離を維持し、統合するのは画面と操作感のみ）。

## 8. 決定ログ

| 日付 | 決定 |
|---|---|
| 2026-08-18 | RAGはメッセージ専用に別立て（ソース定義は共有・インデックスは派生物） |
| 2026-08-18 | 顧客メッセージ用情報（#message・messageInfo）を新設しP1に含める |
| 2026-08-18 | 設定・実績は adminメニュー直下 /admin/messages-ai・正本は settings/messagesAi（SSoT外） |
| 2026-08-19 | 業者やり取りは本設計の対象外（yah.OSディスパッチ側・§7） |
| 2026-08-19 | P1着工承認・ブランチ messages-ai・開始モードは draft で確定 |
| 2026-08-19 | P1実装完了（§9）。RAG別立ては後続へ（インデックス作成がデプロイ作業のため） |
| 2026-08-19 | メニューは「システム管理」カテゴリ・表記「メッセージAI」のみ（発注者指示） |
| 2026-08-19 | P2（限定自動）実装（発注者指示「限定自動まで仕込んでおいて」・§9） |
| 2026-08-19 | 顧客メッセージ用情報の推奨内容ドラフト起票 → draft_message_info_v1.md |
| 2026-08-19 | 暗証番号の扱い: 本文に書かず条件判定→入室案内メール再送で返す（案A・§10・未着工） |

## 9. P1実装メモ（2026-08-19・ブランチ messages-ai）

- **ai_drafts/{autoId}**（新コレクション・staff読み取りのみ・書き込みは全てサーバ）:
  bookingId / prop / guestMessageId / guestMessageExcerpt / body / translatedJa（運営レビュー用の日本語訳）/
  language / escalationRequired / escalationTopics[] / sources[]（根拠表示）/ qaRows /
  status（pending → sent | sent-edited | discarded | superseded）/ mode / model / ms / createdAt / resolvedBy / resolvedAt。
  採用率はこのコレクションの集計＝派生値（保存正本を持たない）
- **aiDraftReply**: threads/{id}/messages onDocumentCreated トリガ。ゲスト発言のみ・inquiry除外・
  モード!=draftは即return・SSoT不読/生成失敗/空応答は書かない（fail-closed）。
  注入=予約コンテキスト＋property_facts/meta＋chatInfo＋messageInfo＋直近12通。
  Gemini 2.5 Flash（Vertex・asia-northeast1・ADC）・構造化出力。コスト上限=同一スレッド1日20件
- **messagesApi**: action:aiMode（admin以上・off/draftのみ受付。auto-limitedはP2までAPIごと拒否）・
  action:draftResolve（staff・採用記録）。送信経路は現行 send のまま＝AIに送信権限なし
- **RAG別立て**はP1に含めず（ベクトルインデックス作成がデプロイ作業のため）。
  P1の知識= SSoT＋Q&A注入で開始し、専用インデックスはP2で判断（§4の方針は不変）
- ゲスト側（My Page）は無変更（draft運用では見た目が一切変わらない・§2）

### デプロイ手順（承認後・この順）

1. `cd functions && npm i`（@google/genai 追加済み）→ `firebase deploy --only functions:aiDraftReply,functions:messagesApi,functions:adminProperties`
2. `firebase deploy --only firestore:rules,firestore:indexes`（ai_drafts の staff 読み取り＋複合インデックス）
3. ~~Vertex AI の有効化・SA権限~~ → **済み（2026-08-19 発注者実施）**: API有効化はserviceAgent存在で確認、
   `yah-homes@appspot.gserviceaccount.com` に `roles/aiplatform.user` 付与済み
4. サイト: `./safe-deploy.sh live`（#message ビュー・/admin/messages-ai・下書きカード）
5. 有効化: /admin/messages-ai でモードを「下書きのみ」にして保存（既定は停止＝デプロイ直後は何も起きない）
6. 運用前に §6-4（Airstar への説明）を済ませる

### P2実装メモ（限定自動・2026-08-19 同ブランチ）

- 判定: `mode=auto-limited` ＆ AIがエスカレーション話題を検出しない ＆ 時間帯条件
  （settings/messagesAi.autoFrom/autoTo・JST・日跨ぎ対応・両方空=常時）→ 自動送信。それ以外は下書きに落ちる
- 自動送信の実体: messagesApi の host 送信と同じ書き込み（aiAutoSend）＋免責フッター5言語を必ず付加。
  ゲストへの新着通知メール・Beds24複製・運営への控えメール（【AI自動応答・控え】）も同経路を踏襲
- メッセージdocは `aiGenerated:true / author:"messages-ai" / aiJa（運営用日本語訳）`。
  My Page は AIバッジ＋本文（免責は本文末尾に焼き込み済み）、/admin/messages は「🤖 AI自動応答」ラベル＋日本語訳
- 記録: ai_drafts の status="auto-sent"（実績ページに自動送信件数として出る）
- 設定UIの時間帯は「**24時間（常時）**」チェック既定ON（2026-08-19 発注者指示）。外すと from/to 指定。
  保存はチェックON=空文字（サーバ仕様「空=常時」は不変）
- 免責文言（AI_DISCLAIMER_L10N）: ja「AIによる自動応答です。内容はスタッフも確認します。」／
  en / ko / zh(繁体) / th を同旨で用意（変更はコード修正＝デプロイで反映）

## 10. 入室案内の再送 — 案A（2026-08-19 発注者承認・設計のみ・未着工）

発端: 発注者「暗証番号は、決済が確定しているお客様には返信しても良いのでは」。
議論の結果、**番号を本文に書くのではなく“配達”を返す**案Aで確定。

- **不変の原則**: AIは暗証番号をメッセージ本文に書かない。書くとスレッド・ゲスト通知メール・
  Beds24複製の3方向に番号が散らばり、プロンプト注入で抜かれる経路にもなるため。
  番号の配達は既存の入室案内メール（前日案内と同じテンプレ・実績ある経路）のみ
- **条件判定はコードで決定的に行う**（AIに判定させない）。3点セット:
  ① 決済確定（status が確定系） ② **名簿提出済み**（registeredAt あり＝既存ゲートを壊さない）
  ③ チェックインが近い（例: 前日の案内メール送信時刻以降。閾値は実装時に確定）
- フロー: ゲストが暗証番号・入室方法を尋ねる → aiDraftReply が話題を検出（構造化出力に
  resendEntryGuide フラグを追加）→ サーバが条件3点を判定 →
  - 満たす: 入室案内メールを再送し、返信は「入室のご案内メールを再送しました。届かない場合は
    迷惑メールフォルダもご確認ください」（draft では下書きカードに「再送して送信」アクション、
    auto-limited では自動送信の対象にできる）
  - 満たさない: 現行どおり（名簿未提出なら名簿のご案内・それ以外は担当者へ）
- ガード: 再送は1予約につき1日2回まで・audit_logs 記録・再送メールの露出面は現行の前日案内と同一
- 効果: 「メールが見つかりません」（ドライラン ケース2）がその場で解決する
- 規模: +0.5日弱（P2.5）。**着工は別途承認**
