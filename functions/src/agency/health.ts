/**
 * health — 全検証を1本に常設する（A・2026-08-25 発注者承認）
 *
 * 分析の前に必ずここを1回叩けば、全カードの数字の信頼度が分かる。
 * カード内の監査（物件の血統・二重計上など）に加えて、カードをまたぐ不変条件を見る。
 * check.card は index の data-key と同一文字列——ドットの色はここから導出する
 * （手動ドットは廃止。保存された判断もどきを持たない・G）。
 */
import { getFirestore } from "firebase-admin/firestore";
import { agencyDb, findOverdue } from "./engine.js";
import { propertySummary } from "./props.js";
import { renewalPlan } from "./lifecycle.js";
import { estimatesDue, warrantyDue } from "./alerts.js";

export type HealthCheck = { card: string; name: string; ok: boolean; detail: string };

export async function healthSummary() {
  const db = agencyDb();
  const now = new Date();
  const checks: HealthCheck[] = [];
  const add = (card: string, name: string, ok: boolean, detail = "") =>
    checks.push({ card, name, ok, detail });

  const [props, plan, overdue, est, conSnap, cvrSnap, schedSnap, eqSnap, jobSnap, asmSnap] =
    await Promise.all([
      propertySummary(), renewalPlan(), findOverdue(now), estimatesDue(now),
      db.collection("contracts").get(), db.collection("cvr").get(),
      db.collection("schedules").get(),
      db.collection("equipment").where("kind", "==", "equipment").get(),
      db.collection("jobs").where("status", "in",
        ["draft", "sent", "negotiating", "confirmed", "done"]).get(),
      db.collection("assumptions").get(),
    ]);
  /* 手動の上書き（人の判断＝保存してよい・Firestoreが正本）。色は上書きが勝つが、
     検証結果は捨てない——ツールチップに残す */
  const ovDoc = await db.collection("settings").doc("dots").get();
  const overrides = (ovDoc.data()?.cards ?? {}) as Record<string, { state: string; by: string; at: string }>;

  /* 物件: 各棟の監査（血統・二重計上・group未宣言） */
  for (const r of props.rows as Array<{ id: string; label?: string;
      audit?: { ok: number; total: number; warn: Array<{ name: string; detail: string }> } }>) {
    if (!r.audit?.total) continue;
    add("物件", `${r.label ?? r.id}: 監査`, r.audit.warn.length === 0,
      r.audit.warn.length ? r.audit.warn.map((w) => `${w.name}(${w.detail})`).join(" / ")
        : `${r.audit.ok}/${r.audit.total}`);
  }

  /* 物件×固定費: 積立が年割りで足りているか（棟ごと） */
  for (const p of plan.byProp) {
    add("固定費", `${p.propLabel}: 積立 vs 年割り`, p.gap >= 0,
      `${p.gap >= 0 ? "+" : ""}${p.gap.toLocaleString()}円/年`);
  }
  add("物件", "耐用年数の欠測", plan.total.noLifespan === 0, `${plan.total.noLifespan}件`);

  /* メンテナンス: 期日・見積・紐づけの整合 */
  add("メンテナンス", "期日超過のジョブ", overdue.length === 0,
    overdue.map((o) => o.job.title).join(" / ") || "なし");
  const wty = await warrantyDue(now);
  add("メンテナンス", "保証の期限が近い設備", wty.length === 0,
    wty.map((w) => `${w.label}(${w.until}まで)`).join(" / ") || "なし");
  add("メンテナンス", "見積の催促（実施年が近い概算）", est.length === 0,
    est.map((e) => `${e.label}(${e.due})`).join(" / ") || "なし");
  const eqIds = new Set(eqSnap.docs.map((d) => d.id));
  const dangling = schedSnap.docs
    .filter((d) => d.data().ledgerId && !eqIds.has(String(d.data().ledgerId)))
    .map((d) => String(d.data().title ?? d.id));
  add("メンテナンス", "台帳への紐づけ切れ（schedules.ledgerId）", dangling.length === 0,
    dangling.join(" / ") || "なし");
  const schedIds = new Set(schedSnap.docs.map((d) => d.id));
  const orphanJobs = jobSnap.docs
    .filter((d) => d.data().scheduleId && !schedIds.has(String(d.data().scheduleId)))
    .map((d) => String(d.data().title ?? d.id));
  add("メンテナンス", "周期への紐づけ切れ（jobs.scheduleId）", orphanJobs.length === 0,
    orphanJobs.join(" / ") || "なし");

  /* 契約書類: 期限と原本 */
  const today = now.toISOString().slice(0, 10);
  const d90 = new Date(now.getTime() + 90 * 864e5).toISOString().slice(0, 10);
  const cons: Array<Record<string, unknown>> = conSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Record<string, unknown>));
  const expired = cons.filter((c) => c.expiresAt && String(c.expiresAt) < today);
  const expiring = cons.filter((c) => c.expiresAt && String(c.expiresAt) >= today && String(c.expiresAt) <= d90);
  const noOriginal = cons.filter((c) => !c.path && !c.file);
  add("契約書類", "期限切れ", expired.length === 0, expired.map((c) => String(c.label)).join(" / ") || "なし");
  add("契約書類", "90日以内に期限", expiring.length === 0, expiring.map((c) => `${c.label}(${c.expiresAt})`).join(" / ") || "なし");
  add("契約書類", "原本が未登録", noOriginal.length === 0, `${noOriginal.length}件`);

  /* 定期レポート: CVRの内部整合（閲覧÷表示＝検索→閲覧） */
  const cvrBad = cvrSnap.docs.filter((d) => {
    const x = d.data();
    if (x.views == null || x.impressions == null || x.searchToView == null) return false;
    return Math.abs((Number(x.views) / Number(x.impressions)) * 100 - Number(x.searchToView)) > 0.06;
  }).map((d) => d.id);
  add("定期レポート", "CVRの検算（閲覧÷表示）", cvrBad.length === 0, cvrBad.join(" / ") || "全行一致");

  /* 横断: AIRSTAR月次報告の稼働 ↔ Beds24の実予約（独立ソース同士の突合・2026-08-25 発注者承認）。
     報告書は運営会社の申告、beds24_state は毎朝の観測ジョブが維持する生の予約一覧——出所が別。
     予約の泊を月に按分して締月ごとに比べる。許容±2泊（按分・キャンセル扱いの差） */
  try {
    const PROP_JA: Record<string, string> = { "清川": "kiyokawa", "高砂": "takasago" };
    const st = (await getFirestore().collection("beds24_state").doc("latest").get()).data();
    const bookings = (st?.bookings ?? {}) as Record<string,
      { status?: string; arrival?: string; n?: number; prop?: string }>;
    const nights: Record<string, number> = {};
    for (const b of Object.values(bookings)) {
      if (!b?.arrival || String(b.status ?? "") === "cancelled") continue;
      const prop = PROP_JA[String(b.prop)] ?? String(b.prop);
      const d = new Date(String(b.arrival) + "T00:00:00Z");
      for (let i = 0; i < Number(b.n ?? 0); i++) {
        const ym = d.toISOString().slice(0, 7);
        nights[`${prop}|${ym}`] = (nights[`${prop}|${ym}`] ?? 0) + 1;
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
    const thisYm = now.toISOString().slice(0, 7);
    const revSnap = await db.collection("revenue").where("kind", "==", "monthly").get();
    const byProp: Record<string, string[]> = {};
    let comparable = 0;
    for (const dref of revSnap.docs) {
      const r = dref.data() as { prop: string; month: string; occ: number };
      if (!r.month || r.month >= thisYm) continue;
      /* beds24_state の履歴は2026年5月末から。5月は部分データで必ず偽陽性になるため
         照合の下限を06に置く（06は両棟±0泊で一致を実測確認・2026-08-25） */
      if (r.month < "2026-06") continue;
      const beds = nights[`${r.prop}|${r.month}`];
      if (beds == null) continue;   // Beds24側に履歴が無い月は照合しない（下の件数で欠測が分かる）
      comparable++;
      const days = new Date(Number(r.month.slice(0, 4)), Number(r.month.slice(5, 7)), 0).getDate();
      const rep = Math.round(Number(r.occ) / 100 * days);
      byProp[r.prop] ??= [];
      if (Math.abs(beds - rep) > 2) byProp[r.prop].push(`${r.month}: 報告${rep}泊 vs Beds24 ${beds}泊`);
    }
    for (const [prop, bad] of Object.entries(byProp)) {
      const label = prop === "kiyokawa" ? "清川" : prop === "takasago" ? "高砂" : prop;
      add("定期レポート", `${label}: 稼働の突合（AIRSTAR報告 ↔ Beds24実予約）`, bad.length === 0,
        bad.length ? bad.join(" / ") : `照合できた全月が±2泊以内（${comparable}ヶ月）`);
    }
  } catch {
    add("定期レポート", "Beds24との突合", false, "beds24_state が読めない");
  }

  /* 前提の存在（係数が消えていたらフォールバックで動くが、気づけるように） */
  const asm = new Set(asmSnap.docs.map((d) => d.id));
  add("利回り", "前提: cap-rate", asm.has("cap-rate"), "");
  add("財務", "前提: management-fee", asm.has("management-fee"), "");
  add("物件", "前提: lifecycle", asm.has("lifecycle"), "");

  const summary = { ok: checks.filter((c) => c.ok).length,
    warn: checks.filter((c) => !c.ok).length, total: checks.length, at: now.toISOString() };
  return { checks, summary, overrides };
}
