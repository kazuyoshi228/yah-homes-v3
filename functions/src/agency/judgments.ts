/**
 * 判定カレンダー — 「この日が来たら何を見るか」と合格ラインを、実測と突き合わせる
 * docs/proposal_reports_gaps_20260825.md A（2026-08-25 発注者承認）
 *
 * 保存するのは期限・合格ライン・見る指標だけ（judgments コレクション）。
 * **判定値は保存しない**——毎回、定点データ（bookingDaily / adsDaily / ga4Daily / gscDaily）から
 * 計算して合否を出す。数字が育てば判定も自動で変わる。
 *
 * health（数字の信頼度）とは別の軸。health の赤は「数字を信じるな」、
 * ここの期限は「そろそろ決めろ」——同じドットに混ぜない（2026-08-25 設計判断）。
 */
import { agencyDb } from "./engine.js";

export type Judgment = {
  id: string; title: string; due: string; category: string;
  passLine: string; metric: string; threshold: number; op: string;
  note?: string; source?: string;
  /** 以下は毎回計算する（保存しない） */
  actual: number | null; unit: string; pass: boolean | null;
  daysLeft: number; state: "期限切れ" | "今週" | "先";
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function judgmentSummary() {
  const db = agencyDb();
  const today = ymd(new Date());
  const from28 = ymd(new Date(Date.now() - 28 * 864e5));

  const [jSnap, bkSnap, adsSnap, gaSnap, gscSnap, gscPageSnap] = await Promise.all([
    db.collection("judgments").get(),
    db.collection("bookingDaily").where("date", ">=", from28).get(),
    db.collection("adsDaily").where("date", ">=", from28).get(),
    db.collection("ga4Daily").where("date", ">=", from28).get(),
    db.collection("gscDaily").where("date", ">=", from28).get(),
    db.collection("gscPage").where("date", ">=", from28).get(),
  ]);

  /* ── 実測をここで組み立てる。すべて既存の定点データから ── */
  const bk = bkSnap.docs.map((d) => d.data());
  const days = bk.filter((r) => r.k?.n != null || r.t?.n != null).length || 1;
  const sumN = (key: "k" | "t") => bk.reduce((a, r) => a + Number(r[key]?.n ?? 0), 0);
  /* 販売ペース＝直近28日の泊数を週あたりに直す（baseline §3-2 の判定単位） */
  const paceK = (sumN("k") / days) * 7;
  const paceT = (sumN("t") / days) * 7;

  const adsCost = adsSnap.docs.reduce((a, d) => a + Number(d.data().total?.cost ?? 0), 0);
  const handoff = gaSnap.docs.reduce((a, d) => {
    const e = d.data().events ?? {};
    return a + Number(e.click_airbnb ?? 0) + Number(e.click_booking_com ?? 0)
      + Number(e.click_booking_calendar ?? 0);
  }, 0);

  /* 先付け率は最新日の値（率は平均せず、いまの状態を見る） */
  const latestBk = [...bk].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const fwdRate = latestBk?.fwd?.rate != null ? Number(latestBk.fwd.rate) * 100 : null;

  /* GSCはページ単位。URLの一部で拾う（記事の場所が変わっても追えるように） */
  const pageAgg = (needle: string) => {
    const rs = gscPageSnap.docs.map((d) => d.data())
      .filter((r) => String(r.page ?? "").includes(needle));
    if (!rs.length) return { position: null, ctr: null };
    const imp = rs.reduce((a, r) => a + Number(r.impressions ?? 0), 0);
    if (!imp) return { position: null, ctr: null };
    const clicks = rs.reduce((a, r) => a + Number(r.clicks ?? 0), 0);
    const pos = rs.reduce((a, r) => a + Number(r.position ?? 0) * Number(r.impressions ?? 0), 0) / imp;
    return { position: pos, ctr: (clicks / imp) * 100 };
  };
  const villa = pageAgg("villa");
  const wts = pageAgg("where-to-stay");

  const METRICS: Record<string, { v: number | null; unit: string }> = {
    "pace.kiyokawa": { v: Math.round(paceK * 10) / 10, unit: "泊/週" },
    "pace.takasago": { v: Math.round(paceT * 10) / 10, unit: "泊/週" },
    "pace.total": { v: Math.round((paceK + paceT) * 10) / 10, unit: "泊/週" },
    "ads.cpaHandoff": { v: handoff ? Math.round(adsCost / handoff) : null, unit: "円" },
    "fwd.rate": { v: fwdRate == null ? null : Math.round(fwdRate * 10) / 10, unit: "%" },
    "gsc.position.villa": { v: villa.position == null ? null : Math.round(villa.position * 10) / 10, unit: "位" },
    "gsc.ctr.where-to-stay": { v: wts.ctr == null ? null : Math.round(wts.ctr * 100) / 100, unit: "%" },
  };

  const judge = (actual: number | null, th: number, op: string): boolean | null => {
    if (actual == null) return null;
    if (op === "gte") return actual >= th;
    if (op === "lte") return actual <= th;
    if (op === "between33") return actual >= th && actual <= 33;   // 先付けの適正帯 28〜33%
    return null;
  };

  const rows: Judgment[] = jSnap.docs
    .filter((d) => d.data().active !== false)
    .map((d) => {
      const j = d.data() as Omit<Judgment, "id" | "actual" | "unit" | "pass" | "daysLeft" | "state">;
      const m = METRICS[j.metric] ?? { v: null, unit: "" };
      const daysLeft = Math.round((Date.parse(j.due) - Date.parse(today)) / 864e5);
      return {
        id: d.id, ...j,
        actual: m.v, unit: m.unit,
        pass: judge(m.v, Number(j.threshold), String(j.op)),
        daysLeft,
        state: (daysLeft < 0 ? "期限切れ" : daysLeft <= 7 ? "今週" : "先") as Judgment["state"],
      };
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));

  return {
    rows,
    total: {
      count: rows.length,
      due: rows.filter((r) => r.state !== "先").length,          // 期限切れ＋今週
      failing: rows.filter((r) => r.pass === false).length,
      unknown: rows.filter((r) => r.pass === null).length,        // 実測が取れていない
    },
    asOf: today,
  };
}
