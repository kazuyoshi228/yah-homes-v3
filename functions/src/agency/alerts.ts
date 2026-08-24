/**
 * アラート配信 — 業者ディスパッチ仕様書 §6（fail-closed の出口）
 *
 * 見張り（engine.findOverdue / staleHeartbeats）が見つけた異常を、人に届ける。
 * 静かに壊れないための最後の一段。届かなければ意味がないので、
 * ここ自体の失敗も次回のハートビート点検で検知される。
 */
import { agencyDb, findOverdue, staleHeartbeats } from "./engine.js";
import { notifySettings } from "./settings.js";
import { sendOrDraft } from "./mailer.js";

const PROP_LABEL: Record<string, string> = {
  kiyokawa: "清川", takasago: "高砂", ropponmatsu: "六本松", otemonA: "大手門A", otemonB: "大手門B",
};

/** 例外ジョブ（人の判断待ち）を集める */
async function exceptions() {
  const snap = await agencyDb().collection("jobs").where("status", "==", "exception").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as Array<{
    id: string; title: string; prop: string; dueMonth: string;
    timeline: Array<{ note?: string }>;
  }>;
}

/** 未紐付けメール（誰宛か分からなかったもの） */
async function unmatched() {
  const snap = await agencyDb().collection("unmatched").where("needsHuman", "==", true).get();
  return snap.docs.map((d) => d.data() as { from: string; subject: string });
}

/**
 * 毎朝の点検メール。異常が1つも無ければ送らない（通知が増えると読まれなくなるため）。
 * ただし「沈黙の検知」だけは別で、ハートビートが切れていたら必ず送る。
 */
/**
 * 見積の催促 — 概算のまま実施年が近づいている長期修繕を拾う。
 *
 * これが無いと、2036年に¥132万の請求書を見て初めて概算が甘かったと気づくことになる。
 * 実施年の1年前に出す。金額が概算（estimate が付いている）ものだけが対象。
 */
async function estimatesDue(now: Date): Promise<Array<{ label: string; prop: string; due: number; amount: number }>> {
  const db = agencyDb();
  const [eq, props] = await Promise.all([
    db.collection("equipment").where("kind", "==", "equipment").get(),
    db.collection("properties").get(),
  ]);
  const label = new Map(props.docs.map((d) => [d.id, String(d.data().label ?? d.id)]));
  const fx = new Map(props.docs.map((d) => [d.id,
    { f: Number(d.data().usageFactor ?? 2), c: Number(d.data().lifespanCapYears ?? 30) }]));
  const y = now.getFullYear();
  const out: Array<{ label: string; prop: string; due: number; amount: number }> = [];
  for (const d of eq.docs) {
    const e = d.data();
    if (!e.estimate) continue;                       // 実額が入っているものは催促しない
    if (e.estimateObtained === true) continue;       // 見積を取り終えたものも催促しない
    const life = Number(e.lifespanYears ?? 0);
    if (!life) continue;
    const p = fx.get(String(e.prop)) ?? { f: 2, c: 30 };
    const ov = Number(e.effectiveYearsOverride ?? 0);
    const eff = ov > 0 ? ov : e.noFactor === true ? life : Math.min(life * p.f, p.c);
    const at = String(e.installedAt ?? e.date ?? "");
    if (!/^\d{4}/.test(at)) continue;
    const due = Math.round(Number(at.slice(0, 4)) + eff);
    if (due - y > 1 || due < y) continue;            // 1年前になったら／過ぎたものは overdue 側で拾う
    out.push({ label: String(e.model ?? d.id), prop: label.get(String(e.prop)) ?? String(e.prop),
      due, amount: Number(e.amount ?? e.price ?? 0) });
  }
  return out.sort((a, b) => a.due - b.due);
}

