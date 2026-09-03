/* 戦略提案書に埋める数字を、台帳から出す（2026-09-03 発注者承認・design_report_from_ledger_20260903.md）
 *
 * ここが【提案書に出る数字の唯一の出どころ】である。
 * テンプレート側では計算しない。掛け算・引き算もここに1回だけ書く。
 * 各キーは必ず src（出どころ）を持つ——持たないと reportcheck.mjs が落とす。
 *
 * 2026-09-03、この仕組みが無かったために30年後の清算額を1日で6回訂正した。
 * とくに closing（納税前）と closingAfterTax（納税後）の取り違えは、
 * 30年で ¥261,000,000 のずれになった。名前で区別できるようにキーを分けている。 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = "yah-homes";
const CAP_SRC = "assumptions/cap-rate";

/** 仲介手数料（宅建業法の上限・税込）。売買代金×3%＋6万に消費税10% */
export const brokerFee = (price) => Math.round((price * 0.03 + 60_000) * 1.1);

/** 法人税（段階税率）。brackets は assumptions/corporate-tax が正本 */
export function corpTax(taxable, brackets) {
  if (taxable <= 0) return 0;
  let rest = taxable, sum = 0, prev = 0;
  for (const b of brackets ?? []) {
    const cap = b.upTo == null ? Infinity : Number(b.upTo);
    const span = Math.max(0, Math.min(rest, cap - prev));
    sum += span * Number(b.rate || 0);
    rest -= span; prev = cap;
    if (rest <= 0) break;
  }
  return Math.round(sum);
}

const BANKS = /銀行|公庫|信用金庫|信用組合|金庫|證券|証券/;

