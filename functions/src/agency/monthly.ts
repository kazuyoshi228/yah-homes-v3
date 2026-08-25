/**
 * 月次のまとめ — 各カード（売上・光熱費・固定費・融資）の合流点
 *
 * 「今月いくら残ったか」を横で見るための1枚。すべて既にある数字から機械的に組むので、
 * 転記も手入力も入らない。数字を疑ったら、その月の元データ（報告書PDF・仕訳）へ辿れる。
 *
 * 期のズレの扱い（2026-08-19 決定）:
 *  - 年額（固定資産税・火災保険・修繕積立）は12で割って各月へ按分する
 *  - 運営会社の報告書が届いていない月は空欄（0で埋めない＝埋まっていないことが見える）
 *  - 報告書が揃っている月を「確定」、そうでない月を「暫定」として区別する
 *  - 広告費は日次（adsDaily）を月で合算する。月額は保存しない——正本は adsDaily 単独
 *    （裁量費なので固定費とは別の列。docs/spec_ad_cost_classification_20260825.md）
 */
import { agencyDb } from "./engine.js";
import { lodgingFilter } from "./places.js";
import { loanState, type Loan } from "./finance.js";

const ACTIVE_PROPS = ["kiyokawa", "takasago"];      // 稼働中の棟。増えたらここに足す

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export interface MonthlyRow {
  month: string;
  status: "確定" | "暫定" | "未着";
  revenue: number | null; payout: number | null;
  utilities: number | null;
  fixed: number;
  ads: number;                           // 広告費（adsDailyの月合算・裁量費）
  repayment: number; principal: number; interest: number;
  profit: number | null;                 // 返済に回せる利益（入金 − 光熱費 − 固定費 − 広告費）
  net: number | null;                    // 手残り（利益 − 返済）
  dscr: number | null;
  props: number;                         // その月に報告書が揃っている棟数
}

export async function monthlySummary() {
  const db = agencyDb();
  const [revSnap, utilSnap, taxSnap, insSnap, resSnap, loanSnap, adsSnap] = await Promise.all([
    db.collection("revenue").where("kind", "==", "monthly").get(),
    db.collection("utilities").where("kind", "==", "utility").get(),
    db.collection("taxes").get(), db.collection("insurance").get(),
    db.collection("reserves").get(),
    db.collection("finance").where("kind", "==", "loan").get(),
    db.collection("adsDaily").get(),
  ]);
  /* 広告費は日次で貯めているものを月へ畳む。月額は保存しない（合算は読むたびに作る） */
  const adsByMonth = new Map<string, number>();
  for (const d of adsSnap.docs) {
    const a = d.data() as { date?: string; total?: { cost?: number } };
    const ym = String(a.date ?? "").slice(0, 7);
    if (!ym) continue;
    adsByMonth.set(ym, (adsByMonth.get(ym) ?? 0) + Number(a.total?.cost ?? 0));
  }
  const rev = revSnap.docs.map((d) => d.data() as { prop: string; month: string; revenue: number; payout: number });
  const util = utilSnap.docs.map((d) => d.data() as { month: string; place: string; amount: number });
  const loans = loanSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as Loan);
  const sumField = (docs: FirebaseFirestore.QueryDocumentSnapshot[], key: string) =>
    docs.reduce((a, d) => a + Number(d.data()[key] ?? 0), 0);

  /* 年額はこの1枚の上では12で割って各月へ置く。実際の支払は年1回でも、
     月ごとの損益を見るときは均した方が読み違えない。 */
  const fixedPerMonth = Math.round(
    (sumField(taxSnap.docs, "amountPerYear") + sumField(insSnap.docs, "premiumPerYear")
      + sumField(resSnap.docs, "amountPerYear")) / 12);

  const months: string[] = [];
  const start = rev.map((r) => r.month).sort()[0] ?? "2025-07";
  const now = new Date();
  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  for (let m = start; m <= end; m = addMonths(m, 1)) months.push(m);

  const isLodging = await lodgingFilter();

  const rows: MonthlyRow[] = months.map((month) => {
    const rs = rev.filter((r) => r.month === month);
    const hasReport = rs.length > 0;
    const revenue = hasReport ? rs.reduce((a, r) => a + r.revenue, 0) : null;
    const payout = hasReport ? rs.reduce((a, r) => a + r.payout, 0) : null;

    /* 光熱費は宿泊事業の拠点だけ。どの拠点がそうかは places 台帳が持つ。仕訳が無い月は空欄 */
    const us = util.filter((u) => u.month === month && isLodging(u.place));
    const utilities = us.length ? us.reduce((a, u) => a + u.amount, 0) : null;

    /* 返済は契約条件から計算する。過去の月も同じ式で出せる */
    const asOf = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 15);
    let repayment = 0, interest = 0;
    for (const l of loans) {
      const st = loanState(l, asOf);
      repayment += st.monthlyTotal;
      interest += st.monthlyTotal > 0 ? st.interestThisMonth : 0;
    }
    const principal = Math.max(0, repayment - interest);

    /* 広告費は裁量費（明日ゼロにできる）だが、実際に出ていくキャッシュなので利益から引く。
       記録が無い月は0（出稿していなかった月と区別しない——GA4連携前は取得できないため） */
    const ads = Math.round(adsByMonth.get(month) ?? 0);

    const profit = payout == null ? null : payout - (utilities ?? 0) - fixedPerMonth - ads;
    return {
      month,
      status: !hasReport ? "未着" : rs.length >= ACTIVE_PROPS.length ? "確定" : "暫定",
      revenue, payout, utilities, fixed: fixedPerMonth, ads,
      repayment, principal, interest,
      profit, net: profit == null ? null : profit - repayment,
      dscr: profit == null || repayment === 0 ? null : Math.round((profit / repayment) * 100) / 100,
      props: rs.length,
    };
  });

  const done = rows.filter((r) => r.status === "確定");
  const avg = (f: (r: MonthlyRow) => number | null) =>
    done.length ? Math.round(done.reduce((a, r) => a + (f(r) ?? 0), 0) / done.length) : 0;

  return {
    rows: [...rows].reverse(),                     // 新しい月を上に
    fixedPerMonth,
    total: {
      months: rows.length, confirmed: done.length,
      avgRevenue: avg((r) => r.revenue), avgPayout: avg((r) => r.payout),
      avgProfit: avg((r) => r.profit), avgNet: avg((r) => r.net),
      avgPrincipal: avg((r) => r.principal), avgInterest: avg((r) => r.interest),
      avgAds: avg((r) => r.ads),
      avgDscr: done.length
        ? Math.round((done.reduce((a, r) => a + (r.dscr ?? 0), 0) / done.length) * 100) / 100 : null,
    },
  };
}
