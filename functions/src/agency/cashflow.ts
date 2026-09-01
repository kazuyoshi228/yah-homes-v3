/**
 * 資金繰り予測 — これから12ヶ月、現金が足りるか（2026-08-31 発注者指示）
 *
 * **何も保存しない。** 借入の返済表・固定費・光熱費の実績・工事の支払予定から毎回計算する。
 * 唯一、人が宣言するのが期首の現金残高（settings/cashflow.opening）——
 * 台帳から導けない一次事実で、これが無いと「いつ足りなくなるか」が出せない。
 *
 * 予測の置き方（画面にも明示する。隠れた仮定を作らない）:
 *   入金 … 直近N月の payout（運営会社からの手取り）の平均。棟ごとに積む
 *   出金 … 借入の毎月返済＋固定費の年額÷12＋光熱費の直近平均＋工事の支払予定（その月）
 * 「たぶん増える」は入れない。**実績と契約だけで組む**——楽観を混ぜると警報が鳴らなくなる
 */
import { agencyDb } from "./engine.js";
import { loanState, type Loan } from "./finance.js";
import { renewalPlan } from "./lifecycle.js";

export type CfMonth = {
  month: string; opening: number; income: number; incomeProjected: number; funding: number; outgo: number;
  net: number; closing: number;
  detail: { loans: number; fixed: number; reserves: number; utilities: number; build: number;
    officer: number };
  builds: Array<{ label: string; amount: number }>;
  fundings: Array<{ source: string; amount: number }>;
  projections: Array<{ prop: string; amount: number }>;
};

/** 月を1つ進める（純関数・テスト対象） */
export function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** 12ヶ月ぶんを積む（純関数・テスト対象）。opening が null なら残高は出さず増減だけ返す */
export function projectCashflow(input: {
  startMonth: string; months: number; opening: number | null;
  monthlyIncome: number; fixedPerMonth: number; reservesPerMonth: number; utilitiesPerMonth: number;
  loanOutgoByMonth: Record<string, number>;
  buildByMonth: Record<string, Array<{ label: string; amount: number }>>;
  /* 工事のための資金調達（外から入る分だけ）。手元資金からの充当は入れない——
     すでに期首残高に含まれているので、足すと二重に数えることになる */
  fundingByMonth?: Record<string, Array<{ source: string; amount: number }>>;
  withFunding?: boolean;
  /* 稼働予定の棟の入金（人の宣言に基づく見込み）。実績とは分けて持つ——
     見込みと実績を1つの数字に混ぜると、後から「どこまでが事実か」が分からなくなる */
  projectedIncomeByMonth?: Record<string, Array<{ prop: string; amount: number }>>;
  /* 稼働する部屋数の倍率（月→倍率）。固定費と光熱費は部屋数に比例して増える——
     いまは2部屋、六本松が入って3部屋、大手門2部屋が入って5部屋（2026-09-01 発注者指示）。
     未指定の月は 1（＝いまの部屋数のまま） */
  roomFactorByMonth?: Record<string, number>;
  /* 役員報酬（会社負担の社会保険料を含めた月あたりの現金支出）。
     現金が出るので残高に効き、経費なので課税所得も下げる */
  officerByMonth?: Record<string, number>;
  /* 修繕積立（現金→投資信託の振替）。現金は減るが法人の資産は減らない */
  reservesByMonth?: Record<string, number>;
}): CfMonth[] {
  const out: CfMonth[] = [];
  let bal = input.opening ?? 0;
  let ym = input.startMonth;
  for (let i = 0; i < input.months; i++) {
    const loans = input.loanOutgoByMonth[ym] ?? 0;
    const builds = input.buildByMonth[ym] ?? [];
    const build = builds.reduce((a, b) => a + b.amount, 0);
    const fundings = input.withFunding === false ? [] : (input.fundingByMonth?.[ym] ?? []);
    const funding = fundings.reduce((a, b) => a + b.amount, 0);
    const projections = input.projectedIncomeByMonth?.[ym] ?? [];
    const incomeProjected = projections.reduce((a, b) => a + b.amount, 0);
    const rf = input.roomFactorByMonth?.[ym] ?? 1;
    const fixed = Math.round(input.fixedPerMonth * rf);
    const utilities = Math.round(input.utilitiesPerMonth * rf);
    const officer = input.officerByMonth?.[ym] ?? 0;
    const reserves = input.reservesByMonth?.[ym] ?? input.reservesPerMonth;
    const outgo = loans + fixed + reserves + utilities + build + officer;
    const net = input.monthlyIncome + incomeProjected + funding - outgo;
    const opening = bal;
    bal = bal + net;
    out.push({ month: ym, opening, income: input.monthlyIncome, incomeProjected, funding, outgo, net, closing: bal,
      detail: { loans, fixed, reserves, utilities, build, officer },
      builds, fundings, projections });
    ym = nextMonth(ym);
  }
  return out;
}

