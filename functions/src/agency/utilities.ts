/**
 * 光熱費 — 会計（マネーフォワード）の仕訳帳から、水道光熱費だけを取り出したもの
 *
 * 正本は会計。ここは「いつ・どこで・何に・いくら」を月次で並べ直したもので、
 * 売上（入金）や返済と同じ画面で突き合わせるためにある。
 * 取引Noを鍵にしているので、同じCSVを何度取り込んでも二重にならない。
 */
import { agencyDb } from "./engine.js";
import { placeBook } from "./places.js";

export interface UtilityEntry {
  id: string; date: string; month: string;
  place: string; type: string; amount: number; memo: string; source?: string;
}

export async function utilitySummary() {
  const db = agencyDb();
  const [snap, recSnap] = await Promise.all([
    db.collection("utilities").where("kind", "==", "utility").get(),
    db.collection("recurringCosts").where("recurring", "==", true).get(),
  ]);
  const rows = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as object) } as UtilityEntry))
    .sort((a, b) => a.date.localeCompare(b.date));

  /* セキュリティカメラのように、仕訳ではなく「台数×単価」で毎月決まって出るもの。
     会計に個別の仕訳が立たなくても、月次の費用としては同じように効く。 */
  const recurring = recSnap.docs.map((d) => {
    const r = d.data() as { type: string; place: string; unitPrice: number; units: number; note?: string };
    return { id: d.id, ...r, amountPerMonth: r.unitPrice * r.units };
  });

  /* 拠点の台帳。判断は places.ts（＝Firestoreのplaces）だけが持つ */
  const book = await placeBook();

  const months = [...new Set(rows.map((r) => r.month))].sort();
  const places = [...new Set(rows.map((r) => r.place))];
  const types = [...new Set(rows.map((r) => r.type))];
  const sum = (rs: UtilityEntry[]) => rs.reduce((a, r) => a + r.amount, 0);

  const byMonth = months.map((month) => {
    const rs = rows.filter((r) => r.month === month);
    return {
      month, total: sum(rs),
      byType: Object.fromEntries(types.map((t) => [t, sum(rs.filter((r) => r.type === t))])),
      byPlace: Object.fromEntries(places.map((p) => [p, sum(rs.filter((r) => r.place === p))])),
    };
  });

  const recurringPerMonth = recurring.reduce((a, r) => a + r.amountPerMonth, 0);
  const total = sum(rows);
  return {
    rows, byMonth, places, types, recurring, recurringPerMonth, placeBook: book,
    byPlace: places.map((place) => {
      const rs = rows.filter((r) => r.place === place);
      const ms = [...new Set(rs.map((r) => r.month))].length;
      return { place, total: sum(rs), months: ms, perMonth: ms ? Math.round(sum(rs) / ms) : 0, count: rs.length };
    }).sort((a, b) => b.total - a.total),
    byType: types.map((type) => {
      const rs = rows.filter((r) => r.type === type);
      return { type, total: sum(rs), count: rs.length, share: total ? Math.round((sum(rs) / total) * 1000) / 10 : 0 };
    }).sort((a, b) => b.total - a.total),
    window: { from: months[0] ?? "", to: months.at(-1) ?? "", months: months.length },
    total: {
      amount: total, count: rows.length,
      perMonth: (months.length ? Math.round(total / months.length) : 0) + recurringPerMonth,
      perMonthFromJournal: months.length ? Math.round(total / months.length) : 0,
      /* 補助科目が付いていないもの＝何の光熱費か分からない仕訳。放っておくと集計が静かに狂う */
      unknown: sum(rows.filter((r) => r.type === "不明")),
      unknownCount: rows.filter((r) => r.type === "不明").length,
    },
  };
}
