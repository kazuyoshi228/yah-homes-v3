# docs の歩き方（索引）

115本のドキュメントが1つの階に混在していたため、**どれが今の仕様か外から分からない**状態でした。
この索引がその入口です（2026-08-29 作成）。

## まず読む3本（yah.OS の現行仕様）

| 文書 | 何が書いてあるか |
|---|---|
| `schema.md` | **台帳の正本**。コレクションとフィールドの定義。スキーマを変えたらここも直す |
| `spec_no_iframe_20260826.md` | **URLと画面構成の最終形**（パス＝カード・クエリ＝状態）。iframeは全廃済み |
| `spec_mobile_ai_lp_20260829.md` | **モバイルはAIに聞く1画面**。PCは従来どおり |

補助: `spec_ai_ask_20260827.md`（AI質問窓）・`spec_ai_deepening_20260827.md`（取込・月次レポート・朝の所見）

## 最新の点検と、そこから出た宿題

| 文書 | 状態 |
|---|---|
| `review_yah_os_20260829.md` | **最新の全体点検（87点）**。改善点はここが起点 |
| `review_yah_os_20260828.md` | 前回の全体点検。P0/P1/P2 すべて実装済み |
| `directive_p2_20260828.md` | P2の指示書。全8項目 実施済み |
| `directive_hardcoded_amounts_20260827.md` | 金額の焼き込み一掃。実施済み |
| `作業指示書_launch-json-merge.md` | （yah-os リポジトリ側）実施済み |

## 読み方の約束

- **`spec_` = 仕様**（実装の根拠）／**`design_` `proposal_` = 設計・提案**（採用されたとは限らない）
- **`review_` = 点検**／**`directive_` = 指示書**／**`draft_` `handoff_` `todo_` = 下書き・申し送り**
- 同名で `_v2` `_v3` と続くものは**末尾の番号が大きいものが正本**（例: `design_booking_p1_v5.md`）
- 日付つき（`_20260829`）は**その日の判断の記録**。後の日付が前の判断を上書きしていることがある

## 全ドキュメント（接頭辞順・各行は文書の見出し）

