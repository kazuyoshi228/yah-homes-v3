/**
 * 金額計算の自動テスト（2026-08-27 発注者承認「やれることやって」）。
 * 対象は3本: loanState（残債・月々）/ aggregateFacts（facts合計）/ classifyOverdue（期日判定）。
 * 実行: npm test（CI は tsc の後に必ず回す——今日の「旧コードのままメール送信」型の事故の再発防止）。
 * 日付は全て固定して渡す（new Date() を裸で使うと日によって結果が変わるテストになる）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loanState, past12Months, monthsBetween, type Loan } from "./finance.js";
import { classifyOverdue } from "./engine.js";
import { aggregateFacts, type Fact } from "./facts.js";
import { judgeProbe, summarizeProbes, PROBES } from "./aicheck.js";
import { parseSchemaMd, parseFieldCell } from "./schemaparse.js";
import { parseTimeName, yoy } from "./tourism.js";
import { liabilityAmount, liabilityAmountWithBasis } from "./bs.js";
import { loanYear, loanBalanceAtYearEnd } from "./finance.js";
import { projectCashflow, nextMonth, firstShortage, belowFloor } from "./cashflow.js";
import { aggregateAiWeek } from "./weekly.js";
import { DOCUMENTED } from "./schemadoc.js";
import type { Job } from "./model.js";

/* ── loanState ─────────────────────────────────────────── */

const annuity: Loan = {
  id: "t-annuity", lender: "テスト銀行", repayment: "annuity",
  principal: 50_000_000, rate: 1.5, totalPayments: 240,
  firstPayment: 0, monthlyPayment: 241_264,   // 元利均等 1.5%・240回の定額（式値・端数は最終回調整）
  firstPaymentMonth: "2023-01",
};

test("元利均等: 元金残高＋返済済み元金＝借入額（どの時点でも）", () => {
  for (const asOf of [new Date("2023-06-15"), new Date("2030-01-15"), new Date("2040-06-15")]) {
    const st = loanState(annuity, asOf);
    assert.equal(st.paidPrincipal + st.balance, annuity.principal);
  }
});

test("元利均等: 完済時点で残高0・進捗100%・月々0", () => {
  const st = loanState(annuity, new Date("2043-06-15"));   // 240回目（2042-12）より後
  assert.equal(st.balance, 0);
  assert.equal(st.progress, 100);
  assert.equal(st.monthlyTotal, 0);
  assert.equal(st.remainingCount, 0);
});

test("元利均等: 返済中の月々は定額・残高は毎月減る", () => {
  const a = loanState(annuity, new Date("2025-03-15"));
  const b = loanState(annuity, new Date("2025-04-15"));
  assert.equal(a.monthlyTotal, annuity.monthlyPayment);
  assert.ok(b.balance < a.balance, "残高が減っていない");
  assert.ok(a.balance < annuity.principal);
});

const principalEqual: Loan = {
  id: "t-pe", lender: "テスト公庫", repayment: "principal-equal",
  principal: 30_000_000, rate: 2.0, totalPayments: 240,
  firstPayment: 125_000, monthlyPayment: 125_000,
  firstPaymentMonth: "2026-01",
};

test("元金均等: 残高整合と概算利息（残高×年利÷12）", () => {
  const st = loanState(principalEqual, new Date("2026-08-15"));   // 7回支払い済み（当月は未払い）
  assert.equal(st.paidCount, 7);
  assert.equal(st.paidPrincipal, 125_000 * 7);
  assert.equal(st.balance, 30_000_000 - 125_000 * 7);
  assert.equal(st.interestThisMonth, Math.round((st.balance * 0.02) / 12));
  assert.equal(st.monthlyTotal, 125_000 + st.interestThisMonth);
});

test("返済開始前: 月々0・残債は満額のまま", () => {
  const st = loanState(principalEqual, new Date("2025-06-15"));
  assert.equal(st.notStarted, true);
  assert.equal(st.monthlyTotal, 0);
  assert.equal(st.balance, principalEqual.principal);
});

const grace: Loan = {
  id: "t-grace", lender: "テスト銀行2", repayment: "grace",
  principal: 100_000_000, rate: 2.25, totalPayments: 180, repaymentMonths: 180,
  repaymentStartMonth: "2027-04",
  firstPayment: 555_555, monthlyPayment: 555_555,
  firstPaymentMonth: "2026-01",
};

