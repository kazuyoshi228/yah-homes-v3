/**
 * facts — 全金額行を単一スキーマへ射影する読み取りレイヤ（B・2026-08-25 発注者承認）
 *
 * 保存は一切しない。散らばる正本（items・equipment・taxes・insurance・reserves・
 * utilities・revenue）を読み取り時に同じ形へ潰して返すだけ。
 * 横断の問い（「2025年3月に全カテゴリでいくら使ったか」）が、この1本のフィルタ・集計になる。
 *
 * 1行の形:
 *   { prop, ym, amount, flow, group, label, periodicity, txNo?, docPath }
 *   flow: invest（初期投資）| add（追加投資）| future（長期修繕の概算・未払い）
 *       | fixed（税・保険・積立）| opex（光熱費等）| revenue（売上・入金）
 *   periodicity: once | month | year   … fixed は年額、opex の定額は月額。混ぜて足さないための印
 *   docPath: その数字の正本の場所。どの数字も一発で遡れる（血統の完成形）
 */
import { agencyDb } from "./engine.js";
import { revenueSummary } from "./revenue.js";
import { utilitySummary } from "./utilities.js";

const PLACE2PROP: Record<string, string> = { "清川": "kiyokawa", "高砂": "takasago", "千人町": "senninCho" };
const ymOf = (d: unknown) => {
  const m = String(d ?? "").match(/^(\d{4})(?:-(\d{2}))?/);
  return m ? (m[2] ? `${m[1]}-${m[2]}` : m[1]) : "";
};

export type Fact = {
  prop: string; ym: string; amount: number; flow: string; group: string; label: string;
  periodicity: "once" | "month" | "year"; txNo?: string; docPath: string;
};

export async function factsSummary(q: { prop?: string; ym?: string; flow?: string }) {
  const db = agencyDb();
  const [itemsSnap, eqSnap, taxSnap, insSnap, resSnap, rev, util] = await Promise.all([
    db.collection("items").get(),
    db.collection("equipment").where("kind", "==", "equipment").get(),
    db.collection("taxes").get(), db.collection("insurance").get(), db.collection("reserves").get(),
    revenueSummary(120), utilitySummary(),
  ]);
  const out: Fact[] = [];
  const push = (f: Fact) => { if (f.amount) out.push(f); };

  for (const d of itemsSnap.docs) {
    const x = d.data();
    const kind = String(x.kind);
    const ym = ymOf(x.date);
    push({
      prop: String(x.prop), ym,
      amount: Number(x.amount ?? 0),
      flow: ym.startsWith("2026") ? "add" : "invest",
      group: kind === "supply" ? "備品" : kind === "construction" ? "工事" : String(x.cat ?? "取得費用"),
      label: String(x.item ?? x.label ?? d.id), periodicity: "once",
      ...(x.txNo ? { txNo: String(x.txNo) } : {}), docPath: `items/${d.id}`,
    });
  }
  for (const d of eqSnap.docs) {
    const e = d.data();
    const ym = ymOf(e.date ?? e.installedAt);
    push({
      prop: String(e.prop), ym,
      amount: Number(e.amount ?? e.price ?? 0),
      flow: e.futureCost === true ? "future" : ym.startsWith("2026") ? "add" : "invest",
      group: String(e.group ?? "設備"),
      label: String(e.model ?? e.category ?? d.id), periodicity: "once",
      ...(e.txNo ? { txNo: String(e.txNo) } : {}), docPath: `equipment/${d.id}`,
    });
  }
  const yearly = (snap: FirebaseFirestore.QuerySnapshot, group: string, amountKey: string, labelKey: string) => {
    for (const d of snap.docs) {
      const x = d.data();
      push({ prop: String(x.prop ?? ""), ym: "", amount: Number(x[amountKey] ?? 0),
        flow: "fixed", group, label: String(x[labelKey] ?? d.id), periodicity: "year",
        docPath: `${snap.docs[0].ref.parent.id}/${d.id}` });
    }
  };
  yearly(taxSnap, "税金", "amountPerYear", "type");
  yearly(insSnap, "保険", "premiumPerYear", "product");
  yearly(resSnap, "積立", "amountPerYear", "type");

  for (const r of util.rows as Array<{ id: string; month: string; place: string; type: string; amount: number }>) {
    push({ prop: PLACE2PROP[r.place] ?? r.place, ym: r.month, amount: r.amount,
      flow: "opex", group: r.type, label: `${r.place} ${r.type}`, periodicity: "once",
      docPath: `utilities/${r.id}` });
  }
  for (const r of util.recurring as Array<{ id: string; place: string; type: string; amountPerMonth: number }>) {
    push({ prop: PLACE2PROP[r.place] ?? r.place, ym: "", amount: r.amountPerMonth,
      flow: "opex", group: r.type, label: `${r.place} ${r.type}（定額）`, periodicity: "month",
      docPath: `recurringCosts/${r.id}` });
  }
  for (const r of rev.rows as Array<{ id: string; prop: string; month: string; revenue: number; payout: number }>) {
    push({ prop: r.prop, ym: r.month, amount: r.revenue, flow: "revenue", group: "売上",
      label: `${r.month} 売上`, periodicity: "once", docPath: `revenue/${r.id}` });
    push({ prop: r.prop, ym: r.month, amount: r.payout, flow: "revenue", group: "入金",
      label: `${r.month} 入金`, periodicity: "once", docPath: `revenue/${r.id}` });
  }
  /* 融資の返済は次段（LoanState の月次展開が要る）。黙って欠かさず、無いことを明記する */

  const rows = out.filter((f) =>
    (!q.prop || f.prop === q.prop) && (!q.ym || f.ym.startsWith(q.ym)) && (!q.flow || f.flow === q.flow));
  const byFlow: Record<string, { count: number; amount: number }> = {};
  for (const f of rows) {
    (byFlow[f.flow] ??= { count: 0, amount: 0 });
    byFlow[f.flow].count++; byFlow[f.flow].amount += f.amount;
  }
  return { rows, byFlow, total: { count: rows.length },
    note: "融資の返済（flow=loan）は未実装。fixed は年額・opex定額は月額（periodicity 参照）" };
}