/** 残高が初めてマイナスになる月（純関数・テスト対象）。opening 未設定なら null */
export function firstShortage(rows: CfMonth[], hasOpening: boolean): string | null {
  if (!hasOpening) return null;
  return rows.find((r) => r.closing < 0)?.month ?? null;
}

/** 手元の下限を割る月（純関数・テスト対象）。ショートより手前で気づくための線 */
export function belowFloor(rows: CfMonth[], hasOpening: boolean, floor: number): string[] {
  if (!hasOpening || !floor) return [];
  return rows.filter((r) => r.closing < floor).map((r) => r.month);
}

export async function cashflow(months = 12, asOf = new Date(), withFunding = true) {
  const db = agencyDb();
  const [finSnap, revSnap, taxSnap, insSnap, resSnap, utilSnap, bpSnap, cfDoc, propSnap,
    cashSnap, bankSnap] =
    await Promise.all([
      db.collection("finance").where("kind", "==", "loan").get(),
      db.collection("revenue").where("kind", "==", "monthly").get(),
      db.collection("taxes").get(), db.collection("insurance").get(), db.collection("reserves").get(),
      db.collection("utilities").get(), db.collection("buildPayments").get(),
      db.collection("settings").doc("cashflow").get(),
      db.collection("properties").get(),
      db.collection("cash").get(),
      db.collection("bankBalances").get(),
    ]);
  const num = (v: unknown) => Number(v ?? 0) || 0;
  const jst = new Date(asOf.getTime() + 9 * 3600e3);
  const startMonth = `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;

  /* 入金: 直近6ヶ月の payout の月平均（棟の合計）。実績が無ければ0 */
  const byMonth: Record<string, number> = {};
  for (const d of revSnap.docs) {
    const r = d.data() as { month?: string; payout?: number };
    if (!r.month) continue;
    byMonth[r.month] = (byMonth[r.month] ?? 0) + num(r.payout);
  }
  const recent = Object.keys(byMonth).sort().slice(-6);
  const monthlyIncome = recent.length
    ? Math.round(recent.reduce((a, m) => a + byMonth[m], 0) / recent.length) : 0;

  /* 出金: 固定費（年額÷12）・光熱費（直近6ヶ月平均） */
  /* 固定費と修繕積立金は列を分ける（2026-09-01 発注者指示）。
     積立は「将来の修繕に備えて取り分けるお金」で、税や保険とは性格が違う——
     混ぜると、削れない支出と自分で決めた支出の区別がつかなくなる */
  const fixedYearly = taxSnap.docs.reduce((a, d) => a + num(d.data().amountPerYear), 0)
    + insSnap.docs.reduce((a, d) => a + num(d.data().premiumPerYear), 0);
  /* 積立は cashOutflow=false なら出金に数えない（2026-09-01 発注者判断A）。
     福岡銀行内の投資信託へ移すだけで、現金が投資信託に姿を変えるだけ＝法人の資産は減らない。
     ただし投資信託はすぐ現金化できるとは限らないので、現金とは分けて資産に出す */
  const reservesYearly = resSnap.docs
    .filter((d) => d.data().cashOutflow !== false)
    .reduce((a, d) => a + num(d.data().amountPerYear), 0);
  const reservesInvested = resSnap.docs
    .filter((d) => d.data().cashOutflow === false)
    .reduce((a, d) => a + num(d.data().amountPerYear), 0);
  const fixedPerMonth = Math.round(fixedYearly / 12);
  const reservesPerMonth = Math.round(reservesYearly / 12);
  const uByMonth: Record<string, number> = {};
  for (const d of utilSnap.docs) {
    const u = d.data() as { month?: string; amount?: number };
    if (!u.month) continue;
    uByMonth[u.month] = (uByMonth[u.month] ?? 0) + num(u.amount);
  }
  const uRecent = Object.keys(uByMonth).sort().slice(-6);
  const utilitiesPerMonth = uRecent.length
    ? Math.round(uRecent.reduce((a, m) => a + uByMonth[m], 0) / uRecent.length) : 0;

  /* 借入: 月ごとに返済表を引き直す（据置・利息のみ・完済も正しく効く） */
  /* 年次の表のために、月ごとの前提は30年ぶん作っておく（2026-09-01 発注者指示）。
     12ヶ月の表は同じ表から先頭だけを見るので、数字は必ず一致する */
  const LONG = 360;
  const loans = finSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Loan));
  const loanOutgoByMonth: Record<string, number> = {};
  /* 支払利息は経費、元金の返済は経費ではない。課税所得を出すのに利息だけを取り分ける */
  const loanInterestByMonth: Record<string, number> = {};
  let ym = startMonth;
  for (let i = 0; i < LONG; i++) {
    const at = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 15);
    loanOutgoByMonth[ym] = loans.reduce((a, l) => {
      try { return a + loanState(l, at).monthlyTotal; } catch { return a; }
    }, 0);
    loanInterestByMonth[ym] = loans.reduce((a, l) => {
      try { const st = loanState(l, at); return a + (st.monthlyTotal > 0 ? st.interestThisMonth : 0); } catch { return a; }
    }, 0);
    ym = nextMonth(ym);
  }

  /* 工事の支払予定（未払のみ） */
  const propLabel = new Map(propSnap.docs.map((d) => [d.id, String(d.data().label ?? d.id)]));
  const buildByMonth: Record<string, Array<{ label: string; amount: number }>> = {};
  const fundingByMonth: Record<string, Array<{ source: string; amount: number }>> = {};
  const fundingTotals: Record<string, number> = {};
  for (const d of bpSnap.docs) {
    const b = d.data() as Record<string, unknown>;
    if (b.paid === true) continue;
    const raw = String(b.date ?? "").slice(0, 7);
    if (!raw) continue;
    /* 期日を過ぎてもまだ払っていない分は、初月に繰り上げて必ず数える。
       窓の外（過去月）に落ちると、未払いなのに予測から消えてしまう
       （2026-09-01 発覚: 大手門着工¥20,000,000が8/31期日で消えていた） */
    const overdue = raw < startMonth;
    const m = overdue ? startMonth : raw;
    (buildByMonth[m] ??= []).push({
      label: `${propLabel.get(String(b.prop ?? "")) ?? b.prop} ${b.kind}`
        + (overdue ? `（${raw} 期日・未払い）` : ""), amount: num(b.amount) });
    for (const f of (b.funding ?? []) as Array<Record<string, unknown>>) {
      const src = String(f.source ?? "");
      fundingTotals[src] = (fundingTotals[src] ?? 0) + num(f.amount);
      if (f.inflow === false) continue;          // 手元資金・入金済みは将来の入金に数えない
      (fundingByMonth[m] ??= []).push({ source: src, amount: num(f.amount) });
    }
  }

  /* 稼働予定の棟（settings/cashflow.projections・人の宣言）。
     basis の棟の「同じ暦月の手取り実績」をそのまま当てる＝カーブも金額も同じ */
  const payoutByPropMonth: Record<string, Record<string, number>> = {};
  for (const d of revSnap.docs) {
    const r = d.data() as { prop?: string; month?: string; payout?: number };
    if (!r.prop || !r.month) continue;
    (payoutByPropMonth[r.prop] ??= {})[r.month] = num(r.payout);
  }
  const projectedIncomeByMonth: Record<string, Array<{ prop: string; amount: number }>> = {};
  const projections = (cfDoc.data()?.projections ?? []) as Array<Record<string, unknown>>;
  for (const pj of projections) {
    const basis = payoutByPropMonth[String(pj.basis ?? "")] ?? {};
    const from = String(pj.from ?? "");
    let m = startMonth;
    for (let i = 0; i < LONG; i++) {
      if (m >= from) {
        /* 同じ暦月（MM）の実績を新しい順に探す。無ければその棟の平均で埋める */
        const mm = m.slice(5);
        const hit = Object.keys(basis).filter((k) => k.slice(5) === mm).sort().at(-1);
        const vals = Object.values(basis);
        const one = hit ? basis[hit]
          : vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
        /* units = 稼働する部屋数。大手門は2部屋なので basis（高砂1部屋）の2倍（2026-09-01 発注者指示） */
        const amount = one * Math.max(1, num(pj.units) || 1);
        if (amount) (projectedIncomeByMonth[m] ??= []).push({ prop: String(pj.prop ?? ""), amount });
      }
      m = nextMonth(m);
    }
  }

  /* 期首残高は現金台帳（cash）の最新スナップショットを使う。
     人が settings/cashflow.opening を置いていればそちらが勝つ（手で上書きしたいとき用） */
  const cashDocs: Array<Record<string, unknown>> = cashSnap.docs
    .filter((d) => d.data().superseded !== true)
    .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const latestCash = cashDocs.at(-1) ?? null;
  /* 手元の下限（人が決める線）。ショートしてからでは遅いので、その手前で警告する */
  const floor = num(cfDoc.data()?.floor);
  const openingRaw = cfDoc.data()?.opening ?? (latestCash ? latestCash.total : null);
  const opening = openingRaw == null ? null : num(openingRaw);
  const openingFrom = cfDoc.data()?.opening != null ? "手入力（settings/cashflow.opening）"
    : latestCash ? `現金台帳 ${String(latestCash.id)} 時点` : "";
  const openingAccounts = ((latestCash?.accounts ?? []) as Array<Record<string, unknown>>)
    .map((a) => ({ name: String(a.name ?? ""), balance: num(a.balance), asOf: String(a.asOf ?? "") }));
  /* 口座ごとの残高の推移（銀行タブ用）。account ごとに日付順 */
  const balances: Record<string, Array<{ date: string; balance: number }>> = {};
  const bankLabel: Record<string, string> = {};
  /* 現金（cash）と、すぐ現金化できるとは限らない資産（investment）を分ける */
  const bankKind: Record<string, string> = {};
  for (const d of bankSnap.docs) {
    const b = d.data() as Record<string, unknown>;
    const a = String(b.account ?? "");
    if (!a || String(b.entity ?? "corp") !== "corp") continue;   // 法人の口座だけを見る
    bankKind[a] = String(b.kind ?? "cash");
    bankLabel[a] = String(b.label ?? a);
    (balances[a] ??= []).push({ date: String(b.date ?? ""), balance: num(b.balance) });
  }
  for (const a of Object.keys(balances)) balances[a].sort((x, y) => x.date.localeCompare(y.date));
  const accounts = Object.keys(balances).map((a) => ({
    account: a, label: bankLabel[a], kind: bankKind[a] ?? "cash", points: balances[a],
    latest: balances[a].at(-1) ?? null })).sort((x, y) => (y.latest?.balance ?? 0) - (x.latest?.balance ?? 0));
  /* 投資信託への積立額は台帳（reserves の cashOutflow=false）から出す。画面に金額を焼き込まない */
  const investedMonthly = Math.round(reservesInvested / 12);
  const accountsOut = accounts.map((a) => a.kind === "investment"
    ? { ...a, monthly: investedMonthly } : a);
  const investmentTotal = accounts.filter((a) => a.kind === "investment")
    .reduce((t, a) => t + (a.latest?.balance ?? 0), 0);
  const [taxDoc, depSnap, ownerDoc, ocDoc, rpDoc, eqSnap2, capDoc, plan] = await Promise.all([
    db.collection("assumptions").doc("corporate-tax").get(),
    db.collection("depreciation").get(),
    db.collection("settings").doc("owner").get(),
    db.collection("assumptions").doc("officer-comp").get(),
    db.collection("assumptions").doc("reserve-plan").get(),
    db.collection("equipment").where("kind", "==", "equipment").get(),
    db.collection("assumptions").doc("cap-rate").get(),
    renewalPlan(),
  ]);
  /* 償却台帳に無い有償の設備の数（画面の注記をデータから作るために数える） */
  const eqCount = eqSnap2.docs.filter((d) => Number(d.data().price ?? 0) > 0).length;
  /* 修繕積立: 1部屋あたり月◯円を投資信託へ振り替える。現金は減るが法人の資産は減らない */
  const reservePerRoom = num(rpDoc.data()?.perRoomPerMonth);
  /* 長期修繕: 更新計画のタイムライン（年→金額）。まず投資信託から充てる */
  const repairByYear: Record<string, number> = {};
  for (const t of (plan.timeline ?? []) as Array<{ year: number; amount: number }>) {
    repairByYear[String(t.year)] = (repairByYear[String(t.year)] ?? 0) + num(t.amount);
  }
  const capRate = Number(capDoc.data()?.value ?? capDoc.data()?.rate ?? 0);
  /* 部屋数の推移。いまの稼働部屋数（settings/cashflow.baseRooms・既定2）を起点に、
     稼働予定の棟が入るたび units ぶん増やす。固定費と光熱費はこの比で増やす
     ——1部屋あたりの負担は今の実績から割り出す（2026-09-01 発注者指示） */
  const baseRooms = Math.max(1, num(cfDoc.data()?.baseRooms) || 2);
  const roomsByMonth: Record<string, number> = {};
  /* 積立は部屋数に比例する（部屋あたり月◯円） */
  const reservesByMonth: Record<string, number> = {};
  const roomFactorByMonth: Record<string, number> = {};
  {
    let m = startMonth;
    for (let i = 0; i < LONG; i++) {
      const added = projections
        .filter((pj) => m >= String(pj.from ?? ""))
        .reduce((a, pj) => a + Math.max(1, num(pj.units) || 1), 0);
      roomsByMonth[m] = baseRooms + added;
      roomFactorByMonth[m] = roomsByMonth[m] / baseRooms;
      reservesByMonth[m] = reservePerRoom * roomsByMonth[m];
      m = nextMonth(m);
    }
  }

  /* 「もし追加融資を受けたら」の見立て（settings/cashflow.scenario・人の宣言）。
     実績でも確定でもないので本体の予測とは別に持ち、画面のボタンで切り替える。
     返済条件が未定のため返済は含めない——含めないことを画面に明記する */
  const sc = (cfDoc.data()?.scenario ?? null) as Record<string, unknown> | null;
  const scenario = sc && num(sc.amount) ? {
    label: String(sc.label ?? "追加融資あり"), month: String(sc.month ?? ""),
    amount: num(sc.amount), source: String(sc.source ?? ""), date: String(sc.date ?? ""),
    note: String(sc.note ?? ""),
    /* 返済条件（既存の福岡銀行¥50,000,000と同等・人の宣言）。
       実在の借入ではないので finance には入れず、この見立ての中だけで返済を積む */
    loan: (sc.loan ?? null) as Loan | null,
  } : null;

  /* 追加融資を受けたときの返済。既存の返済に上乗せする */
  const loanOutgoAlt: Record<string, number> = { ...loanOutgoByMonth };
  if (scenario?.loan) {
    let m = startMonth;
    for (let i = 0; i < LONG; i++) {
      const at = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 15);
      try { loanOutgoAlt[m] = (loanOutgoAlt[m] ?? 0) + loanState(scenario.loan, at).monthlyTotal; } catch { /* 条件が足りなければ足さない */ }
      m = nextMonth(m);
    }
  }

  /* 役員報酬（assumptions/officer-comp・人の判断）。開始月ごとに年額が変わる。
     会社負担の社会保険料を上乗せした額が、毎月の現金支出になる */
  const ocBurden = 1 + Number(ocDoc.data()?.employerBurdenRate ?? 0);
  const ocSchedule = ((ocDoc.data()?.schedule ?? []) as Array<Record<string, unknown>>)
    .map((x) => ({ from: String(x.from ?? ""), annual: num(x.annual) }))
    .filter((x) => x.from).sort((a, b) => a.from.localeCompare(b.from));
  const officerByMonth: Record<string, number> = {};
  {
    let m = startMonth;
    for (let i = 0; i < LONG; i++) {
      const hit = [...ocSchedule].reverse().find((x) => m >= x.from);
      officerByMonth[m] = hit ? Math.round((hit.annual * ocBurden) / 12) : 0;
      m = nextMonth(m);
    }
  }
  /* 年次の表に「その年に何歳か」を出す。30年の表は人生の時間割でもある（2026-09-01 発注者指示） */
  const birth = String(ownerDoc.data()?.birthDate ?? "");
  const ownerName = String(ownerDoc.data()?.name ?? "");
  const rows = projectCashflow({ startMonth, months, opening, monthlyIncome,
    fixedPerMonth, reservesPerMonth, utilitiesPerMonth, roomFactorByMonth, officerByMonth, reservesByMonth, loanOutgoByMonth, buildByMonth,
    fundingByMonth, withFunding,
    projectedIncomeByMonth });

  /* 追加融資ありの見立て。調達の月に1件足すだけで、他の前提は本体とまったく同じ */
  const rowsAlt = scenario ? projectCashflow({ startMonth, months, opening, monthlyIncome,
    fixedPerMonth, reservesPerMonth, utilitiesPerMonth, roomFactorByMonth,
    officerByMonth, reservesByMonth, loanOutgoByMonth: loanOutgoAlt, buildByMonth,
    fundingByMonth: { ...fundingByMonth,
      [scenario.month]: [...(fundingByMonth[scenario.month] ?? []),
        { source: scenario.source || scenario.label, amount: scenario.amount }] },
    withFunding, projectedIncomeByMonth }) : null;

  /* 年次の表。月次と同じ前提で30年ぶん積み、暦年で束ねる。
     売上・固定費・光熱費は今の水準を横に置くだけ——物価の上昇も、大規模修繕も、
     次の物件も含まない。だから「借入をこのまま返せるか」を見るための表であって、
     事業計画ではない（画面にもそう書く） */
  const rowsLong = projectCashflow({ startMonth, months: LONG, opening, monthlyIncome,
    fixedPerMonth, reservesPerMonth, utilitiesPerMonth, roomFactorByMonth, officerByMonth, reservesByMonth, loanOutgoByMonth, buildByMonth,
    fundingByMonth, withFunding, projectedIncomeByMonth });
  /* 法人税（assumptions/corporate-tax・人の判断）。
     課税所得＝売上−固定費−光熱費−支払利息。減価償却は台帳に無いので含めない
     ——そのぶん税額は多めに出る（資金繰りを見る目的では安全側）。
     繰越欠損金を先に充当し、納付は決算の翌年に起きるものとして現金から引く */
  /* 減価償却（定額法）。取得価額 ÷ 耐用年数 を、事業供用の月から月割りで積む。
     現金は出ないので資金繰りの残高には効かない——効くのは課税所得だけ */
  const depAssets = depSnap.docs.map((d) => {
    const a = d.data() as { cost?: number; years?: number; startMonth?: string; label?: string;
      prop?: string; immediate?: boolean };
    return { label: String(a.label ?? d.id), prop: String(a.prop ?? ""),
      cost: num(a.cost), years: Math.max(1, num(a.years) || 1), startMonth: String(a.startMonth ?? ""),
      /* 少額減価償却資産（30万円未満）は供用した年に全額が損金になる。月割りしない */
      immediate: a.immediate === true };
  }).filter((a) => a.cost > 0 && a.startMonth);
  /* 月ごとの償却額。耐用年数を過ぎたら止める */
  const depByMonth: Record<string, number> = {};
  {
    let m = startMonth;
    for (let i = 0; i < LONG; i++) {
      depByMonth[m] = depAssets.reduce((acc, a) => {
        if (m < a.startMonth) return acc;
        if (a.immediate) return acc + (m === a.startMonth ? a.cost : 0);
        const elapsed = monthsBetweenYm(a.startMonth, m);
        if (elapsed >= a.years * 12) return acc;
        return acc + a.cost / a.years / 12;
      }, 0);
      m = nextMonth(m);
    }
  }

  const taxRate = Number(taxDoc.data()?.rate ?? 0);
  /* 段階税率（2026-09-01 発注者決定）。上から順に、その帯に入るぶんだけ税率を当てる。
     brackets が無ければ従来どおり rate 一本で計算する */
  const brackets = ((taxDoc.data()?.brackets ?? []) as Array<Record<string, unknown>>)
    .map((b) => ({ upTo: b.upTo == null ? Infinity : num(b.upTo), rate: Number(b.rate ?? 0),
      label: String(b.label ?? "") }));
  const taxOf = (income: number): number => {
    if (income <= 0) return 0;
    if (!brackets.length) return Math.round(income * taxRate);
    let left = income, prev = 0, t = 0;
    for (const b of brackets) {
      const span = Math.max(0, Math.min(income, b.upTo) - prev);
      if (span <= 0) { prev = b.upTo; continue; }
      t += span * b.rate; left -= span; prev = b.upTo;
      if (left <= 0) break;
    }
    return Math.round(t);
  };
  const payDelay = Math.max(0, num(taxDoc.data()?.payDelayYears) || 0);
  let lossLeft = num(taxDoc.data()?.lossCarryforward);
  const lossAtStart = lossLeft;

  const yearsSet = [...new Set(rowsLong.map((r) => r.month.slice(0, 4)))];
  const yearly = yearsSet.map((year) => {
    const rs = rowsLong.filter((r) => r.month.startsWith(year));
    const add = (f: (r: typeof rs[number]) => number) => rs.reduce((a, r) => a + f(r), 0);
    /* 暦年の年末（12/31）時点の年齢。誕生日を迎えているかで1歳変わるので、日付で見る */
    const age = birth
      ? Number(year) - Number(birth.slice(0, 4)) - (`${year}-12-31` >= `${year}-${birth.slice(5)}` ? 0 : 1)
      : null;
    return {
      year, months: rs.length, age,
      partial: rs.length < 12,          // 初年と最終年は途中から/途中まで
      opening: rs[0].opening, closing: rs.at(-1)!.closing,
      income: add((r) => r.income + r.incomeProjected),
      funding: add((r) => r.funding),
      loans: add((r) => r.detail.loans),
      fixed: add((r) => r.detail.fixed),
      utilities: add((r) => r.detail.utilities),
      reserves: add((r) => r.detail.reserves),
      build: add((r) => r.detail.build),
      net: add((r) => r.net),
      interest: rs.reduce((a, r) => a + (loanInterestByMonth[r.month] ?? 0), 0),
      officer: add((r) => r.detail.officer),
      reserves2: add((r) => r.detail.reserves),          // 投資信託への積立（現金→投信）
      repair: repairByYear[year] ?? 0,                    // 長期修繕（更新計画のタイムライン）
      /* その年末の借入残高。返済が進むほど純資産が増える */
      loanBalance: (() => {
        const at = new Date(Number(year), 11, 31);
        return Math.round(loans.reduce((acc, l) => {
          try { return acc + loanState(l, at).balance; } catch { return acc; }
        }, 0));
      })(),
      /* 減価償却は現金が出ないので残高には効かない。課税所得を下げるためだけに使う */
      depreciation: Math.round(rs.reduce((a, r) => a + (depByMonth[r.month] ?? 0), 0)),
      /* その年でいちばん薄い月。年末だけ見ていると、途中の谷を見落とす */
      worst: rs.reduce((m, r) => (r.closing < m.closing ? r : m), rs[0]).month,
      worstClosing: rs.reduce((m, r) => (r.closing < m.closing ? r : m), rs[0]).closing,
    };
  });

  /* 税額を年ごとに出す。繰越欠損金は古い年から順に食う */
  const taxed: Array<{ tax: number; closing: number }> = [];
  for (const a of yearly) {
    const pretax = a.income - a.fixed - a.utilities - a.interest - a.depreciation - a.officer;
    const used = pretax > 0 ? Math.min(lossLeft, pretax) : 0;
    lossLeft -= used;
    const taxable = Math.max(0, pretax - used);
    Object.assign(a, {
      pretax, lossUsed: used, lossLeft, taxable,
      tax: taxOf(taxable),
    });
    taxed.push({ tax: taxOf(taxable), closing: a.closing });
  }
  /* 投資信託の残高。いまの残高から始めて、毎年の積立を足し、長期修繕を先に充てる。
     足りないぶんは現金から出る（cashShort）——積立が足りているかがここで見える */
  let inv = investmentTotal;
  for (const a of yearly as unknown as Array<Record<string, number | string>>) {
    const add2 = Number(a.reserves2 ?? 0);
    const rep = Number(a.repair ?? 0);
    inv += add2;
    const fromInv = Math.min(inv, rep);
    inv -= fromInv;
    Object.assign(a, { investBalance: Math.round(inv),
      repairFromInvestment: Math.round(fromInv), repairFromCash: Math.round(rep - fromInv) });
  }

  /* 納付は翌年に起きる。税引後の残高は、その年までに納めた税の累計を引いたもの */
  let paidSoFar = 0;
  for (let i = 0; i < yearly.length; i++) {
    const due = i - payDelay >= 0 ? taxed[i - payDelay].tax : 0;
    paidSoFar += due;
    Object.assign(yearly[i], { taxPaid: due, closingAfterTax: taxed[i].closing - paidSoFar });
  }

  /* 企業価値（2026-09-01 発注者指示）。
     不動産の収益還元価値（NOI ÷ 還元利回り）＋ 現金 ＋ 投資信託 − 借入残高。
     NOIは「売上 − 固定費 − 光熱費 − 長期修繕の年割り」——減価償却・支払利息・役員報酬・法人税は引かない
     （買い手はその物件から得られる収益を見るため）。還元利回りは assumptions/cap-rate */
  const valuation = yearly.map((a) => {
    const x = a as unknown as Record<string, number | string>;
    const noi = Number(x.income) - Number(x.fixed) - Number(x.utilities) - Number(x.reserves2);
    const asset = capRate > 0 ? Math.round(noi / capRate) : 0;
    const cash = Number(x.closingAfterTax ?? x.closing);
    const equity = asset + cash + Number(x.investBalance ?? 0) - Number(x.loanBalance ?? 0);
    return { year: String(x.year), noi: Math.round(noi), capRate, asset, cash,
      investBalance: Number(x.investBalance ?? 0), loanBalance: Number(x.loanBalance ?? 0), equity };
  });

  return {
    scenario, rowsAlt, yearly, valuation,
    reservePlan: { perRoomPerMonth: reservePerRoom, investmentNow: investmentTotal },
    owner: birth ? { name: ownerName, birthDate: birth } : null,
    officerComp: { schedule: ocSchedule, employerBurdenRate: ocBurden - 1,
      perMonth: officerByMonth[startMonth] ?? 0 },
    tax: { rate: taxRate, brackets, lossCarryforward: lossAtStart, lossLeft, payDelayYears: payDelay,
      note: String(taxDoc.data()?.note ?? ""),
      assets: depAssets.map((a) => ({ label: a.label, cost: a.cost, years: a.years,
        startMonth: a.startMonth, immediate: a.immediate,
        perYear: a.immediate ? a.cost : Math.round(a.cost / a.years) })),
      /* 償却台帳に載っていないものを**データから**出す。文章に書き込むと実態とずれる
         （2026-09-01: 清川・高砂を登録したあとも「未登録」と書いた注記が残っていた） */
      missing: {
        props: propSnap.docs
          .filter((d) => ["稼働中", "準備中"].includes(String(d.data().status ?? "")))
          .filter((d) => !depAssets.some((a) => a.prop === d.id))
          .map((d) => String(d.data().label ?? d.id)),
        equipmentCount: eqCount,
      } },
    shortageAlt: rowsAlt ? firstShortage(rowsAlt, opening != null) : null,
    belowFloorAlt: rowsAlt ? belowFloor(rowsAlt, opening != null, floor) : [],
    asOf: asOf.toISOString().slice(0, 10), startMonth, rows,
    opening, openingFrom,
    openingAt: String(cfDoc.data()?.openingAt ?? latestCash?.id ?? ""),
    accounts: accountsOut, openingAccounts, investmentTotal,
    assumptions: { monthlyIncome, fixedPerMonth, reservesPerMonth, utilitiesPerMonth,
      fixedBasis: "固定資産税・保険の年額÷12",
      reservesBasis: reservesYearly ? "修繕積立金の年額÷12" : "投資信託への積立のため出金に数えない",
      investedPerMonth: Math.round(reservesInvested / 12),
      incomeBasis: recent.length ? `${recent[0]}〜${recent.at(-1)} の手取り平均` : "実績なし",
      utilitiesBasis: uRecent.length ? `${uRecent[0]}〜${uRecent.at(-1)} の平均` : "実績なし" },
    shortage: firstShortage(rows, opening != null),
    floor, belowFloor: belowFloor(rows, opening != null, floor),
    floorNote: String(cfDoc.data()?.floorNote ?? ""),
    buildUnpaidTotal: Object.values(buildByMonth).flat().reduce((a, b) => a + b.amount, 0),
    fundingTotals, withFunding,
    baseRooms, roomsByMonth,
    projectionNotes: projections.map((pj) => ({ prop: String(pj.prop ?? ""), from: String(pj.from ?? ""),
      units: Math.max(1, num(pj.units) || 1),
      basis: String(pj.basis ?? ""), note: String(pj.note ?? "") })),
    projectedTotal: Object.values(projectedIncomeByMonth).flat().reduce((a, b) => a + b.amount, 0),
    fundingInflowTotal: Object.values(fundingByMonth).flat().reduce((a, b) => a + b.amount, 0),
  };
}

/** yyyy-mm どうしの月差（a から b まで。b が前なら負） */
function monthsBetweenYm(a: string, b: string): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
}