test("据置中: 出ていくのは利息だけ・元金は1円も減らない", () => {
  const st = loanState(grace, new Date("2026-08-15"));
  assert.equal(st.balance, grace.principal);
  assert.equal(st.paidPrincipal, 0);
  assert.equal(st.monthlyTotal, Math.round((grace.principal * 0.0225) / 12));
  assert.equal(st.graceUntil, "2027-04");
});

test("据置明け: 元金均等として残高が減り始める", () => {
  const st = loanState(grace, new Date("2027-06-15"));   // 開始2ヶ月後
  assert.ok(st.balance < grace.principal);
  assert.equal(st.paidPrincipal + st.balance, grace.principal);
});

test("past12Months: 途中で始まった借入を12ヶ月分に膨らませない", () => {
  /* 2026-03 開始の借入を 2026-08 時点で見る＝実績は5回ぶん（当月は未払い） */
  const young: Loan = { ...principalEqual, firstPaymentMonth: "2026-03" };
  const sum = past12Months(young, new Date("2026-08-15"));
  const one = loanState(young, new Date("2026-07-15"));
  assert.ok(sum < (125_000 + 60_000) * 12, "12ヶ月分として数えている");
  assert.ok(sum >= one.monthlyTotal * 4, "実績月ぶんが入っていない");
});

test("monthsBetween: 年またぎ", () => {
  assert.equal(monthsBetween("2025-11", "2026-02"), 3);
  assert.equal(monthsBetween("2026-01", "2026-01"), 0);
});

/* ── classifyOverdue（期日判定） ─────────────────────────── */

const NOW = new Date("2026-08-27T03:00:00+09:00");
const job = (over: Partial<Job & { plantingDate?: string }>): Job & { plantingDate?: string } =>
  ({ type: "periodic", title: "テスト作業", prop: "kiyokawa", trigger: "t", status: "draft",
     dueMonth: "2026-08", statutory: false, timeline: [], createdAt: "", updatedAt: "", ...over } as Job);

test("実施日が明日の confirmed は警告しない（2026-08-27の植栽誤報の再発防止）", () => {
  assert.equal(classifyOverdue(job({ status: "confirmed", plantingDate: "2026-08-28" }), NOW), null);
});

test("実施日を過ぎた confirmed は日数つきで超過", () => {
  const c = classifyOverdue(job({ status: "confirmed", plantingDate: "2026-08-26" }), NOW);
  assert.equal(c?.level, "warn");
  assert.match(c!.reason, /期日を1日超過/);   // 8/26 23:59 期日 → 8/27 03:00 時点で1日超過（端数は安全側に切り上がる）
  assert.equal(c?.dueLabel, "2026-08-26");
});

test("月ジョブは月の途中では超過にしない（未確定の注意喚起になる）", () => {
  const c = classifyOverdue(job({ status: "draft", dueMonth: "2026-08" }), NOW);
  assert.equal(c?.level, "warn");
  assert.match(c!.reason, /実施月に入って\d+日、まだ未確定/);
  assert.doesNotMatch(c!.reason, /超過/);
});

test("月が終わったら未確定ジョブは超過（14日超で最上級）", () => {
  const c = classifyOverdue(job({ status: "sent", dueMonth: "2026-07" }), NOW);
  assert.equal(c?.level, "critical");   // 8/1から26日経過 > 14
  assert.match(c!.reason, /超過/);
});

test("confirmed の月ジョブは月内なら何も出さない", () => {
  assert.equal(classifyOverdue(job({ status: "confirmed", dueMonth: "2026-08" }), NOW), null);
});

test("法定は月初30日前から・任意は7日前から未確定を警告", () => {
  const stat = classifyOverdue(job({ status: "draft", dueMonth: "2026-09", statutory: true }), NOW);
  assert.match(stat!.reason, /法定・期日まで\d日で未確定/);
  const near = classifyOverdue(job({ status: "draft", dueMonth: "2026-09" }), NOW);
  assert.match(near!.reason, /期日まで\d日で未確定/);
  const far = classifyOverdue(job({ status: "draft", dueMonth: "2026-10" }), NOW);
  assert.equal(far, null);
});

