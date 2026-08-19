/**
 * 周期エンジン — 業者ディスパッチ仕様書 §3
 *
 * 役割は3つだけ:
 *   1. 起票   … schedules の周期から、期日の leadDays 前になったジョブを作る（冪等）
 *   2. 再登録 … ジョブが verified になったら次回分を自動で作る（人が思い出さない）
 *   3. 見張り … 期日に対して遅れているジョブを検知する（fail-closed・§6）
 *
 * ここではメールを送らない（送信は dispatcher が担当）。エンジンは「いつ・何を・誰に」だけを決める。
 */
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Job, JobStatus, Schedule } from "./model.js";

export const agencyDb = () => getFirestore("agency");

const JST = "Asia/Tokyo";
/** JSTの「今」を {y, m} で返す（月の判定は必ずJSTで行う） */
export function nowJst(d = new Date()): { y: number; m: number; day: number } {
  const s = d.toLocaleDateString("sv-SE", { timeZone: JST }); // YYYY-MM-DD
  const [y, m, day] = s.split("-").map(Number);
  return { y, m, day };
}
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

/** 予定月の1日を基準日とする（実施日は業者との調整で決まるため、月単位で管理する） */
function dueDate(y: number, m: number): Date {
  return new Date(`${ym(y, m)}-01T00:00:00+09:00`);
}

/**
 * schedule から「次に来る実施月」を列挙する（今月以降・count件）。
 *
 * everyYears を指定すると数年に一度の作業になる（外壁クリーニング=5年など）。
 * 基準年 anchorYear から everyYears ごとの年だけを拾う。
 * 何年も先の話なので、忘れないためにこそ機械に持たせる。
 */
export function upcomingMonths(
  months: number[], from: { y: number; m: number }, count = 4,
  everyYears = 1, anchorYear?: number,
): Array<{ y: number; m: number }> {
  const out: Array<{ y: number; m: number }> = [];
  const sorted = [...months].sort((a, b) => a - b);
  const step = Math.max(1, everyYears);
  const anchor = anchorYear ?? from.y;
  let y = from.y;
  while (out.length < count) {
    const onCycle = ((y - anchor) % step + step) % step === 0;
    if (onCycle) {
      for (const m of sorted) {
        if (y > from.y || m >= from.m) out.push({ y, m });
        if (out.length >= count) break;
      }
    }
    y++;
    if (y > from.y + 20 * step) break; // 保険
  }
  return out;
}

/**
 * 起票: leadDays 以内に迫った実施月のジョブを作る。
 * 冪等キー = `${scheduleId}:${yyyy-mm}` なので、何度実行しても二重に作らない。
 */
