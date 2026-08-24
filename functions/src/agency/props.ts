/**
 * 物件 — 棟そのものの属性の正本
 *
 * ここが持つのは「開発時に決まって以後変わらないもの」だけ:
 *   面積・取得年月日・取得価額・築年月・構造・住所・定員・状態
 *   宿泊以外の収入（オフィス賃料など。宿泊の報告書に載らないもの）
 *
 * 売上・光熱費・税金・保険・積立は、それぞれのカードが正本。ここでは参照して並べるだけ。
 * 借入はこの画面では扱わない（融資カードの領分・2026-08-19 発注者指示）。
 */
import { agencyDb } from "./engine.js";
import { revenueSummary } from "./revenue.js";
import { utilitySummary } from "./utilities.js";

/* 収益還元の還元利回り。宿泊施設としては強気寄りだが、清川は住宅としても値が付き、
   買い手が自主運営すればNOIはさらに大きくなる。査定が出たら実勢に置き換える。
   （2026-08-19 発注者判断で 6% → 5%） */
export const CAP_RATE = 0.05;

/** 画面から編集できる項目。ここに無いものは保存時に弾く（勝手な項目が増えないように） */
export const PROP_FIELDS = [
  "label", "status", "address", "area", "acquiredAt", "acquisitionPrice",
  "built", "structure", "rooms", "capacity", "note",
  /* 資料から拾えた項目（物件概要書・売買契約書） */
  "landArea", "floorAreaForFAR", "layout", "zoning", "coverageRatio", "access",
  "listPrice", "purchasePrice",
  /* 取得の相手と根拠（決済のご案内・売買契約書） */
  "seller", "broker", "contractDate", "buildingPermit", "warranty",
  /* 現地の条件（物件概要書） */
  "utilities", "roads", "parking", "surroundings", "psychologicalDefect", "encroachment",
  "riverDistance",
  "otherIncomeLabel", "otherIncomePerMonth", "otherIncomeNote",
  "landPrice", "units", "planned",
  "investment", "investmentTotal", "investmentNote", "investmentSource",
  "additionalInvestment",   // 稼働後に足した費用（初期投資額とは分けて持つ）
  "drawings",               // 図面データ（保管庫のパスと名前）
] as const;

export async function propertySummary() {
  const db = agencyDb();
  const [snap, rev, util, taxSnap, insSnap, resSnap, schedSnap] = await Promise.all([
    db.collection("properties").get(),
    revenueSummary(12), utilitySummary(),
    db.collection("taxes").get(), db.collection("insurance").get(),
    db.collection("reserves").get(), db.collection("schedules").get(),
  ]);

  const activeCount = rev.byProp.length || 1;
  const utilPerYear = Math.round(
    util.byPlace.filter((p) => p.place !== "千人町").reduce((a, p) => a + p.perMonth, 0) / activeCount * 12);
  const per = (s: FirebaseFirestore.QuerySnapshot, prop: string, key: string) =>
    s.docs.filter((d) => d.data().prop === prop).reduce((a, d) => a + Number(d.data()[key] ?? 0), 0);

  const rows = snap.docs.map((d) => {
    const p = d.data() as Record<string, unknown>;
    const r = rev.byProp.find((x) => x.prop === d.id);
    /* 利回りは取得価額ではなく総投資額（初期投資額の合計）で見る。
       リフォームや申請費用も回収すべき投資だから（2026-08-19 発注者指示）。
       総投資額がまだ無い棟は、暫定で取得価額を使う。 */
    const invTotal = Array.isArray(p.investment)
      ? (p.investment as Array<{ amount?: number }>).reduce((a, x) => a + (x.amount ?? 0), 0)
      : Number(p.investmentTotal ?? 0);
    const price = invTotal || Number(p.acquisitionPrice ?? 0);
    /* 宿泊以外の収入。OTA手数料も運営代行も清掃もかからないので、ほぼ全額がNOIに乗る */
    const other = Number(p.otherIncomePerMonth ?? 0) * 12;

    const stayRevenue = r ? Math.round(r.revenue / r.months * 12) : 0;
    const stayPayout = r ? Math.round(r.payout / r.months * 12) : 0;
    const tax = per(taxSnap, d.id, "amountPerYear");
    const ins = per(insSnap, d.id, "premiumPerYear");
    const res = per(resSnap, d.id, "amountPerYear");
    const utilities = r ? utilPerYear : 0;
    const noi = r || other ? stayPayout + other - utilities - tax - ins - res : null;

    return {
      id: d.id, ...p,
      investmentTotal: invTotal || null,
      priceBasis: invTotal ? "総投資額" : "取得価額",
      months: r?.months ?? 0, occ: r?.occ ?? null, adr: r?.adr ?? null,
      stayRevenue, stayPayout, otherIncomePerYear: other,
      utilities, tax, insurance: ins, reserve: res,
      noi,
      /* 実質利回りと収益還元の評価。取得価額が未入力なら出さない（0で割らない） */
      netYield: noi && price ? Math.round((noi / price) * 10000) / 100 : null,
      capRate: CAP_RATE,
      value: noi ? Math.round(noi / CAP_RATE) : null,
      gain: noi && price ? Math.round(noi / CAP_RATE) - price : null,
      schedules: schedSnap.docs.filter((s) => s.data().prop === d.id)
        .map((s) => ({ id: s.id, title: s.data().title, months: s.data().months, everyYears: s.data().everyYears ?? 1 })),
      docs: insSnap.docs.filter((s) => s.data().prop === d.id)
        .map((s) => ({ id: s.id, label: `${s.data().product}（${s.data().plan}）` })),
    };
  }).sort((a, b) => (b.netYield ?? -1) - (a.netYield ?? -1));

  return { rows, utilNote: "光熱費・通信費は棟別に分かれていないため、稼働棟数で割った概算" };
}
