# 台帳のカタログ（どの数字がどこにあるか）

**自動生成**: `node functions/catalog-build.mjs`。手で編集しない——定義は `functions/catalog-def.mjs`。

台帳を探す前にここを読む。**とくに「ここには無い」の欄**——

> 2026-09-03、AIが「土地の取得原価は台帳にない」と断言した。実際は `items` の `kind="acquisition"` に27件あった。

## 数字を探すときの入口

| 探しているもの | どこにあるか |
|---|---|
| 土地の取得原価（簿価） | `items` の `kind="acquisition"` |
| 建物・家具の取得原価と簿価 | `depreciation` の `cost` / `bookValue` |
| 借入の元本 | `finance` の `principal`（`entity` で法人と個人を分ける） |
| 借入の残債 | 保存されていない。`loanState()` が計算する |
| 30年の資金繰り・企業価値 | 保存されていない。`cashflow()` が計算する |
| 月ごとの売上 | `revenue` |
| 光熱費 | 契約は `utilities`、実際の請求は `utilityBills`（拠点ごと。棟への按分は `derive.ts`） |
| 公示地価 | `landComps` の `unitPrice` |
| 還元利回り・税率・NOIの定義 | `assumptions`（`status` を必ず見る） |

## コレクション

### `items` — 物件ごとの支出明細（領収証・請求書の単位）

**332件** ／ 金額の列: `amount`

- 取得原価 kind=acquisition … 売買代金＋仲介手数料＋登記費用＋固都税精算金＋印紙税。【土地の簿価はここ】
- 工事関連 kind=construction … 着工後の追加・変更
- 備品・消耗品 kind=supply … 開業時の買い物

> **ここには無い**: properties には取得原価は無い（listPrice は【検討中】物件の売出価格）

関連: `properties` / `depreciation` / `buildPayments`

<sub>主なフィールド: amount, date, idx, kind, memo, phase, prop, txNo, vendor</sub>

### `depreciation` — 減価償却の資産台帳（建物・家具・内装）

**9件** ／ 金額の列: `cost`

- 取得原価 cost
- 現在の簿価 bookValue
- 耐用年数 years・償却方法 method

> **ここには無い**: 土地は償却しないのでここに載らない。土地の簿価は items の kind=acquisition

関連: `items` / `bsAdjustments`

<sub>主なフィールド: bookValue, confirmWith, cost, kind, label, method, note, pendingConfirmation, prop, rate, source, startMonth, structure, updatedAt, years</sub>

### `bsAdjustments` — 貸借対照表の調整（申告書に載らない資産の持ち出し）

**4件** ／ 金額の列: `amount`

- 建物などを【棟の合計】で持つ行

> **ここには無い**: depreciation と重複して見えるが粒度が違う。大手門は bsAdjustments ¥80,000,000 ＝ depreciation の建物 ¥70,000,000 ＋ 家具 ¥10,000,000

関連: `depreciation`

<sub>主なフィールド: amount, entity, excluded, group, kind, label, paid, prop, reason, source, superseded, updatedAt</sub>

### `finance` — 借入の台帳（法人・個人の両方）

**12件** ／ 金額の列: `principal`

- 銀行の借入 … lender に「銀行/公庫/金庫」を含む
- 家族からの借入 … それ以外。entity="corp" が法人、"personal" は借り手＝山田一慶の個人債務

> **ここには無い**: 残債は持たない。firstPaymentMonth・totalPayments・monthlyPayment から導出する（loanState / cashflow.ts）

> ⚠️ entity で必ず分ける。法人 ¥186,031,628 と個人 ¥80,000,000 を混ぜない

関連: `cash` / `bankBalances`

<sub>主なフィールド: borrower, conditionsUnknown, entity, finalPaymentMonth, firstPayment, firstPaymentMonth, interestNote, kind, lender, monthlyPayment, note, principal, rate, rateNote, repayment, source, totalPayments, updatedAt</sub>

### `properties` — 物件の台帳（取得済み＋検討中）

**5件** ／ 金額の列: `listPrice`

- 所在・面積・用途地域・接道
- 検討中物件の売出価格 listPrice と採点 screeningScore
- 撤退判断 withdrawalDecision

> **ここには無い**: 取得原価は無い。それは items の kind=acquisition

関連: `items` / `landComps` / `revenue`

<sub>主なフィールド: access, acquiredAt, acquisitionPrice, address, area, assetScorecard, boundaryNote, broker, buildingConfirmation, buildingConfirmationSource, built, contractDate, coverageRatio, drawings, heightLimit, kind, label, landArea, landAreaNote, landPriceBenchmark, layout, listPrice, note, occupancy, psychologicalDefect, purchasePrice, registryMortgage, registryOwner, requiredDocs, roads, screeningScore, seller, source, status, structure, updatedAt, updatedBy, zoning, zoningSource</sub>

### `landComps` — 公示地価と取引事例

**1555件** ／ 金額の列: `unitPrice`

- 地点ごとの㎡単価 unitPrice（年次）

