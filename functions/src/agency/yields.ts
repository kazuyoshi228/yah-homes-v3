/**
 * 利回り — 取得価額に対して、その物件がいくら稼いでいるか
 *
 * 3つの段で出す。どれも同じ売上から出発するが、引くものが違う。
 *  表面   = 売上 ÷ 取得価額            … 物件どうしを粗く比べるとき
 *  入金   = 入金 ÷ 取得価額            … OTA手数料・運営代行・清掃を引いた後
 *  実質   = NOI  ÷ 取得価額            … さらに光熱費・税・保険・修繕積立を引いた後
 *
 * 実質が本当の姿で、借入金利との差（イールドギャップ）がそのまま事業の取り分になる。
 * 修繕積立を引くかどうかで見え方が変わるので、両方返す。
 */
import { agencyDb } from "./engine.js";
import { revenueSummary } from "./revenue.js";
import { utilitySummary } from "./utilities.js";

export async function yieldSummary() {
  const db = agencyDb();
  const [rev, util, props, taxSnap, insSnap, resSnap] = await Promise.all([
    revenueSummary(12), utilitySummary(),
    db.collection("properties").get(),
    db.collection("taxes").get(), db.collection("insurance").get(), db.collection("reserves").get(),
  ]);

  /* 光熱費・通信費は「yah全体」の合算でしか無いので、稼働している棟数で割る。
     棟別に分けたいなら、会計側で科目を棟ごとに分ける必要がある。 */
  const activeCount = rev.byProp.length || 1;
  const utilPerYear = Math.round(
    util.byPlace.filter((p) => p.place !== "千人町").reduce((a, p) => a + p.perMonth, 0) / activeCount * 12);

  const per = (snap: FirebaseFirestore.QuerySnapshot, prop: string, key: string) =>
    snap.docs.filter((d) => d.data().prop === prop).reduce((a, d) => a + Number(d.data()[key] ?? 0), 0);

  const rows = rev.byProp.map((p) => {
    const doc = props.docs.find((d) => d.id === p.prop)?.data();
    const price = Number(doc?.acquisitionPrice ?? 0);
    /* 実績の月数で割ってから12倍する。10ヶ月しか無い棟を12ヶ月として扱わない */
    const revenueY = Math.round(p.revenue / p.months * 12);
    const payoutY = Math.round(p.payout / p.months * 12);
    const tax = per(taxSnap, p.prop, "amountPerYear");
    const ins = per(insSnap, p.prop, "premiumPerYear");
    const res = per(resSnap, p.prop, "amountPerYear");
    const noi = payoutY - utilPerYear - tax - ins - res;
    const pct = (n: number) => (price ? Math.round((n / price) * 10000) / 100 : null);
    return {
      prop: p.prop, label: p.label, months: p.months, price,
      revenueY, payoutY, utilities: utilPerYear, tax, insurance: ins, reserve: res,
      noi, noiExReserve: noi + res,
      gross: pct(revenueY), payoutYield: pct(payoutY),
      net: pct(noi), netExReserve: pct(noi + res),
      occ: p.occ, adr: p.adr,
    };
  }).sort((a, b) => (b.net ?? 0) - (a.net ?? 0));

  /* これから建てる棟の試算。清川を基準に置くのは、いまの手札で最も強い実績だから */
  const bench = rows.find((r) => r.prop === "kiyokawa") ?? rows[0];
  const otemon = props.docs.find((d) => d.id === "otemon")?.data();
  const landPerUnit = otemon ? Math.round(Number(otemon.landPrice) / Number(otemon.units || 1)) : 0;
  const sim = bench && landPerUnit
    ? [2000, 3000, 4000, 5000, 6000, 7000].map((man) => {
        const build = man * 10000;
        const total = landPerUnit + build;
        return {
          build, total,
          net: Math.round((bench.noi / total) * 10000) / 100,
          gross: Math.round((bench.revenueY / total) * 10000) / 100,
        };
      })
    : [];

  return {
    rows, sim,
    benchmark: bench ? { label: bench.label, noi: bench.noi, revenueY: bench.revenueY } : null,
    otemon: otemon ? { landPrice: Number(otemon.landPrice), units: Number(otemon.units), landPerUnit } : null,
    note: {
      utilities: "光熱費・通信費は棟別に分かれていないため、稼働棟数で割った概算",
      annualized: "実績の月数で割ってから12倍している（10ヶ月しか無い棟を12ヶ月として扱わない）",
    },
  };
}