/* ── aggregateFacts（facts合計） ─────────────────────────── */

const F = (prop: string, ym: string, amount: number, flow: string): Fact =>
  ({ prop, ym, amount, flow, group: "g", label: "l", periodicity: "once", docPath: "t/x" });

const FACTS: Fact[] = [
  F("kiyokawa", "2026-07", 10_000, "opex"),
  F("kiyokawa", "2026-08", 20_000, "opex"),
  F("takasago", "2026-08", 30_000, "opex"),
  F("takasago", "2026-08", 500_000, "revenue"),
  F("kiyokawa", "2025-12", 1_000_000, "invest"),
];

test("facts合計: byFlow の合計と件数が行と一致する", () => {
  const r = aggregateFacts(FACTS, {});
  assert.equal(r.total.count, 5);
  assert.equal(r.byFlow.opex.amount, 60_000);
  assert.equal(r.byFlow.opex.count, 3);
  assert.equal(r.byFlow.revenue.amount, 500_000);
  const sum = Object.values(r.byFlow).reduce((a, x) => a + x.amount, 0);
  assert.equal(sum, FACTS.reduce((a, f) => a + f.amount, 0));
});

test("facts合計: prop / ym（前方一致）/ flow のフィルタ", () => {
  assert.equal(aggregateFacts(FACTS, { prop: "takasago" }).total.count, 2);
  assert.equal(aggregateFacts(FACTS, { ym: "2026-08" }).total.count, 3);
  assert.equal(aggregateFacts(FACTS, { ym: "2026" }).total.count, 4);
  assert.equal(aggregateFacts(FACTS, { prop: "kiyokawa", flow: "opex" }).byFlow.opex.amount, 30_000);
});


/* AIの自己点検の判定（2026-08-29）。実機の誤答——health を見ずに
   list_overdue_jobs だけで「タスクはありません」と答えた——を落とせることを確かめる */
test("AI自己点検: 期待した道具を引いていなければ落ちる", () => {
  const p = { question: "今日やることを教えて", expectTools: ["get_health"] };
  const ng = judgeProbe(p, ["list_overdue_jobs"], "対応が必要なタスクはありません。");
  assert.equal(ng.ok, false);
  assert.match(ng.why, /期待した道具/);
  const ok = judgeProbe(p, ["get_health", "list_overdue_jobs"], "契約書の原本が6件未登録です。");
  assert.equal(ok.ok, true);
});

test("AI自己点検: 道具は合っていても回答が空なら落ちる", () => {
  const p = { question: "先月の売上はいくらでしたか", expectTools: ["get_revenue", "get_monthly"] };
  const r = judgeProbe(p, ["get_monthly"], "   ");
  assert.equal(r.ok, false);
  assert.equal(r.why, "回答が空");
});

test("AI自己点検: 1件でも落ちたら全体を不合格にする", () => {
  const good = { question: "a", toolsUsed: ["get_health"], answerLen: 10, ok: true, why: "OK" };
  const bad = { question: "b", toolsUsed: [], answerLen: 0, ok: false, why: "回答が空" };
  assert.equal(summarizeProbes([good, good]).ok, true);
  const s2 = summarizeProbes([good, bad]);
  assert.equal(s2.ok, false);
  assert.equal(s2.ng.length, 1);
});

test("AI自己点検: 質問は3件だけに保つ（増やすとコストと実行時間が伸びる）", () => {
  assert.ok(PROBES.length <= 3, `質問が${PROBES.length}件に増えている`);
  assert.ok(PROBES.every((p) => p.expectTools.length > 0));
});


/* schema.md（文書）と schemadoc.ts（生成物）のズレ検知（2026-08-29）。
   schema.md を直して再生成を忘れると、health の検査が古い文書で回ってしまう */
test("schema.md と schemadoc.ts が一致している", async () => {
  const fs = await import("node:fs");
  const path = new URL("../../../docs/schema.md", import.meta.url).pathname;
  const fresh = parseSchemaMd(fs.readFileSync(path, "utf8"));
  const keys = Object.keys(fresh).sort();
  assert.deepEqual(keys, Object.keys(DOCUMENTED).sort(),
    "コレクションがズレている。npx tsx tools/gen-schema-doc.ts で作り直すこと");
  for (const k of keys) {
    assert.deepEqual([...fresh[k]].sort(), [...DOCUMENTED[k]].sort(),
      `${k} のフィールドがズレている。npx tsx tools/gen-schema-doc.ts で作り直すこと`);
  }
});

