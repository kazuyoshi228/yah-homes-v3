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
import type { Job, JobStatus, Schedule, PropKey } from "./model.js";
import { enrichSchedules } from "./schedules.js";

export const agencyDb = () => getFirestore("agency");

/* ── 書き込みの入口（2026-09-03 発注者承認・design_agency_db_review_20260903.md C案）──
 *
 * なぜ: 53コレクションのうち updatedBy が完備しているのは construction だけだった。
 * 「誰が入れた数字か」がほぼ残っていない。AIが台帳へ書く頻度が上がるほど、
 * 人が確認した数字とAIが置いた数字を後から区別できないことのコストが上がる。
 *
 * 書き込みはすべてここを通す。writecheck.mjs がCIで直接の .set()/.update() を止める。
 */
export type Actor = { by: string; kind: "human" | "ai" | "job" };

/* 変更履歴を残すコレクション（2026-09-04 発注者指示）。
   これまで updatedAt / updatedBy はあったが【前の値が消えていた】。
   2026-09-04、AIが assumptions/family-fund.postPlan の金額を1日で4回上書きし、
   誰がいつ何から何に変えたのかが復元できなくなった。金額を扱う台帳としては欠陥。
   対象は金額・係数・人の判断を持つものだけ——ログ・定点・キャッシュは対象外
   （量が多く、履歴の価値もない）。 */
const HISTORY_COLS = new Set([
  "finance", "assumptions", "scenarios", "bsAdjustments", "items", "equipment",
  "properties", "taxes", "insurance", "reserves", "personalAssets", "cash", "terms", "people",
]);

/** 変わったフィールドだけを before/after で返す（ドキュメント全体をコピーしない） */
function diffFields(before: Record<string, unknown> | undefined, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {}, a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (k === "updatedAt" || k === "updatedBy" || k === "updatedByKind") continue;
    const bv = before?.[k];
    if (JSON.stringify(bv) === JSON.stringify(after[k])) continue;
    if (bv !== undefined) b[k] = bv;
    a[k] = after[k];
  }
  return { before: b, after: a };
}

/** 台帳へ書く。updatedAt / updatedBy / updatedByKind を必ず添え、変更履歴を残す */
export async function ledgerSet(
  col: string, id: string, data: Record<string, unknown>,
  actor: Actor, opts: { merge?: boolean; note?: string } = {},
) {
  const db = agencyDb();
  const ref = db.collection(col).doc(id);
  const at = new Date().toISOString();
  const stamped = { ...data, updatedAt: at, updatedBy: actor.by, updatedByKind: actor.kind };

  if (!HISTORY_COLS.has(col)) {
    if (opts.merge) await ref.set(stamped, { merge: true });
    else await ref.set(stamped);
    return ref;
  }
  /* 本体と履歴は【同じトランザクション】で書く。片方だけ残ると履歴が信用できなくなる */
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const before = cur.exists ? (cur.data() as Record<string, unknown>) : undefined;
    const d = diffFields(before, stamped);
    if (opts.merge) tx.set(ref, stamped, { merge: true });
    else tx.set(ref, stamped);
    /* 中身が何も変わっていないなら履歴を残さない（同じ値の書き直しでログが膨らむ） */
    if (Object.keys(d.after).length === 0) return;
    tx.set(ref.collection("history").doc(at), {
      at, by: actor.by, byKind: actor.kind,
      action: cur.exists ? "update" : "create",
      ...d, ...(opts.note ? { note: opts.note } : {}),
    });
  });
  return ref;
}

/** 判断（assumptions など）を書く。status を必ず求める——
 *  「決定なのか検討中なのか」が読めないと、AIが検討中の値を確定として使う
 *  （2026-09-03、cap-rate 6.0%＝収益仲介1件の回答を、確定した数字として扱った） */
