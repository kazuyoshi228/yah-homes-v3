/* 台帳のカタログ（2026-09-03 発注者承認・design_agency_db_review_20260903.md A案）
 *
 * 「どの数字がどこにあるか」の正本。AIも人も、台帳を探す前にここを読む。
 *
 * なぜ要るか: 2026-09-03、AIが「土地の取得原価は台帳にない」と断言した。
 * 実際は items の kind="acquisition" に27件あった。properties と depreciation を
 * 見て無いと結論した——名前がそれを教えてくれないから。
 *
 * いちばん大事なのは notHere（ここには無い）である。
 * 「あるもの」だけ書いても、探している側は「無い」を確かめられない。 */

export const CATALOG = {
  items: {
    label: "物件ごとの支出明細（領収証・請求書の単位）",
    holds: [
      "取得原価 kind=acquisition … 売買代金＋仲介手数料＋登記費用＋固都税精算金＋印紙税。【土地の簿価はここ】",
      "工事関連 kind=construction … 着工後の追加・変更",
      "備品・消耗品 kind=supply … 開業時の買い物",
    ],
    amountField: "amount",
    keyFields: ["prop", "kind", "date"],
    notHere: "properties には取得原価は無い（listPrice は【検討中】物件の売出価格）",
    relatedTo: ["properties", "depreciation", "buildPayments"],
  },
  depreciation: {
    label: "減価償却の資産台帳（建物・家具・内装）",
    holds: ["取得原価 cost", "現在の簿価 bookValue", "耐用年数 years・償却方法 method"],
    amountField: "cost",
    keyFields: ["prop", "kind"],
    notHere: "土地は償却しないのでここに載らない。土地の簿価は items の kind=acquisition",
    relatedTo: ["items", "bsAdjustments"],
  },
  bsAdjustments: {
    label: "貸借対照表の調整（申告書に載らない資産の持ち出し）",
    holds: ["建物などを【棟の合計】で持つ行"],
    amountField: "amount",
    keyFields: ["prop", "kind", "entity"],
    notHere: "depreciation と重複して見えるが粒度が違う。大手門は bsAdjustments ¥80,000,000 ＝ depreciation の建物 ¥70,000,000 ＋ 家具 ¥10,000,000",
    relatedTo: ["depreciation"],
  },
  finance: {
    label: "借入の台帳（法人・個人の両方）",
    holds: [
      "銀行の借入 … lender に「銀行/公庫/金庫」を含む",
      "家族からの借入 … それ以外。entity=\"corp\" が法人、\"personal\" は借り手＝山田一慶の個人債務",
    ],
    amountField: "principal",
    keyFields: ["entity", "lender", "kind"],
    notHere: "残債は持たない。firstPaymentMonth・totalPayments・monthlyPayment から導出する（loanState / cashflow.ts）",
    relatedTo: ["cash", "bankBalances"],
    caution: "entity で必ず分ける。法人 ¥186,031,628 と個人 ¥80,000,000 を混ぜない",
  },
  properties: {
    label: "物件の台帳（取得済み＋検討中）",
    holds: ["所在・面積・用途地域・接道", "検討中物件の売出価格 listPrice と採点 screeningScore", "撤退判断 withdrawalDecision"],
    amountField: "listPrice",
    keyFields: ["status", "planned"],
    notHere: "取得原価は無い。それは items の kind=acquisition",
    relatedTo: ["items", "landComps", "revenue"],
  },
  landComps: {
    label: "公示地価と取引事例",
    holds: ["地点ごとの㎡単価 unitPrice（年次）"],
    notHere: "自社物件の取得単価は無い。それは items",
    amountField: "unitPrice",
    keyFields: ["year", "kind", "address"],
    notHere: "自社物件の取得単価は無い。それは items",
    relatedTo: ["properties"],
  },
  assumptions: {
    label: "人の判断・前提（SSoTでいう【判断】の置き場）",
    holds: ["還元利回り cap-rate", "法人税の段階税率 corporate-tax", "家族ファンドの条件 family-fund", "確定モデル target-model", "NOIの定義 noi-definition", "ほか20件"],
    amountField: null,
    keyFields: ["status"],
    notHere: "実績は無い。ここにあるのは【そう決めた】ことだけ",
    caution: "status が confirmed か proposed かを必ず見る。family-fund と target-model は proposed（承認未取得）",
  },
  bookingDaily: {
    label: "予約の日次（Beds24から取り込み）",
    holds: ["日ごとの予約・稼働・単価"],
    amountField: null, keyFields: ["prop", "date"],
    notHere: "会計上の売上は無い。それは revenue（手取り・月次）",
    relatedTo: ["revenue"],
  },
  places: {
    label: "拠点の台帳（宿泊用か、事務所か）",
    holds: ["拠点ごとの用途 isLodging と所在"],
    amountField: null, keyFields: [],
    notHere: "金額は無い。光熱費は utilities が place に紐づけて持つ",
    relatedTo: ["utilities"],
  },
  personalDistributions: {
    label: "代表個人の分配金（投資信託）",
    holds: ["分配の実績"],
    amountField: "amount", keyFields: [],
    notHere: "法人の収入ではない。役員報酬0円の土台になっている個人の収入",
    relatedTo: ["personalAssets"],
  },
  revenue: { label: "宿泊の売上（月次・棟別）", holds: ["月ごとの手取り売上"], amountField: "amount", keyFields: ["prop", "ym"], notHere: "経費は無い（utilities / recurringCosts / taxes / insurance を見る）", relatedTo: ["bookingDaily"] },
  utilities: { label: "光熱費の契約（拠点ごとの月額）", holds: ["拠点ごとの月額"], amountField: "amount", keyFields: ["place"], notHere: "prop を持たない。拠点（places）に紐づく。棟への按分は derive.ts が行う", relatedTo: ["places", "utilityBills"] },
  utilityBills: { label: "光熱費の実際の請求", holds: ["請求書の実額"], amountField: "amount", keyFields: ["place", "ym"], notHere: "契約の月額は utilities", relatedTo: ["utilities"] },
  buildPayments: { label: "工事代金の支払予定（契約・着工・中間・引渡・家具）", holds: ["支払の予定と実績 paid"], amountField: "amount", keyFields: ["prop", "kind", "date"], notHere: "完成後の取得原価は items の kind=acquisition", relatedTo: ["items", "construction"] },
  construction: { label: "工事の契約と図面", holds: ["請負総額 contractTotal", "工期", "仕様の読み解き"], amountField: "contractTotal", keyFields: ["site"], notHere: "支払のタイミングは buildPayments", relatedTo: ["buildPayments"] },
  reserves: { label: "修繕積立", holds: ["年額 amountPerYear", "投資信託への振替か（cashOutflow）"], amountField: "amountPerYear", keyFields: [], notHere: "積立は【費用ではない】。現金は減るが法人の資産は減らない（cashflow.ts:54）", relatedTo: ["assumptions"] },
  taxes: { label: "固定資産税など（棟ごとの年額）", holds: ["年額 amountPerYear"], amountField: "amountPerYear", keyFields: ["prop", "kind"], notHere: "法人税は無い。それは cashflow が assumptions/corporate-tax から計算する", relatedTo: ["financials"] },
  insurance: { label: "保険", holds: ["年額 premiumPerYear（火災・地震・施設賠償）"], amountField: "premiumPerYear", keyFields: ["prop", "kind"], notHere: "団信・経営者保険は無い（2026-09-03 現在、加入状況が未確認）", relatedTo: ["properties"] },
  financials: { label: "法人税申告書の要約（年度別）", holds: ["所得", "繰越欠損金", "納税額"], amountField: null, keyFields: ["fy"], notHere: "将来の予測は無い。それは cashflow の出力", relatedTo: ["assumptions"] },
  personalAssets: { label: "代表個人の資産", holds: ["投資信託の評価額など"], amountField: "value", keyFields: [], notHere: "法人の資産は bsAdjustments / depreciation", relatedTo: ["personalDistributions"] },
  equipment: { label: "設備の台帳（更新計画のもと）", holds: ["設備ごとの取得と更新予定"], amountField: "amount", keyFields: ["prop", "kind"], notHere: "実際に更新した支出は items の kind=supply / construction。ここは【計画】", relatedTo: ["reserves", "items"] },
  contracts: { label: "契約書の所在", holds: ["売買契約書・運営委託・OTA規約"], amountField: "amount", keyFields: ["prop", "category"], notHere: "金額は参考値。取得原価は items", caution: "prop が空文字の行が5件ある（物件に紐づかない契約）。null と混在するので判定に注意" },
  cash: { label: "口座残高のスナップショット", holds: ["期首残高 total と口座別内訳"], amountField: "total", keyFields: ["date"], notHere: "将来の残高は無い。cashflow が計算する", relatedTo: ["bankBalances"] },
  bankBalances: { label: "口座残高の推移", holds: ["日付ごとの残高"], amountField: "balance", keyFields: ["date"], notHere: "借入の残債は無い。それは finance から loanState() が計算する", relatedTo: ["cash", "finance"] },
  settings: { label: "カードの設定（下限・表示など）", holds: ["cashflow の下限 floor など"], amountField: null, keyFields: [], notHere: "事業の判断は assumptions", relatedTo: ["assumptions"] },
};