test("schema.md のフィールド抽出（かっこ・スラッシュ・配列を落とす）", () => {
  assert.deepEqual(parseFieldCell("kind(supply/construction), prop, actual{amount,ym}, timeline[]"),
    ["kind", "prop", "actual", "timeline"]);
  assert.deepEqual(parseFieldCell("item/label, amount, …"), ["item", "label", "amount"]);
});


/* 週報の集計（2026-08-31）。実測ログの形をそのまま流し、単価の掛け算と集約を検算 */
test("週報: aiLogsの集計と概算費用", () => {
  const r = aggregateAiWeek([
    { purpose: "morningNote", model: "gemini-2.5-flash", promptTokens: 1255, outputTokens: 99, calls: 1 },
    { purpose: "morningNote", model: "gemini-2.5-flash", promptTokens: 1245, outputTokens: 101, calls: 1 },
    { purpose: "ask", model: "gemini-2.5-pro", promptTokens: 2035, outputTokens: 15, calls: 1 },
  ]);
  assert.equal(r.lines.length, 2);                       // purpose×modelで2グループ
  assert.ok(r.lines.some((l) => l.includes("morningNote") && l.includes("2回")));
  /* flash: (2500*0.3 + 200*2.5)/1e6 ≒ $0.00125 / pro: (2035*1.25 + 15*10)/1e6 ≒ $0.00269 */
  assert.ok(r.totalUsd > 0.003 && r.totalUsd < 0.005, `totalUsd=${r.totalUsd}`);
});

test("週報: 未知モデルは単価0で落ちない", () => {
  const r = aggregateAiWeek([{ purpose: "x", model: "unknown", promptTokens: 100, outputTokens: 10 }]);
  assert.equal(r.totalUsd, 0);
  assert.equal(r.lines.length, 1);
});


/* 観光定点（spec_tourism_stats_20260830）の純関数 */
test("観光定点: e-Statの時間名の解釈（月だけ拾い、年計・四半期は捨てる）", () => {
  assert.equal(parseTimeName("2026年4月"), "2026-04");
  assert.equal(parseTimeName("2026年12月"), "2026-12");
  assert.equal(parseTimeName("2026年"), null);
  assert.equal(parseTimeName("2026年1〜3月"), null);
});
test("観光定点: 前年同月比（前年ゼロ・欠測はnull）", () => {
  assert.equal(yoy(120, 100), 20);
  assert.equal(yoy(90, 100), -10);
  assert.equal(yoy(100, 0), null);
  assert.equal(yoy(100, undefined), null);
});


/* BS: 条件が登録されていない借入の計上（2026-08-30） */
test("BS: 条件未登録なら申告額をそのまま使う（返済表の残債は使わない）", () => {
  assert.equal(liabilityAmount({ conditionsUnknown: true, amountReported: 85000000 }, 999), 85000000);
  assert.equal(liabilityAmount({ conditionsUnknown: true, amountReported: 0, principal: 30000000 }, null), 30000000);
});
test("BS: 条件が登録済みなら返済表から導いた残債を使う", () => {
  assert.equal(liabilityAmount({ principal: 50000000 }, 41234567), 41234567);
  assert.equal(liabilityAmount({ principal: 50000000 }, null), 50000000);   // 導出できない時は当初額
});