> **ここには無い**: 自社物件の取得単価は無い。それは items

関連: `properties`

<sub>主なフィールド: address, areaSqm, asOf, distM, district, fetchedAt, kind, pointNo, source, sourceName, sourceNote, sourceUrl, station, unitPrice, year, zone</sub>

### `assumptions` — 人の判断・前提（SSoTでいう【判断】の置き場）

**24件** ／ 金額なし

- 還元利回り cap-rate
- 法人税の段階税率 corporate-tax
- 家族ファンドの条件 family-fund
- 確定モデル target-model
- NOIの定義 noi-definition
- ほか20件

> **ここには無い**: 実績は無い。ここにあるのは【そう決めた】ことだけ

> ⚠️ status が confirmed か proposed かを必ず見る。family-fund と target-model は proposed（承認未取得）

<sub>主なフィールド: kind, label, note, source, updatedAt</sub>

### `bookingDaily` — 予約の日次（Beds24から取り込み）

**37件** ／ 金額なし

- 日ごとの予約・稼働・単価

> **ここには無い**: 会計上の売上は無い。それは revenue（手取り・月次）

関連: `revenue`

<sub>主なフィールド: cv, date, fwd, k, raw, source, syncedAt, t</sub>

### `places` — 拠点の台帳（宿泊用か、事務所か）

**4件** ／ 金額なし

- 拠点ごとの用途 isLodging と所在

> **ここには無い**: 金額は無い。光熱費は utilities が place に紐づけて持つ

関連: `utilities`

<sub>主なフィールド: label, lodging, note, prop, updatedAt</sub>

### `personalDistributions` — 代表個人の分配金（投資信託）

**6件** ／ 金額の列: `amount`

- 分配の実績

> **ここには無い**: 法人の収入ではない。役員報酬0円の土台になっている個人の収入

関連: `personalAssets`

<sub>主なフィールド: annual, entity, holding, kind, name, owner, source, updatedAt, year</sub>

### `revenue` — 宿泊の売上（月次・棟別）

**25件** ／ 金額の列: `amount`

- 月ごとの手取り売上

> **ここには無い**: 経費は無い（utilities / recurringCosts / taxes / insurance を見る）

関連: `bookingDaily`

<sub>主なフィールド: adr, agencyFees, cleaning, expenses, guests, kind, lodgingTax, management, month, nightsPerParty, occ, operator, otaFees, parties, payout, pdf, prop, revPerGuest, revenue, revenuePrevMonth, source, updatedAt</sub>

### `utilities` — 光熱費の契約（拠点ごとの月額）

**64件** ／ 金額の列: `amount`

- 拠点ごとの月額

> **ここには無い**: prop を持たない。拠点（places）に紐づく。棟への按分は derive.ts が行う

関連: `places` / `utilityBills`

<sub>主なフィールド: account, amount, date, importedAt, kind, memo, month, place, source, txNo, type</sub>

### `utilityBills` — 光熱費の実際の請求

**56件** ／ 金額の列: `amount`

- 請求書の実額

> **ここには無い**: 契約の月額は utilities

関連: `utilities`

<sub>主なフィールド: amount, billMonth, kind, plan, prop, source, supplier, type, updatedAt</sub>

### `buildPayments` — 工事代金の支払予定（契約・着工・中間・引渡・家具）

**10件** ／ 金額の列: `amount`

- 支払の予定と実績 paid

> **ここには無い**: 完成後の取得原価は items の kind=acquisition

関連: `items` / `construction`

<sub>主なフィールド: amount, date, funding, fundingSource, kind, paid, prop, source, updatedAt</sub>

### `construction` — 工事の契約と図面

**14件** ／ 金額の列: `contractTotal`

- 請負総額 contractTotal
- 工期
- 仕様の読み解き

> **ここには無い**: 支払のタイミングは buildPayments

関連: `buildPayments`

<sub>主なフィールド: category, date, label, note, path, site, updatedAt, updatedBy</sub>

### `reserves` — 修繕積立

**2件** ／ 金額の列: `amountPerYear`

- 年額 amountPerYear
- 投資信託への振替か（cashOutflow）

> **ここには無い**: 積立は【費用ではない】。現金は減るが法人の資産は減らない（cashflow.ts:54）

関連: `assumptions`

<sub>主なフィールド: amountPerMonth, amountPerYear, cashOutflow, kind, note, note2, prop, propLabel, source, type, updatedAt, vehicle</sub>

### `taxes` — 固定資産税など（棟ごとの年額）

**2件** ／ 金額の列: `amountPerYear`

- 年額 amountPerYear

> **ここには無い**: 法人税は無い。それは cashflow が assumptions/corporate-tax から計算する

関連: `financials`

<sub>主なフィールド: amountPerYear, kind, prop, propLabel, source, type, updatedAt, year</sub>

### `insurance` — 保険

**7件** ／ 金額の列: `premiumPerYear`

- 年額 premiumPerYear（火災・地震・施設賠償）

