/**
 * 売上レポート — 運営会社（AIRSTAR）からの月次「売上収支報告書」を読み取ったもの
 *
 * 正本はPDF（保管庫）。ここはその数字を機械が読める形にしたもので、
 * 取り込み時に「支出=B+C+D」「入金=売上-支出」を必ず検算している。
 * 融資の返済（月々いくら出ていくか）と並べて、返済余力を見るための土台。
 */
import { agencyDb } from "./engine.js";

export interface MonthlyRevenue {
  id: string; prop: string; month: string;
  revenue: number; otaFees: number; agencyFees: number;
  cleaning: number; management: number; lodgingTax: number;
  expenses: number; payout: number;
  occ: number; adr: number; revPerGuest: number;
  nightsPerParty: number; guests: number; parties: number;
  pdf?: string; source?: string;
}

const PROP_LABEL: Record<string, string> = { takasago: "高砂", kiyokawa: "清川" };

export async function revenueSummary(months = 12) {
  const snap = await agencyDb().collection("revenue").where("kind", "==", "monthly").get();
  const all = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as object) } as MonthlyRevenue))
    .sort((a, b) => a.month.localeCompare(b.month) || a.prop.localeCompare(b.prop));

  const monthList = [...new Set(all.map((r) => r.month))].sort();
  const recent = monthList.slice(-months);
  const inWindow = all.filter((r) => recent.includes(r.month));
  const sum = (rows: MonthlyRevenue[], f: (r: MonthlyRevenue) => number) => rows.reduce((a, r) => a + f(r), 0);

  /* 棟ごとの積み上げ。稼働率と単価は「月の平均」なので、単純合計ではなく平均で持つ */
  const byProp = Object.keys(PROP_LABEL).map((prop) => {
    const rows = inWindow.filter((r) => r.prop === prop);
    if (!rows.length) return null;
    return {
      prop, label: PROP_LABEL[prop], months: rows.length,
      revenue: sum(rows, (r) => r.revenue),
      payout: sum(rows, (r) => r.payout),
      expenses: sum(rows, (r) => r.expenses),
      occ: Math.round(sum(rows, (r) => r.occ) / rows.length),
      adr: Math.round(sum(rows, (r) => r.adr) / rows.length),
      payoutPerMonth: Math.round(sum(rows, (r) => r.payout) / rows.length),
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  /* 月ごとの横並び（棟を合算）。グラフや前年比の土台になる */
  const byMonth = recent.map((month) => {
    const rows = inWindow.filter((r) => r.month === month);
    return {
      month, props: rows.length,
      revenue: sum(rows, (r) => r.revenue),
      expenses: sum(rows, (r) => r.expenses),
      payout: sum(rows, (r) => r.payout),
      occ: rows.length ? Math.round(sum(rows, (r) => r.occ) / rows.length) : 0,
      adr: rows.length ? Math.round(sum(rows, (r) => r.adr) / rows.length) : 0,
    };
  });

  const rev = sum(inWindow, (r) => r.revenue);
  return {
    rows: all, byProp, byMonth,
    window: { from: recent[0] ?? "", to: recent.at(-1) ?? "", months: recent.length },
    total: {
      revenue: rev,
      payout: sum(inWindow, (r) => r.payout),
      expenses: sum(inWindow, (r) => r.expenses),
      /* 入金率＝手元に残る割合。運営代行・OTA手数料・宿泊税を引いたあと */
      payoutRate: rev ? Math.round((sum(inWindow, (r) => r.payout) / rev) * 1000) / 10 : 0,
      payoutPerMonth: recent.length ? Math.round(sum(inWindow, (r) => r.payout) / recent.length) : 0,
      occ: inWindow.length ? Math.round(sum(inWindow, (r) => r.occ) / inWindow.length) : 0,
      adr: inWindow.length ? Math.round(sum(inWindow, (r) => r.adr) / inWindow.length) : 0,
      count: all.length,
    },
  };
}