/* 資金繰り予測（2026-08-31）。日付をまたぐ計算と、ショート月の検知 */
test("資金繰り: 月送り（年またぎ）", () => {
  assert.equal(nextMonth("2026-11"), "2026-12");
  assert.equal(nextMonth("2026-12"), "2027-01");
});
test("資金繰り: 残高の積み上がりと工事支払いの反映", () => {
  const rows = projectCashflow({ startMonth: "2026-09", months: 3, opening: 1000000,
    monthlyIncome: 1000000, fixedPerMonth: 100000, reservesPerMonth: 0, utilitiesPerMonth: 70000,
    loanOutgoByMonth: { "2026-09": 500000, "2026-10": 500000, "2026-11": 500000 },
    buildByMonth: { "2026-11": [{ label: "六本松 引き渡し", amount: 12000000 }] } });
  assert.equal(rows[0].closing, 1330000);          // 100万＋(100万−67万)
  assert.equal(rows[2].detail.build, 12000000);
  assert.ok(rows[2].closing < 0);                  // 工事支払いで沈む
  assert.equal(firstShortage(rows, true), "2026-11");
});
test("資金繰り: 期首残高が無ければショート判定をしない（勝手に断定しない）", () => {
  const rows = projectCashflow({ startMonth: "2026-09", months: 2, opening: null,
    monthlyIncome: 0, fixedPerMonth: 0, reservesPerMonth: 0, utilitiesPerMonth: 0, loanOutgoByMonth: {}, buildByMonth: {} });
  assert.equal(firstShortage(rows, false), null);
});


test("資金繰り: 調達を入れると同じ月の支払いを相殺する（手元資金は入金に数えない）", () => {
  const base = { startMonth: "2026-11", months: 1, opening: 0, monthlyIncome: 0,
    fixedPerMonth: 0, reservesPerMonth: 0, utilitiesPerMonth: 0, loanOutgoByMonth: {},
    buildByMonth: { "2026-11": [{ label: "大手門 中間金", amount: 25000000 }] },
    fundingByMonth: { "2026-11": [{ source: "ウィズダム", amount: 14000000 },
      { source: "晴信", amount: 10000000 }] } };
  const withF = projectCashflow({ ...base, withFunding: true });
  assert.equal(withF[0].funding, 24000000);
  assert.equal(withF[0].net, -1000000);          // 自己資金100万ぶんだけ手元から出る
  const without = projectCashflow({ ...base, withFunding: false });
  assert.equal(without[0].net, -25000000);       // 調達を切ると支払い全額が沈む
});


test("資金繰り: 稼働予定の入金は開始月から乗り、実績とは別に持つ", () => {
  const rows = projectCashflow({ startMonth: "2027-01", months: 3, opening: 0,
    monthlyIncome: 1000000, fixedPerMonth: 0, reservesPerMonth: 0, utilitiesPerMonth: 0,
    loanOutgoByMonth: {}, buildByMonth: {},
    projectedIncomeByMonth: { "2027-02": [{ prop: "ropponmatsu", amount: 751188 }],
      "2027-03": [{ prop: "ropponmatsu", amount: 724460 }] } });
  assert.equal(rows[0].incomeProjected, 0);          // 開始前は乗らない
  assert.equal(rows[1].incomeProjected, 751188);
  assert.equal(rows[1].income, 1000000);             // 実績ぶんは混ぜない
  assert.equal(rows[1].net, 1751188);
});


test("資金繰り: 修繕積立金は固定費と別の列で引かれる", () => {
  const [r] = projectCashflow({ startMonth: "2026-09", months: 1, opening: 0, monthlyIncome: 0,
    fixedPerMonth: 51302, reservesPerMonth: 100000, utilitiesPerMonth: 69516,
    loanOutgoByMonth: {}, buildByMonth: {} });
  assert.equal(r.detail.fixed, 51302);
  assert.equal(r.detail.reserves, 100000);
  assert.equal(r.outgo, 220818);                  // 合計は分ける前と同じ
});


/* 期日を過ぎた未払いが窓の外に落ちない（2026-09-01 実害あり）。
   大手門着工¥20,000,000が8/31期日で、9月始まりの予測から消えていた */
test("資金繰り: 期日超過の未払いは初月に繰り上げて必ず数える", () => {
  const [r] = projectCashflow({ startMonth: "2026-09", months: 1, opening: 24037860,
    monthlyIncome: 0, fixedPerMonth: 0, reservesPerMonth: 0, utilitiesPerMonth: 0,
    loanOutgoByMonth: {},
    buildByMonth: { "2026-09": [
      { label: "大手門 着工（2026-08 期日・未払い）", amount: 20000000 },
      { label: "六本松 中間金", amount: 16000000 }] } });
  assert.equal(r.detail.build, 36000000);
  assert.equal(r.closing, 24037860 - 36000000);
});