/* 導出値の在り処。数字が「保存されていない」ものは、どこで計算されるかを書く */
export const DERIVED = {
  "資金繰り・30年の推移": { where: "functions/src/agency/cashflow.ts の cashflow(months, asOf, withFunding)", caution: "yearly の closing は【納税前】。年次表が使うのは closingAfterTax（法人税・消費税の納付累計を引いた額）。30年で約 ¥261,000,000 ずれる" },
  "企業価値": { where: "同 cashflow() の valuation 配列", caution: "asset / cash / investBalance / loanBalance / equity と、インフレ2%版の assetInflated / equityInflated。自分で NOI÷cap を組まない" },
  "NOI・DSCR・利回り・担保余力": { where: "functions/src/agency/derive.ts", caution: "derivecheck.mjs がCIで、式が外で書き直されていないか見張る" },
  "借入の残債": { where: "loanState()。finance の firstPaymentMonth / totalPayments / monthlyPayment から", caution: "firstPaymentMonth が無い借入は conditionsUnknown で monthlyTotal: 0 を返す（返済予定なし）" },
  "提案書に出る数字": { where: "functions/report-values.mjs（119キー・各キーに出どころ）", caution: "reportcheck.mjs がCIで、テンプレートへの金額の焼き込みを止める" },
};
