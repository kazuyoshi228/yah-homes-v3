# schema.md — agency DB スキーマ台帳（E・2026-08-25）

> Firestore `agency` DB の全コレクション。**スキーマを変えたらこの表も直す**（共有部スレッドの責務）。
> 分析の入口は `?action=health`（全検証）→ `?action=facts`（全金額行の単一射影）の2本。

## 保存の原則（2026-08-25 発注者方針）

**保存してよいのは一次事実（いつ・いくら・出典）と人の判断（承認・係数・宣言）だけ。
合計・割り算・並び替えで作れるものは保存しない。**

## コレクション一覧

| コレクション | 1行 | 主なフィールド | 書くのは | 備考 |
|---|---|---|---|---|
| `properties` | 棟 | label, status, address, area, acquisitionPrice, built, structure ほか属性・requiredDocs・drawings・interior・buildingConfirmation・usageFactor/lifespanCapYears/buildingLifeYears（物件別係数） | 画面(saveProperty)・スクリプト | 明細配列・合計値は廃止（→items・導出） |
| `items` | 金額明細1行 | kind(supply/construction/acquisition), prop, idx, item/label, amount, date, txNo, vendor, phase, offLedger, splitOk | スクリプト | 備品・工事・取得費用の正本。idx=表示順 |
| `equipment` | 設備台帳1行 | kind="equipment", prop, group(タブ名), category, maker, model, spec, amount/price, date/installedAt, txNo, lifespanYears, noFactor, effectiveYearsOverride, workOrder, futureCost, estimate/estimateObtained, noRenewal, breakdown[], alternatives[], history[] | 画面(saveLifespan/saveEstimate)・消し込みの書き戻し・スクリプト | groupは宣言制（未宣言はhealthに出る） |
| `schedules` | 周期マスタ1行 | title, prop, months[], everyYears, anchorYear, leadDays, active, needsDecision, manualOnly, category(更新/維持/法定/事務), vendorId, ledgerId(→equipment), budget | 画面・スクリプト | active=false はAIが動かない(fail-closed) |
| `jobs` | 作業1件 | type, title, prop, scheduleId, trigger(冪等キー), status, dueMonth, statutory, actual{amount,ym}, ledgerWrittenBack, timeline[](追記のみ) | advance()のみ | verified→equipmentへ書き戻し＋次回自動登録 |
| `taxes` | 税1行 | prop, type, amountPerYear, year | スクリプト | |
| `insurance` | 保険1行 | prop, product, plan, premiumPerYear, building, startDate, status, pdf | スクリプト | |
| `reserves` | 積立1行 | prop, type, amountPerMonth, amountPerYear | スクリプト | 妥当性はrenewalPlanが毎回判定 |
| `finance` | 借入1本 | kind="loan", entity(corp/personal), borrower, lender, principal, amountReported, conditionsUnknown, rate, months, firstPaymentMonth, method, schedule… | スクリプト | 返済表はloanState()で導出。**entityで法人（ボンファイア）と個人（山田一慶）を分ける——混ぜない**。条件未登録の借入は amountReported（申告額）を使う |
| `revenue` | 月次報告1行 | kind="monthly", prop, month, revenue, expenses, payout, occ, adr, pdf | スクリプト | AIRSTAR報告書が原本 |
| `places` | 拠点の台帳 | label, lodging(宿泊事業か), prop, note | 人 | **「その拠点は宿泊事業か」の唯一の正本**。無い拠点は宿泊事業とみなす |
| `utilities` | 光熱費仕訳1行 | kind="utility", date, month, place(日本語名), type, amount | スクリプト | place→propの対応は places 台帳 |
| `recurringCosts` | 定額費1行 | type, place, unitPrice, units, recurring | スクリプト | 例: セキュリティカメラ500円×台数 |
| `contracts` | 契約書類1行 | label, category, prop, counterparty, signedAt, expiresAt, autoRenew, noticeDays, path(原本gs://), status, feeSchedule[], notes[] | 画面(saveContract)・スクリプト | 原本の所在の正本 |
| `cvr` | CVR観測1行 | prop, label, sortKey, type(month/rolling/rolling90), overallCvr, imprRate, searchToView, viewToBook, views, impressions, occupancy, bookedNights, checkins, source | スクリプト | 欠測は書かない。検算はhealth |
| `assumptions` | 事業の係数1行 | value/factor/capYears等, label, note, updatedAt | 人の判断のみ | cap-rate・lifecycle・management-fee(tiers[]) |
| `scorecards` | 承継採点1回 | date, dimensions[], total, horizon | 画面(saveScorecard) | 日付ごとに積む（上書きしない） |
| `vendors` / `templates` / `settings` | 業者・定型文・設定 | — | 画面 | 外部委託まわり |
| `alertLogs` | 警報ログ | at, items, breakdown | システム | 追記のみ |
| `cash` | 現金残高スナップショット1回 | date, total, accounts[{name,balance}], source(原本スクショgs://) | 検収（人のクリック）のみ | 取込パイプ（段D）経由。ランウェイは導出 |
| `intake` | 取込の下書き1件 | at, from, filename, gsPath, kind, confidence, summary, data, status(draft/accepted/rejected) | AI(draft)・人(検収/破棄) | 正本ではなく待合室。検収で各台帳へ |
| `construction` | 工事資料1行 | site(ropponmatsu/otemon), label, category, date, path(gs://), note | 画面(constructionSave) | 建築カードの正本。竣工後はitems/設備台帳へ |
| `competitorObs` | AirDNA市場定点1回 | date, market, filters, adrUsd, occupancyPct, activeListings, listingsYoYPct ほか | 半年定点（コピペ→構造化投入） | 条件固定（中央区・Beds3-9）が生命線 |
| `opsTasks` | 運営タスク1行 | scenario(airstar/inhouse), label, freq, hoursMin/Max または category/window/assignees | 人の判断 | 運営カードの正本（委託の分解と内製座組） |
| `tourismStats` | 月次インバウンド定点1行 | month, metric(stay/entry), value, fetchedAt | システム（e-Stat毎月5日）・検収（FCVB等の手入力） | docID=metric-month で冪等。spec_tourism_stats_20260830 |
| `bsAdjustments` | BSの調整項目1件 | kind="asset", entity, group(unbooked/personal), label, amount, prop, excluded, reason | 人の判断のみ | 台帳に無い資産の宣言。group=unbooked は建設中の建物、personal は個人資産。**excluded=true は計上してはいけないもの**（自社株＝法人を展開する画面では二重計上）。既定では合計に入れずスイッチで足す |
| `policies` | 経営方針1件 | kind, title, policy, items[], decidedAt | 人の判断のみ | 事業承継カード方針タブの正本（出口設計・再調達価値等） |

## 導出レイヤ（保存しない）

| endpoint | 中身 |
|---|---|
| `health` | 全検証（棟監査・積立vs年割り・期日・契約期限・CVR検算・紐づけ切れ・前提の存在）。indexのドットの源 |
| `facts` | 全金額行を `{prop, ym, amount, flow, group, periodicity, docPath}` に射影。flow=invest/add/future/fixed/opex/revenue（loanは未実装） |
| `properties` | 属性＋items再構成＋投資額（取得費用+導出リフォーム）＋監査 |
| `renewalPlan` | 実効年数・年割り・更新カレンダー・積立判定 |
| `loans` / `monthly` / `yields` / `fixedCosts` / `utilities` / `revenue` | 各カードの集計 |

## バックアップ

Firestore標準のスケジュールバックアップ（日次・保持7日）を agency / default / chat の3DBに設定済み（2026-08-25）。

## 機械ゲート（スキーマ外の守り・2026-08-27整備）

金額テスト17本＋期日判定テスト（CI・落ちればデプロイ中止）／スモーク全カード（実ブラウザ・JSエラー0）／
デプロイ後のビルドSHA照合／金額焼き込みラチェット／フォント下限0.72rem。一覧の正本: yah-os/CLAUDE.md