export async function values(asOf = new Date("2026-09-03"), exitYear = "2050") {
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  const db = getFirestore("agency");
  const { cashflow } = await import("./lib/agency/cashflow.js");
  const r = await cashflow(360, asOf, true);

  const yr = r.yearly.find((v) => String(v.year) === exitYear);
  const va = r.valuation.find((v) => String(v.year) === exitYear);
  if (!yr || !va) throw new Error(`${exitYear}年の行が cashflow に無い`);

  /* 家族からの資金。finance の entity で法人と個人に分かれる——片方だけ見ない
     （2026-09-03、法人分だけを「家族ファンド」として扱い、個人 ¥80,000,000 を落とした） */
  const fin = (await db.collection("finance").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const famOf = (entity) => fin.filter((v) => v.entity === entity
    && !BANKS.test(String(v.lender || "")) && Number(v.principal || 0) > 0);
  const sum = (a) => a.reduce((s, v) => s + Number(v.principal || 0), 0);
  const famCorp = famOf("corp"), famPersonal = famOf("personal");

  /* 土地の取得価額。items の kind="acquisition"（売買代金＋仲介手数料＋登記費用＋
     固都税精算金＋印紙税＋担保取扱料）。建物・家具は depreciation にあり、
     出口年には償却しきって簿価ゼロ */
  const items = (await db.collection("items").get()).docs.map((d) => d.data());
  const aq = items.filter((v) => v.kind === "acquisition");
  const landBook = aq.reduce((s, v) => s + Number(v.amount || 0), 0);

  const brackets = r.tax?.brackets ?? [];
  const capRate = Number(va.capRate ?? 0);

  /* 出口: 収益還元で売り、手数料と譲渡益への法人税を引く */
  const exit = (asset) => {
    const fee = brokerFee(asset);
    const gain = asset - landBook - fee;
    const tax = corpTax(Math.max(0, gain), brackets);
    return { asset, fee, gain, tax, net: asset - fee - tax };
  };
  const flat = exit(va.asset), infl = exit(va.assetInflated);
  const hand = (e) => e.net + va.cash + va.investBalance - va.loanBalance;

  const V = {};
  const put = (k, v, src) => { V[k] = { v, src }; };

  put("asOf", asOf.toISOString().slice(0, 10), "生成時の基準日");
  put("exit.year", exitYear, "出口の年（発注者指定）");
  put("exit.capRate", capRate, `${CAP_SRC}（収益仲介1件の回答）`);

  put("exit.cash", va.cash,
    `cashflow(360).yearly[${exitYear}].closingAfterTax ＝ 法人税・消費税の納付後の現金`);
  put("exit.cashBeforeTax", yr.closing,
    `cashflow(360).yearly[${exitYear}].closing ＝ 納付前。提案書では使わない`);
  put("exit.investBalance", va.investBalance,
    `cashflow(360).yearly[${exitYear}].investBalance ＝ 修繕積立の投資信託残高`);
  put("exit.loanBalance", va.loanBalance,
    `cashflow(360).valuation[${exitYear}].loanBalance ＝ 出口年の借入残高`);
  put("exit.noi", va.noi, "valuation.noi（売上−固定費−光熱費−長期修繕の年割り）");
  put("exit.equity", va.equity, "valuation.equity ＝ 不動産＋現金＋投信−借入（売却コスト前）");

  put("exit.asset", flat.asset, `valuation.asset ＝ NOI ÷ 還元利回り（${CAP_SRC}）`);
  put("exit.fee", flat.fee, "売買代金×3%＋6万に消費税10%（宅建業法の上限）");
  put("exit.gain", flat.gain, "売却額 − 土地の簿価 − 仲介手数料");
  put("exit.tax", flat.tax, "段階税率（assumptions/corporate-tax の brackets）");
  put("exit.saleNet", flat.net, "売却額 − 仲介手数料 − 譲渡の法人税");
  put("exit.hand", hand(flat), "売却の手取り ＋ 現金 ＋ 投資信託 − 借入残高");

  put("exitInf.asset", infl.asset, "valuation.assetInflated（NOIを年2%で伸ばす・利回りは据え置き）");
  put("exitInf.fee", infl.fee, "同上に対する仲介手数料");
  put("exitInf.gain", infl.gain, "同上の譲渡益");
  put("exitInf.tax", infl.tax, "同上の譲渡の法人税");
  put("exitInf.saleNet", infl.net, "同上の売却の手取り");
  put("exitInf.hand", hand(infl), "同上で手元に残る額");

  put("land.bookValue", landBook, `items kind="acquisition" ${aq.length}件の合計（付随費用込み）`);
  put("land.itemCount", aq.length, 'items kind="acquisition" の件数');

  put("family.corpPrincipal", sum(famCorp),
    `finance entity="corp" かつ貸し手が銀行以外 ${famCorp.length}件`);
  put("family.personalPrincipal", sum(famPersonal),
    `finance entity="personal"（借り手＝山田一慶）${famPersonal.length}件。法人の清算表には載らない`);
  put("family.totalPrincipal", sum(famCorp) + sum(famPersonal), "上の2つの合計＝一族から出ている総額");

  put("tax.lossCarryforward", r.tax?.lossCarryforward ?? 0, "assumptions/corporate-tax（申告書の確定値）");
  put("cash.floor", r.floor, "settings/cashflow の下限");
  put("shortage.alt", r.shortageAlt ?? "なし", "追加融資を含めた資金繰りの不足月（null＝不足なし）");

  /* 棟ごとの取得価額。売買代金は最大の1件、付随費用はその他の合計 */
  const byProp = {};
  for (const v of aq) {
    const k = String(v.prop || "unknown");
    (byProp[k] ??= []).push(Number(v.amount || 0));
  }
  for (const [k, arr] of Object.entries(byProp)) {
    const tot = arr.reduce((s, n) => s + n, 0);
    const main = Math.max(...arr);
    put(`land.${k}.total`, tot, `items kind="acquisition" prop="${k}" ${arr.length}件の合計`);
    put(`land.${k}.price`, main, `同上のうち最大額＝売買代金（手付金を含む場合あり）`);
    put(`land.${k}.extras`, tot - main, "同上の残り＝仲介手数料・登記費用・固都税精算金・印紙税など");
  }
  put("land.priceTotal", Object.values(byProp).reduce((s, a) => s + Math.max(...a), 0),
    "各棟の売買代金の合計");
  put("land.extrasTotal", landBook - Object.values(byProp).reduce((s, a) => s + Math.max(...a), 0),
    "取得価額の合計 − 売買代金の合計＝付随費用");

  /* 建物・家具の取得原価（depreciation）。出口年には償却しきって簿価ゼロ */
  const dep = (await db.collection("depreciation").get()).docs.map((d) => d.data());
  put("building.cost", dep.reduce((s, v) => s + Number(v.cost || 0), 0),
    `depreciation ${dep.length}件の取得原価合計（建物・家具・内装）`);

  /* 出口年の年次の姿。2050年以降は借入も償却もゼロで、数字が動かなくなる */
  put("year.income", yr.income, `cashflow(360).yearly[${exitYear}].income ＝ 手取り収入`);
  put("year.tax", yr.tax, `同 tax ＝ その年の法人税`);
  put("year.netAfterTax", yr.netAfterTax, `同 netAfterTax ＝ 納税後の年の増減`);
  put("year.interest", yr.interest, `同 interest ＝ 支払利息`);
  put("year.depreciation", yr.depreciation, `同 depreciation ＝ 減価償却費`);
  put("exitInf.noi", va.noiInflated, "valuation.noiInflated（NOIを年2%で伸ばした額）");
  put("exitInf.equity", va.equityInflated, "valuation.equityInflated（売却コスト前）");

  /* 銀行の完済年＝支払利息が最後に立つ年の翌年 */
  const lastInt = [...r.yearly].reverse().find((v) => Number(v.interest || 0) > 0);
  put("bank.paidOffYear", lastInt ? String(lastInt.year) : "—",
    "cashflow(360).yearly で支払利息が最後に立つ年＝銀行の完済年");

  /* 家族ファンドを年4%（利息のみ）に切り替えた場合。assumptions/family-fund は status:"proposed" */
  const ff = (await db.collection("assumptions").doc("family-fund").get()).data() ?? {};
  const RATE = Number(ff.targetRate ?? 0), SW = String(ff.switchMonth ?? "9999-12");
  const ym = (m, i) => { const [a, b] = m.split("-").map(Number); const t = a * 12 + b - 1 + i;
    return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, "0")}`; };
  const famYear = (year) => {
    let now = 0, plan = 0, nowInt = 0, planInt = 0;
    for (const L of famCorp) {
      const p = Number(L.principal || 0), st = L.firstPaymentMonth ?? null;
      const n = Number(L.totalPayments || 0), mp = Number(L.monthlyPayment || 0);
      let bal = p;
      if (st && n) for (let i = 0; i < n; i++) {
        const m = ym(st, i), it = Math.floor(bal * (Number(L.rate || 0) / 100) / 12);
        if (m.slice(0, 4) === String(year)) { now += mp; nowInt += it; }
        bal -= mp - it; if (m.slice(0, 4) > String(year)) break;
      }
      for (let i = 0; i < 12; i++) {
        const m = `${year}-${String(i + 1).padStart(2, "0")}`;
        const run = st ? (m >= st && (!n || m < ym(st, n))) : false, ih = st ? m >= st : true;
        if (m >= SW && ih) { plan += p * RATE / 12; planInt += p * RATE / 12; }
        else if (run) { plan += mp; planInt += Math.floor(p * (Number(L.rate || 0) / 100) / 12); }
      }
    }
    return { deltaCash: plan - now, deltaInt: planInt - nowInt, nowInt, planInt };
  };
  let left = Number(r.tax?.lossCarryforward ?? 0), cum = 0, cash4 = 0, iNow = 0, iPlan = 0;
  for (const v of r.yearly) {
    const f = famYear(Number(v.year));
    const pre = Number(v.pretax ?? 0) - f.deltaInt;
    const u = Math.min(Math.max(0, pre), left); left -= u;
    cum += -f.deltaCash + (Number(v.tax ?? 0) - corpTax(Math.max(0, pre - u), brackets));
    if (Number(v.year) <= Number(exitYear)) { iNow += f.nowInt; iPlan += f.planInt; }
    if (String(v.year) === exitYear) cash4 = Number(v.closingAfterTax ?? 0) + cum;
  }
  put("family.rate", RATE, "assumptions/family-fund.targetRate（status:proposed・承認は未取得）");
  put("family.switchMonth", String(ff.switchMonth ?? ""), "assumptions/family-fund.switchMonth");
  put("exit.cash4", cash4, `家族に年4%を払った場合の ${exitYear} 年の現金（税引後）`);
  put("family.interestNow", iNow, `いまの条件で ${exitYear} 年までに家族へ払う利息の累計`);
  put("family.interest4", iPlan, `年4%にした場合の同上`);
  put("family.interestDelta", iPlan - iNow, "上の2つの差＝家族が余分に受け取る利息");
  const exit4 = (e) => e.net + cash4 + va.investBalance - sum(famCorp);
  put("exit.hand4", exit4(flat), "4%版で手元に残る額（インフレなし）");
  put("exitInf.hand4", exit4(infl), "4%版で手元に残る額（インフレ2%）");
  put("family.companyDelta", exit4(flat) - hand(flat), "4%にしたときの会社の手元の増減");
  put("family.clanNet", (iPlan - iNow) + (exit4(flat) - hand(flat)),
    "家族の利息増 ＋ 会社の手元の増減＝一族全体の差（≒追加利息の節税分）");

  /* 個別の家族借入（章で名前とともに出すため）。lender+principal で引く */
  const famPick = (name, principal, entity = "corp") =>
    (entity === "corp" ? famCorp : famPersonal)
      .find((v) => String(v.lender).includes(name) && Number(v.principal) === principal);
  const famPut = (key, name, principal, entity, note) => {
    const d = famPick(name, principal, entity);
    if (d) put(key, Number(d.principal), `finance/${d.id}（${d.lender}・${d.rate ?? 0}%）${note ?? ""}`);
  };
  famPut("family.officer", "一慶", 93031628, "corp", "役員借入・返済予定なし");
  famPut("family.harunobuCorp", "晴信", 3000000, "corp", "返済予定なし");
  famPut("family.harunobuA", "晴信", 20000000, "personal", "個人債務");
  famPut("family.harunobuB", "眞佐子", 30000000, "personal", "個人債務");
  /* 期中に返し終わる2%の3本（240回） */
  const amort = famCorp.filter((v) => Number(v.totalPayments || 0) > 0);
  put("family.amortizingPrincipal", amort.reduce((s, v) => s + Number(v.principal || 0), 0),
    `finance entity="corp" で返済回数のある ${amort.length}件（2%・240回）＝期中に返し終わる元本`);
  put("family.total4at2050",
    sum(famCorp) + famPersonal.filter((v) => !Number(v.monthlyPayment || 0))
      .reduce((s, v) => s + Number(v.principal || 0), 0),
    "法人分の全額 ＋ 個人分のうち返済予定のないもの＝4%にした場合に出口年で残る一族の元本");

  /* いま／4% の年あたりの利息（切替の翌年で比較） */
  const y1 = famYear(Number(String(SW).slice(0, 4)) + 1);
  put("family.annualInterestNow", y1.nowInt, "切替の翌年に、いまの条件で家族へ払う利息");
  put("family.annualInterest4", y1.planInt, "同年に、年4%で家族へ払う利息");

  /* 会社側の増減（絶対値。章では「減る」と書くので符号は文章側が持つ） */
  put("family.companyDeltaAbs", Math.abs(exit4(flat) - hand(flat)), "4%にしたときの会社の手元の減少額");
  put("family.cashDeltaAbs", Math.abs(cash4 - va.cash), "4%にしたときの出口年の現金の減少額");
  put("family.interestDeltaOld", iPlan - iNow, "family.interestDelta と同じ（章の旧表記の互換）");

  /* 法人税が最初に立つ年 */
  const firstTax = r.yearly.find((v) => Number(v.tax || 0) > 0);
  put("tax.firstYearTax", firstTax ? Number(firstTax.tax) : 0,
    `cashflow(360).yearly で法人税が最初に立つ年（${firstTax?.year ?? "—"}）の税額`);
  put("tax.firstYear", firstTax ? String(firstTax.year) : "—", "同上の年");

  /* 銀行の最終年に返した元本（完済年の返済額の目安） */
  const bankRows = fin.filter((v) => v.entity === "corp" && BANKS.test(String(v.lender || "")));
  put("bank.lastPrincipal",
    bankRows.reduce((s, v) => s + Number(v.monthlyPayment || 0), 0) * 12,
    `finance の銀行 ${bankRows.length}件の月々の合計×12＝完済年に消える年間返済額`);

  /* 還元利回りの感応度。cap が 8% になったら */
  const at8 = va.noi / 0.08;
  put("exit.assetAt8", at8, "NOI ÷ 8.0%（還元利回りが2㌽上がった場合の不動産の価値）");
  const e8 = exit(at8);
  put("exit.handAt8", e8.net + va.cash + va.investBalance - va.loanBalance,
    "同上で手元に残る額（いまの条件・インフレなし）");

  /* 償却が尽きる年に、法人税がいくら増えるか（費用が消えるだけで現金は出ない） */
  const depEndIdx = r.yearly.findIndex((v) => Number(v.depreciation || 0) === 0
    && Number(v.income || 0) > 0 && !v.partial);
  if (depEndIdx > 0) {
    const before = r.yearly[depEndIdx - 1], after = r.yearly[depEndIdx];
    put("tax.depreciationEndYear", String(after.year), "減価償却が尽きる年（cashflow の yearly）");
    put("tax.depreciationEndDelta", Number(after.tax || 0) - Number(before.tax || 0),
      `同年の法人税 − 前年の法人税（${before.year}→${after.year}）`);
  }

  return V;
}