export async function createDueJobs(now = new Date()): Promise<{ created: string[]; skipped: number }> {
  const db = agencyDb();
  const today = nowJst(now);
  const snap = await db.collection("schedules").where("active", "==", true).get();
  const created: string[] = [];
  let skipped = 0;

  for (const doc of snap.docs) {
    const s = doc.data() as Schedule;
    const lead = s.leadDays ?? 60;
    for (const { y, m } of upcomingMonths(s.months, today, 4, s.everyYears, s.anchorYear)) {
      const daysUntil = Math.floor((dueDate(y, m).getTime() - now.getTime()) / 86400000);
      if (daysUntil > lead) continue;              // まだ早い
      const trigger = `${doc.id}:${ym(y, m)}`;
      const existing = await db.collection("jobs").where("trigger", "==", trigger).limit(1).get();
      if (!existing.empty) { skipped++; continue; } // 既に起票済み

      const nowIso = new Date().toISOString();
      const job: Job = {
        type: "periodic",
        title: s.title,
        prop: s.prop,
        vendorId: s.vendorId,
        scheduleId: doc.id,
        trigger,
        status: "draft",                            // ドライラン中は人が送信する
        dueMonth: ym(y, m),
        statutory: s.statutory,
        budget: s.budget,
        manualOnly: s.manualOnly ?? false,
        timeline: [{ at: nowIso, status: "draft", by: "system",
          note: `周期マスタから自動起票（実施予定 ${ym(y, m)}）${s.manualOnly ? "・人が対応する作業" : ""}` }],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await db.collection("jobs").add(job as unknown as Record<string, unknown>);
      created.push(trigger);
    }
  }
  return { created, skipped };
}

/**
 * 再登録: verified になったジョブの次回分を作る。
 * 「一度登録したら、以後は人が思い出さなくてよい」を成立させる中核（発注者指示 2026-08-18）。
 */
export async function scheduleNext(jobId: string): Promise<string | null> {
  const db = agencyDb();
  const ref = db.collection("jobs").doc(jobId);
  const snap = await ref.get();
  const job = snap.data() as Job | undefined;
  if (!job?.scheduleId || job.status !== "verified") return null;

  const sc = await db.collection("schedules").doc(job.scheduleId).get();
  const s = sc.data() as Schedule | undefined;
  if (!s?.active) return null;

  const [dy, dm] = job.dueMonth.split("-").map(Number);
  const next = upcomingMonths(
    s.months, { y: dm === 12 ? dy + 1 : dy, m: dm === 12 ? 1 : dm + 1 }, 1, s.everyYears, s.anchorYear)[0];
  if (!next) return null;   // 周期の設定が壊れていれば黙って次回を作らない（誤った期日を置かない）
  const trigger = `${job.scheduleId}:${ym(next.y, next.m)}`;
  const dup = await db.collection("jobs").where("trigger", "==", trigger).limit(1).get();
  if (!dup.empty) return null;

  const nowIso = new Date().toISOString();
  await db.collection("jobs").add({
    type: "periodic", title: s.title, prop: s.prop, vendorId: s.vendorId, scheduleId: job.scheduleId,
    trigger, status: "draft", dueMonth: ym(next.y, next.m), statutory: s.statutory, budget: s.budget,
    timeline: [{ at: nowIso, status: "draft", by: "system", note: `前回完了により次回分を自動登録（${job.dueMonth} → ${ym(next.y, next.m)}）` }],
    createdAt: nowIso, updatedAt: nowIso,
  });
  return trigger;
}

/** 状態遷移は必ずここを通す（timeline に追記・上書きしない = append-only） */
export async function advance(jobId: string, status: JobStatus, by: "ai" | "human" | "system", note?: string): Promise<void> {
  const db = agencyDb();
  const nowIso = new Date().toISOString();
  await db.collection("jobs").doc(jobId).update({
    status,
    updatedAt: nowIso,
    timeline: FieldValue.arrayUnion({ at: nowIso, status, by, ...(note ? { note } : {}) }),
  });
  if (status === "verified") await scheduleNext(jobId);
}

/**
 * 見張り: 遅れているジョブを返す（fail-closed §6）。
 *   法定 … 期日30日前までに confirmed でなければ警告
 *   任意 … 期日 7日前までに confirmed でなければ警告
 *   期日超過 … 警告、14日超過で最上級
 * 「やったことになる」自動遷移は行わない。放置してもジョブは消えない。
 */
export async function findOverdue(now = new Date()): Promise<Array<{ id: string; job: Job; level: "warn" | "critical"; reason: string }>> {
  const db = agencyDb();
  const snap = await db.collection("jobs")
    .where("status", "in", ["draft", "sent", "negotiating", "confirmed", "done"])
    .get();
  const out: Array<{ id: string; job: Job; level: "warn" | "critical"; reason: string }> = [];

  for (const doc of snap.docs) {
    const job = doc.data() as Job;
    const [y, m] = job.dueMonth.split("-").map(Number);
    const days = Math.floor((dueDate(y, m).getTime() - now.getTime()) / 86400000);
    const settled = job.status === "confirmed" || job.status === "done";

    if (days < -14) out.push({ id: doc.id, job, level: "critical", reason: `期日を${-days}日超過（${job.status}）` });
    else if (days < 0) out.push({ id: doc.id, job, level: "warn", reason: `期日を${-days}日超過（${job.status}）` });
    else if (!settled && job.statutory && days <= 30) out.push({ id: doc.id, job, level: "warn", reason: `法定・期日まで${days}日で未確定` });
    else if (!settled && !job.statutory && days <= 7) out.push({ id: doc.id, job, level: "warn", reason: `期日まで${days}日で未確定` });
  }
  return out;
}

/** ハートビート（原則2-2・沈黙の検知）。処理が成功したら必ず打つ */
export async function beat(name: string, expectEverySec: number): Promise<void> {
  await agencyDb().collection("heartbeats").doc(name).set({
    lastSuccessAt: new Date().toISOString(), expectEverySec, updatedAt: Timestamp.now(),
  }, { merge: true });
}

/** 見張りの見張り: 期待間隔を過ぎても更新のないハートビートを返す */
export async function staleHeartbeats(now = new Date()): Promise<Array<{ name: string; silentSec: number }>> {
  const snap = await agencyDb().collection("heartbeats").get();
  return snap.docs.flatMap((d) => {
    const h = d.data() as { lastSuccessAt: string; expectEverySec: number };
    const silent = (now.getTime() - new Date(h.lastSuccessAt).getTime()) / 1000;
    return silent > h.expectEverySec * 1.5 ? [{ name: d.id, silentSec: Math.floor(silent) }] : [];
  });
}