> **ここには無い**: 団信・経営者保険は無い（2026-09-03 現在、加入状況が未確認）

関連: `properties`

<sub>主なフィールド: agentVendorId, covers, endAt, file, id, insurer, kind, note, pdf, plan, policyNo, policyNoNote, premiumPerYear, product, productOverview, prop, propLabel, quote, renewalPolicySetAt, startAt, status, term, updatedAt</sub>

### `financials` — 法人税申告書の要約（年度別）

**5件** ／ 金額なし

- 所得
- 繰越欠損金
- 納税額

> **ここには無い**: 将来の予測は無い。それは cashflow の出力

関連: `assumptions`

<sub>主なフィールド: company, corpTax, era, file, fy, kind, localCorpTax, lossCarryforward, lossUsed, netIncome, note, office, periodFrom, periodTo, refund, source, taxableIncome, updatedAt, userId</sub>

### `personalAssets` — 代表個人の資産

**9件** ／ 金額の列: `value`

- 投資信託の評価額など

> **ここには無い**: 法人の資産は bsAdjustments / depreciation

関連: `personalDistributions`

<sub>主なフィールド: broker, category, entity, gain, hedged, kind, monthlyPay, name, owner, source, updatedAt, value</sub>

### `equipment` — 設備の台帳（更新計画のもと）

**198件** ／ 金額の列: `amount`

- 設備ごとの取得と更新予定

> **ここには無い**: 実際に更新した支出は items の kind=supply / construction。ここは【計画】

関連: `reserves` / `items`

<sub>主なフィールド: category, group, installedAt, kind, lifespanYears, maker, model, note, offLedger, price, prop, source, spec, txNo, updatedAt, vendor, workOrder</sub>

### `contracts` — 契約書の所在

**12件** ／ 金額の列: `amount`

- 売買契約書・運営委託・OTA規約

> **ここには無い**: 金額は参考値。取得原価は items

> ⚠️ prop が空文字の行が5件ある（物件に紐づかない契約）。null と混在するので判定に注意

<sub>主なフィールド: amount, category, counterparty, expiresAt, label, note, path, prop, signedAt, status, updatedAt</sub>

### `cash` — 口座残高のスナップショット

**2件** ／ 金額の列: `total`

- 期首残高 total と口座別内訳

> **ここには無い**: 将来の残高は無い。cashflow が計算する

関連: `bankBalances`

<sub>主なフィールド: accounts, date, source, superseded, total, updatedAt</sub>

### `bankBalances` — 口座残高の推移

**63件** ／ 金額の列: `balance`

- 日付ごとの残高

> **ここには無い**: 借入の残債は無い。それは finance から loanState() が計算する

関連: `cash` / `finance`

<sub>主なフィールド: account, balance, date, entity, label, source, updatedAt</sub>

### `settings` — カードの設定（下限・表示など）

**15件** ／ 金額なし

- cashflow の下限 floor など

> **ここには無い**: 事業の判断は assumptions

関連: `assumptions`

<sub>主なフィールド: —</sub>

## 保存していない数字（計算で出す）

### 資金繰り・30年の推移

**functions/src/agency/cashflow.ts の cashflow(months, asOf, withFunding)**

> ⚠️ yearly の closing は【納税前】。年次表が使うのは closingAfterTax（法人税・消費税の納付累計を引いた額）。30年で約 ¥261,000,000 ずれる

### 企業価値

**同 cashflow() の valuation 配列**

> ⚠️ asset / cash / investBalance / loanBalance / equity と、インフレ2%版の assetInflated / equityInflated。自分で NOI÷cap を組まない

### NOI・DSCR・利回り・担保余力

**functions/src/agency/derive.ts**

> ⚠️ derivecheck.mjs がCIで、式が外で書き直されていないか見張る

### 借入の残債

**loanState()。finance の firstPaymentMonth / totalPayments / monthlyPayment から**

> ⚠️ firstPaymentMonth が無い借入は conditionsUnknown で monthlyTotal: 0 を返す（返済予定なし）

### 提案書に出る数字

**functions/report-values.mjs（119キー・各キーに出どころ）**

> ⚠️ reportcheck.mjs がCIで、テンプレートへの金額の焼き込みを止める

## カタログに載っていないコレクション

運用ログ・キャッシュ・外部データの取り込みなど。**金額の一次事実はここには無い。**

`adsDaily` / `aiChecks` / `aiLogs` / `alarmTests` / `alertLogs` / `analyses` / `beds24cache` / `competitorObs` / `cvr` / `ga4Daily` / `gscDaily` / `gscPage` / `gscQuery` / `heartbeats` / `intake` / `jobs` / `judgments` / `mailTemplates` / `opsTasks` / `policies` / `recurringCosts` / `schedules` / `scorecards` / `serviceAccounts` / `tourismStats` / `unmatched` / `vendors`

---

<sub>生成 2026-09-03 11:41 UTC ／ 対象 25コレクション（台帳全体は 52）</sub>