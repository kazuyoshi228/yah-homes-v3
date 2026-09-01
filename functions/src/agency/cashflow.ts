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

export type CfMonth = {
  month: string; opening: number; income: number; incomeProjected: number; funding: number; outgo: number;
  net: number; closing: number;
  detail: { loans: number; fixed: number; reserves: number; utilities: number; build: number };
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
    const outgo = loans + input.fixedPerMonth + input.reservesPerMonth + input.utilitiesPerMonth + build;
    const net = input.monthlyIncome + incomeProjected + funding - outgo;
    const opening = bal;
    bal = bal + net;
    out.push({ month: ym, opening, income: input.monthlyIncome, incomeProjected, funding, outgo, net, closing: bal,
      detail: { loans, fixed: input.fixedPerMonth, reserves: input.reservesPerMonth,
        utilities: input.utilitiesPerMonth, build },
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
  const reservesYearly = resSnap.docs.reduce((a, d) => a + num(d.data().amountPerYear), 0);
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
  const loans = finSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Loan));
  const loanOutgoByMonth: Record<string, number> = {};
  let ym = startMonth;
  for (let i = 0; i < months; i++) {
    const at = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 15);
    loanOutgoByMonth[ym] = loans.reduce((a, l) => {
      try { return a + loanState(l, at).monthlyTotal; } catch { return a; }
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
    const m = String(b.date ?? "").slice(0, 7);
    if (!m) continue;
    (buildByMonth[m] ??= []).push({
      label: `${propLabel.get(String(b.prop ?? "")) ?? b.prop} ${b.kind}`, amount: num(b.amount) });
    for (const f of (b.funding ?? []) as Array<Record<string, unknown>>) {
      const src = String(f.source ?? "");
      fundingTotals[src] = (fundingTotals[src] ?? 0) + num(f.amount);
      if (f.inflow === false) continue;          // 手元資金からの充当は入金に数えない
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
    for (let i = 0; i < months; i++) {
      if (m >= from) {
        /* 同じ暦月（MM）の実績を新しい順に探す。無ければその棟の平均で埋める */
        const mm = m.slice(5);
        const hit = Object.keys(basis).filter((k) => k.slice(5) === mm).sort().at(-1);
        const vals = Object.values(basis);
        const amount = hit ? basis[hit]
          : vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
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
  const openingRaw = cfDoc.data()?.opening ?? (latestCash ? latestCash.total : null);
  const opening = openingRaw == null ? null : num(openingRaw);
  const openingFrom = cfDoc.data()?.opening != null ? "手入力（settings/cashflow.opening）"
    : latestCash ? `現金台帳 ${String(latestCash.id)} 時点` : "";
  const openingAccounts = ((latestCash?.accounts ?? []) as Array<Record<string, unknown>>)
    .map((a) => ({ name: String(a.name ?? ""), balance: num(a.balance), asOf: String(a.asOf ?? "") }));
  /* 口座ごとの残高の推移（銀行タブ用）。account ごとに日付順 */
  const balances: Record<string, Array<{ date: string; balance: number }>> = {};
  const bankLabel: Record<string, string> = {};
  for (const d of bankSnap.docs) {
    const b = d.data() as Record<string, unknown>;
    const a = String(b.account ?? "");
    if (!a || String(b.entity ?? "corp") !== "corp") continue;   // 法人の口座だけを見る
    bankLabel[a] = String(b.label ?? a);
    (balances[a] ??= []).push({ date: String(b.date ?? ""), balance: num(b.balance) });
  }
  for (const a of Object.keys(balances)) balances[a].sort((x, y) => x.date.localeCompare(y.date));
  const accounts = Object.keys(balances).map((a) => ({
    account: a, label: bankLabel[a], points: balances[a],
    latest: balances[a].at(-1) ?? null })).sort((x, y) => (y.latest?.balance ?? 0) - (x.latest?.balance ?? 0));
  const rows = projectCashflow({ startMonth, months, opening, monthlyIncome,
    fixedPerMonth, reservesPerMonth, utilitiesPerMonth, loanOutgoByMonth, buildByMonth,
    fundingByMonth, withFunding,
    projectedIncomeByMonth });

  return {
    asOf: asOf.toISOString().slice(0, 10), startMonth, rows,
    opening, openingFrom,
    openingAt: String(cfDoc.data()?.openingAt ?? latestCash?.id ?? ""),
    accounts, openingAccounts,
    assumptions: { monthlyIncome, fixedPerMonth, reservesPerMonth, utilitiesPerMonth,
      fixedBasis: "固定資産税・保険の年額÷12", reservesBasis: "修繕積立金の年額÷12",
      incomeBasis: recent.length ? `${recent[0]}〜${recent.at(-1)} の手取り平均` : "実績なし",
      utilitiesBasis: uRecent.length ? `${uRecent[0]}〜${uRecent.at(-1)} の平均` : "実績なし" },
    shortage: firstShortage(rows, opening != null),
    buildUnpaidTotal: Object.values(buildByMonth).flat().reduce((a, b) => a + b.amount, 0),
    fundingTotals, withFunding,
    projectionNotes: projections.map((pj) => ({ prop: String(pj.prop ?? ""), from: String(pj.from ?? ""),
      basis: String(pj.basis ?? ""), note: String(pj.note ?? "") })),
    projectedTotal: Object.values(projectedIncomeByMonth).flat().reduce((a, b) => a + b.amount, 0),
    fundingInflowTotal: Object.values(fundingByMonth).flat().reduce((a, b) => a + b.amount, 0),
  };
}