test("資金繰り: 手元の下限を割る月を、ショートより手前で拾う", () => {
  const rows = projectCashflow({ startMonth: "2026-09", months: 3, opening: 24037860,
    monthlyIncome: 0, fixedPerMonth: 0, reservesPerMonth: 0, utilitiesPerMonth: 0,
    loanOutgoByMonth: {},
    buildByMonth: { "2026-09": [{ label: "大手門 着工", amount: 21500000 }] } });
  assert.equal(firstShortage(rows, true), null);              // マイナスにはならない
  assert.deepEqual(belowFloor(rows, true, 5000000), ["2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(belowFloor(rows, false, 5000000), []);     // 期首未設定なら判定しない
  assert.deepEqual(belowFloor(rows, true, 0), []);            // 下限未設定なら判定しない
});

test("資金繰り: 部屋数が増えた月から固定費と光熱費が比例して増える", () => {
  const rows = projectCashflow({ startMonth: "2026-09", months: 3, opening: 0,
    monthlyIncome: 0, fixedPerMonth: 100000, reservesPerMonth: 0, utilitiesPerMonth: 70000,
    loanOutgoByMonth: {}, buildByMonth: {},
    /* 2部屋 → 3部屋 → 5部屋 */
    roomFactorByMonth: { "2026-10": 3 / 2, "2026-11": 5 / 2 } });
  assert.equal(rows[0].detail.fixed, 100000);      // 倍率の指定が無い月はそのまま
  assert.equal(rows[0].detail.utilities, 70000);
  assert.equal(rows[1].detail.fixed, 150000);
  assert.equal(rows[1].detail.utilities, 105000);
  assert.equal(rows[2].detail.fixed, 250000);
  assert.equal(rows[2].detail.utilities, 175000);
  assert.equal(rows[2].outgo, 425000);             // 増えたぶんは出金の合計にも効く
});

/* 金額の意味（設計メモ⑧・2026-09-04）。同じ列に3種類の意味が並ぶのが混乱の元だった——
   ウィズダムだけ残高、真佐子・晴信は当初元本、一慶は申告額。額と一緒に basis を返す */
test("金額の意味: 残高／当初元本／申告額を取り違えない", () => {
  /* 返済が始まっていて残高を導けた → derived（ウィズダムのケース） */
  assert.deepEqual(liabilityAmountWithBasis({ principal: 30000000 }, 29591920),
    { amount: 29591920, basis: "derived" });
  /* 返済がまだ始まっていない → 当初元本（真佐子・晴信のケース） */
  assert.deepEqual(liabilityAmountWithBasis({ principal: 30000000 }, null),
    { amount: 30000000, basis: "principal" });
  /* 条件が未登録 → 申告額（一慶の役員借入のケース） */
  assert.deepEqual(liabilityAmountWithBasis({ conditionsUnknown: true, amountReported: 93031628 }, null),
    { amount: 93031628, basis: "reported" });
  /* 条件未登録だが申告額が無い → 当初元本に落とす（0 を採らない） */
  assert.deepEqual(liabilityAmountWithBasis({ conditionsUnknown: true, amountReported: 0, principal: 3000000 }, 999),
    { amount: 3000000, basis: "principal" });
  /* 従来の liabilityAmount と食い違わない */
  assert.equal(liabilityAmount({ principal: 30000000 }, 29591920), 29591920);
});

/* 返済表の最終回は残高＋利息だけ払う（総点検 2026-09-04）。
   これを無視すると実在の返済表（¥30,000,000・年2%・240回・毎月¥151,765・最終回¥151,621）より
   総返済額が144円多くなる。3本の実契約と1円まで一致することを検証 */
test("返済表: 最終回の端数調整で契約書の総額と1円まで一致する", () => {
  const L = { principal: 30000000, rate: 2, firstPaymentMonth: "2026-05",
    totalPayments: 240, monthlyPayment: 151765 };
  let pay = 0, interest = 0;
  for (let y = 2026; y <= 2046; y++) { const r = loanYear(L, y); pay += r.pay; interest += r.interest; }
  assert.equal(pay, 36423456);          // 契約書の総返済額（151,765×239＋151,621）
  assert.equal(interest, 6423456);      // 契約書の利息合計
  assert.equal(loanBalanceAtYearEnd(L, 2046), 0);   // 完済年の年末残高はゼロ
});