export async function sendDailyAlert(now = new Date()): Promise<{ sent: boolean; items: number }> {
  const overdue = await findOverdue(now);
  const stale = await staleHeartbeats(now);
  const exc = await exceptions();
  const un = await unmatched();
  const est = await estimatesDue(now);
  const total = overdue.length + stale.length + exc.length + un.length + est.length;
  if (total === 0) return { sent: false, items: 0 };

  const L: string[] = ["yah.OS 外部委託の点検結果です。", ""];
  if (stale.length) {
    L.push("■ 自動処理が動いていない可能性（最優先）");
    stale.forEach((s) => L.push(`　・${s.name}: ${Math.floor(s.silentSec / 3600)}時間 音沙汰なし`));
    L.push("");
  }
  const crit = overdue.filter((o) => o.level === "critical");
  if (crit.length) {
    L.push("■ 期日を大きく超過");
    crit.forEach((o) => L.push(`　・${o.job.title}（${PROP_LABEL[o.job.prop] ?? o.job.prop}・${o.job.dueMonth}）— ${o.reason}`));
    L.push("");
  }
  const warn = overdue.filter((o) => o.level === "warn");
  if (warn.length) {
    L.push("■ 期日が近い・遅れている");
    warn.forEach((o) => L.push(`　・${o.job.title}（${PROP_LABEL[o.job.prop] ?? o.job.prop}・${o.job.dueMonth}）— ${o.reason}`));
    L.push("");
  }
  if (exc.length) {
    L.push("■ 人の判断待ち");
    exc.forEach((e) => L.push(`　・${e.title}（${PROP_LABEL[e.prop] ?? e.prop}・${e.dueMonth}）— ${e.timeline?.at(-1)?.note ?? ""}`));
    L.push("");
  }
  if (est.length) {
    L.push("■ 見積を取る時期（概算のまま実施年が近い）");
    est.forEach((e) => L.push(`　・${e.label}（${e.prop}・${e.due}年予定）— いまの見込み ¥${e.amount.toLocaleString()}`));
    L.push("");
  }
  if (un.length) {
    L.push("■ ジョブに紐付かなかったメール");
    un.forEach((u) => L.push(`　・${u.from}「${u.subject}」`));
    L.push("");
  }
  L.push("画面: https://os.yah.homes/vendors.html");
  L.push("（このメールは異常がある日だけ届きます）");

  const to = (await notifySettings()).exceptionsTo;
  const r = await sendOrDraft({
    to,
    subject: `[yah.OS] 外部委託の要対応 ${total}件${stale.length ? "（自動処理の停止あり）" : ""}`,
    body: L.join("\n"),
  });
  await agencyDb().collection("alertLogs").add({
    at: new Date().toISOString(), items: total, mode: r.mode,
    breakdown: { stale: stale.length, critical: crit.length, warn: warn.length,
      exception: exc.length, unmatched: un.length, estimates: est.length },
  });
  return { sent: true, items: total };
}

/**
 * 警報のテスト（原則2-5）— 月1回、わざと異常を作ってアラートが鳴るか確かめる。
 *
 * 鳴らない警報は無いのと同じで、しかも「静かだから正常」と誤解させる分だけ有害。
 * 内部ジョブとして期日切れの状態を1件作り、アラートに載ることを確認して片付ける。
 */
export async function testAlarm(): Promise<{ ok: boolean; detail: string }> {
  const db = agencyDb();
  const ref = await db.collection("jobs").add({
    type: "internal", title: "【警報テスト】これは訓練です", prop: "takasago",
    dueMonth: "2020-01", status: "sent", createdAt: new Date().toISOString(),
    requestMailAt: new Date().toISOString(),
    timeline: [{ at: new Date().toISOString(), status: "sent", by: "system", note: "警報が鳴るかの訓練" }],
  });
  const overdue = await findOverdue();
  const caught = overdue.some((o) => (o.job as { id?: string }).id === ref.id || o.job.title.includes("警報テスト"));
  await ref.delete();
  await db.collection("alarmTests").add({ at: new Date().toISOString(), caught });
  return { ok: caught, detail: caught ? "期日超過として検知された" : "検知されなかった（見張りが壊れている）" };
}