export type JudgementStatus = "confirmed" | "proposed" | "provisional";
export async function ledgerJudgement(
  col: string, id: string, data: Record<string, unknown>,
  status: JudgementStatus, actor: Actor, source: string,
) {
  if (!source) throw new Error(`${col}/${id}: source が空です（何に基づく判断かを書く）`);
  return ledgerSet(col, id, { ...data, status, source }, actor, { merge: true });
}


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
export async function createDueJobs(now = new Date()): Promise<{ created: string[]; skipped: number; noMonth: number }> {
  const db = agencyDb();
  const [schedSnap, jobSnap, eqSnap, propSnap] = await Promise.all([
    db.collection("schedules").where("active", "==", true).get(),
    db.collection("jobs").get(),
    db.collection("equipment").get(),
    db.collection("properties").get(),
  ]);
  const withId = (s: FirebaseFirestore.QuerySnapshot) =>
    s.docs.map((d) => ({ id: d.id, ...d.data() }));
  const jobs = withId(jobSnap);
  /* 次回の出し方はカードと同じ関数を使う。以前はここに months + everyYears の独自計算があり、
     everyMonths への移行に追随できていなかった——実施月が空のものは一度も起票されず、
     四半期のものは年1回として扱われていた（2026-08-27 発注者指摘で発見） */
  const views = enrichSchedules(withId(schedSnap), jobs, withId(eqSnap), withId(propSnap));

  const created: string[] = [];
  let skipped = 0, noMonth = 0;

  for (const v of views) {
    const next = String(v.nextDueMonth ?? "");
    const m = next.match(/^(\d{4})\/(\d{2})$/);
    if (!m) { if (next) noMonth++; continue; }   // 「2027年」＝実施月が未定。人が決めるまで起票しない
    const y = Number(m[1]), mm = Number(m[2]);
    const dueYm = ym(y, mm);
    const lead = Number(v.leadDays ?? 60);
    const daysUntil = Math.floor((dueDate(y, mm).getTime() - now.getTime()) / 86400000);
    if (daysUntil > lead) continue;              // まだ早い

    /* 同じ周期・同じ月に生きているジョブがあれば作らない。trigger だけで見ると、
       業者ポータルや手入力で作られたジョブ（trigger を持たない）と二重になる */
    if (jobs.some((j: Record<string, unknown>) =>
      String(j.scheduleId ?? "") === v.id && String(j.dueMonth ?? "") === dueYm &&
      !["cancelled"].includes(String(j.status)))) { skipped++; continue; }

    const nowIso = new Date().toISOString();
    const job: Job = {
      type: "periodic",
      title: String(v.title ?? ""),
      prop: v.prop as PropKey,
      vendorId: String(v.vendorId ?? ""),
      scheduleId: v.id,
      trigger: `${v.id}:${dueYm}`,
      status: "draft",
      dueMonth: dueYm,
      statutory: !!v.statutory,
      budget: Number(v.budget ?? 0),
      manualOnly: v.manualOnly === true,
      timeline: [{ at: nowIso, status: "draft", by: "system",
        note: `周期マスタから自動起票（実施予定 ${dueYm}）${v.manualOnly ? "・人が対応する作業" : ""}` }],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    /* docID = trigger の create() で並行起票を構造的に弾く（レビュー2026-08-28 P1）。
       agencyDaily と画面操作が同時に走っても2通目は ALREADY_EXISTS で消える */
    try {
      await db.collection("jobs").doc(job.trigger as string).create(job as unknown as Record<string, unknown>);
      created.push(job.trigger as string);
    } catch (e) {
      if ((e as { code?: number }).code === 6) { skipped++; continue; }
      throw e;
    }
  }
  return { created, skipped, noMonth };
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
  const nowIso = new Date().toISOString();
  try {
    await db.collection("jobs").doc(trigger).create({
      type: "periodic", title: s.title, prop: s.prop, vendorId: s.vendorId, scheduleId: job.scheduleId,
      trigger, status: "draft", dueMonth: ym(next.y, next.m), statutory: s.statutory, budget: s.budget,
      timeline: [{ at: nowIso, status: "draft", by: "system", note: `前回完了により次回分を自動登録（${job.dueMonth} → ${ym(next.y, next.m)}）` }],
      createdAt: nowIso, updatedAt: nowIso,
    });
  } catch (e) {
    if ((e as { code?: number }).code === 6) return null;   // 既に起票済み（並行実行）
    throw e;
  }
  return trigger;
}

/**
 * 消し込みの書き戻し: 完了確定したジョブの実績を、設備台帳の項目へ返す。
 *
 * これが無いと、作業をやっても更新計画はいつまでも当初の概算のままになる。
 * 実施年月を入れ直すので次の更新年がずれ、実額を入れるので年割りが本物になる。
 * 前の値は history[] に残す（上書きの痕跡を消さない）。
 *
 * 紐づけは schedules.ledgerId → equipment のドキュメントID。
 * ledgerId が無いジョブ（清掃・消防点検など、物に紐づかない作業）は何もしない。
 */
async function writeBackToLedger(job: Job & { actual?: { amount?: number; ym?: string } }): Promise<string | null> {
  const db = agencyDb();
  if (!job.scheduleId) return null;
  const sc = await db.collection("schedules").doc(job.scheduleId).get();
  const ledgerId = String(sc.data()?.ledgerId ?? "");
  if (!ledgerId) return null;

  const ref = db.collection("equipment").doc(ledgerId);
  const cur = await ref.get();
  if (!cur.exists) return null;
  const e = cur.data() ?? {};

  /* 実施年月は、報告があればそれ。無ければ期日の月を使う（推測せず、あるものを使う） */
  const ym = job.actual?.ym || job.confirmedAt?.slice(0, 7) || job.dueMonth;
  /* 実額は報告があるときだけ置き換える。無いなら概算のまま（勝手に確定させない） */
  const amount = Number(job.actual?.amount ?? 0);

  const patch: Record<string, unknown> = {
    installedAt: ym,
    date: ym,
    history: FieldValue.arrayUnion({
      at: new Date().toISOString(), ym, jobId: job.trigger,
      before: Number(e.amount ?? e.price ?? 0), after: amount || Number(e.amount ?? e.price ?? 0),
      note: amount ? "実額に置き換え" : "実施年月のみ更新（実額の報告なし）",
    }),
    updatedAt: new Date().toISOString(),
  };
  if (amount > 0) {
    patch.amount = amount; patch.price = amount;
    patch.estimate = FieldValue.delete();     // 概算ではなくなった
    patch.futureCost = false;                 // もう払った
  }
  await ref.set(patch, { merge: true });
  return ledgerId;
}

/**
 * 保証点検ジョブ（H）。期限90日前に1回だけ内部ジョブを起票する。
 * trigger を warranty:{台帳ID}:{期限} にして二重起票しない。人が動く前提（manualOnly）。
 */
export async function createWarrantyJobs(now = new Date()): Promise<number> {
  const db = agencyDb();
  const { warrantyDue } = await import("./alerts.js");
  const due = await warrantyDue(now);
  let made = 0;
  for (const w of due) {
    const trigger = `warranty:${w.id}:${w.until}`;
    const nowIso = now.toISOString();
    try {
    await db.collection("jobs").doc(trigger).create({
      type: "internal", title: `保証期限前の点検（${w.label}・${w.until}まで）`,
      prop: w.prop, trigger, status: "draft", dueMonth: w.until,
      statutory: false, manualOnly: true,
      timeline: [{ at: nowIso, status: "draft", by: "system",
        note: "保証期限の90日前。不調がないか点検し、あれば保証で修理（症状がないと保証は使えない）" }],
      createdAt: nowIso, updatedAt: nowIso,
    });
    made++;
    } catch (e) { if ((e as { code?: number }).code !== 6) throw e; }
  }
  return made;
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
  if (status !== "verified") return;
  const job = (await db.collection("jobs").doc(jobId).get()).data() as Job | undefined;
  if (job) {
    const led = await writeBackToLedger(job);
    if (led) {
      await db.collection("jobs").doc(jobId).update({
        ledgerWrittenBack: led, updatedAt: new Date().toISOString(),
        timeline: FieldValue.arrayUnion({ at: new Date().toISOString(), status, by: "system",
          note: `設備台帳 ${led} に実績を書き戻した` }),
      });
    }
  }
  await scheduleNext(jobId);
}

/**
 * 見張り: 遅れているジョブを返す（fail-closed §6）。
 *   法定 … 期日30日前までに confirmed でなければ警告
 *   任意 … 期日 7日前までに confirmed でなければ警告
 *   期日超過 … 警告、14日超過で最上級
 * 「やったことになる」自動遷移は行わない。放置してもジョブは消えない。
 */
export async function findOverdue(now = new Date()): Promise<Array<{ id: string; job: Job; level: "warn" | "critical"; reason: string; dueLabel: string }>> {
  const db = agencyDb();
  const snap = await db.collection("jobs")
    .where("status", "in", ["draft", "sent", "negotiating", "confirmed", "done"])
    .get();
  const out: Array<{ id: string; job: Job; level: "warn" | "critical"; reason: string; dueLabel: string }> = [];

  for (const doc of snap.docs) {
    const job = doc.data() as Job & { plantingDate?: string };
    const c = classifyOverdue(job, now);
    if (c) out.push({ id: doc.id, job, ...c });
  }
  return out;
}

/**
 * 1ジョブの期日判定（純粋関数・自動テスト対象）。
 * 期日は日付で追う（2026-08-27 発注者指示）。実施日が決まっているジョブ
 * （plantingDate / confirmedAt）はその日が期日。月単位のジョブは「月が終わるまで」は
 * 超過ではない——従来は月初を期日扱いにして、月の途中で「27日超過」と誤報していた。
 */
export function classifyOverdue(job: Job & { plantingDate?: string }, now: Date):
  { level: "warn" | "critical"; reason: string; dueLabel: string } | null {
  const [y, m] = job.dueMonth.split("-").map(Number);
  const exact = String(job.plantingDate ?? job.confirmedAt ?? "").slice(0, 10);
  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(exact);
  const hard = hasDate ? new Date(`${exact}T23:59:59+09:00`)
    : new Date(`${ym(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1)}-01T00:00:00+09:00`);
  const daysHard = Math.floor((hard.getTime() - now.getTime()) / 86400000);
  /* 確定の締切は従来どおり月初（実施月に入る前に業者と合意していてほしい） */
  const daysConfirm = Math.floor((dueDate(y, m).getTime() - now.getTime()) / 86400000);
  const settled = job.status === "confirmed" || job.status === "done";
  const dueLabel = hasDate ? exact : job.dueMonth;

  if (daysHard < -14) return { level: "critical", reason: `期日を${-daysHard}日超過（${job.status}）`, dueLabel };
  if (daysHard < 0) return { level: "warn", reason: `期日を${-daysHard}日超過（${job.status}）`, dueLabel };
  if (!settled && daysConfirm < 0) return { level: "warn", reason: `実施月に入って${-daysConfirm}日、まだ未確定（${job.status}）`, dueLabel };
  if (!settled && job.statutory && daysConfirm <= 30) return { level: "warn", reason: `法定・期日まで${daysConfirm}日で未確定`, dueLabel };
  if (!settled && !job.statutory && daysConfirm <= 7) return { level: "warn", reason: `期日まで${daysConfirm}日で未確定`, dueLabel };
  return null;
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
