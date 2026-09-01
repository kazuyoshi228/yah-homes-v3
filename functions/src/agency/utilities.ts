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
  const [snap, recSnap, billSnap] = await Promise.all([
    db.collection("utilities").where("kind", "==", "utility").get(),
    db.collection("recurringCosts").where("recurring", "==", true).get(),
    /* 供給元の請求明細。仕訳帳（utilities）は支払の記録で、費目が混ざることがある
       （西部ガスの請求はガス＋電気のセットだが、仕訳では全額ガスに計上されていた）。
       金額が正確なのはこちらなので、棟別・費目別を見るときは請求明細を使う。
       ただし同じ費用なので、月あたりの費用は**どちらか一方だけ**を数える（2026-09-01） */
    db.collection("utilityBills").get(),
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
  /* 回線などの契約者情報。パスワードは持たない（管理ツール側・2026-08-26） */
  const acctSnap = await db.collection("serviceAccounts").get();
  /* パスワード類は一覧に載せない（レビュー2026-08-28 #6: 平文がブラウザとsessionStorageに残っていた）。
     見る時だけ serviceAccountSecret（都度取得・キャッシュ不可）で1件返す */
  const SECRET = /pass|pwd|pin|secret|暗証/i;
  const accounts = acctSnap.docs.map((d) => {
    const o: Record<string, unknown> = { id: d.id };
    for (const [k, v] of Object.entries(d.data())) if (!SECRET.test(k)) o[k] = v;
    o.hasSecret = Object.keys(d.data()).some((k) => SECRET.test(k));
    return o;
  });

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

  /* 請求明細（棟別・費目別・請求月）。棟ごとにまとめて返し、画面は棟を選んで見る */
  type Bill = { prop: string; billMonth: string; type: string; plan?: string;
    amount: number; supplier?: string; source?: string;
    kwh?: number; dueDate?: string; paidDate?: string; tariff?: string; note?: string };
  const bills = billSnap.docs.map((d) => d.data() as Bill)
    .filter((b) => b.billMonth && b.amount != null)
    .sort((a, b) => a.billMonth.localeCompare(b.billMonth));
  const billProps = [...new Set(bills.map((b) => b.prop))];
  const billTypes = [...new Set(bills.map((b) => b.type))];
  const billsByProp = billProps.map((prop) => {
    const rs = bills.filter((b) => b.prop === prop);
    const ms = [...new Set(rs.map((b) => b.billMonth))].sort();
    const t = rs.reduce((a, b) => a + b.amount, 0);
    return {
      prop,
      supplier: rs[0]?.supplier ?? "",
      from: ms[0] ?? "", to: ms.at(-1) ?? "", months: ms.length,
      total: t, perMonth: ms.length ? Math.round(t / ms.length) : 0,
      byType: billTypes.map((type) => {
        const ts = rs.filter((b) => b.type === type);
        const tm = [...new Set(ts.map((b) => b.billMonth))].length;
        const sub = ts.reduce((a, b) => a + b.amount, 0);
        return { type, plan: ts[0]?.plan ?? "", total: sub, months: tm,
          perMonth: tm ? Math.round(sub / tm) : 0 };
      }).filter((x) => x.total > 0),
      /* 月ごとの内訳。画面はこれをそのまま並べる（合計は保存せず毎回作る） */
      byMonth: ms.map((month) => {
        const mr = rs.filter((b) => b.billMonth === month);
        /* 使用量・支払日は明細に載っている棟だけ持つ（西部ガスの一覧には無い） */
        const kwh = mr.reduce((a, b) => a + (b.kwh ?? 0), 0);
        const withPay = mr.find((b) => b.dueDate);
        return { month, total: mr.reduce((a, b) => a + b.amount, 0),
          kwh: kwh || null,
          dueDate: withPay?.dueDate ?? "", paidDate: withPay?.paidDate ?? "",
          tariff: withPay?.tariff ?? "",
          byType: Object.fromEntries(billTypes.map((t2) =>
            [t2, mr.filter((b) => b.type === t2).reduce((a, b) => a + b.amount, 0)])) };
      }),
    };
  });

  const recurringPerMonth = recurring.reduce((a, r) => a + r.amountPerMonth, 0);
  const total = sum(rows);
  return {
    rows, byMonth, places, types, recurring, recurringPerMonth, placeBook: book, accounts,
    bills: { byProp: billsByProp, types: billTypes },
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