## GUARD (1)
- GUARD_tracking_baselayout.md :: 【保護】BaseLayout.astro の計測ブロックを壊さないための指示
## analysis (2)
- analysis_airdna_3cities_202607.md :: AirDNA分析（3都市）— 東京・札幌・福岡の市場比較と「福岡の残り時間」
- analysis_annual_reports_202607.md :: 年間実績分析 — 売上収支報告書 全23ヶ月（清川2025-06〜2026-06・高砂2025-09〜2026-06）
## audit (1)
- audit_ssot_20260825.md :: SSoT 総点検 — 2026-08-25
## backlog (1)
- backlog_priority_20260825.md :: yah.OS 残作業の優先順位（効率順・建設完了までの道筋）
## bcp (1)
- bcp_operator_risk.md :: 運営会社リスク管理・BCP — Airstar委託の構造整理
## communication (1)
- communication_map.md :: コミュニケーション遷移図（現状）
## content (1)
- content_strategy_yah_homes.md :: yah.homes コンテンツ戦略 — 目標: オーガニック月1,000人
## databook (1)
- databook_beds24_202608.md :: Beds24 データブック — 実測データ集約（正本）
## design (26)
- design_astro_scaffold.md :: 設計図：Astro 雛形の作成と UI 資産の移植（Phase 1 基盤）
- design_booking_p1.md :: 直接予約基盤 P1 設計書 — 「店構えは自社・エンジンはBeds24」
- design_booking_p1_v2.md :: 直接予約基盤 P1 設計書 v2 — 「店構えは自社・エンジンはBeds24」
- design_booking_p1_v3.md :: 直接予約基盤 P1 設計書 v3 — 「店構えは自社・エンジンはBeds24」
- design_booking_p1_v4.md :: 直接予約基盤 P1 設計書 v4 — 「店構えは自社・エンジンはBeds24」
- design_booking_p1_v5.md :: 直接予約基盤 P1 設計書 v5（正本）
- design_contact_autoreply.md :: 計画書: 問い合わせフォーム自動返信メール（オートリプライ）
- design_faq_from_reviews.md :: 計画書: レビュー抽出FAQ（確認の資産化）
- design_firebase_hosting.md :: 設計図：Firebase Hosting 接続（Phase 1・静的配信）
- design_ga4_events_pricing.md :: 設計図：GA4イベント計測＋料金の手がかり＋高砂住所
- design_geo_improvements.md :: 設計図：GEO（生成エンジン最適化）改善 — P0/P1
- design_geo_machinaka.md :: 計画書: AI Overview引用対策（街中クエリ・語彙・周辺距離表）
- design_google_ads_hongkong.md :: Google広告 設計書 — 香港キャンペーン（yah.homes_香港_2026Aug）
- design_google_ads_korea.md :: Google広告 設計書 — 韓国キャンペーン（yah.homes_韓国_2026Aug）
- design_google_ads_taiwan.md :: Google広告 設定手順書 — 台湾キャンペーン（福岡包棟民宿）
- design_google_ads_thailand.md :: 設計書: yah.homes_タイ Google広告キャンペーン（台湾式・タイ語）
- design_google_ads_villa.md :: Google広告 設定手順書 — 「福岡 ヴィラ」検索キャンペーン
- design_guest_registration_v1.md :: 宿泊者名簿の自社フロント化 v1（設計書・承認待ち）
- design_guides_pipeline.md :: 計画書: ガイド配管 — magazine Firestore → yah.homes /guides/ 描画
- design_home_cta.md :: ホームCTA最適化 設計書 — HERO 2棟化 × 計測強化
- design_messages_ai_v1.md :: 直販メッセージのAI応答 v1（設計書・P1着工中）
- design_meta_ads_korea.md :: 設計書: Meta（Instagram）広告 — 韓国市場
- design_partners_page.md :: 設計書: インフルエンサー向けパートナーページ（ファクトシート＋写真＋空き状況）
- design_reviews_page.md :: 設計：レビューページ /review ＋ 管理 /admin/review（v2）
- design_ui_improvements.md :: 設計図：Locals のデザイン統一 + 全ページ改善提案
- design_weekly_report.md :: 設計書: 週次定点観測レポート自動化 — v0.1（承認待ち）
## directive (2)
- directive_hardcoded_amounts_20260827.md :: 指示書 — HTMLに焼き込まれた金額の整理（カードスレッド宛）
- directive_p2_20260828.md :: 指示書: yah.OS P2改善（レビュー2026-08-28の残件）
## draft (3)
- draft_mail_insurance_renewal_20260827.md :: メール下書き — 保険の見直し（清川）＋旅館賠償の見積依頼
- draft_mail_insurance_takasago_20260827.md :: メール下書き — 高砂の保険料を下げる相談
- draft_message_info_v1.md :: 顧客メッセージ用情報 — 推奨内容ドラフト v1
## faq (1)
- faq_draft_from_messages_20260825.md :: FAQ草案 — Beds24メッセージ180日の実測から
## handoff (3)
- handoff_chat_faq_20260825.md :: 指示書 — Beds24メッセージの実測をチャットのQ&Aへ反映する
- handoff_monthly_ads_20260825.md :: 申し送り — 月次カード（monthly.html）へ広告費の1行を
- handoff_tabs_hidden_20260825.md :: 申し送り — os.css の `.tabs` が hidden 属性に勝つ
## issue (1)
- issue_embed_panel_20260825.md :: 不具合メモ — 埋め込み表示で右パネルが常に消え、400pxの死にスペースが出る
## mail (2)
- mail_airstar_cutoff_202608.md :: Airstar 宛：当日予約についての再確認メール（草案・第2版）
- mail_templates_proposal_202608.md :: 定型メール文面 改訂案
## meeting (1)
- meeting_airstar_direct_booking_202608.md :: 運営会社ご説明資料 — yah.homes 直接予約サイトのご案内
## ops (1)
- ops_task_breakdown.md :: 運営業務 分解表 — yah.homes（5棟・稼働85%・月64組想定）
## plan (2)
- plan_master_2026h2.md :: yah.homes 統合計画書 2026下期 — 直販基盤 × コンテンツ × 広告
- plan_refactor_and_conversion_202608.md :: 実装設計図・リファクタリング計画 — yah.homes（2026-08-16）
## proposal (8)
- proposal_automation_20260825.md :: 提案書 — いま自動化できるカード・箇所（創造枠込み）
- proposal_parallel_card_updates_20260825.md :: 提案書 — OSの各カードを別々のClaudeスレッドで並行更新できるようにする
- proposal_planting_tool_ux_20260825.md :: 提案書 — 植栽ツールを「現場で使える」ものにする改善案
- proposal_reduce_schedules_20260825.md :: 提案書 — 定期作業を減らす（50件 → 24件）
- proposal_reports_gaps_20260825.md :: 提案 — 定期レポートに入れておくべき内容（棚卸し）
- proposal_ssot_architecture_20260825.md :: 提案書 — yah.OS のデータ構造改善（強固・シンプル・SSoT・横断検証）
- proposal_vendor_portal_expansion_20260825.md :: 提案書 — 業者ポータル（niwa方式）を他の業者へ広げる
- proposal_yah_os_automation_100_v1.md :: 提案書: yah.OS を自動化100%へ持っていく道筋 v1（2026-08-18）
## report (1)
- report_ko_traffic_anomaly_202607.md :: 調査報告: /ko/ 異常アクセス（Q-01）
## research (1)
- research_query_survey_202607.md :: クエリ実査(第1回) — Googleサジェスト採取結果
## review (9)
- review_1month_202608.md :: 1ヶ月運用レビュー（2026-07-12 サイト公開 〜 08-15）と次の30日
- review_insurance_20260825.md :: 保険の総点検 — 削れるところと、削ってはいけないところ
- review_insurance_kiyokawa_20260827.md :: 清川 — 保険の見直し項目（一覧）
- review_kiyokawa_asset_20260825.md :: 清川 資産記録の採点 — 「1棟の記録がどこまで揃ったか」
- review_properties_card_20260825.md :: 物件カードの改善点 — 担当スレッドからの所見
- review_takasago_asset_20260826.md :: 高砂 資産記録の採点 — 清川と同じ物差しで
- review_yah_os_20260824.md :: yah.OS 全体レビュー — UI・経営の両面からの採点
- review_yah_os_20260828.md :: yah.OS 全体レビュー（上級エンジニア視点・5観点並列精査）
- review_yah_os_20260829.md :: yah.OS 全体点検（2026-08-29）— 実データ・実コードによる検査と採点
## schema (1)
- schema.md :: schema.md — agency DB スキーマ台帳（E・2026-08-25）
## spec (35)
- spec_ad_cost_classification_20260825.md :: 仕様書 — 広告費の費目分類と、返済余力への算入
- spec_admin_messages.md :: 仕様書：メッセージ機能（Airbnb同等）v2
- spec_ads_gsc_teiten_20260825.md :: 仕様書 — Google広告費とGSCの定点蓄積
- spec_ai_ask_20260827.md :: 仕様書 — AI質問窓（yah.OS × Claude API 連携・段A）
- spec_ai_deepening_20260827.md :: 仕様書 — AI連動の深化（質問窓の次へ・段B〜G）
- spec_beds24_cloud_observer.md :: 仕様書: Beds24クラウド定点観測（Cloud Functions日次実行）
- spec_beds24_message_mining_20260825.md :: 仕様書 — Beds24 メッセージの定期回収と、チャットへの還元
- spec_booking_teiten_20260825.md :: 仕様書 — 予約状況の定点観測（定期レポートに新ビュー）
- spec_cta_location_202608.md :: 仕様書: click_airbnb の CTA位置ラベル欠落修正（(not set) 解消）
- spec_cta_location_tagging_202608.md :: 仕様書: click_airbnb の CTA位置ラベル欠落修正（(not set) 解消）
- spec_direct_booking_conversion_switch.md :: 作業指示書: 直販サイト公開に伴う コンバージョン切替（GA4 / Google Ads）
- spec_display_stability_20260826.md :: 仕様書 — yah.OS 画面表示の安定化（原因判定と恒久対策）
- spec_email_deliverability_20260825.md :: 作業指示書 — メールが迷惑メールに入る問題の根本対処（SPF / DKIM / DMARC）
- spec_ga4_teiten_20260825.md :: 仕様書 — GA4定点の蓄積（ga4Daily）
- spec_inquiry_threads.md :: 仕様書：問い合わせとメッセージの統合（B案・マジックリンク双方向）
- spec_inquiry_to_beds24_202608.md :: 仕様書: 問い合わせフォームの内容を Beds24 受信箱にも届ける
- spec_insurance_policy_numbers_20260827.md :: 作業指示書 — 保険台帳を「見積」から「契約中」へ直す（証券番号 MP… の取り込み）
- spec_insurance_review_card_20260827.md :: 仕様書 — 保険の見直しカード（ツール）
- spec_kaiteki_portal_20260827.md :: 仕様書 — 快適クリーンの業者ポータル（水まわり＋屋外・1つのURL）
- spec_land_valuation_tab_20260827.md :: 仕様書 — 物件カード「土地の評価額」タブ（パネル2の金カテゴリー）
- spec_mail_templates_ssot_202608.md :: 仕様書：定型メールのSSoT化（B案）
- spec_min_stay_autumn_202608.md :: 仕様書: 繁忙期（9〜11月）の最低宿泊日数を2泊にする
- spec_mobile_ai_lp_20260829.md :: 仕様書: モバイルは「AIに聞く1画面」にする（yah.OS ホーム）
- spec_no_iframe_20260826.md :: 仕様書 — yah.OS iframe全廃＋URL再々設計（MPA直遷移への転換）
- spec_planting_schedule_beds24.md :: 仕様書 — 植栽メンテの記録と、業者向け「作業に入れる日」カレンダー（Beds24連携）
- spec_property_requirements_v1.md :: 物件要件定義書 v1 — 3号棟以降（需要データ逆引き）
- spec_renewal_worklog.md :: 仕様書 — 更新計画と作業台帳の切り分け（消し込み・アラート）
- spec_ryokan_liability_20260827.md :: 検討書 — 旅館賠償責任保険をどう設定するか
- spec_schedules_editable_20260825.md :: 仕様書 — 定期作業を編集できるようにする（周期のヶ月統一・業者は台帳から選択）
- spec_self_cancel_202608.md :: 仕様書：ゲストによるセルフキャンセル（MS4）
- spec_tracking_cleanup_and_meta_pixel.md :: 仕様書: 計測タグの汚染除去 ＋ Metaピクセル設置
- spec_url_state_20260825.md :: 仕様書 — yah.OS のURL設計（並行スレッド運用に合わせた見直し）
- spec_yah_os_automation_v1.md :: yah.OS 自動化 仕様書 v1（2026-08-18・承認待ち）
- spec_yah_os_onepager_v1.md :: yah.OS 仕様書 v1.2（2026-08-19 更新・デモ確定状態を反映）
- spec_yah_os_vendor_dispatch_v1.md :: yah.OS 業者ディスパッチ仕様書 v1.2 — メールベース（2026-08-19 更新・モック確定状態を反映）
## strategy (2)
- strategy_exit_entity_v1.md :: 出口の器と個人系の切り離し（v1・2026-08-19）
- strategy_yah_os_exit_v1.md :: yah. 100億戦略メモ v1（2026-08-18・ドラフト）
## teiten (2)
- teiten_baseline_20260726.md :: 定点観測レポート — 基準スナップショット 2026-07-26
- teiten_calendar_log.md :: カレンダー観測ログ（分析資料用・日付レベル転記）
## todo (3)
- todo_direct_booking.md :: 直販サイト 構築ToDo（優先順）
- todo_vendor_dispatch.md :: 業者ディスパッチ v1 実装ToDo（2026-08-19 更新）
- todo_yah_os_implementation.md :: yah.OS 実装ToDo（2026-08-19 時点）
## 作業指示書 (1)
- 作業指示書_privacy_meta_pixel_追記.md :: 作業指示書: プライバシーポリシーへのMetaピクセル追記
## 依頼 (1)
- 依頼_Beds24販売期間の延長_202608.md :: 依頼: Beds24 の販売期間を延長してください（2027年5月以降が売れていません）
## 面談メモ (1)
- 面談メモ_Airstar_20260727.md :: Airstar面談メモ — 2026-07-27
